"""Host settings (env-driven)."""

import os

from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("AGENT_MODEL", "gpt-6-luna")
# gpt-6-luna on Chat Completions only does tool calling with reasoning "none".
REASONING_EFFORT = os.getenv("AGENT_REASONING_EFFORT", "none")

# The MCP servers this host connects to. Only URLs: what each one can do comes from discovery (tools/list).
MCP_SERVERS = {
    "garden": os.getenv("GARDEN_MCP_URL", "http://127.0.0.1:8001/mcp"),
    "weather": os.getenv("WEATHER_MCP_URL", "http://127.0.0.1:8002/mcp"),
}

WEB_PORT = int(os.getenv("WEB_PORT", "8080"))
MCP_TIMEOUT_S = 10  # a hung server must not hang the chat
MAX_ROUNDS = 6  # LLM ↔ tools round trips per message
MAX_TEXT = 1000  # characters per chat message
