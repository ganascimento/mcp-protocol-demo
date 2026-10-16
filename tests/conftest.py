"""The real stack, in-process: both MCP servers over real HTTP (background threads, free ports)."""

import socket
import threading
import time

import pytest
import uvicorn

from host.events import EventBus
from servers.common import http_app
from servers.garden import data as garden_data
from servers.garden.server import mcp as garden
from servers.weather.server import mcp as weather


def start_server(server) -> tuple[uvicorn.Server, str]:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    uv = uvicorn.Server(uvicorn.Config(http_app(server), log_level="warning"))
    threading.Thread(target=uv.run, kwargs={"sockets": [sock]}, daemon=True).start()
    while not uv.started:
        time.sleep(0.05)
    return uv, f"http://127.0.0.1:{sock.getsockname()[1]}/mcp"


@pytest.fixture(scope="session")
def servers():
    running = {"garden": start_server(garden), "weather": start_server(weather)}
    yield {name: url for name, (_, url) in running.items()}
    for uv, _ in running.values():
        uv.should_exit = True


@pytest.fixture(autouse=True)
def fresh_garden():
    garden_data.reset()


@pytest.fixture
def bus():
    bus = EventBus()
    bus.log = []
    bus.listen(bus.log.append)
    return bus
