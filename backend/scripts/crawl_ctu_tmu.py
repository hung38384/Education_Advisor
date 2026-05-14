# flake8: noqa: E501
"""
Crawl admission scores for TMU and CTU.

This script fetches 2023-2025 cutoff scores for:
- Dai hoc Thuong mai (TMU)
- Dai hoc Can Tho (CTU)

Output:
- MongoDB collection: admission_scores
- No local JSON files are created

Each MongoDB document is stored in the same shape as the existing
admission score schema, for example:
{
  "university_code": "BKA",
  "year": 2023,
  "method_name": "Diem thi THPT",
  "method_type": "THPT",
  "major_code": "BF-E12",
  "major_name": "Ky thuat Thuc pham (CT tien tien)",
  "score": 22.7,
  "subject_combinations": ["A00"],
  "notes": None
}

Usage:
    venv\\Scripts\\python.exe backend\\scripts\\crawl_admission_dataset.py
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import httpx
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.constants import (
    METHOD_IDS,
    TARGET_UNIVERSITIES,
    TARGET_YEARS,
)  # noqa: E402


LOGGER = logging.getLogger(__name__)

API_BASE_URL = "https://diemthi.tuyensinh247.com/api/common/cutoff-score"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.0.0 Safari/537.36"
)

TARGET_CODES = ("TMU", "CTU")
MAX_RETRIES = 3
MIN_DELAY = 0.2
MAX_DELAY = 0.6
SCORE_COLLECTION_NAME = "admission_scores"


def dedupe_score_records(records: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique: Dict[tuple[Any, ...], Dict[str, Any]] = {}
    for record in records:
        key = (
            record.get("year"),
            record.get("method_name"),
            record.get("method_type"),
            record.get("major_code"),
            record.get("major_name"),
            record.get("score"),
            tuple(record.get("subject_combinations") or []),
        )
        unique.setdefault(key, record)
    return sorted(
        unique.values(),
        key=lambda item: (
            item.get("year") or 0,
            item.get("method_name") or "",
            item.get("major_code") or "",
            item.get("major_name") or "",
        ),
    )


def split_subject_combinations(raw_value: str) -> List[str]:
    return [
        entry.strip() for entry in re.split(r"[;,]", raw_value or "") if entry.strip()
    ]


def score_method_type(method_name: str, university_code: str) -> str:
    if not method_name:
        return "OTHER"

    name_upper = method_name.upper()
    if "THPT" in name_upper:
        return "THPT"
    if "ĐGNL" in name_upper or "ĐÁNH GIÁ NĂNG LỰC" in name_upper:
        if university_code in {"QHI", "QSB", "QHX", "QHF"}:
            return "HSA"
        return "APT"
    if "TƯ DUY" in name_upper or "ĐGTD" in name_upper:
        return "TSA"
    if "HỌC BẠ" in name_upper:
        return "HOC_BA"
    if "KẾT HỢP" in name_upper or "CHỨNG CHỈ" in name_upper or "IELTS" in name_upper:
        return "IELTS_COMBINED"
    return "OTHER"


def build_score_db_documents(dataset: Dict[str, Any]) -> List[Dict[str, Any]]:
    documents: List[Dict[str, Any]] = []
    university_code = dataset["university_code"]

    for score in dataset["admission_scores"]:
        documents.append(
            {
                "university_code": university_code,
                "year": score.get("year"),
                "method_name": score.get("method_name"),
                "method_type": score.get("method_type"),
                "major_code": score.get("major_code"),
                "major_name": score.get("major_name"),
                "score": score.get("score"),
                "subject_combinations": score.get("subject_combinations") or [],
                "notes": score.get("notes"),
            }
        )

    return documents


def get_score_collection_name(university_code: str) -> str:
    if university_code not in TARGET_CODES:
        raise ValueError(f"Unsupported university code: {university_code}")
    return SCORE_COLLECTION_NAME


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    LOGGER.info("Creating database indexes...")
    score_collection = db[SCORE_COLLECTION_NAME]
    await score_collection.create_index(
        [("university_code", 1), ("year", 1), ("method_type", 1)],
        unique=False,
    )
    await score_collection.create_index(
        [("university_code", 1), ("year", 1), ("major_code", 1)],
        unique=False,
    )
    LOGGER.info("Indexes created successfully")


async def sync_dataset_to_database(
    db: AsyncIOMotorDatabase, dataset: Dict[str, Any]
) -> Dict[str, Any]:
    university_code = dataset["university_code"]
    collection_name = get_score_collection_name(university_code)
    score_collection = db[collection_name]

    score_documents = build_score_db_documents(dataset)

    await score_collection.delete_many(
        {
            "university_code": university_code,
            "year": {"$in": list(TARGET_YEARS)},
        }
    )

    inserted_scores = 0

    if score_documents:
        score_result = await score_collection.insert_many(
            score_documents, ordered=False
        )
        inserted_scores = len(score_result.inserted_ids)

    return {
        "inserted_scores": inserted_scores,
        "collection_name": collection_name,
    }


async def fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    expect_json: bool = False,
) -> Any:
    last_error: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await client.get(url)
            response.raise_for_status()
            if expect_json:
                return response.json()
            return response
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= MAX_RETRIES:
                break
            await asyncio.sleep((attempt * 0.8) + random.uniform(0.1, 0.4))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error


async def fetch_admission_scores(
    client: httpx.AsyncClient,
    university_code: str,
    school_id: int,
) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []

    for year in TARGET_YEARS:
        for method_id in METHOD_IDS:
            url = (
                f"{API_BASE_URL}?"
                f"school_id={school_id}&method_id={method_id}&year={year}"
            )
            try:
                payload = await fetch_with_retry(client, url, expect_json=True)
            except RuntimeError as exc:
                LOGGER.warning(
                    "Score request failed for %s/%s/%s: %s",
                    university_code,
                    year,
                    method_id,
                    exc,
                )
                continue

            items = payload.get("data") or []
            if not items:
                await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
                continue

            method_name = items[0].get("admission_name", "")
            method_type = score_method_type(method_name, university_code)
            for item in items:
                records.append(
                    {
                        "year": item.get("year"),
                        "method_name": item.get("admission_name"),
                        "method_type": method_type,
                        "major_code": item.get("code"),
                        "major_name": item.get("name"),
                        "score": float(item["mark"]) if item.get("mark") else None,
                        "subject_combinations": split_subject_combinations(
                            item.get("block") or ""
                        ),
                        "notes": item.get("introtext") or None,
                    }
                )

            await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    return dedupe_score_records(records)


async def crawl_university_dataset(
    client: httpx.AsyncClient,
    university_meta: Dict[str, Any],
) -> Dict[str, Any]:
    university_code = university_meta["code"]
    school_id = university_meta["school_id"]
    LOGGER.info("Crawling dataset for %s", university_code)

    scores = await fetch_admission_scores(client, university_code, school_id)

    dataset = {
        "university_code": university_code,
        "university_name": university_meta["name"],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "admission_scores": scores,
        "meta": {
            "score_source": API_BASE_URL,
            "target_years": list(TARGET_YEARS),
            "total_records": len(scores),
        },
    }
    return dataset


async def main() -> bool:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    university_lookup = {
        item["code"]: item
        for item in TARGET_UNIVERSITIES
        if item["code"] in TARGET_CODES
    }

    if set(university_lookup) != set(TARGET_CODES):
        missing = sorted(set(TARGET_CODES) - set(university_lookup))
        raise RuntimeError(f"Missing university configuration for: {missing}")

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    }

    crawl_results: List[Dict[str, int | str]] = []
    timeout = httpx.Timeout(45.0, connect=20.0)
    from app.core.config import settings  # noqa: E402

    mongo_client: Optional[AsyncIOMotorClient] = None

    try:
        LOGGER.info("Connecting to MongoDB: %s", settings.MONGODB_URL)
        mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = mongo_client[settings.MONGODB_DB_NAME]
        await db.command("ping")
        LOGGER.info("Connected to database: %s", settings.MONGODB_DB_NAME)
        await create_indexes(db)

        async with httpx.AsyncClient(
            headers=headers,
            timeout=timeout,
            follow_redirects=True,
        ) as client:
            for code in TARGET_CODES:
                dataset = await crawl_university_dataset(
                    client, university_lookup[code]
                )
                sync_result = await sync_dataset_to_database(db, dataset)
                crawl_results.append(
                    {
                        "university_code": code,
                        "score_records": len(dataset["admission_scores"]),
                        "inserted_scores": sync_result["inserted_scores"],
                        "collection_name": sync_result["collection_name"],
                    }
                )
    finally:
        if mongo_client is not None:
            LOGGER.info("Closing MongoDB connection...")
            mongo_client.close()
            LOGGER.info("MongoDB connection closed")

    for result in crawl_results:
        LOGGER.info(
            "%s: %s records inserted into %s",
            result["university_code"],
            result["inserted_scores"],
            result["collection_name"],
        )

    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
    except KeyboardInterrupt:
        success = False
    sys.exit(0 if success else 1)
