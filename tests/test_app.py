"""The web API on top of the agent (Starlette test client)."""

from starlette.testclient import TestClient

from host.agent import Agent
from host.app import create_app
from tests.conftest import DOWN_URL
from tests.fake_llm import FakeLLM


def client(servers, bus, *steps):
    return TestClient(create_app(Agent(servers, FakeLLM(*steps), bus), bus))


def test_chat_answers_and_keeps_the_conversation(servers, bus):
    with client(servers, bus, "Hi!", "Still here.") as http:
        first = http.post("/api/chat", json={"text": "hello"}).json()
        second = http.post("/api/chat", json={"text": "again", "conversation": first["conversation"]}).json()
    assert (first["text"], second["text"]) == ("Hi!", "Still here.")


def test_chat_validates_the_text(servers, bus):
    with client(servers, bus) as http:
        assert http.post("/api/chat", json={"text": "  "}).status_code == 400
        assert http.post("/api/chat", json={"text": "x" * 1001}).status_code == 413


def test_chat_waits_for_a_booted_agent(bus):
    with client({"garden": DOWN_URL}, bus) as http:
        assert http.post("/api/chat", json={"text": "hi"}).status_code == 503
        assert http.post("/api/boot").status_code == 502
