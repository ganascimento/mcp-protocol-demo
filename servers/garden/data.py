"""The garden's own data (in memory). Only this server reads or writes it."""

import copy
from datetime import date, timedelta

# watered_days_ago is turned into a real date on reset(), so the demo always starts "today".
_SEED = [
    {"id": "monstera", "name": "Monstera", "species": "Monstera deliciosa", "location": "living room",
     "outdoor": False, "water_every_days": 7, "watered_days_ago": 6},
    {"id": "basil", "name": "Basil", "species": "Ocimum basilicum", "location": "balcony",
     "outdoor": True, "water_every_days": 2, "watered_days_ago": 2},
    {"id": "snake-plant", "name": "Snake plant", "species": "Dracaena trifasciata", "location": "bedroom",
     "outdoor": False, "water_every_days": 14, "watered_days_ago": 5},
    {"id": "fern", "name": "Boston fern", "species": "Nephrolepis exaltata", "location": "bathroom",
     "outdoor": False, "water_every_days": 3, "watered_days_ago": 4},
    {"id": "tomato", "name": "Cherry tomato", "species": "Solanum lycopersicum", "location": "balcony",
     "outdoor": True, "water_every_days": 1, "watered_days_ago": 1},
]

CARE_GUIDES = {
    "Monstera deliciosa": {"light": "bright, indirect", "water": "when the top 5 cm of soil is dry",
                           "humidity": "medium to high", "tip": "wipe the leaves monthly so they can breathe"},
    "Ocimum basilicum": {"light": "6+ hours of direct sun", "water": "keep the soil evenly moist",
                         "humidity": "medium", "tip": "pinch the flower buds to keep the leaves coming"},
    "Dracaena trifasciata": {"light": "any, even low light", "water": "only when the soil is completely dry",
                             "humidity": "low", "tip": "overwatering is the only way to kill it"},
    "Nephrolepis exaltata": {"light": "indirect, no direct sun", "water": "never let the soil dry out",
                             "humidity": "high — mist it or keep it in the bathroom", "tip": "brown tips = air too dry"},
    "Solanum lycopersicum": {"light": "full sun", "water": "deeply, at the base, in the morning",
                             "humidity": "medium", "tip": "irregular watering cracks the fruit"},
}

PLANTS: list[dict] = []


def today() -> date:
    return date.today()


def reset() -> None:
    PLANTS.clear()
    for seed in copy.deepcopy(_SEED):
        seed["last_watered"] = today() - timedelta(days=seed.pop("watered_days_ago"))
        PLANTS.append(seed)


reset()
