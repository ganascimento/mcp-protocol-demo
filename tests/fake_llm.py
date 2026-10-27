"""A scripted LLM: each step is either a list of tool calls or a final text. Records what it was shown."""

import json


class FakeLLM:
    model = "fake-llm"

    def __init__(self, *steps):
        self.steps = list(steps)
        self.seen: list[dict] = []  # one entry per call: the messages and tool names the "model" received

    async def __call__(self, messages: list[dict], tools: list[dict]) -> dict:
        self.seen.append({"messages": [dict(m) for m in messages], "tools": [t["function"]["name"] for t in tools]})
        step = self.steps.pop(0)
        if isinstance(step, str):
            return {"role": "assistant", "content": step}
        calls = [{"id": f"call_{i}", "type": "function",
                  "function": {"name": name, "arguments": json.dumps(args)}}
                 for i, (name, args) in enumerate(step)]
        return {"role": "assistant", "content": None, "tool_calls": calls}
