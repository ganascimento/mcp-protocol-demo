"""python -m host → the chat + workflow UI on http://127.0.0.1:8080 (start the MCP servers first)."""

import uvicorn

from host.agent import Agent
from host.app import create_app
from host.config import MCP_SERVERS, WEB_PORT
from host.events import EventBus
from host.llm import OpenAIChat

bus = EventBus()
app = create_app(Agent(MCP_SERVERS, OpenAIChat(), bus), bus)

if __name__ == "__main__":
    print(f"\n  Fern → http://127.0.0.1:{WEB_PORT}\n", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=WEB_PORT, log_level="warning")
