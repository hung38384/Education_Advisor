from __future__ import annotations

import re
from math import ceil
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


_SEARCH_FIELDS = [
    "university_code",
    "university_name",
    "school_name",
    "major_code",
    "major_name",
]


def _normalize_score(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _normalize_subject_combinations(value: Any) -> List[str]:
    if value is None:
        return []

    if isinstance(value, str):
        parts = [item.strip() for item in value.split(",")]
        return [item for item in parts if item]

    if isinstance(value, list):
        normalized: List[str] = []
        for item in value:
            text = str(item).strip()
            if text:
                normalized.append(text)
        return normalized

    return []


def build_mongo_query(
    q: Optional[str] = None,
    year: Optional[int] = None,
    method_tag: Optional[str] = None,
    university_code: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
) -> Dict[str, Any]:
    query: Dict[str, Any] = {}

    if q and q.strip():
        terms = [term for term in q.strip().split() if term]
        and_conditions: List[Dict[str, Any]] = []

        for term in terms:
            regex = {"$regex": re.escape(term), "$options": "i"}
            and_conditions.append({"$or": [{field: regex} for field in _SEARCH_FIELDS]})

        if and_conditions:
            query["$and"] = and_conditions

    if year is not None:
        query["year"] = year

    if method_tag:
        query["method_tag"] = method_tag

    if university_code:
        query["university_code"] = university_code

    score_filter: Dict[str, float] = {}
    if min_score is not None:
        score_filter["$gte"] = float(min_score)
    if max_score is not None:
        score_filter["$lte"] = float(max_score)
    if score_filter:
        query["score"] = score_filter

    return query


def build_admission_catalog_response(
    records: List[Dict[str, Any]],
    page: int = 1,
    page_size: int = 15,
) -> Dict[str, Any]:
    page = max(1, int(page))
    page_size = min(50, max(1, int(page_size)))

    grouped: Dict[str, Dict[str, Any]] = {}
    all_years = set()
    all_method_tags = set()
    all_universities: Dict[str, Optional[str]] = {}

    for record in records:
        university_code = str(record.get("university_code") or "").strip()
        major_code = str(record.get("major_code") or "").strip()
        major_name = str(record.get("major_name") or "").strip()

        if not university_code or not major_code or not major_name:
            continue

        university_name = record.get("university_name")
        if university_name is None or not str(university_name).strip():
            university_name = record.get("school_name")

        group_key = f"{university_code}::{major_code}"
        if group_key not in grouped:
            grouped[group_key] = {
                "universityCode": university_code,
                "universityName": university_name,
                "majorCode": major_code,
                "majorName": major_name,
                "methods": {},
            }

        all_universities[university_code] = university_name

        method_tag = str(record.get("method_tag") or "").strip()
        method_alias = record.get("method_alias")
        method_key = method_tag or "UNKNOWN"

        methods = grouped[group_key]["methods"]
        if method_key not in methods:
            methods[method_key] = {
                "methodTag": method_tag if method_tag else None,
                "methodAlias": method_alias,
                "subjectCombinations": set(),
                "yearlyScores": [],
                "shortComment": record.get("short_comment"),
            }

        method_bucket = methods[method_key]
        for combo in _normalize_subject_combinations(
            record.get("subject_combinations")
        ):
            method_bucket["subjectCombinations"].add(combo)

        score = _normalize_score(record.get("score"))
        year_value = record.get("year")
        try:
            year_int = int(year_value) if year_value is not None else None
        except (TypeError, ValueError):
            year_int = None

        if score is not None and year_int is not None:
            method_bucket["yearlyScores"].append({"year": year_int, "score": score})
            all_years.add(year_int)

        if method_tag:
            all_method_tags.add(method_tag)

    rows: List[Dict[str, Any]] = []

    for _, group in sorted(
        grouped.items(), key=lambda kv: (kv[1]["universityCode"], kv[1]["majorCode"])
    ):
        methods_list: List[Dict[str, Any]] = []
        methods_map = group.pop("methods")

        for _, method in sorted(methods_map.items(), key=lambda kv: (kv[0])):
            method["subjectCombinations"] = sorted(method["subjectCombinations"])
            method["yearlyScores"] = sorted(
                method["yearlyScores"], key=lambda item: item["year"], reverse=True
            )
            methods_list.append(method)

        group["methods"] = methods_list
        rows.append(group)

    total_items = len(rows)
    total_pages = ceil(total_items / page_size) if total_items > 0 else 1
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": rows[start:end],
        "pagination": {
            "page": page,
            "pageSize": page_size,
            "totalItems": total_items,
            "totalPages": total_pages,
        },
        "filters": {
            "years": sorted(all_years, reverse=True),
            "methodTags": sorted(all_method_tags),
            "universities": [
                {
                    "universityCode": code,
                    "universityName": all_universities.get(code),
                }
                for code in sorted(all_universities.keys())
            ],
        },
    }


async def search_admissions(
    db: AsyncIOMotorDatabase,
    q: Optional[str] = None,
    year: Optional[int] = None,
    method_tag: Optional[str] = None,
    university_code: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    page: int = 1,
    page_size: int = 15,
) -> Dict[str, Any]:
    query = build_mongo_query(
        q=q,
        year=year,
        method_tag=method_tag,
        university_code=university_code,
        min_score=min_score,
        max_score=max_score,
    )

    cursor = (
        db["admission_scores"]
        .find(query)
        .sort(
            [
                ("university_code", 1),
                ("major_code", 1),
                ("method_tag", 1),
                ("year", -1),
            ]
        )
    )
    records = await cursor.to_list(length=5000)
    return build_admission_catalog_response(
        records=records, page=page, page_size=page_size
    )
