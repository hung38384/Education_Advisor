import os
import time
import logging
import re
import unicodedata
from typing import Optional

from pymongo import MongoClient
from pymongo.errors import PyMongoError
from thefuzz import process

logger = logging.getLogger(__name__)

CANONICAL_METHOD_TAGS = {
    "CHUNG_CHI_QUOC_TE",
    "DGNL_APT",
    "DGNL_CHUNG",
    "DGNL_HSA",
    "DGTD_TSA",
    "HOC_BA",
    "KY_THI_RIENG",
    "NGOAI_NGU_KET_HOP",
    "THPT_QG",
    "TOT_NGHIEP_QUOC_TE",
}

# Legacy university-specific method codes must never be sent to admission_scores.
# Map only codes that are known. Unknown PTxxx returns None so the caller asks
# for clarification instead of querying a non-existent tag.
PT_CODE_TO_CANONICAL = {
    "409": "CHUNG_CHI_QUOC_TE",
}

CANONICAL_METHOD_ALIASES = {
    "CHUNG_CHI_QUOC_TE": {"chung-chi-quoc-te"},
    "DGNL_APT": {"diem-thi-dgnl-dh-su-pham-hn"},
    "DGNL_CHUNG": {"diem-thi-dgnl-qg-hcm"},
    "DGNL_HSA": {"diem-thi-dgnl-hn"},
    "DGTD_TSA": {"diem-dg-tu-duy-dhbkhn"},
    "HOC_BA": {"diem-hoc-ba"},
    "KY_THI_RIENG": {
        "diem-thi-danh-gia-dau-vao-v-sat",
        "diem-thi-rieng",
        "uu-tien-xet-tuyen-xet-tuyen-thang",
    },
    "NGOAI_NGU_KET_HOP": set(),
    "THPT_QG": {"diem-thi-thpt"},
    "TOT_NGHIEP_QUOC_TE": set(),
}

ALIAS_TO_CANONICAL = {
    alias: tag
    for tag, aliases in CANONICAL_METHOD_ALIASES.items()
    for alias in aliases
}

HSA_UNIVERSITIES = {"QHI", "QHX", "QHF", "KHA", "NTH", "LPH", "HQT", "SPH"}
HCM_DGNL_UNIVERSITIES = {"QSB", "KSA", "YDS", "SPK", "TCT", "DDT", "DTT"}
TSA_UNIVERSITIES = {"BKA"}

# =============================================================================
# REFACTOR: Connection Pooling — MongoClient ở global scope với maxPoolSize=50
# Tận dụng pool thay vì mở/đóng kết nối liên tục mỗi request
# =============================================================================
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "admission_planner_db")

try:
    _client = MongoClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=5000,
        maxPoolSize=50,  # REFACTOR: Connection Pooling cho 20+ trường
    )
    _db = _client[MONGODB_DB_NAME]
    _taxonomy_collection = _db["method_taxonomy"]
    logger.info("Taxonomy Engine: MongoDB connection pool initialized (maxPoolSize=50)")
except Exception as e:
    logger.error(f"Lỗi khởi tạo MongoDB client cho taxonomy_engine: {e}")
    _taxonomy_collection = None

# =============================================================================
# REFACTOR: In-memory Cache với TTL = 3600 giây (1 tiếng)
# Tránh query MongoDB mỗi lần user chat → giảm latency đáng kể khi scale
# =============================================================================
_CACHE: dict = {"data": None, "timestamp": 0}
_CACHE_TTL: int = 3600  # 1 tiếng


def _get_taxonomy_docs() -> list[dict]:
    """
    Helper: Lấy dữ liệu taxonomy từ cache. Nếu cache hết hạn hoặc rỗng,
    query MongoDB (collection method_taxonomy), sắp xếp theo priority giảm dần,
    lưu vào cache và trả về.

    Returns:
        list[dict]: Danh sách documents taxonomy đã sắp xếp theo priority.
    """
    global _CACHE

    now = time.time()

    # REFACTOR: Kiểm tra cache còn hạn hay không
    if _CACHE["data"] is not None and (now - _CACHE["timestamp"]) < _CACHE_TTL:
        return _CACHE["data"]

    # Cache miss hoặc hết hạn → query MongoDB
    if _taxonomy_collection is None:
        logger.warning("Taxonomy collection chưa được khởi tạo, trả về list rỗng")
        return []

    try:
        documents = list(_taxonomy_collection.find({}))
        documents.sort(
            key=lambda x: x.get("priority", 0),  # Sắp xếp theo priority giảm dần
            reverse=True,
        )

        # Lưu vào cache
        _CACHE["data"] = documents
        _CACHE["timestamp"] = now
        logger.info(f"Taxonomy cache refreshed: {len(documents)} documents, TTL={_CACHE_TTL}s")

        return documents

    except PyMongoError as e:
        logger.error(f"Lỗi query MongoDB trong _get_taxonomy_docs: {e}")
        # Nếu cache cũ còn dùng được thì trả về cache cũ (stale) thay vì crash
        if _CACHE["data"] is not None:
            logger.warning("Trả về stale cache do lỗi MongoDB")
            return _CACHE["data"]
        return []


from thefuzz import fuzz


def _normalize_text(text: str) -> str:
    text = (text or "").replace("đ", "d").replace("Đ", "D")
    text = text.replace("Ä‘", "d").replace("Ä", "D")
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = re.sub(r"[^a-zA-Z0-9_\s]", " ", text)
    return re.sub(r"\s+", " ", text).lower().strip()


def _to_alias_slug(text: str) -> str:
    return _normalize_text(text).replace("_", " ").replace(" ", "-")


TAG_SUPPORT_KEYWORDS = {
    "THPT_QG": {
        "thpt", "thptqg", "thpt_qg", "diem thi thpt", "thi thpt",
        "tot nghiep thpt", "thpt quoc gia",
    },
    "HOC_BA": {"hoc ba", "xet hoc ba", "diem hoc ba"},
    "DGTD_TSA": {"tsa", "dgtd", "danh gia tu duy", "dg tu duy", "tu duy bach khoa"},
    "DGNL_HSA": {
        "hsa", "dgnl hn", "dgnl ha noi", "dgnl dhqg hn", "dgnl dhqghn",
        "danh gia nang luc ha noi", "dai hoc quoc gia ha noi", "dhqg ha noi",
    },
    "DGNL_CHUNG": {
        "dgnl qg hcm", "dgnl hcm", "dhqg hcm", "dai hoc quoc gia hcm",
        "dai hoc quoc gia tp hcm", "vnu hcm", "vnuhcm",
    },
    "DGNL_APT": {"apt", "dgnl su pham", "danh gia nang luc su pham"},
    "CHUNG_CHI_QUOC_TE": {
        "xet tuyen ket hop", "phuong thuc ket hop", "chung chi quoc te",
        "ccqt", "chung chi tieng anh", "ielts", "toefl", "sat", "act",
    },
    "KY_THI_RIENG": {"vsat", "v sat", "ky thi rieng", "thi rieng", "xet tuyen thang"},
    "NGOAI_NGU_KET_HOP": {"ngoai ngu ket hop"},
    "TOT_NGHIEP_QUOC_TE": {"tot nghiep quoc te", "a level", "alevel", "ib diploma"},
}


def _tag_supported_by_query(tag: Optional[str], normalized_query: str) -> bool:
    canonical_tag = normalize_method_tag(tag)
    if not canonical_tag:
        return False
    return any(keyword in normalized_query for keyword in TAG_SUPPORT_KEYWORDS.get(canonical_tag, set()))


def _has_explicit_method_signal(normalized_query: str) -> bool:
    broad_signals = {
        "phuong thuc", "theo phuong thuc", "bang diem", "diem thi",
        "diem chuan", "xet tuyen", "danh gia", "thpt", "hoc ba",
        "tsa", "hsa", "dgnl", "dgtd", "vsat", "ielts", "ccqt",
        "chung chi", "ky thi rieng",
    }
    return any(signal in normalized_query for signal in broad_signals)


def _has_explicit_thpt_method(query: str) -> bool:
    explicit_patterns = [
        "bang diem thi thpt",
        "bang diem thpt",
        "theo diem thi thpt",
        "phuong thuc thpt",
        "phuong thuc diem thi thpt",
        "xet diem thi thpt",
        "xet tuyen bang diem thi thpt",
        "xet tuyen thpt qg",
        "thptqg",
        "thpt_qg",
    ]
    return any(pattern in query for pattern in explicit_patterns)


def _has_thpt_score_context(query: str) -> bool:
    subject_score = re.search(
        r"\b(?:toan|van|ngu van|anh|tieng anh|ly|vat ly|hoa|hoa hoc|sinh|su|dia)\s*(?:la|duoc|dat|:)?\s*\d+(?:\.\d+)?\b",
        query,
    )
    score_subject = re.search(
        r"\b\d+(?:\.\d+)?\s*(?:diem)?\s*(?:toan|van|ngu van|anh|tieng anh|ly|vat ly|hoa|hoa hoc|sinh|su|dia)\b",
        query,
    )
    return bool(subject_score or score_subject or "diem thi thpt" in query or "thi thpt" in query)


def _resolve_generic_dgnl_by_university(university_code: str) -> Optional[str]:
    uni = str(university_code or "").upper()
    if uni in HCM_DGNL_UNIVERSITIES:
        return "DGNL_CHUNG"
    if uni in HSA_UNIVERSITIES:
        return "DGNL_HSA"
    return None


def _assessment_scale_hint(query: str) -> Optional[str]:
    if re.search(r"/\s*150\b", query) or "thang 150" in query:
        return "DGNL_HSA"
    if re.search(r"/\s*1200\b", query) or "thang 1200" in query:
        return "DGNL_CHUNG"
    if re.search(r"/\s*100\b", query) or "thang 100" in query:
        return "DGTD_TSA"
    return None


def get_method_aliases(method_tag: str) -> list[str]:
    canonical_tag = normalize_method_tag(method_tag)
    if not canonical_tag:
        return []
    return sorted(CANONICAL_METHOD_ALIASES.get(canonical_tag, set()))


def normalize_method_tag(raw_method: Optional[str]) -> Optional[str]:
    """
    Normalize every incoming method label/code to the DB canonical tag set.

    This is intentionally strict: if a legacy PTxxx code is unknown, return None
    instead of leaking it into Mongo queries and producing false "not found".
    """
    if not raw_method:
        return None

    raw_text = str(raw_method).strip()
    upper_tag = raw_text.upper().replace("-", "_").replace(" ", "_")
    if upper_tag in CANONICAL_METHOD_TAGS:
        return upper_tag

    alias_slug = _to_alias_slug(raw_text)
    if alias_slug in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[alias_slug]

    normalized = _normalize_text(raw_text)
    pt_match = re.search(r"\bpt\s*(\d{3}[a-z]?)\b", normalized)
    if not pt_match:
        pt_match = re.search(r"\bphuong thuc\s*(\d{3}[a-z]?)\b", normalized)
    if pt_match:
        code = pt_match.group(1).upper()
        return PT_CODE_TO_CANONICAL.get(code)

    return _deterministic_method_tag(raw_text)


def _deterministic_method_tag(user_query: str, university_code: str = "") -> Optional[str]:
    query = _normalize_text(user_query)

    pt_match = re.search(r"\bpt\s*(\d{3}[a-z]?)\b", query)
    if not pt_match:
        pt_match = re.search(r"\bphuong thuc\s*(\d{3}[a-z]?)\b", query)
    if pt_match:
        code = pt_match.group(1).upper()
        return PT_CODE_TO_CANONICAL.get(code)

    alias_slug = _to_alias_slug(user_query)
    if alias_slug in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[alias_slug]

    combined_keywords = [
        "xet tuyen ket hop",
        "phuong thuc ket hop",
        "chung chi quoc te",
        "ccqt",
    ]
    if any(keyword in query for keyword in combined_keywords):
        return "CHUNG_CHI_QUOC_TE"

    scale_hint = _assessment_scale_hint(query)
    if scale_hint:
        return scale_hint

    if any(keyword in query for keyword in ["dgtd", "tsa", "danh gia tu duy", "dg tu duy", "tu duy bach khoa"]):
        return "DGTD_TSA"

    if any(keyword in query for keyword in [
        "dgnl qg hcm",
        "dgnl hcm",
        "dhqg hcm",
        "dai hoc quoc gia hcm",
        "dai hoc quoc gia tp hcm",
        "vnu hcm",
        "vnuhcm",
    ]):
        return "DGNL_CHUNG"

    if any(keyword in query for keyword in ["dgnl su pham", "su pham hn", "danh gia nang luc su pham", "apt"]):
        return "DGNL_APT"

    if any(keyword in query for keyword in [
        "hsa",
        "dgnl hn",
        "dgnl ha noi",
        "dgnl dhqg hn",
        "dgnl dhqghn",
        "danh gia nang luc ha noi",
        "dai hoc quoc gia ha noi",
        "dhqg ha noi",
        "vnu hanoi",
    ]):
        return "DGNL_HSA"

    if any(keyword in query for keyword in ["dgnl", "danh gia nang luc"]):
        return _resolve_generic_dgnl_by_university(university_code)

    if any(keyword in query for keyword in ["hoc ba", "xet hoc ba"]):
        return "HOC_BA"

    if any(keyword in query for keyword in ["v sat", "vsat", "ky thi rieng", "thi rieng", "xet tuyen thang"]):
        return "KY_THI_RIENG"

    if any(keyword in query for keyword in ["ngoai ngu ket hop"]):
        return "NGOAI_NGU_KET_HOP"

    if any(keyword in query for keyword in ["tot nghiep quoc te", "a level", "alevel", "ib diploma"]):
        return "TOT_NGHIEP_QUOC_TE"

    has_cert_signal = any(keyword in query for keyword in ["ielts", "toefl", "sat", "act", "chung chi ngoai ngu", "chung chi quoc te"])
    if has_cert_signal and _has_thpt_score_context(query) and not _has_explicit_thpt_method(query):
        return "CHUNG_CHI_QUOC_TE"

    thpt_keywords = [
        "thpt_qg",
        "thptqg",
        "diem thi thpt",
        "thi thpt",
        "tot nghiep thpt",
        "thpt quoc gia",
    ]
    if any(keyword in query for keyword in thpt_keywords):
        return "THPT_QG"

    return None


def get_standard_method_tag(user_query: str, university_code: str) -> Optional[str]:
    """
    Xác định method_tag theo thuật toán 2 bước: Exact Match và Weighted Fuzzy Match.
    Khắc phục lỗi 'Tag Trap' khi các tag phổ biến đè bẹp các tag đặc thù.
    """
    if not user_query:
        return None

    deterministic_tag = _deterministic_method_tag(user_query, university_code)
    if deterministic_tag:
        logger.info(f"   🎯 [Deterministic] Taxonomy Engine chọn tag: '{deterministic_tag}'")
        return deterministic_tag

    if _taxonomy_collection is None:
        logger.warning("Taxonomy collection unavailable and no deterministic method match; returning None")
        return None
        
    query_normalized = _normalize_text(user_query)
    query_lower = query_normalized
    best_tag = None
    
    try:
        documents = _get_taxonomy_docs()
        
        # =========================================================
        # BƯỚC 1: EXACT MATCH (Ưu tiên tuyệt đối)
        # =========================================================
        for doc in documents:
            tag = normalize_method_tag(doc.get("tag") or doc.get("_id"))
            if not tag:
                continue
                
            exact_keywords = doc.get("exact_keywords", [])
            method_aliases = doc.get("method_alias", [])
            if isinstance(method_aliases, str):
                method_aliases = [method_aliases]
            exact_keywords = list(exact_keywords) + list(method_aliases) + get_method_aliases(tag)
            for keyword in exact_keywords:
                normalized_keyword = _normalize_text(str(keyword))
                keyword_slug = _to_alias_slug(str(keyword))
                query_slug = _to_alias_slug(query_lower)
                if keyword and (normalized_keyword in query_normalized or keyword_slug in query_slug):
                    logger.info(f"   🎯 [Exact Match] Taxonomy Engine chốt ngay tag: '{tag}' nhờ keyword: '{keyword}'")
                    return tag
        
        # =========================================================
        # BƯỚC 2: WEIGHTED FUZZY MATCH (Kết hợp trọng số Priority)
        # =========================================================
        highest_weighted_score = 0
        best_raw_score = 0
        best_priority = 1
        
        for doc in documents:
            tag = normalize_method_tag(doc.get("tag") or doc.get("_id"))
            if not tag:
                continue
                
            priority = doc.get("priority", 1)
            
            # Gom tất cả keyword/alias (global + specific) thành một chuỗi đại diện để fuzzy
            global_keywords = doc.get("global_keywords", [])
            method_aliases = doc.get("method_alias", [])
            if isinstance(method_aliases, str):
                method_aliases = [method_aliases]
            university_specific = doc.get("university_specific", {})
            uni_aliases = university_specific.get(university_code, [])
            
            all_aliases = [str(k) for k in (global_keywords + method_aliases + uni_aliases + get_method_aliases(tag)) if k]
            if not all_aliases:
                continue
                
            combined_keywords = " ".join(all_aliases).lower()
            
            # Tính raw fuzzy score bằng token_set_ratio (tốt cho query dài chứa keyword)
            raw_score = fuzz.token_set_ratio(query_lower, combined_keywords)
            
            # Tính weighted score: nhân raw score với trọng số ưu tiên
            weighted_score = raw_score * (1 + (priority / 100))
            
            if raw_score > 78 and weighted_score > highest_weighted_score:
                highest_weighted_score = weighted_score
                best_raw_score = raw_score
                best_priority = priority
                best_tag = tag
        
        if highest_weighted_score > 0:
            supported = _tag_supported_by_query(best_tag, query_normalized)
            if not supported and (_has_explicit_method_signal(query_normalized) or best_raw_score < 88):
                logger.warning(
                    "   ⚠️ [Fuzzy Guard] Rejecting weak/unsupported method tag '%s' "
                    "(raw_score=%s) for query='%s'",
                    best_tag,
                    best_raw_score,
                    query_normalized,
                )
                return None
            logger.info(
                f"   ⚖️ [Weighted Fuzzy] Taxonomy Engine chọn tag: '{best_tag}' "
                f"(raw_score={best_raw_score}, priority={best_priority}, weighted={highest_weighted_score:.2f})"
            )
        else:
            logger.info("Taxonomy Engine did not match any method tag; returning None")
            
    except PyMongoError as e:
        logger.error(f"   ❌ Lỗi truy vấn MongoDB trong taxonomy_engine: {e}")
    except Exception as e:
        logger.error(f"   ❌ Lỗi không xác định trong taxonomy_engine: {e}")
        
    return normalize_method_tag(best_tag)
