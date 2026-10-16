# mcp-protocol-demo

Visual demo of **MCP** (spec 2026-07-28, official SDK `mcp==2.2.0`): a plant-care chatbot. The agent (MCP host)
discovers two MCP servers — `garden` and `weather` — over Streamable HTTP, turns their tools into functions for the
LLM and routes each call to the server that owns it. A web UI draws the boot and every decision live.
Sibling of `a2a-protocol-demo`. Built for GitHub + a LinkedIn post.

## Rules

- **Everything in English:** code, comments, docs, commit messages. The agent replies in the user's language; UI is PT/EN.
- **Comments short, succinct, to the point.**
- **Official SDK only** (`mcp`, pinned). The installed SDK source is the reference, not old tutorials (2.x renamed
  FastMCP → MCPServer and speaks the stateless 2026-07-28 spec).
- Servers use the high-level API (`MCPServer` + `@tool`), `stateless_http=True, json_response=True`, bound to 127.0.0.1.
- Each server owns its `data.py`. The host never imports server code (tests may, to start them).
- Business refusals raise `ToolError` (the model reads them); other exceptions are crashes (text stays on the server).
- One long-lived MCP `Client` per server, owned by its own task (anyio: close in the task that opened it).
- Server failures are `ServerUnavailable`, told to the user by code — never handed to the LLM as text.
- The UI is driven only by host events (`host/events.py`, SSE). Wire events are observed with httpx hooks, never
  reconstructed. Telemetry stays out-of-band: nothing extra travels inside MCP messages.
- Web UI: vanilla HTML/CSS/JS, no framework, no build step, SVG icons (no emoji), dark green tokens in `styles.css`.
- Tests never call the LLM: real servers over HTTP + `tests/fake_llm.py`.

## Commands

```bash
./start.sh                        # garden :8001 · weather :8002 · UI http://127.0.0.1:8080
.venv/bin/python -m pytest -q
```
