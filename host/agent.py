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


@dataclass(frozen=True)
class Answer:
    text: str
    seq: int  # the event that delivered it: the UI waits for this one before showing the text itself


class BootError(Exception):
    def __init__(self, server: str, reason: str, message: str):
        super().__init__(message)
        self.server, self.reason = server, reason  # reason: "unavailable" | "conflict"


class Agent:
    def __init__(self, servers: dict[str, str], llm, bus: EventBus):
        self.servers = servers
        self.llm, self.bus = llm, bus
        self.registry: dict[str, RegisteredTool] = {}
        self.definitions: list[dict] = []  # what the LLM is sent: built once per boot
        self.ready = False
        self._boot_lock = asyncio.Lock()

    @property
    def model(self) -> str:
        return self.llm.model

    # --- boot -----------------------------------------------------------------------------------------

    async def boot(self) -> None:
        async with self._boot_lock:
            self.ready = False
            self.bus.emit("boot_start", servers=self.servers, model=self.model)
            registry: dict[str, RegisteredTool] = {}
            opened: list[MCPConnection] = []
            try:
                # One server after the other, so the UI tells a clear story. A production host would discover in parallel.
                for name, url in self.servers.items():
                    await self._discover(name, url, registry, opened)
            except BaseException as e:
                if isinstance(e, BootError):
                    self.bus.emit("boot_error", server=e.server, reason=e.reason, error=str(e))
                await _close(opened)  # one cleanup for every way a boot can fail
                raise
            old = {r.server for r in self.registry.values()}
            self.registry, self.definitions = registry, [r.definition for r in registry.values()]
            self.ready = True
            self.bus.emit("ready", tools=[{"name": n, "server": r.server.name} for n, r in registry.items()])
            await _close(old)

    async def _discover(self, name: str, url: str, registry: dict, opened: list) -> None:
        self.bus.emit("connect", server=name, url=url)
        connection = MCPConnection(name, url, self.bus)
        try:
            tools = await connection.open()
        except ServerUnavailable as e:
            raise BootError(name, "unavailable", str(e)) from e
        opened.append(connection)
        self.bus.emit("server_ready", server=name, version=connection.protocol_version,
                      instructions=connection.instructions, tools=[_summary(t) for t in tools])
        added = [RegisteredTool(connection, t) for t in tools]
        for r in added:
            if r.tool.name in registry:
                # Two servers, one name: whichever registered last would win in silence (tool shadowing).
                owner = registry[r.tool.name].server.name
                raise BootError(name, "conflict", f"Tool '{r.tool.name}' is published by both '{owner}' and '{name}'")
            registry[r.tool.name] = r
        self.bus.emit("tools_registered", server=name, tools=[r.definition for r in added])

    async def close(self) -> None:
        self.ready = False
        await _close({r.server for r in self.registry.values()})

    # --- one chat turn --------------------------------------------------------------------------------

    async def reply(self, history: list[dict], text: str) -> Answer:
        """history = earlier turns, user/assistant text only. Tool results are NOT kept between turns: the next
        turn asks the servers again (fresh data, shorter prompts; the price is repeating a call now and then).
        Every exit emits one "answer" event: the UI ends a turn in one place."""
        self.bus.emit("user", text=text)
        names = [d["function"]["name"] for d in self.definitions]
        messages = [{"role": "system", "content": SYSTEM_PROMPT.format(today=date.today().isoformat())},
                    *history, {"role": "user", "content": text}]
        try:
            for round_ in range(1, MAX_ROUNDS + 1):
                self.bus.emit("llm_request", round=round_, messages=len(messages), tools=names)
                message = await self.llm(messages, self.definitions)
                calls = message.get("tool_calls") or []
                self.bus.emit("llm_decision", round=round_, text=None if calls else message.get("content"),
                              tool_calls=calls, owners={c["function"]["name"]: self._owner(c) for c in calls})
                messages.append(message)
                if not calls:
                    return self._answer(message.get("content") or "")
                # Several calls in one decision run in parallel — often on different servers.
                messages += await asyncio.gather(*(self._run(call) for call in calls))
        except ServerUnavailable as e:
            # A server is down: our code tells the user. Handing it to the LLM as text would get an invented excuse.
            return self._answer(f"Sorry — {e}. Please try again in a moment.", error=True)
        return self._answer("Sorry, I couldn't finish that. Could you rephrase?")

    def _answer(self, text: str, error: bool = False) -> Answer:
        return Answer(text, self.bus.emit("answer", text=text, error=error)["seq"])

    def _owner(self, call: dict) -> str | None:
        owner = self.registry.get(call["function"]["name"])
        return owner.server.name if owner else None

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


async def _close(connections) -> None:
    await asyncio.gather(*(c.close() for c in connections))
