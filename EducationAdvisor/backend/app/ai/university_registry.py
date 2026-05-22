"""
University Registry — Metadata for supported universities.

This registry provides metadata hints for the agentic system.
The PRIMARY source of truth is always ChromaDB (admission rules documents).
This registry helps agents search more effectively.
"""

import re
from typing import Dict, Any


SUPPORTED_UNIVERSITY_CODES: tuple[str, ...] = (
    "BKA",
    "CTU",
    "DDT",
    "DKH",
    "HQT",
    "KHA",
    "LPH",
    "NTH",
    "QHF",
    "QHI",
    "QHX",
    "SPH",
    "TCT",
    "TMU",
    "YDS",
    "YHB",
)

UNIVERSITY_CODE_ALIASES: dict[str, str] = {
    "DTT": "DDT",
}


UNIVERSITY_REGISTRY: Dict[str, Dict[str, Any]] = {
    "BKA": {
        "name": "Đại học Bách khoa Hà Nội",
        "short_name": "Bách Khoa",
        "method_tags": ["THPT_QG", "DGTD_TSA", "XET_TUYEN_TAI_NANG"],
        "score_scale": 100,  # TSA thang 100
        "vocabulary_map": {"TSA": "ĐGTD", "Đánh giá tư duy": "ĐGTD"},
    },
    "TMU": {
        "name": "Trường Đại học Thương mại",
        "short_name": "Thương mại",
        "method_tags": ["PT100", "PT200", "PT402a", "PT402b", "PT409", "PT410", "PT500"],
        "score_scale": 30,  # Thang 30
        "vocabulary_map": {},
    },
    "CTU": {
        "name": "Trường Đại học Cần Thơ",
        "short_name": "Cần Thơ",
        "method_tags": [],
        "score_scale": 30,
        "vocabulary_map": {},
    },
}


for _code in SUPPORTED_UNIVERSITY_CODES:
    UNIVERSITY_REGISTRY.setdefault(
        _code,
        {
            "name": f"TrÆ°á»ng Ä‘áº¡i há»c (mÃ£: {_code})",
            "short_name": _code,
            "method_tags": [],
            "score_scale": 30,
            "vocabulary_map": {},
        },
    )


def normalize_university_code(code: str | None) -> str | None:
    """Normalize a university code without corrupting supported codes like DDT."""
    if not code:
        return None

    normalized = str(code).strip().upper()
    if not normalized:
        return None

    normalized = UNIVERSITY_CODE_ALIASES.get(normalized, normalized)
    if normalized in SUPPORTED_UNIVERSITY_CODES:
        return normalized

    collapsed = re.sub(r"^(.)\1+", r"\1", normalized)
    collapsed = UNIVERSITY_CODE_ALIASES.get(collapsed, collapsed)
    if collapsed in SUPPORTED_UNIVERSITY_CODES:
        return collapsed

    return normalized


def is_supported_university(code: str | None) -> bool:
    normalized = normalize_university_code(code)
    return bool(normalized and normalized in SUPPORTED_UNIVERSITY_CODES)


def get_university_info(code: str) -> Dict[str, Any]:
    """
    Get university info by code. Returns a default entry if not found.

    Args:
        code: University code (e.g., "BKA", "TMU")

    Returns:
        Dict with university metadata
    """
    default = {
        "name": f"Trường đại học (mã: {code})",
        "short_name": code,
        "method_tags": [],
        "score_scale": 30,
        "vocabulary_map": {},
    }
    normalized_code = normalize_university_code(code) or str(code or "").upper()
    return UNIVERSITY_REGISTRY.get(normalized_code, default)


def get_university_name(code: str) -> str:
    """Get full university name by code."""
    info = get_university_info(code)
    return info["name"]


def list_supported_universities() -> list[str]:
    """Return list of supported university codes."""
    return list(SUPPORTED_UNIVERSITY_CODES)
