"""
University Registry — Metadata for supported universities.

This registry provides metadata hints for the agentic system.
The PRIMARY source of truth is always ChromaDB (admission rules documents).
This registry helps agents search more effectively.
"""

from typing import Dict, Any


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
    return UNIVERSITY_REGISTRY.get(code.upper(), default)


def get_university_name(code: str) -> str:
    """Get full university name by code."""
    info = get_university_info(code)
    return info["name"]


def list_supported_universities() -> list[str]:
    """Return list of supported university codes."""
    return list(UNIVERSITY_REGISTRY.keys())
