"""
AI advisor API routes.

This module exposes the LangGraph-based education advisor through FastAPI while
keeping the AI workflow lazily initialized via get_ai_workflow().
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.ai.graph.workflow import get_ai_workflow

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Advisor"])

GRAPH_TIMEOUT_SECONDS = 180
YEAR_PATTERN = re.compile(r"\b(20\d{2}|19\d{2})\b")
PENDING_CLARIFICATION_TTL_SECONDS = 30 * 60
_PENDING_CLARIFICATIONS: Dict[str, Dict[str, Any]] = {}
_PENDING_LOCK = threading.Lock()


class AdviceRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default=None, max_length=128)
    conversation_id: Optional[str] = Field(default=None, max_length=128)
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


def _session_key(request: AdviceRequest) -> Optional[str]:
    raw_key = request.session_id or request.conversation_id
    if not raw_key and request.student_profile:
        raw_key = request.student_profile.get("session_id") or request.student_profile.get("conversation_id")
    if not raw_key:
        return None
    return str(raw_key).strip()[:128] or None


def _load_pending_clarification(session_key: Optional[str], target_university: Optional[str]) -> Optional[Dict[str, Any]]:
    if not session_key:
        return None
    now = time.time()
    with _PENDING_LOCK:
        item = _PENDING_CLARIFICATIONS.get(session_key)
        if not item:
            return None
        if item.get("expires_at", 0) <= now:
            _PENDING_CLARIFICATIONS.pop(session_key, None)
            return None
        pending = dict(item.get("pending") or {})

    pending_uni = str(pending.get("target_university") or "").upper()
    request_uni = str(target_university or "").upper()
    if pending_uni and request_uni and pending_uni != request_uni:
        with _PENDING_LOCK:
            _PENDING_CLARIFICATIONS.pop(session_key, None)
        return None
    return pending


def _store_pending_clarification(session_key: Optional[str], pending: Optional[Dict[str, Any]]) -> None:
    if not session_key:
        return
    with _PENDING_LOCK:
        if pending:
            _PENDING_CLARIFICATIONS[session_key] = {
                "pending": pending,
                "expires_at": time.time() + PENDING_CLARIFICATION_TTL_SECONDS,
            }
        else:
            _PENDING_CLARIFICATIONS.pop(session_key, None)


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

    def clean_message(content: Any) -> str:
        text = str(content).strip()
        return re.sub(r"^\[[^\]\n]{0,100}\]:\s*", "", text).strip()

    for message in reversed(messages):
        name = getattr(message, "name", None)
        if name == "Synthesis":
            return clean_message(getattr(message, "content", ""))

    if messages:
        last_message = messages[-1]
        return clean_message(getattr(last_message, "content", last_message))

    return "Hệ thống chưa tạo được phản hồi tư vấn."


def _invoke_graph(request: AdviceRequest, pending_clarification: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    app_graph = get_ai_workflow()
    user_profile = _build_user_profile(request)

    initial_state = {
        "messages": [("user", request.query)],
        "target_university": request.target_university,
        "user_profile": user_profile,
        "called_agents": [],
        "calculated_score": None,
        "calculated_details": {},
        "pending_clarification": pending_clarification,
    }

    return app_graph.invoke(initial_state)


@router.post("/advise", response_model=AdviceResponse)
async def advise(request: AdviceRequest) -> AdviceResponse:
    session_key = _session_key(request)
    pending_clarification = _load_pending_clarification(session_key, request.target_university)
    try:
        result = await asyncio.wait_for(
            run_in_threadpool(_invoke_graph, request, pending_clarification),
            timeout=GRAPH_TIMEOUT_SECONDS,
        )
        _store_pending_clarification(session_key, result.get("pending_clarification"))
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
