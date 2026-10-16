"""How every MCP server in this demo is served. Each one is its own process, port and data — like two teams'."""

import uvicorn
from mcp.server.mcpserver import MCPServer
from starlette.applications import Starlette


def http_app(server: MCPServer) -> Starlette:
    # Streamable HTTP, spec 2026-07-28: stateless (no session, every request stands alone) and json_response
    # (one POST → one JSON answer; SSE would only be needed if a tool streamed progress).
    return server.streamable_http_app(stateless_http=True, json_response=True)


def serve(server: MCPServer, port: int) -> None:
    # 127.0.0.1 only: these servers trust whoever reaches them (no auth — see README, "What this demo skips").
    print(f"MCP server '{server.name}' → http://127.0.0.1:{port}/mcp", flush=True)
    uvicorn.run(http_app(server), host="127.0.0.1", port=port, log_level="warning")
