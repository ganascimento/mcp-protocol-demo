"""In-process event bus: the host narrates what it does, the web UI animates it. Out-of-band: nothing here
travels inside MCP messages."""

import time
from collections.abc import Callable

Listener = Callable[[dict], None]


class EventBus:
    def __init__(self) -> None:
        self._listeners: set[Listener] = set()
        self._seq = 0

    def emit(self, kind: str, **data) -> dict:
        self._seq += 1
        event = {"seq": self._seq, "t": time.time(), "kind": kind, **data}
        for listener in list(self._listeners):
            listener(event)
        return event

    def listen(self, listener: Listener) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)
