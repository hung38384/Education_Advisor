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
                   Values: "CareerProfiler", "AcademicExpert", "ScoreCalculator", "DataStrategist", "FINISH"
        user_profile: Dictionary containing student information:
                     - mbti: MBTI personality type and description
                     - ielts: IELTS score (float)
                     - transcript: Dict of subject::score for academic assessment
                     - tsa_score: TSA/ĐGTD score (float)
                     - target_university, target_major, target_year
        called_agents: List of agents that have already been called (tracks progress)
        calculated_score: Total admission score calculated by ScoreCalculator (TSA + IELTS bonus)
        calculated_details: Dictionary with breakdown:
                           - tsa_score, ielts_score, ielts_bonus, total_score
        admission_assessment: Deterministic admission comparison produced by DataStrategist.
        pending_clarification: Short-lived structured slot-filling state used
                               for follow-up answers like "năm 2024 ạ".
    """
    
    messages: Annotated[list, add_messages]
    next_agent: str
    user_profile: dict[str, Any]
    called_agents: list[str]
    calculated_score: float | None
    calculated_details: dict[str, Any]
    admission_assessment: dict[str, Any] | None
    pending_clarification: dict[str, Any] | None
