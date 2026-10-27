"""The LLM, behind one async function: (messages, tools) → assistant message, in OpenAI's dict shape.
Tests swap it for a scripted fake (tests/fake_llm.py)."""

from openai import AsyncOpenAI

from host.config import MODEL, REASONING_EFFORT


class OpenAIChat:
    model = MODEL

    def __init__(self) -> None:
        self._client = AsyncOpenAI()

    async def __call__(self, messages: list[dict], tools: list[dict]) -> dict:
        response = await self._client.chat.completions.create(
            model=self.model, messages=messages, tools=tools, reasoning_effort=REASONING_EFFORT,
        )
        return response.choices[0].message.model_dump(exclude_none=True)
