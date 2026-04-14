"""
LangGraph Agent State Definition

Defines the shared state structure for the multi-agent supervisor system.
This state is passed between all agents and the supervisor.
"""

from typing import TypedDict, Annotated, Any
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    Shared state for the multi-agent supervisor system.
    
    Attributes:
        messages: Conversation history. New messages are automatically appended.
        next_agent: Indicates which agent should be called next by supervisor.
                   Values: "CareerProfiler", "AcademicExpert", "DataStrategist", "FINISH"
        user_profile: Dictionary containing student information:
                     - mbti: MBTI personality type and description
                     - ielts: IELTS score (float)
                     - transcript: Dict of subject::score for academic assessment
                     - Add more fields as needed (hsCode, preferences, etc.)
        called_agents: List of agents that have already been called (tracks progress)
    """
    
    messages: Annotated[list, add_messages]
    next_agent: str
    user_profile: dict[str, Any]
    called_agents: list[str]
