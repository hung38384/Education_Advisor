"""
Tool layer for admission Q&A.

This module exposes two LangChain tools used by the LangGraph workflow:
- search_admission_rules: retrieve admission proposal content
- get_historical_scores: retrieve historical cutoff scores

It prefers Chroma + MongoDB when available and degrades gracefully to local
markdown search when those backends are unavailable.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from langchain_core.tools import tool

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[3]
RULES_DIR = BACKEND_DIR / "data" / "processed_rules"
CHROMA_DIR = BACKEND_DIR / "data" / "chroma_db"

UNIVERSITY_ALIASES: Dict[str, List[str]] = {
    "BKA": ["bka", "hust", "bách khoa", "bach khoa", "bách khoa hà nội", "dai hoc bach khoa ha noi"],
    "TMU": ["tmu", "đại học thương mại", "dai hoc thuong mai"],
    "CTU": ["ctu", "đại học cần thơ", "dai hoc can tho"],
}

VI_STOPWORDS = {
    "la",
    "là",
    "va",
    "và",
    "cho",
    "cua",
    "của",
    "trong",
    "theo",
    "nam",
    "năm",
    "ve",
    "về",
    "nhu",
    "như",
    "bao",
    "nhiêu",
    "bao_nhieu",
    "toi",
    "tôi",
    "hoc",
    "học",
    "truong",
    "trường",
    "nganh",
    "ngành",
    "diem",
    "điểm",
}

_VECTORSTORE: Any | None = None
_VECTORSTORE_ERROR: Exception | None = None
_VECTORSTORE_INITIALIZED = False

_MONGO_COLLECTION: Any | None = None
_MONGO_COLLECTION_ERROR: Exception | None = None
_MONGO_COLLECTION_INITIALIZED = False


def _truthy(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _normalize_text(value: str) -> str:
    return _strip_accents(value).casefold().strip()


def _normalize_code(value: str | None) -> str:
    if not value:
        return ""
    code = value.strip().upper()
    return code if code else ""


def _extract_year(value: str) -> Optional[int]:
    match = re.search(r"\b(20\d{2})\b", value)
    if not match:
        return None
    year = int(match.group(1))
    if 2000 <= year <= 2100:
        return year
    return None


def _infer_university_code(text: str) -> str:
    normalized = _normalize_text(text)
    for code, aliases in UNIVERSITY_ALIASES.items():
        if code.casefold() in text.casefold():
            return code
        for alias in aliases:
            if _normalize_text(alias) in normalized:
                return code
    return ""


def _query_tokens(text: str) -> List[str]:
    raw_tokens = re.findall(r"[0-9A-Za-zÀ-ỹà-ỹ]+", text)
    tokens: List[str] = []
    for token in raw_tokens:
        normalized = _normalize_text(token)
        if len(normalized) < 2:
            continue
        if normalized in VI_STOPWORDS:
            continue
        tokens.append(normalized)
    return tokens


def _extract_metadata_from_filename(filename: str) -> Dict[str, str]:
    match = re.match(r"^([A-Z]+)_DeAn(\d{4})_clean\.md$", filename)
    if not match:
        return {}
    return {"university": match.group(1), "year": match.group(2), "source": filename}


def _compact_text(text: str, max_chars: int = 420) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= max_chars:
        return compact
    truncated = compact[:max_chars].rsplit(" ", 1)[0]
    return f"{truncated}..."


def _score_text(text: str, tokens: Iterable[str]) -> int:
    haystack = _normalize_text(text)
    score = 0
    for token in tokens:
        if token in haystack:
            score += 1
    return score


@lru_cache(maxsize=1)
def _load_markdown_chunks() -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []

    if not RULES_DIR.exists():
        logger.warning("Rules directory does not exist: %s", RULES_DIR)
        return chunks

    for file_path in sorted(RULES_DIR.glob("*_clean.md")):
        metadata = _extract_metadata_from_filename(file_path.name)
        if not metadata:
            continue

        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to read %s: %s", file_path.name, exc)
            continue

        current_heading = "Nội dung chung"
        buffer: List[str] = []

        def flush_buffer() -> None:
            if not buffer:
                return
            body = "\n".join(buffer).strip()
            buffer.clear()
            if not body:
                return
            chunks.append(
                {
                    **metadata,
                    "heading": current_heading,
                    "text": body,
                }
            )

        for raw_line in content.splitlines():
            line = raw_line.strip()
            if line.startswith("#"):
                flush_buffer()
                current_heading = line.lstrip("#").strip() or "Nội dung"
                continue
            buffer.append(raw_line)

        flush_buffer()

    return chunks


def _search_markdown_rules(
    query: str,
    university_code: str,
    year: Optional[int],
    top_k: int,
) -> List[Dict[str, Any]]:
    tokens = _query_tokens(query)
    if not tokens:
        tokens = [_normalize_text(query)]

    candidates = _load_markdown_chunks()
    scored: List[Dict[str, Any]] = []

    for candidate in candidates:
        if university_code and candidate.get("university") != university_code:
            continue
        if year and candidate.get("year") != str(year):
            continue

        heading_text = f"{candidate.get('heading', '')}\n{candidate.get('text', '')}"
        score = _score_text(heading_text, tokens)
        if score <= 0:
            continue

        scored.append(
            {
                "score": score,
                "text": candidate.get("text", ""),
                "heading": candidate.get("heading", "Nội dung"),
                "source": candidate.get("source", "unknown"),
                "university": candidate.get("university", "N/A"),
                "year": candidate.get("year", "N/A"),
            }
        )

    scored.sort(
        key=lambda item: (
            int(item.get("score", 0)),
            str(item.get("year", "")),
            str(item.get("source", "")),
        ),
        reverse=True,
    )
    return scored[:top_k]


def _format_rule_results(results: List[Dict[str, Any]], provider: str) -> str:
    if not results:
        return "Không tìm thấy dữ liệu đề án tuyển sinh phù hợp trong kho hiện tại."

    lines = [f"Kết quả tra cứu đề án tuyển sinh ({provider}):"]
    for idx, item in enumerate(results, start=1):
        heading = item.get("heading", "Nội dung")
        source = item.get("source", "unknown")
        uni = item.get("university", "N/A")
        year = item.get("year", "N/A")
        snippet = _compact_text(str(item.get("text", "")))
        lines.append(
            f"{idx}. [{uni} {year}] {heading}: {snippet} (nguồn: {source})"
        )

    return "\n".join(lines)


def _load_vectorstore() -> Any | None:
    global _VECTORSTORE, _VECTORSTORE_ERROR, _VECTORSTORE_INITIALIZED

    if _VECTORSTORE_INITIALIZED:
        return _VECTORSTORE

    _VECTORSTORE_INITIALIZED = True

    if _truthy(os.getenv("AI_DISABLE_CHROMA")):
        logger.info("AI_DISABLE_CHROMA is enabled; skip Chroma initialization.")
        return None

    try:
        from langchain_chroma import Chroma
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        embedding_model = os.getenv(
            "AI_EMBEDDING_MODEL",
            "models/gemini-embedding-2-preview",
        )
        embeddings = GoogleGenerativeAIEmbeddings(model=embedding_model)

        _VECTORSTORE = Chroma(
            persist_directory=str(CHROMA_DIR),
            collection_name="admission_rules",
            embedding_function=embeddings,
        )
        logger.info("Chroma vectorstore initialized at %s", CHROMA_DIR)
        return _VECTORSTORE

    except Exception as exc:
        _VECTORSTORE_ERROR = exc
        logger.warning("Unable to initialize Chroma vectorstore: %s", exc)
        return None


def _search_chroma_rules(
    query: str,
    university_code: str,
    year: Optional[int],
    top_k: int,
) -> List[Dict[str, Any]]:
    vectorstore = _load_vectorstore()
    if vectorstore is None:
        return []

    metadata_filter: Dict[str, Any] = {}
    if university_code:
        metadata_filter["university"] = university_code
    if year:
        metadata_filter["year"] = str(year)

    try:
        docs = vectorstore.similarity_search(
            query=query,
            k=top_k,
            filter=metadata_filter or None,
        )
    except TypeError:
        docs = vectorstore.similarity_search(query=query, k=top_k)

    results: List[Dict[str, Any]] = []
    for doc in docs:
        metadata = doc.metadata or {}
        results.append(
            {
                "text": doc.page_content or "",
                "heading": metadata.get("Header_2") or metadata.get("Header_1") or "Nội dung",
                "source": metadata.get("source", "unknown"),
                "university": metadata.get("university", "N/A"),
                "year": metadata.get("year", "N/A"),
            }
        )
    return results


def _extract_major_hint(query: str) -> str:
    code_match = re.search(r"\b([A-Z]{2,4}\d{2,4}|7\d{6})\b", query.upper())
    if code_match:
        return code_match.group(1)

    normalized_query = re.sub(r"\s+", " ", query).strip()
    major_match = re.search(
        r"ngành\s+([A-Za-zÀ-ỹà-ỹ0-9\-\+\s]{3,80})",
        normalized_query,
        flags=re.IGNORECASE,
    )
    if not major_match:
        return ""

    candidate = major_match.group(1).strip()
    candidate = re.split(r"[,.!?;]", candidate)[0].strip()

    stop_tokens = {
        "truong",
        "dai",
        "hoc",
        "nam",
        "ma",
        "phuong",
        "thuc",
        "xet",
        "tuyen",
        "to",
        "hop",
        "khoi",
        "thi",
        "nao",
        "diem",
        "chuan",
        "tren",
        "duoi",
        "bao",
        "nhieu",
        "o",
        "tai",
        "la",
        "co",
        "cac",
    }

    selected_words: List[str] = []
    for word in candidate.split():
        normalized_word = _normalize_text(word)
        if normalized_word in stop_tokens:
            break
        selected_words.append(word)

    if not selected_words:
        return ""

    if len(selected_words) > 6:
        selected_words = selected_words[:6]

    hint = " ".join(selected_words).strip()
    if len(hint) < 2 or hint.isdigit():
        return ""

    return hint


def _load_mongo_collection() -> Any:
    global _MONGO_COLLECTION, _MONGO_COLLECTION_ERROR, _MONGO_COLLECTION_INITIALIZED

    if _MONGO_COLLECTION_INITIALIZED:
        if _MONGO_COLLECTION is None and _MONGO_COLLECTION_ERROR is not None:
            raise _MONGO_COLLECTION_ERROR
        return _MONGO_COLLECTION

    _MONGO_COLLECTION_INITIALIZED = True

    try:
        from pymongo import MongoClient

        mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
        mongo_db = os.getenv("MONGODB_DB_NAME", "admission_planner_db")

        client = MongoClient(
            mongo_url,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
            socketTimeoutMS=3000,
        )
        _MONGO_COLLECTION = client[mongo_db]["admission_scores"]
        return _MONGO_COLLECTION
    except Exception as exc:
        _MONGO_COLLECTION_ERROR = exc
        logger.warning("Unable to initialize Mongo admission_scores collection: %s", exc)
        raise


def _fetch_historical_scores(
    university_code: str,
    year: Optional[int],
    major_hint: str,
    query_tokens: List[str],
    max_fetch: int = 200,
) -> List[Dict[str, Any]]:
    collection = _load_mongo_collection()

    filters: Dict[str, Any] = {}
    if university_code:
        filters["university_code"] = university_code
    if year:
        filters["year"] = int(year)
    if major_hint:
        escaped = re.escape(major_hint)
        filters["$or"] = [
            {"major_code": {"$regex": escaped, "$options": "i"}},
            {"major_name": {"$regex": escaped, "$options": "i"}},
        ]

    rows = list(
        collection.find(
            filters,
            {
                "_id": 0,
                "university_code": 1,
                "year": 1,
                "method_name": 1,
                "method_type": 1,
                "major_code": 1,
                "major_name": 1,
                "score": 1,
                "subject_combinations": 1,
                "notes": 1,
            },
        )
        .sort([("year", -1), ("score", -1)])
        .limit(max_fetch)
    )

    if not rows:
        return []

    normalized_major_hint = _normalize_text(major_hint) if major_hint else ""
    ranked: List[Dict[str, Any]] = []

    for row in rows:
        searchable = " ".join(
            [
                str(row.get("major_code", "")),
                str(row.get("major_name", "")),
                str(row.get("method_name", "")),
                str(row.get("notes", "")),
            ]
        )
        norm_searchable = _normalize_text(searchable)
        normalized_major_name = _normalize_text(str(row.get("major_name", "")))
        rank = 0
        for token in query_tokens:
            if token in norm_searchable:
                rank += 1
        if normalized_major_hint and normalized_major_hint in norm_searchable:
            rank += 3
            if normalized_major_name == normalized_major_hint:
                rank += 6
            elif normalized_major_name.startswith(normalized_major_hint):
                rank += 3
            if f"({normalized_major_hint})" in normalized_major_name:
                rank += 4

        row_copy = dict(row)
        row_copy["_rank"] = rank
        ranked.append(row_copy)

    ranked.sort(
        key=lambda item: (
            int(item.get("_rank", 0)),
            int(item.get("year", 0) or 0),
            float(item.get("score", -1) if item.get("score") is not None else -1),
        ),
        reverse=True,
    )
    return ranked


def _format_historical_scores(rows: List[Dict[str, Any]], top_k: int) -> str:
    if not rows:
        return "Không tìm thấy dữ liệu điểm chuẩn lịch sử phù hợp trong kho hiện tại."

    lines = ["Kết quả điểm chuẩn lịch sử:"]
    for idx, row in enumerate(rows[:top_k], start=1):
        uni = str(row.get("university_code", "N/A"))
        year = str(row.get("year", "N/A"))
        major_code = str(row.get("major_code") or "N/A")
        major_name = str(row.get("major_name") or "Không rõ ngành")
        method = str(row.get("method_name") or row.get("method_type") or "Không rõ phương thức")
        score = row.get("score")
        if isinstance(score, (int, float)):
            score_text = f"{float(score):.2f}".rstrip("0").rstrip(".")
        else:
            score_text = "N/A"

        combos = row.get("subject_combinations") or []
        combos_text = ", ".join(
            str(item).strip() for item in combos if str(item).strip()
        )
        notes_text = _compact_text(str(row.get("notes") or ""), max_chars=120)

        line = (
            f"{idx}. {uni} {year} | {major_code} - {major_name} | "
            f"Điểm: {score_text} | Phương thức: {method}"
        )
        if combos_text:
            line += f" | Tổ hợp: {combos_text}"
        if notes_text:
            line += f" | Ghi chú: {notes_text}"

        lines.append(line)

    return "\n".join(lines)


@tool
def search_admission_rules(
    query: str,
    university_code: str = "",
    year: int = 0,
    top_k: int = 4,
) -> str:
    """
    Search admission proposal rules (de an tuyen sinh) relevant to the user query.

    Use this tool for questions about admission methods, prerequisites, language
    conversion, formulas, tuition, timeline, quotas, or policy details.
    """
    normalized_query = (query or "").strip()
    if not normalized_query:
        return "Câu hỏi trống, chưa thể tra cứu đề án tuyển sinh."

    safe_top_k = max(1, min(int(top_k or 4), 8))
    safe_year = year if 2000 <= int(year or 0) <= 2100 else _extract_year(normalized_query)
    safe_university = _normalize_code(university_code) or _infer_university_code(normalized_query)

    chroma_results: List[Dict[str, Any]] = []
    try:
        chroma_results = _search_chroma_rules(
            query=normalized_query,
            university_code=safe_university,
            year=safe_year,
            top_k=safe_top_k,
        )
    except Exception as exc:
        logger.warning("Chroma search failed: %s", exc)

    if chroma_results:
        return _format_rule_results(chroma_results, provider="chroma")

    markdown_results = _search_markdown_rules(
        query=normalized_query,
        university_code=safe_university,
        year=safe_year,
        top_k=safe_top_k,
    )
    return _format_rule_results(markdown_results, provider="markdown-fallback")


@tool
def get_historical_scores(
    query: str,
    university_code: str = "",
    year: int = 0,
    top_k: int = 8,
) -> str:
    """
    Search historical admission cutoff scores.

    Use this tool when the user asks about "điểm chuẩn", major code, major name,
    historical trends, or score comparison by year/method.
    """
    normalized_query = (query or "").strip()
    if not normalized_query:
        return "Câu hỏi trống, chưa thể tra cứu điểm chuẩn."

    safe_top_k = max(1, min(int(top_k or 8), 12))
    safe_university = _normalize_code(university_code) or _infer_university_code(normalized_query)
    safe_year = year if 2000 <= int(year or 0) <= 2100 else _extract_year(normalized_query)
    major_hint = _extract_major_hint(normalized_query)
    tokens = _query_tokens(normalized_query)

    try:
        score_rows = _fetch_historical_scores(
            university_code=safe_university,
            year=safe_year,
            major_hint=major_hint,
            query_tokens=tokens,
        )
        if score_rows:
            return _format_historical_scores(score_rows, top_k=safe_top_k)
    except Exception as exc:
        logger.warning("Historical score lookup via MongoDB failed: %s", exc)

    markdown_results = _search_markdown_rules(
        query=f"{normalized_query} điểm chuẩn",
        university_code=safe_university,
        year=safe_year,
        top_k=safe_top_k,
    )
    if markdown_results:
        return (
            "Không lấy được dữ liệu điểm chuẩn từ MongoDB, "
            "tham khảo nội dung đề án gần nhất:\n"
            + _format_rule_results(markdown_results, provider="markdown-fallback")
        )

    return "Không tìm thấy dữ liệu điểm chuẩn phù hợp trong kho hiện tại."
