"""
Fast career prediction API.

This router is intentionally narrow: it accepts student profile features,
delegates prediction to CareerRecommender, and returns only the top 3 career
group names.
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.ai.ml.ml_recommender import get_recommender

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Fast Prediction"])


class FastPredictRequest(BaseModel):
    mbti: str = Field(..., min_length=4, max_length=4)
    academic_scores: Dict[str, float] = Field(..., min_length=1)
    ielts: Optional[float] = Field(default=None, ge=0, le=9)

    @field_validator("mbti")
    @classmethod
    def normalize_mbti(cls, value: str) -> str:
        mbti = value.strip().upper()
        if len(mbti) != 4 or any(ch not in "EISNTFJP" for ch in mbti):
            raise ValueError("mbti must be a valid 4-letter MBTI code")
        return mbti


class FastPredictResponse(BaseModel):
    status: str
    predictions: List[str]


@router.post("/predict-fast", response_model=FastPredictResponse)
async def predict_fast(request: FastPredictRequest) -> FastPredictResponse:
    try:
        recommender = get_recommender()

        raw_predictions = recommender.predict_top_3(
            {
                "mbti": request.mbti,
                "transcript": request.academic_scores,
                "ielts": request.ielts,
            }
        )

        predictions = [
            item["name"] if isinstance(item, dict) else str(item)
            for item in raw_predictions[:3]
        ]

        return FastPredictResponse(status="success", predictions=predictions)
    except Exception as exc:
        logger.exception("Fast career prediction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fast career prediction failed.",
        ) from exc
