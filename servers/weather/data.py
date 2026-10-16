"""Simulated weather (deterministic, so the demo always tells the same story). Day 0 = today."""

CITY = "São Paulo"
CURRENT = {"condition": "light rain", "temp_c": 19, "humidity": 84, "uv_index": 2}
FORECAST = [  # rain today, a hot dry day tomorrow: the outdoor plants are covered today, not tomorrow
    {"condition": "rain", "min_c": 17, "max_c": 22, "rain_mm": 14, "rain_chance": 90, "humidity": 86},
    {"condition": "sunny", "min_c": 20, "max_c": 31, "rain_mm": 0, "rain_chance": 5, "humidity": 45},
    {"condition": "partly cloudy", "min_c": 19, "max_c": 28, "rain_mm": 0, "rain_chance": 20, "humidity": 55},
    {"condition": "thunderstorms", "min_c": 18, "max_c": 25, "rain_mm": 22, "rain_chance": 95, "humidity": 90},
    {"condition": "sunny", "min_c": 21, "max_c": 32, "rain_mm": 0, "rain_chance": 0, "humidity": 40},
]
