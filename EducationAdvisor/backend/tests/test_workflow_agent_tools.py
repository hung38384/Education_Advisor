import sys
from pathlib import Path
from types import SimpleNamespace

from langchain_google_genai import ChatGoogleGenerativeAI

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.ai.graph.workflow as workflow
from app.ai.graph.workflow import create_expert_agent
from app.ai.tools.tools import search_admission_rules


class FakeLLM:
    def __init__(self, bind_result=None, bind_error=None):
        self.bind_result = bind_result
        self.bind_error = bind_error
        self.bind_call = None

    def bind_tools(self, tools, **kwargs):
        self.bind_call = (tools, kwargs)
        if self.bind_error:
            raise self.bind_error
        return self.bind_result


def test_create_expert_agent_builds_google_agent_with_tools(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key="test-google-key",
        temperature=0,
    )

    agent = create_expert_agent(llm, [search_admission_rules], "Bạn là chuyên gia tuyển sinh.")

    assert agent is not None


def test_create_expert_agent_uses_prebound_model_when_tool_names_match(monkeypatch):
    selected_model = None

    def fake_create_react_agent(*, model, tools, state_modifier):
        nonlocal selected_model
        selected_model = model
        return "agent"

    bound_model = SimpleNamespace(kwargs={"tools": [{"name": "search_admission_rules"}]})
    raw_model = FakeLLM(bind_result=bound_model)
    tool = SimpleNamespace(name="search_admission_rules")
    monkeypatch.setattr(workflow, "create_react_agent", fake_create_react_agent)

    agent = create_expert_agent(raw_model, [tool], "system prompt")

    assert agent == "agent"
    assert selected_model is bound_model
    assert raw_model.bind_call == ([tool], {"parallel_tool_calls": False})


def test_create_expert_agent_lets_langgraph_bind_when_tool_names_do_not_match(monkeypatch):
    selected_model = None

    def fake_create_react_agent(*, model, tools, state_modifier):
        nonlocal selected_model
        selected_model = model
        return "agent"

    bound_model = SimpleNamespace(kwargs={"tools": [{"function": {"name": "__arg1"}, "type": "function"}]})
    raw_model = FakeLLM(bind_result=bound_model)
    tool = SimpleNamespace(name="search_admission_rules")
    monkeypatch.setattr(workflow, "create_react_agent", fake_create_react_agent)

    agent = create_expert_agent(raw_model, [tool], "system prompt")

    assert agent == "agent"
    assert selected_model is raw_model


def test_create_expert_agent_lets_langgraph_bind_when_bound_model_kwargs_are_invalid(monkeypatch):
    selected_models = []

    def fake_create_react_agent(*, model, tools, state_modifier):
        selected_models.append(model)
        return "agent"

    tool = SimpleNamespace(name="search_admission_rules")
    monkeypatch.setattr(workflow, "create_react_agent", fake_create_react_agent)

    none_kwargs_raw_model = FakeLLM(bind_result=SimpleNamespace(kwargs=None))
    invalid_kwargs_raw_model = FakeLLM(bind_result=SimpleNamespace(kwargs="invalid"))

    assert create_expert_agent(none_kwargs_raw_model, [tool], "system prompt") == "agent"
    assert create_expert_agent(invalid_kwargs_raw_model, [tool], "system prompt") == "agent"
    assert selected_models == [none_kwargs_raw_model, invalid_kwargs_raw_model]


def test_create_expert_agent_lets_langgraph_bind_when_provider_bind_fails(monkeypatch):
    selected_model = None

    def fake_create_react_agent(*, model, tools, state_modifier):
        nonlocal selected_model
        selected_model = model
        return "agent"

    raw_model = FakeLLM(bind_error=ValueError("provider rejected tools"))
    tool = SimpleNamespace(name="search_admission_rules")
    monkeypatch.setattr(workflow, "create_react_agent", fake_create_react_agent)

    agent = create_expert_agent(raw_model, [tool], "system prompt")

    assert agent == "agent"
    assert selected_model is raw_model
