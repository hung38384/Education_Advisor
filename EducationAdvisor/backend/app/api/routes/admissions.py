from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.ai.admissions_search import search_admissions
from app.db.connection import get_db

router = APIRouter(tags=["Admissions"])


@router.get("/admissions/search")
async def admissions_search(
    q: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    methodTag: Optional[str] = Query(default=None),
    universityCode: Optional[str] = Query(default=None),
    minScore: Optional[float] = Query(default=None),
    maxScore: Optional[float] = Query(default=None),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=15, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    return await search_admissions(
        db=db,
        q=q,
        year=year,
        method_tag=methodTag,
        university_code=universityCode,
        min_score=minScore,
        max_score=maxScore,
        page=page,
        page_size=pageSize,
    )
