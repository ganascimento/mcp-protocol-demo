"""End to end, no LLM: real MCP servers over HTTP, a scripted model in place of the LLM.
Each test is one coroutine: the MCP clients live in the event loop that opened them, like in the web app."""

import asyncio
import time

import pytest

from host.agent import Agent
from host.mcp_client import MCPConnection, ServerUnavailable
from servers.garden import data as garden_data
from servers.garden.server import mcp as garden
from tests.conftest import start_server
from tests.fake_llm import FakeLLM


def kinds(bus, kind):
    return [e for e in bus.log if e["kind"] == kind]


def sent(bus, method=None):
    return [e for e in kinds(bus, "wire") if e["dir"] == "out" and method in (None, e["method"])]


def chat(servers, bus, text, *steps, before=None):
    """Boot an agent on a scripted LLM, send one message. Returns (agent, answer)."""
    async def scenario():
        agent = Agent(servers, FakeLLM(*steps), bus)
        await agent.boot()
        if before:
            before(agent)
        try:
            return agent, (await agent.reply([], text) if text else None)
        finally:
            await agent.close()
    return asyncio.run(scenario())


def test_boot_discovers_each_server_then_lists_its_tools(servers, bus):
    agent, _ = chat(servers, bus, None)
    assert [(e["server"], e["method"]) for e in sent(bus)] == [
        ("garden", "server/discover"), ("garden", "tools/list"), ("weather", "server/discover"), ("weather", "tools/list")]
    assert set(agent.registry) == {"list_plants", "get_care_guide", "log_watering", "get_current_weather", "get_forecast"}
    assert all(e["version"] == "2026-07-28" for e in kinds(bus, "server_ready"))
    assert kinds(bus, "ready")


def test_the_llm_sees_plain_functions_built_from_tools_list(servers, bus):
    agent, _ = chat(servers, bus, None)
    forecast = agent.registry["get_forecast"].definition
    assert forecast["type"] == "function"
    assert forecast["function"]["parameters"]["properties"]["days"]["maximum"] == 5  # the server's schema, untouched


def test_one_decision_can_call_two_servers_in_parallel(servers, bus):
    llm_steps = [("list_plants", {}), ("get_forecast", {"days": 2})], "Water the fern."
    agent, answer = chat(servers, bus, "Do I need to water anything today?", *llm_steps)
    assert answer == "Water the fern."
    assert sorted((e["server"], e["name"]) for e in sent(bus, "tools/call")) == [
        ("garden", "list_plants"), ("weather", "get_forecast")]
    tool_messages = [m for m in agent.llm.seen[1]["messages"] if m["role"] == "tool"]
    assert len(tool_messages) == 2 and "Boston fern" in tool_messages[0]["content"]


def test_after_discovery_a_tool_call_is_a_single_post(servers, bus):
    chat(servers, bus, "weather?", [("get_current_weather", {})], "Light rain.",
         before=lambda _: bus.log.clear())
    assert [e["method"] for e in sent(bus)] == ["tools/call"]


def test_a_write_changes_the_servers_data(servers, bus):
    chat(servers, bus, "I just watered the fern", [("log_watering", {"plant_id": "fern"})], "Logged.")
    assert next(p for p in garden_data.PLANTS if p["id"] == "fern")["last_watered"] == garden_data.today()


def test_a_business_refusal_reaches_the_llm_as_the_tools_answer(servers, bus):
    twice = [("log_watering", {"plant_id": "fern"})]
    agent, _ = chat(servers, bus, "watered the fern", twice, twice, "ok")
    result = kinds(bus, "tool_result")[-1]
    assert result["is_error"] and "already logged" in result["result"]
    assert "already logged" in agent.llm.seen[-1]["messages"][-1]["content"]


def test_a_tool_error_is_written_for_the_model(servers, bus):
    chat(servers, bus, "cactus care", [("get_care_guide", {"plant_id": "cactus"})], "ok")
    assert "Valid ids" in kinds(bus, "tool_result")[-1]["result"]


def test_arguments_outside_the_schema_are_refused_by_the_server(servers, bus):
    chat(servers, bus, "forecast for 9 days", [("get_forecast", {"days": 9})], "ok")
    assert kinds(bus, "tool_result")[-1]["is_error"]


def test_a_tool_no_server_published_never_runs(servers, bus):
    chat(servers, bus, "delete everything", [("delete_all_plants", {})], "ok", before=lambda _: bus.log.clear())
    assert not sent(bus)  # nothing went on the wire
    assert kinds(bus, "tool_result")[0]["is_error"]


def test_the_same_tool_name_on_two_servers_fails_the_boot(servers, bus):
    with pytest.raises(ValueError, match="published by both"):
        chat({"garden": servers["garden"], "garden-copy": servers["garden"]}, bus, None)


def test_a_server_that_is_down_fails_the_boot_loudly(bus):
    with pytest.raises(ServerUnavailable):
        chat({"garden": "http://127.0.0.1:9/mcp"}, bus, None)
    assert kinds(bus, "boot_error")


def test_a_server_down_mid_chat_is_told_by_code_not_by_the_llm(servers, bus):
    uv, url = start_server(garden)
    _, answer = chat({"garden": url}, bus, "my plants?", [("list_plants", {})], "never reached",
                     before=lambda _: stop(uv))
    assert "unavailable" in answer and kinds(bus, "error")


def test_the_wire_shows_the_mirrored_routing_headers(servers, bus):
    async def scenario():
        connection = MCPConnection("garden", servers["garden"], bus)
        await connection.open()
        await connection.close()
    asyncio.run(scenario())
    out = sent(bus)[-1]
    assert out["headers"]["mcp-method"] == "tools/list" and out["headers"]["mcp-protocol-version"] == "2026-07-28"
    assert out["body"]["method"] == "tools/list"



def stop(uv):
    uv.should_exit = True
    while any(server.is_serving() for server in uv.servers):
        time.sleep(0.02)
