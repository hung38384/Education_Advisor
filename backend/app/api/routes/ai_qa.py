"""
Internal AI QA Route

Exposes an internal endpoint for Express to query AI answers that focus on
admission proposals/rules and historical admission scores.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.qa_service import AIQAServiceError, ask_admission_qa
from app.core.config import settings

router = APIRouter(tags=["AI Internal"])


class AIConversationMessage(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="Conversation role")
    message: str = Field(..., min_length=1, max_length=4000, description="Message content")


class AIProfileContext(BaseModel):
    fullName: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    targetMajor: Optional[str] = Field(default=None)
    targetUniversity: Optional[str] = Field(default=None)


class AIPersonalityContext(BaseModel):
    mbtiType: Optional[str] = Field(default=None)


class AIReviewContext(BaseModel):
    overallScore: Optional[float] = Field(default=None)
    summary: Optional[str] = Field(default=None)


class AIQuestionContext(BaseModel):
    profile: Optional[AIProfileContext] = None
    personality: Optional[AIPersonalityContext] = None
    review: Optional[AIReviewContext] = None
    history: List[AIConversationMessage] = Field(default_factory=list)


class AIQARequest(BaseModel):
    userId: Optional[int] = Field(default=None)
    question: str = Field(..., min_length=1, max_length=2000)
    context: Optional[AIQuestionContext] = None


class AIQAResponse(BaseModel):
    answer: str
    metadata: Dict[str, Any]


def _verify_internal_api_key(x_internal_api_key: Optional[str]) -> None:
    expected_key = settings.INTERNAL_API_KEY.strip()
    if not expected_key:
        return

    if not x_internal_api_key or x_internal_api_key.strip() != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )


@router.post("/api/ai/qa/ask", response_model=AIQAResponse)
def ask_internal_ai_qa(
    payload: AIQARequest,
    x_internal_api_key: Optional[str] = Header(default=None, alias="X-Internal-Api-Key"),
) -> AIQAResponse:
    _verify_internal_api_key(x_internal_api_key)

    try:
        result = ask_admission_qa(
            question=payload.question,
            context=payload.context.model_dump() if payload.context else None,
        )
        return AIQAResponse(**result)
    except AIQAServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
