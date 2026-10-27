"""The real stack, in-process: both MCP servers over real HTTP (background threads, free ports)."""

import socket
import threading
from collections.abc import Callable

import pytest
import uvicorn

from host.events import EventBus
from servers.common import http_app
from servers.garden import data as garden_data
from servers.garden.server import mcp as garden
from servers.weather.server import mcp as weather

DOWN_URL = "http://127.0.0.1:9/mcp"  # nothing listens there


def start_server(server) -> tuple[str, Callable[[], None]]:
    """Serves an MCP server in a thread. Returns its URL and a stop() that waits for it to finish."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen()  # connections wait in the backlog until uvicorn is up: no startup polling
    uv = uvicorn.Server(uvicorn.Config(http_app(server), log_level="warning"))
    thread = threading.Thread(target=uv.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()

    def stop() -> None:
        uv.should_exit = True
        thread.join(timeout=5)

    return f"http://127.0.0.1:{sock.getsockname()[1]}/mcp", stop


class RecordingBus(EventBus):
    def __init__(self) -> None:
        super().__init__()
        self.log: list[dict] = []
        self.listen(self.log.append)


@pytest.fixture(scope="session")
def servers():
    (garden_url, stop_garden), (weather_url, stop_weather) = start_server(garden), start_server(weather)
    yield {"garden": garden_url, "weather": weather_url}
    stop_garden()
    stop_weather()


@pytest.fixture(autouse=True)
def fresh_garden():
    garden_data.reset()


@pytest.fixture
def bus():
    return RecordingBus()
