"""MCP client: the host's connection to ONE MCP server, on the official SDK over Streamable HTTP.

Two jobs:
1. DISCOVER (once, at boot): server/discover (protocol version, capabilities, instructions) + tools/list.
2. CALL: tools/call with the arguments the LLM chose.

Spec 2026-07-28 is stateless: no initialize handshake, no session. Each request is one POST that carries
everything it needs (the protocol version travels in every request's _meta and in the MCP-Protocol-Version
header). The PROTOCOL keeps no state — but the CLIENT does: one Client per server lives from boot to shutdown,
because it caches what discovery taught it. It needs each tool's outputSchema to validate structured results;
a fresh Client per call would send an extra tools/list after every tools/call to learn it again.

The httpx hooks only OBSERVE the real HTTP traffic (for the UI); they change nothing on the wire.
"""

import asyncio
import json
import time

import httpx2
import mcp_types as types
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from host.config import MCP_TIMEOUT_S
from host.events import EventBus

CLIENT_INFO = types.Implementation(name="fern-host", version="1.0.0")


class ServerUnavailable(Exception):
    """The SERVER failed (down, timeout, protocol error) — not a refusal of this request. For our code, not the LLM."""


def _root(e: BaseException) -> BaseException:
    while isinstance(e, BaseExceptionGroup) and len(e.exceptions) == 1:  # the SDK wraps errors in task groups
        e = e.exceptions[0]
    return e


def _json(raw: bytes) -> object:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw.decode(errors="replace")


def _route(request: httpx2.Request) -> dict:
    """The mirrored routing headers: what a gateway reads without parsing the body."""
    return {"method": request.headers.get("mcp-method"), "name": request.headers.get("mcp-name")}


class MCPConnection:
    def __init__(self, name: str, url: str, bus: EventBus):
        self.name, self.url, self.bus = name, url, bus
        self.protocol_version: str | None = None
        self.server_info: types.Implementation | None = None
        self.instructions: str | None = None
        self._client: Client | None = None
        self._task: asyncio.Task | None = None
        self._opened: asyncio.Future | None = None
        self._stop = asyncio.Event()

    def _unavailable(self, e: BaseException) -> ServerUnavailable:
        return ServerUnavailable(f"MCP server '{self.name}' is unavailable ({_root(e)!r})")

    async def open(self) -> list[types.Tool]:
        """Connects and discovers. The Client lives in a task of its own (anyio: a client must be closed by the
        task that opened it — and the web app boots in one request and shuts down in another)."""
        self._opened = asyncio.get_running_loop().create_future()
        self._task = asyncio.create_task(self._own_client())
        try:
            return await self._opened
        except Exception as e:  # noqa: BLE001
            raise self._unavailable(e) from e

    async def _own_client(self) -> None:
        hooks = {"request": [self._on_request], "response": [self._on_response]}
        try:
            async with (httpx2.AsyncClient(timeout=MCP_TIMEOUT_S, event_hooks=hooks) as http,
                        # mode="auto" (default): server/discover first, to negotiate the version — or the old
                        # initialize handshake if the server predates 2026-07-28.
                        Client(streamable_http_client(self.url, http_client=http), client_info=CLIENT_INFO,
                               read_timeout_seconds=MCP_TIMEOUT_S, cache=None) as client):
                self.protocol_version, self.server_info = client.protocol_version, client.server_info
                self.instructions = client.instructions
                tools, cursor = [], None
                while True:  # tools/list is paginated
                    page = await client.list_tools(cursor=cursor)
                    tools += page.tools
                    if not (cursor := page.next_cursor):
                        break
                self._client = client
                self._opened.set_result(tools)
                await self._stop.wait()
        except Exception as e:  # noqa: BLE001
            if not self._opened.done():
                self._opened.set_exception(e)
        finally:
            self._client = None
            if not self._opened.done():  # cancelled before discovery finished
                self._opened.cancel()

    async def call_tool(self, name: str, arguments: dict) -> types.CallToolResult:
        if self._client is None:
            raise ServerUnavailable(f"MCP server '{self.name}' is not connected")
        try:
            return await self._client.call_tool(name, arguments)  # one POST: the version is already negotiated
        except Exception as e:  # noqa: BLE001 — a business refusal comes back as a RESULT (isError), never raises
            raise self._unavailable(e) from e

    async def close(self) -> None:
        if self._task:
            self._stop.set()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    # --- wire observation (UI only) ------------------------------------------------------------------

    async def _on_request(self, request: httpx2.Request) -> None:
        request.extensions["sent_at"] = time.perf_counter()
        headers = {k: v for k, v in request.headers.items() if k.lower().startswith("mcp")}
        self.bus.emit("wire", server=self.name, dir="out", http=f"{request.method} {request.url.path}",
                      headers=headers, body=_json(request.content), **_route(request))

    async def _on_response(self, response: httpx2.Response) -> None:
        await response.aread()
        sent_at = response.request.extensions.get("sent_at", time.perf_counter())
        self.bus.emit("wire", server=self.name, dir="in", status=response.status_code,
                      ms=round((time.perf_counter() - sent_at) * 1000, 1), body=_json(response.content),
                      **_route(response.request))
