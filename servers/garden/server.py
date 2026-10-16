"""Garden MCP server: the user's plants and their watering log.

High-level SDK API (MCPServer): a decorated function IS the tool. The SDK reads its name, docstring and type hints
to build what tools/list publishes (name, description, JSON Schema) and validates the arguments of every tools/call.
"""

from datetime import timedelta

import mcp_types as types
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from servers.garden import data

PORT = 8001
READ_ONLY = types.ToolAnnotations(read_only_hint=True)

mcp = MCPServer(
    "garden",
    title="My Garden",
    version="1.0.0",
    instructions="The user's plant collection: where each plant lives, how often it needs water and the watering log.",
)


def _plant(plant_id: str) -> dict:
    for plant in data.PLANTS:
        if plant["id"] == plant_id:
            return plant
    # ToolError = a refusal the MODEL should read. Any other exception is a crash: the SDK hides its text.
    raise ToolError(f"No plant with id '{plant_id}'. Valid ids: {', '.join(p['id'] for p in data.PLANTS)}")


def _view(plant: dict) -> dict:
    days_since = (data.today() - plant["last_watered"]).days
    # The arithmetic is done HERE, in code: the LLM reads "due_in_days", it doesn't compute dates.
    return {
        "id": plant["id"], "name": plant["name"], "species": plant["species"], "location": plant["location"],
        "outdoor": plant["outdoor"], "water_every_days": plant["water_every_days"],
        "last_watered": plant["last_watered"].isoformat(), "days_since_watering": days_since,
        "due_in_days": plant["water_every_days"] - days_since,  # 0 = today, negative = overdue
    }


@mcp.tool(annotations=READ_ONLY)
def list_plants() -> list[dict]:
    """Lists the user's plants: location, indoor/outdoor, watering interval, last watering and due_in_days
    (0 = water today, negative = overdue). Use it before giving any watering advice."""
    return [_view(p) for p in data.PLANTS]


@mcp.tool(annotations=READ_ONLY)
def get_care_guide(plant_id: str) -> dict:
    """Care guide (light, water, humidity, a tip) for one of the user's plants, by its id from list_plants."""
    plant = _plant(plant_id)
    return {"plant": plant["name"], "species": plant["species"], **data.CARE_GUIDES[plant["species"]]}


@mcp.tool(annotations=types.ToolAnnotations(read_only_hint=False, idempotent_hint=False))
def log_watering(plant_id: str) -> dict:
    """Records that the user watered a plant today. Only when the user SAYS they watered it — never on your own."""
    plant = _plant(plant_id)
    if plant["last_watered"] == data.today():
        raise ToolError(f"{plant['name']} was already logged as watered today.")
    plant["last_watered"] = data.today()
    next_date = data.today() + timedelta(days=plant["water_every_days"])
    return {"plant": plant["name"], "last_watered": data.today().isoformat(), "next_watering": next_date.isoformat()}
