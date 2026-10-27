"""Web app: serves the UI, the chat API and the live event stream (SSE) the workflow is drawn from."""

import asyncio
import contextlib
import json
import uuid
from collections import OrderedDict
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from host.agent import Agent, BootError
from host.config import MAX_TEXT
from host.events import EventBus

WEB = Path(__file__).resolve().parents[1] / "web"
MAX_CONVERSATIONS = 100
MAX_HISTORY = 20  # messages kept per conversation (user + assistant text)


def create_app(agent: Agent, bus: EventBus) -> Starlette:
    conversations: OrderedDict[str, list[dict]] = OrderedDict()

    @contextlib.asynccontextmanager
    async def lifespan(_):
        with contextlib.suppress(BootError):  # shown as boot_error; the UI can retry
            await agent.boot()  # ready for the API even before a browser opens
        yield
        await agent.close()

    async def index(_: Request) -> FileResponse:
        return FileResponse(WEB / "index.html")

    async def state(_: Request) -> JSONResponse:
        return JSONResponse({"ready": agent.ready, "model": agent.model, "servers": agent.servers})

    async def events(request: Request) -> StreamingResponse:
        queue: asyncio.Queue = asyncio.Queue(maxsize=1000)

        def push(event: dict) -> None:
            if not queue.full():  # a stalled tab loses events instead of growing memory
                queue.put_nowait(event)

        stop = bus.listen(push)

        async def feed():
            try:
                yield ": connected\n\n"
                while not await request.is_disconnected():
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15)
                        yield f"data: {json.dumps(event, default=str)}\n\n"
                    except TimeoutError:
                        yield ": ping\n\n"
            finally:
                stop()

        return StreamingResponse(feed(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})

    async def boot(_: Request) -> JSONResponse:
        try:
            await agent.boot()
        except BootError as e:
            return JSONResponse({"ready": False, "error": str(e)}, status_code=502)
        return JSONResponse({"ready": True, "tools": list(agent.registry)})

    async def chat(request: Request) -> JSONResponse:
        body = await request.json()
        text = str(body.get("text", "")).strip()
        conversation_id = str(body.get("conversation") or uuid.uuid4())
        if not text:
            return JSONResponse({"error": "text is required"}, status_code=400)
        if len(text) > MAX_TEXT:
            return JSONResponse({"error": f"at most {MAX_TEXT} characters"}, status_code=413)
        if not agent.ready:
            return JSONResponse({"error": "the agent is not ready (is every MCP server up?)"}, status_code=503)
        history = conversations.pop(conversation_id, [])
        answer = await agent.reply(history, text)
        history = history + [{"role": "user", "content": text}, {"role": "assistant", "content": answer.text}]
        conversations[conversation_id] = history[-MAX_HISTORY:]
        while len(conversations) > MAX_CONVERSATIONS:
            conversations.popitem(last=False)
        return JSONResponse({"text": answer.text, "seq": answer.seq, "conversation": conversation_id})

    return Starlette(routes=[
        Route("/", index),
        Route("/api/state", state),
        Route("/api/events", events),
        Route("/api/boot", boot, methods=["POST"]),
        Route("/api/chat", chat, methods=["POST"]),
        Mount("/static", StaticFiles(directory=WEB)),
    ], lifespan=lifespan)
