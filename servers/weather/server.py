"""Weather MCP server: current conditions and a short forecast for the user's city."""

from datetime import date, timedelta
from typing import Annotated

import mcp_types as types
from mcp.server.mcpserver import MCPServer
from pydantic import Field

from servers.weather import data

PORT = 8002
READ_ONLY = types.ToolAnnotations(read_only_hint=True, open_world_hint=True)

mcp = MCPServer(
    "weather",
    title="Weather",
    version="1.0.0",
    instructions=f"Weather for the user's city ({data.CITY}): current conditions and a forecast of up to 5 days.",
)


@mcp.tool(annotations=READ_ONLY)
def get_current_weather() -> dict:
    """Current weather in the user's city: condition, temperature, humidity and UV index."""
    return {"city": data.CITY, **data.CURRENT}


@mcp.tool(annotations=READ_ONLY)
def get_forecast(days: Annotated[int, Field(ge=1, le=5, description="How many days, starting today")] = 3) -> list[dict]:
    """Daily forecast for the user's city, starting today: condition, min/max temperature, rain in mm and chance."""
    # The bounds live in the schema (Field): the SDK rejects days=9 before this function runs.
    return [{"date": (date.today() + timedelta(days=i)).isoformat(), **day} for i, day in enumerate(data.FORECAST[:days])]
