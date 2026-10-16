"""The agent — the MCP HOST. It owns the conversation and the LLM; the MCP servers own the tools.

Boot:  for each server → discover (server/discover + tools/list) → translate every MCP tool into a function
       definition (name, description, JSON Schema) → one tool registry. Then: ready.
Turn:  LLM sees the registry as plain functions → picks one or more → the registry says which server owns each
       → tools/call → the result goes back to the LLM → repeat until it answers.

The LLM never learns that MCP exists: to it, list_plants is just a function. MCP is how the HOST finds and runs it.
"""

import asyncio
import json
from dataclasses import dataclass
from datetime import date

import mcp_types as types

from host.config import MAX_ROUNDS
from host.events import EventBus
from host.mcp_client import MCPConnection, ServerUnavailable

SYSTEM_PROMPT = """You are Fern, a friendly plant-care assistant. Today is {today}.
- Any fact about the user's plants or the weather comes from your tools. Never guess it.
- When you need several independent facts, call those tools together, in one step.
- Outdoor plants get the rain: when it rains enough today (5 mm or more), they don't need watering today.
- Log a watering only when the user says they watered a plant — never on your own.
- Reply in the user's language, short (at most 6 lines). Plain text; simple "- " bullets are fine."""


@dataclass(frozen=True)
class RegisteredTool:
    server: MCPConnection
    tool: types.Tool

    @property
    def definition(self) -> dict:
        """MCP tool → OpenAI function. Same three pieces, different wrapper: this is all the LLM ever sees."""
        return {"type": "function", "function": {
            "name": self.tool.name, "description": self.tool.description or "", "parameters": self.tool.input_schema,
        }}


class Agent:
    def __init__(self, servers: dict[str, str], llm, bus: EventBus):
        self.servers = servers
        self.llm, self.bus = llm, bus
        self.registry: dict[str, RegisteredTool] = {}
        self.ready = False
        self._boot_lock = asyncio.Lock()

    # --- boot -----------------------------------------------------------------------------------------

    async def boot(self) -> None:
        async with self._boot_lock:
            self.ready = False
            self.bus.emit("boot_start", servers=self.servers, model=getattr(self.llm, "model", "llm"))
            registry: dict[str, RegisteredTool] = {}
            # One server after the other, so the UI tells a clear story. A production host would discover in parallel.
            for name, url in self.servers.items():
                self.bus.emit("connect", server=name, url=url)
                connection = MCPConnection(name, url, self.bus)
                try:
                    tools = await connection.open()
                except ServerUnavailable as e:
                    self.bus.emit("boot_error", server=name, error=str(e))
                    await _close(registry)
                    raise
                self.bus.emit("server_ready", server=name, version=connection.protocol_version,
                              title=connection.server_info.title if connection.server_info else None,
                              instructions=connection.instructions,
                              tools=[_summary(t) for t in tools])
                for tool in tools:
                    if tool.name in registry:
                        # Two servers, one name: whichever registered last would win in silence (tool shadowing).
                        error = f"Tool '{tool.name}' is published by both '{registry[tool.name].server.name}' and '{name}'"
                        self.bus.emit("boot_error", server=name, error=error)
                        await _close(registry)
                        await connection.close()
                        raise ValueError(error)
                    registry[tool.name] = RegisteredTool(connection, tool)
                self.bus.emit("tools_registered", server=name,
                              tools=[registry[t.name].definition["function"] for t in tools])
            old, self.registry = self.registry, registry
            await _close(old)
            self.ready = True
            self.bus.emit("ready", tools=[{"name": n, "server": r.server.name} for n, r in registry.items()])

    async def close(self) -> None:
        self.ready = False
        await _close(self.registry)

    # --- one chat turn --------------------------------------------------------------------------------

    async def reply(self, history: list[dict], text: str) -> str:
        """history = earlier turns, user/assistant text only. Tool results are NOT kept between turns: the next
        turn asks the servers again (fresh data, shorter prompts; the price is repeating a call now and then)."""
        self.bus.emit("user", text=text)
        definitions = [r.definition for r in self.registry.values()]
        messages = [{"role": "system", "content": SYSTEM_PROMPT.format(today=date.today().isoformat())},
                    *history, {"role": "user", "content": text}]
        try:
            for round_ in range(1, MAX_ROUNDS + 1):
                self.bus.emit("llm_request", round=round_, messages=len(messages),
                              tools=[d["function"]["name"] for d in definitions])
                message = await self.llm(messages, definitions)
                calls = message.get("tool_calls") or []
                self.bus.emit("llm_decision", round=round_, text=message.get("content") if not calls else None,
                              tool_calls=[self._describe(c) for c in calls])
                messages.append(message)
                if not calls:
                    answer = message.get("content") or ""
                    self.bus.emit("answer", text=answer)
                    return answer
                # Several calls in one decision run in parallel — often on different servers.
                messages += await asyncio.gather(*(self._run(call) for call in calls))
        except ServerUnavailable as e:
            # A server is down: our code tells the user. Handing it to the LLM as text would get an invented excuse.
            self.bus.emit("error", text=str(e))
            return f"Sorry — {e}. Please try again in a moment."
        answer = "Sorry, I couldn't finish that. Could you rephrase?"
        self.bus.emit("answer", text=answer)
        return answer

    def _describe(self, call: dict) -> dict:
        name = call["function"]["name"]
        owner = self.registry.get(name)
        return {"id": call["id"], "name": name, "arguments": call["function"].get("arguments") or "{}",
                "server": owner.server.name if owner else None}

    async def _run(self, call: dict) -> dict:
        name, call_id = call["function"]["name"], call["id"]

        def reply(content: str) -> dict:
            return {"role": "tool", "tool_call_id": call_id, "content": content}

        owner = self.registry.get(name)
        if owner is None:  # the LLM can ask for ANY name (hallucination, injection): only registered tools run
            self.bus.emit("tool_result", id=call_id, name=name, server=None, is_error=True, result="unknown tool")
            return reply(f"Error: there is no tool named '{name}'.")
        try:
            arguments = json.loads(call["function"].get("arguments") or "{}")
        except ValueError:
            self.bus.emit("tool_result", id=call_id, name=name, server=owner.server.name, is_error=True,
                          result="invalid JSON arguments")
            return reply("Error: the arguments were not valid JSON.")
        self.bus.emit("tool_call", id=call_id, name=name, server=owner.server.name, arguments=arguments)
        result = await owner.server.call_tool(name, arguments)
        text = "\n".join(c.text for c in result.content if isinstance(c, types.TextContent))
        self.bus.emit("tool_result", id=call_id, name=name, server=owner.server.name, is_error=bool(result.is_error),
                      result=result.structured_content if result.structured_content is not None else text)
        # isError = a refusal the model must read (e.g. "already watered today"): it goes back as the tool's answer.
        return reply(f"Error: {text}" if result.is_error else text)


def _summary(tool: types.Tool) -> dict:
    hints = tool.annotations
    return {"name": tool.name, "description": tool.description or "",
            "read_only": bool(hints and hints.read_only_hint)}


async def _close(registry: dict[str, RegisteredTool]) -> None:
    for connection in {id(r.server): r.server for r in registry.values()}.values():
        await connection.close()
