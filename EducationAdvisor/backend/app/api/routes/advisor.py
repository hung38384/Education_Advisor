"""
AI advisor API routes.

This module exposes the LangGraph-based education advisor through FastAPI while
keeping the AI workflow lazily initialized via get_ai_workflow().
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.ai.graph.workflow import get_ai_workflow

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Advisor"])

GRAPH_TIMEOUT_SECONDS = 180
YEAR_PATTERN = re.compile(r"\b(20\d{2}|19\d{2})\b")


class AdviceRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    target_university: Optional[str] = Field(default=None, max_length=20)
    target_major: Optional[str] = Field(default=None, max_length=100)
    target_major_name: Optional[str] = Field(default=None, max_length=255)
    target_year: Optional[str] = Field(default=None, max_length=10)
    mbti: Optional[str] = Field(default=None, max_length=255)
    ielts: Optional[float] = Field(default=None, ge=0, le=9)
    tsa_score: Optional[float] = Field(default=None, ge=0)
    transcript: Optional[Dict[str, float]] = Field(default=None)
    student_profile: Optional[Dict[str, Any]] = Field(default=None)


class AdviceResponse(BaseModel):
    status: str
    advice: str


def _build_user_profile(request: AdviceRequest) -> Dict[str, Any]:
    profile = dict(request.student_profile or {})

    for key in (
        "target_university",
        "target_major",
        "target_major_name",
        "target_year",
        "mbti",
        "ielts",
        "tsa_score",
        "transcript",
    ):
        value = getattr(request, key)
        if value is not None:
            profile[key] = value

    if "target_year" not in profile:
        year_match = YEAR_PATTERN.search(request.query)
        if year_match:
            profile["target_year"] = year_match.group(1)

    return profile


def _extract_final_message(result: Dict[str, Any]) -> str:
    messages: List[Any] = result.get("messages", []) if isinstance(result, dict) else []

    for message in reversed(messages):
        name = getattr(message, "name", None)
        if name == "Synthesis":
            return str(getattr(message, "content", ""))

    if messages:
        last_message = messages[-1]
        return str(getattr(last_message, "content", last_message))

    return "Hệ thống chưa tạo được phản hồi tư vấn."


def _invoke_graph(request: AdviceRequest) -> Dict[str, Any]:
    app_graph = get_ai_workflow()
    user_profile = _build_user_profile(request)

    initial_state = {
        "messages": [("user", request.query)],
        "target_university": request.target_university,
        "user_profile": user_profile,
        "called_agents": [],
        "calculated_score": None,
        "calculated_details": {},
    }

    return app_graph.invoke(initial_state)


@router.post("/advise", response_model=AdviceResponse)
async def advise(request: AdviceRequest) -> AdviceResponse:
    try:
        result = await asyncio.wait_for(
            run_in_threadpool(_invoke_graph, request),
            timeout=GRAPH_TIMEOUT_SECONDS,
        )
        final_message = _extract_final_message(result)
        return AdviceResponse(status="success", advice=final_message)
    except asyncio.TimeoutError as exc:
        logger.exception("AI advisor graph timed out")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI advisor request timed out. Please try a shorter question or retry later.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("AI advisor graph execution failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI advisor failed to process the request.",
        ) from exc
