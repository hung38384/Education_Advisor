"""
LangGraph Multi-Agent System Tools

This module defines the tools (functions) that LLM agents will use to retrieve data:
- search_admission_rules: Query admission rules, IELTS conversions, and prerequisites
- get_historical_scores: Query historical admission scores from MongoDB

Each tool is decorated with @tool for LangChain integration.
"""

import logging
import re
from pathlib import Path
from typing import Optional, Any

from dotenv import load_dotenv
load_dotenv()

from langchain.tools import tool
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Setup VectorDB Connection
_vectorstore = None

def get_vectorstore():
    """Lazily initialize Chroma only when an AI request/tool needs it."""
    global _vectorstore

    if _vectorstore is None:
        chroma_dir = Path(__file__).parent.parent.parent.parent / "data" / "chroma_db"
        logger.info(f"Initializing VectorDB from: {chroma_dir}")

        # Initialize embeddings with Google Gemini Embedding model
        embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2-preview")

        # Initialize Chroma vector store with persistence
        _vectorstore = Chroma(
            persist_directory=str(chroma_dir),
            embedding_function=embeddings,
            collection_name="admission_rules",
        )

        logger.info("VectorDB initialized successfully")

    return _vectorstore

# =============================================================================
# REFACTOR: MongoDB Connection Pooling — Global scope, maxPoolSize=50
# Không mở/đóng kết nối mỗi lần gọi tool nữa → tái sử dụng pool
# =============================================================================
import os
from pymongo import MongoClient
from pymongo.errors import PyMongoError

_MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
_MONGO_DB_NAME = os.getenv("MONGODB_DB_NAME", "admission_planner_db")

_mongo_client = None
_mongo_db = None
_scores_collection = None


def get_scores_collection():
    """
    Lazily initialize MongoDB connection pooling.

    This keeps FastAPI imports from touching MongoDB, while still reusing the
    same pool after the first tool call.
    """
    global _mongo_client, _mongo_db, _scores_collection

    if _scores_collection is not None:
        return _scores_collection

    try:
        _mongo_client = MongoClient(
            _MONGO_URL,
            serverSelectionTimeoutMS=5000,
            maxPoolSize=50,  # REFACTOR: Connection Pooling cho 20+ trường
        )
        _mongo_db = _mongo_client[_MONGO_DB_NAME]
        _scores_collection = _mongo_db["admission_scores"]
        logger.info("MongoDB connection pool initialized (maxPoolSize=50) for tools")
    except Exception as e:
        logger.error(f"Failed to init MongoDB for tools: {e}")
        _mongo_client = None
        _mongo_db = None
        _scores_collection = None

    return _scores_collection


def _build_method_query(processed_method_tag: str) -> list[dict]:
    from app.utils.taxonomy_engine import get_method_aliases

    method_conditions = [{"method_tag": processed_method_tag}]
    method_aliases = get_method_aliases(processed_method_tag) if processed_method_tag else []
    if method_aliases:
        method_conditions.append({"method_alias": {"$in": method_aliases}})
    return method_conditions


def find_eligible_majors_by_score(
    university: str,
    score: float,
    method_tag: str,
    year: Optional[str] = None,
    limit: int = 10,
) -> str:
    """
    Return majors whose historical cutoff is <= the provided score.

    This is intentionally a direct data lookup for ambiguous "I have X points,
    what majors can I get into?" questions. It does not calculate admission
    scores or map to other universities.
    """
    import json as json_lib

    processed_method_tag = extract_method_tag(method_tag) if method_tag else None
    university = str(university).strip().upper() if university else None

    if not university:
        return "Cần có mã trường để lọc danh sách ngành phù hợp."
    if score is None:
        return "Cần có điểm xét tuyển để lọc danh sách ngành phù hợp."
    if not processed_method_tag:
        return "Cần biết phương thức xét tuyển để lọc ngành, ví dụ THPT_QG, học bạ, TSA/HSA/ĐGNL."

    try:
        score_value = float(score)
    except (TypeError, ValueError):
        return "Điểm xét tuyển không hợp lệ."

    try:
        collection = get_scores_collection()
        if collection is None:
            return "Lỗi: MongoDB connection không được khởi tạo. Kiểm tra lại cấu hình."

        base_filter = {"university_code": university}
        if year:
            try:
                base_filter["year"] = int(year)
            except (ValueError, TypeError):
                logger.warning(f"Invalid year format for eligible-major lookup: {year}")

        method_conditions = _build_method_query(processed_method_tag)
        method_filter = {"$or": method_conditions} if len(method_conditions) > 1 else method_conditions[0]
        query_filter = {"$and": [base_filter, method_filter]}

        if "year" not in base_filter:
            latest_record = collection.find_one(query_filter, sort=[("year", -1)])
            if latest_record and latest_record.get("year"):
                base_filter["year"] = int(latest_record["year"])
                query_filter = {"$and": [base_filter, method_filter]}

        query_filter = {"$and": [query_filter, {"score": {"$lte": score_value, "$gt": 0}}]}
        records = list(
            collection.find(query_filter)
            .sort([("score", -1), ("major_code", 1)])
            .limit(max(1, min(int(limit), 30)))
        )

        if not records:
            return json_lib.dumps(
                {
                    "status": "not_found",
                    "university": university,
                    "score": score_value,
                    "method_tag": processed_method_tag,
                    "year": base_filter.get("year"),
                    "eligible_majors": [],
                },
                ensure_ascii=False,
                indent=2,
            )

        seen = set()
        majors = []
        for record in records:
            major_key = (record.get("major_code"), record.get("major_name"))
            if major_key in seen:
                continue
            seen.add(major_key)
            majors.append(
                {
                    "major_code": record.get("major_code"),
                    "major_name": record.get("major_name"),
                    "cutoff_score": float(record.get("score", 0)),
                    "year": record.get("year"),
                    "method_tag": record.get("method_tag"),
                    "method_alias": record.get("method_alias"),
                }
            )

        return json_lib.dumps(
            {
                "status": "success",
                "university": university,
                "score": score_value,
                "method_tag": processed_method_tag,
                "year": base_filter.get("year"),
                "eligible_majors": majors,
            },
            ensure_ascii=False,
            indent=2,
        )
    except PyMongoError as e:
        logger.error(f"MongoDB error in eligible-major lookup: {e}")
        return f"Lỗi cơ sở dữ liệu khi lọc ngành phù hợp: {str(e)}"
    except Exception as e:
        logger.error(f"Error in eligible-major lookup: {e}", exc_info=True)
        return f"Lỗi khi lọc ngành phù hợp: {str(e)}"


def compare_major_cutoffs(
    university: str,
    major_names: list[str],
    method_tag: str,
    year: str,
) -> str:
    """
    Compare cutoff scores for multiple majors inside one university/year/method.

    This deterministic lookup is used by preflight for short comparison
    questions. It returns JSON so callers can build clean user-facing answers.
    """
    import json as json_lib
    import unicodedata
    from difflib import SequenceMatcher

    def normalize_text(value: Any) -> str:
        text = str(value or "").lower().strip()
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def get_record_score(record: dict) -> float:
        for key in ("score", "cutoff_score", "diem_chuan", "benchmark_score"):
            value = record.get(key)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return 0.0

    def match_record(target_name: str, records: list[dict]) -> tuple[dict | None, float]:
        target = normalize_text(target_name)
        best_record = None
        best_score = 0.0
        for record in records:
            candidates = [
                record.get("major_name"),
                record.get("major_code"),
                record.get("major_alias"),
            ]
            for candidate in candidates:
                normalized_candidate = normalize_text(candidate)
                if not normalized_candidate:
                    continue
                if target == normalized_candidate:
                    score = 1.0
                elif target in normalized_candidate or normalized_candidate in target:
                    score = 0.92
                else:
                    score = SequenceMatcher(None, target, normalized_candidate).ratio()
                if score > best_score:
                    best_score = score
                    best_record = record
        if best_score < 0.68:
            return None, best_score
        return best_record, best_score

    processed_method_tag = extract_method_tag(method_tag) if method_tag else None
    university = str(university).strip().upper() if university else None

    if not university or not processed_method_tag or not year or len(major_names or []) < 2:
        return json_lib.dumps(
            {
                "status": "missing_input",
                "university": university,
                "year": year,
                "method_tag": processed_method_tag,
                "major_names": major_names or [],
            },
            ensure_ascii=False,
        )

    try:
        collection = get_scores_collection()
        if collection is None:
            return json_lib.dumps(
                {"status": "error", "message": "Score database is unavailable."},
                ensure_ascii=False,
            )

        base_filter = {"university_code": university}
        try:
            base_filter["year"] = int(year)
        except (TypeError, ValueError):
            return json_lib.dumps(
                {"status": "missing_input", "message": "Invalid year.", "year": year},
                ensure_ascii=False,
            )

        method_conditions = _build_method_query(processed_method_tag)
        method_filter = {"$or": method_conditions} if len(method_conditions) > 1 else method_conditions[0]
        query_filter = {"$and": [base_filter, method_filter]}
        records = list(collection.find(query_filter).limit(2000))

        matched = []
        missing = []
        used_keys = set()
        for requested_name in major_names:
            record, confidence = match_record(requested_name, records)
            if not record:
                missing.append(requested_name)
                continue
            key = (record.get("major_code"), record.get("major_name"))
            if key in used_keys:
                missing.append(requested_name)
                continue
            used_keys.add(key)
            matched.append(
                {
                    "requested_name": requested_name,
                    "major_code": record.get("major_code"),
                    "major_name": record.get("major_name"),
                    "score": get_record_score(record),
                    "year": record.get("year"),
                    "method_tag": record.get("method_tag"),
                    "method_alias": record.get("method_alias"),
                    "match_confidence": round(confidence, 3),
                }
            )

        return json_lib.dumps(
            {
                "status": "success" if len(matched) >= 2 and not missing else "partial",
                "university": university,
                "year": base_filter["year"],
                "method_tag": processed_method_tag,
                "matched": matched,
                "missing": missing,
            },
            ensure_ascii=False,
            indent=2,
        )
    except PyMongoError as e:
        logger.error(f"MongoDB error in major cutoff comparison: {e}")
        return json_lib.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error in major cutoff comparison: {e}", exc_info=True)
        return json_lib.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


def get_major_cutoffs_all_methods(
    university: str,
    major_name: str,
    year: str,
) -> str:
    """
    Return cutoff scores for one major across all methods in one university/year.

    This supports queries such as "điểm ngành X theo tất cả phương thức năm Y"
    without invoking counseling or score-calculation agents.
    """
    import json as json_lib
    import unicodedata
    from difflib import SequenceMatcher

    def normalize_text(value: Any) -> str:
        text = str(value or "").lower().strip()
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def get_record_score(record: dict) -> float:
        for key in ("score", "cutoff_score", "diem_chuan", "benchmark_score"):
            value = record.get(key)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return 0.0

    university = str(university).strip().upper() if university else None
    requested_major = str(major_name or "").strip()
    target = normalize_text(requested_major)
    if not university or not requested_major or not year:
        return json_lib.dumps(
            {
                "status": "missing_input",
                "university": university,
                "major_name": requested_major,
                "year": year,
            },
            ensure_ascii=False,
        )

    try:
        collection = get_scores_collection()
        if collection is None:
            return json_lib.dumps(
                {"status": "error", "message": "Score database is unavailable."},
                ensure_ascii=False,
            )

        try:
            year_value = int(year)
        except (TypeError, ValueError):
            return json_lib.dumps(
                {"status": "missing_input", "message": "Invalid year.", "year": year},
                ensure_ascii=False,
            )

        records = list(
            collection.find({"university_code": university, "year": year_value}).limit(5000)
        )
        scored = []
        for record in records:
            candidates = [record.get("major_name"), record.get("major_code"), record.get("major_alias")]
            best = 0.0
            for candidate in candidates:
                normalized_candidate = normalize_text(candidate)
                if not normalized_candidate:
                    continue
                if target == normalized_candidate:
                    score = 1.0
                elif target in normalized_candidate or normalized_candidate in target:
                    score = 0.92
                else:
                    score = SequenceMatcher(None, target, normalized_candidate).ratio()
                best = max(best, score)
            if best >= 0.68:
                scored.append((best, record))

        if not scored:
            return json_lib.dumps(
                {
                    "status": "not_found",
                    "university": university,
                    "year": year_value,
                    "requested_major": requested_major,
                    "cutoffs": [],
                },
                ensure_ascii=False,
            )

        scored.sort(key=lambda item: item[0], reverse=True)
        best_major_code = scored[0][1].get("major_code")
        best_major_name = scored[0][1].get("major_name")
        selected_records = [
            record
            for confidence, record in scored
            if record.get("major_code") == best_major_code or record.get("major_name") == best_major_name
        ]

        seen = set()
        cutoffs = []
        for record in sorted(
            selected_records,
            key=lambda item: (str(item.get("method_tag") or ""), str(item.get("method_alias") or "")),
        ):
            key = (
                record.get("method_tag"),
                record.get("method_alias"),
                get_record_score(record),
            )
            if key in seen:
                continue
            seen.add(key)
            cutoffs.append(
                {
                    "major_code": record.get("major_code"),
                    "major_name": record.get("major_name"),
                    "method_tag": record.get("method_tag"),
                    "method_alias": record.get("method_alias"),
                    "score": get_record_score(record),
                    "year": record.get("year"),
                }
            )

        return json_lib.dumps(
            {
                "status": "success",
                "university": university,
                "year": year_value,
                "requested_major": requested_major,
                "matched_major_code": best_major_code,
                "matched_major_name": best_major_name,
                "cutoffs": cutoffs,
            },
            ensure_ascii=False,
            indent=2,
        )
    except PyMongoError as e:
        logger.error(f"MongoDB error in all-method cutoff lookup: {e}")
        return json_lib.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error in all-method cutoff lookup: {e}", exc_info=True)
        return json_lib.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@tool
def search_admission_rules(
    query: str,
    university: Optional[str] = None,
    year: Optional[str] = None,
) -> str:
    """
    Tìm kiếm Luật Xét Tuyển từ Vector Database.
    
    Tool này được sử dụng để tìm kiếm các thông tin liên quan đến xét tuyển đại học, bao gồm:
    - Quy đổi điểm IELTS sang điểm tiếng Anh xét tuyển
    - Điều kiện tiên quyết, yêu cầu đầu vào
    - Công thức tính điểm, phương pháp xét tuyển
    - Quy định, hạn chế đặc biệt
    - Thông tin về các ngành học, khối thi
    
    Kết quả trả về thông tin chi tiết từ tài liệu được lưu trữ trong vector database,
    giúp agent có thể trả lời các câu hỏi liên quan đến quy trình xét tuyển của các trường đại học.
    
    Args:
        query: Câu hỏi hoặc từ khóa tìm kiếm (tiếng Việt hoặc tiếng Anh)
        university: Mã trường đại học (VD: "BKA", "QHI", "BVH"). Nếu None, tìm kiếm tất cả trường.
        year: Năm xét tuyển (VD: "2023", "2024", "2025"). Nếu None, tìm kiếm tất cả năm.
    
    Returns:
        Chuỗi văn bản chứa kết quả tìm kiếm được định dạng với metadata (trường, năm, nội dung).
        Nếu không tìm thấy kết quả, trả về thông báo lịch sự.
    
    Example:
        >>> search_admission_rules("Quy đổi IELTS 6.5", university="BKA", year="2024")
        'Trường: BKA | Năm: 2024 | ...'
    """
    logger.info(f"🔍 Searching admission rules | Query: '{query}' | University: {university} | Year: {year}")
    
    try:
        vectorstore = get_vectorstore()

        # Normalize parameters to strings
        university = str(university).strip().upper() if university else None
        year = str(year).strip() if year else None

        # REFACTOR: Khử nhiễu mã trường do LLM sinh ra ("BBKA" -> "BKA")
        if university:
            university = re.sub(r'^(.)\1+', r'\1', university)

        # =================================================================
        # TEMPORAL ANCHORING: Chiến lược Fallback lùi năm
        # -----------------------------------------------------------------
        # ChromaDB YÊU CẦU: Khi filter có >= 2 điều kiện, phải dùng $and:
        #   ✅ {"$and": [{"university": "BKA"}, {"year": "2024"}]}
        #   ❌ {"university": "BKA", "year": "2024"}  ← sẽ bị lỗi!
        # -----------------------------------------------------------------
        # Bước 1: Thử search VỚI year filter (Strict Matching)
        # Bước 2: Nếu rỗng → Fallback: search LẠI KHÔNG CÓ year filter
        #         để lấy quy chế của năm gần nhất mà trường có dữ liệu
        # =================================================================
        def _build_chroma_filter(conditions: dict) -> dict:
            """Xây dựng filter dict tương thích ChromaDB.
            1 key → trả thẳng dict. >= 2 keys → bọc trong $and."""
            if len(conditions) == 0:
                return {}
            if len(conditions) == 1:
                return conditions
            # ChromaDB $and syntax cho multi-key filter
            return {"$and": [{k: v} for k, v in conditions.items()]}

        # Bước 1: Thử tìm với year cụ thể
        results = []
        used_fallback = False

        if year and university:
            strict_conditions = {"university": university, "year": year}
            strict_filter = _build_chroma_filter(strict_conditions)
            results = vectorstore.similarity_search(query, k=3, filter=strict_filter)
            logger.info(f"   🔎 [Strict] ChromaDB filter={strict_filter} → {len(results)} result(s)")

            # Bước 2: Nếu rỗng → Fallback bỏ year, chỉ giữ university
            if not results:
                fallback_filter = {"university": university}
                results = vectorstore.similarity_search(query, k=3, filter=fallback_filter)
                used_fallback = True
                logger.warning(
                    f"   🔄 [Fallback] Year '{year}' không có dữ liệu → "
                    f"tìm lại với filter={fallback_filter} → {len(results)} result(s)"
                )
        elif university:
            # Chỉ có university, không có year
            results = vectorstore.similarity_search(query, k=3, filter={"university": university})
            logger.info(f"   🔎 ChromaDB filter={{university: {university}}} → {len(results)} result(s)")
        elif year:
            # Chỉ có year, không có university
            results = vectorstore.similarity_search(query, k=3, filter={"year": year})
            logger.info(f"   🔎 ChromaDB filter={{year: {year}}} → {len(results)} result(s)")
        else:
            # Không có filter nào → tìm tất cả
            results = vectorstore.similarity_search(query, k=3)
            logger.info(f"   🔎 ChromaDB (no filter) → {len(results)} result(s)")
        
        if not results:
            logger.info(f"   ⚠️  No results found for query: '{query}'")
            return (
                f"Xin lỗi, không tìm thấy thông tin liên quan đến '{query}'. "
                f"Vui lòng thử lại với từ khóa khác hoặc kiểm tra xem trường/năm bạn tìm kiếm có tồn tại không."
            )
        
        # Format results
        formatted_results = []
        if used_fallback:
            formatted_results.append(
                f"⚠️ LƯU Ý: Không tìm thấy quy chế năm {year}. "
                f"Kết quả dưới đây là quy chế gần nhất có sẵn của trường {university}.\n"
            )
        
        for idx, doc in enumerate(results, 1):
            metadata = doc.metadata
            content = doc.page_content
            
            formatted_result = (
                f"[Kết quả {idx}]\n"
                f"Trường: {metadata.get('university', 'N/A')}\n"
                f"Năm: {metadata.get('year', 'N/A')}\n"
                f"Nguồn: {metadata.get('source', 'N/A')}\n"
                f"Nội dung:\n{content}\n"
            )
            formatted_results.append(formatted_result)
        
        final_result = "\n".join(formatted_results)
        logger.info(f"   ✅ Found {len(results)} result(s){' (fallback)' if used_fallback else ''}")
        return final_result
    
    except Exception as e:
        logger.error(f"   ❌ Error searching admission rules: {e}")
        return f"Lỗi khi tìm kiếm: {str(e)}"


import difflib

def extract_method_tag(text: str) -> str:
    """
    Fuzzy matching to correct method tag.
    
    Thứ tự ưu tiên (Priority):
      1. Các phương thức "ngách" (chứng chỉ quốc tế, đánh giá tư duy, 409...) → kiểm tra ĐẦU TIÊN
      2. Các từ khóa phổ thông (THPT, học bạ) → fallback CUỐI CÙNG
    Điều này tránh bị "bẫy" khi câu hỏi dài chứa cả "THPT" lẫn từ khóa ngách.
    """
    if not text:
        return None
        
    text_lower = text.lower()

    pt_match = re.search(r"\bpt\s*(\d{3}[a-z]?)\b", text_lower)
    if not pt_match:
        pt_match = re.search(r"\bphương thức\s*(\d{3}[a-z]?)\b", text_lower)
    if pt_match:
        from app.utils.taxonomy_engine import normalize_method_tag
        return normalize_method_tag(f"PT{pt_match.group(1).upper()}")
    
    # ── ƯU TIÊN 1: PHƯƠNG THỨC NGÁCH (kiểm tra trước) ──────────────────
    # 1a. Chứng chỉ quốc tế / Kết hợp / Phương thức 409
    if "chứng chỉ quốc tế" in text_lower or "409" in text_lower or "ccqt" in text_lower:
        return "CHUNG_CHI_QUOC_TE"
    # 1b. Đánh giá tư duy / TSA (Bách Khoa)
    if "tsa" in text_lower or "đgtd" in text_lower or "đánh giá tư duy" in text_lower:
        return "DGTD_TSA"
    if "hcm" in text_lower and ("đgnl" in text_lower or "đánh giá năng lực" in text_lower):
        return "DGNL_CHUNG"
    # 1c. Đánh giá năng lực / HSA (ĐHQG)
    if "hsa" in text_lower:
        return "DGNL_HSA"
    if "v-sat" in text_lower or "vsat" in text_lower or "v sat" in text_lower or "thi riêng" in text_lower:
        return "KY_THI_RIENG"
    # 1d. Xét tuyển tài năng
    if "tài năng" in text_lower or "xét tuyển tài năng" in text_lower:
        return "KY_THI_RIENG"

    # ── ƯU TIÊN 2: FALLBACK – TỪ KHÓA PHỔ THÔNG (kiểm tra cuối) ──────
    # 2a. Học bạ
    if "học bạ" in text_lower:
        return "HOC_BA"
    # 2b. THPT Quốc gia (chỉ khi không có từ khóa ngách nào ở trên match)
    if "thpt" in text_lower or "tốt nghiệp" in text_lower:
        return "THPT_QG"
        
    # 3. Fuzzy matching fallback cho các trường hợp còn lại
    valid_tags = [
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
    ]
    matches = difflib.get_close_matches(text.upper(), valid_tags, n=1, cutoff=0.5)
    if matches:
        return matches[0]
        
    from app.utils.taxonomy_engine import normalize_method_tag
    return normalize_method_tag(text)

def _parse_subject_combinations(raw_value: Any) -> list[str]:
    if raw_value is None:
        return []
    raw_items = raw_value if isinstance(raw_value, list) else [raw_value]
    combinations: list[str] = []
    for item in raw_items:
        if item is None:
            continue
        for part in re.split(r"[;,\|\s]+", str(item).upper()):
            part = part.strip()
            if part:
                combinations.append(part)
    return list(dict.fromkeys(combinations))


def _record_score(record: dict) -> float:
    try:
        return float(record.get("score") or 0)
    except (TypeError, ValueError):
        return 0.0


@tool
def get_historical_scores(
    university: str,
    major: str,
    year: Optional[str] = None,
    method_tag: Optional[str] = None,
    subject_combination: Optional[str] = None,
) -> str:
    """
    Truy vấn Điểm Chuẩn Lịch Sử từ MongoDB.
    
    Tool này được sử dụng để cung cấp thông tin về điểm chuẩn của các trường đại học:
    - Nếu có `year`: Trả về điểm chuẩn của đúng năm đó (để so sánh chính xác).
    - Nếu KHÔNG có `year`: Trả về điểm chuẩn của 3 năm gần nhất (để phân tích xu hướng).
    
    Kết quả được trả về dưới dạng JSON có cấu trúc:
    - `status`: "success" hoặc "not_found"
    - `history`: Danh sách điểm chuẩn theo từng năm (sắp xếp giảm dần)
    
    Args:
        university: Mã trường đại học (Bắt buộc, VD: "BKA", "QHI", "BVH")
        major: Mã ngành học (BẮT BUỘC phải truyền mã ngành, VD: "IT1", "TM04". Nếu không có, truyền "")
        year: Năm xét tuyển (Tùy chọn). Nếu có → filter đúng năm. Nếu None → lấy 3 năm gần nhất.
        method_tag: Tên tag phương thức (VD: "THPT_QG", "DGTD_TSA", "CHUNG_CHI_QUOC_TE")
    
    Returns:
        Chuỗi JSON có cấu trúc {status, history} hoặc thông báo lỗi.
    
    Example:
        >>> get_historical_scores("BKA", major="IT1", year="2024", method_tag="DGTD_TSA")
        '{"status": "success", "history": [{"year": 2024, "score": 83.82, ...}]}'
    """
    import json as json_lib
    
    # Process method_tag using fuzzy matching
    processed_method_tag = extract_method_tag(method_tag) if method_tag else None
    from app.utils.taxonomy_engine import get_method_aliases
    method_aliases = get_method_aliases(processed_method_tag) if processed_method_tag else []
    requested_combination = str(subject_combination or "").strip().upper() or None
    
    logger.info(
        f"📊 Fetching historical scores | University: {university} | Major: {major} | "
        f"Year: {year} | Method: {processed_method_tag} (Original: {method_tag}) | "
        f"Subject combo: {requested_combination}"
    )
    
    # REFACTOR: Normalize + Regex khử nhiễu mã trường do LLM sinh ra
    # Ví dụ: "BBKA" -> "BKA", "TTMU" -> "TMU", "QQHI" -> "QHI"
    university = str(university).strip().upper() if university else None
    if university:
        university = re.sub(r'^(.)\1+', r'\1', university)
    major = str(major).strip() if major else None

    if not major:
        return (
            "Không thể tra cứu điểm chuẩn: thiếu mã ngành. "
            "Cần truyền major_code cụ thể để tránh lấy nhầm điểm của ngành khác."
        )

    if not processed_method_tag:
        return (
            "Không thể tra cứu điểm chuẩn: thiếu phương thức xét tuyển. "
            "Cần truyền method_tag cụ thể để tránh so sánh nhầm phương thức."
        )
    
    try:
        # REFACTOR: Dùng global MongoDB pool thay vì tạo client mới mỗi lần
        collection = get_scores_collection()
        if collection is None:
            return "Lỗi: MongoDB connection không được khởi tạo. Kiểm tra lại cấu hình."
        
        # Build query filter
        base_filter = {"university_code": university}
        
        if major:
            base_filter["major_code"] = major
            
        if year:
            # Convert year to int if provided as string for proper querying
            try:
                year_int = int(year)
                base_filter["year"] = year_int
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️  Invalid year format: {year}, ignoring year filter")
        
        method_conditions = [{"method_tag": processed_method_tag}]
        if method_aliases:
            method_conditions.append({"method_alias": {"$in": method_aliases}})

        if len(method_conditions) == 1:
            query_filter = {**base_filter, **method_conditions[0]}
        else:
            query_filter = {"$and": [base_filter, {"$or": method_conditions}]}

        logger.info(f"   Query filter: {query_filter}")
        
        # TEMPORAL: Query logic
        # - Nếu có year: filter đúng năm đó (Strict Matching)
        # - Nếu không có year: lấy 3 năm gần nhất (Trend Analysis)
        results = list(
            collection.find(query_filter)
            .sort("year", -1)
            .limit(20 if not year else 100)  # Lấy đủ các tổ hợp/cơ sở để match subject_combination trong Python
        )
        
        if not results:
            logger.info(f"   ⚠️  No scores found for {university}")
            major_text = f" ngành {major}" if major else ""
            year_text = f" năm {year}" if year else ""
            return (
                f"Xin lỗi, không tìm thấy thông tin điểm chuẩn cho trường {university}{major_text}{year_text}. "
                f"Vui lòng kiểm tra lại mã trường hoặc thử tìm kiếm với thông tin khác."
            )
        
        # TEMPORAL: Format kết quả dạng JSON gọn gàng cho DataStrategist
        # RÚT GỌN: Chỉ lấy những field cần thiết để tránh vượt quá token limit
        selected_record = None
        fallback_used = False
        subject_combination_found = False
        if requested_combination:
            for record in results:
                parsed_combinations = _parse_subject_combinations(record.get("subject_combinations"))
                logger.info(
                    "   Candidate combo | major=%s | score=%s | combos=%s",
                    record.get("major_code"),
                    record.get("score"),
                    parsed_combinations,
                )
                if requested_combination in parsed_combinations:
                    selected_record = record
                    subject_combination_found = True
                    break
            if selected_record is None:
                unknown_combo_records = [
                    record for record in results
                    if not _parse_subject_combinations(record.get("subject_combinations"))
                ]
                selected_record = max(unknown_combo_records or results, key=_record_score)
                fallback_used = True
        else:
            selected_record = max(results, key=_record_score)
            fallback_used = True
            subject_combination_found = False
        selected_index = results.index(selected_record) if selected_record in results else -1

        history_items = []
        for index, record in enumerate(results):
            score_val = record.get("score", 0)
            history_items.append({
                "year": record.get("year"),
                "major_code": record.get("major_code"),
                "major_name": record.get("major_name"),
                "method_tag": record.get("method_tag", "N/A"),
                "method_alias": record.get("method_alias"),
                "score": float(score_val) if isinstance(score_val, (int, float)) else 0,
                "subject_combinations": _parse_subject_combinations(record.get("subject_combinations")),
                "selected": index == selected_index,
            })
        
        json_result = json_lib.dumps(
            {
                "status": "success",
                "university": university,
                "total_records": len(results),
                "subject_combination": requested_combination,
                "selected_cutoff_score": _record_score(selected_record) if selected_record else None,
                "selected_major_name": selected_record.get("major_name") if selected_record else None,
                "selected_major_code": selected_record.get("major_code") if selected_record else None,
                "fallback_used": fallback_used,
                "subject_combination_found": subject_combination_found,
                "history": history_items,
            },
            ensure_ascii=False,
            indent=2,
        )
        
        # Kèm thêm bản text RỨT GỌN dễ đọc cho LLM (không cần major_name dài dòng)
        text_parts = [f"📊 Điểm chuẩn lịch sử - Trường {university}, Ngành {major if major else '(toàn bộ)'}:"]
        for item in history_items:
            score_str = f"{item['score']:.2f}" if item['score'] else "N/A"
            text_parts.append(
                f"  Năm {item['year']}: {item['method_tag']} = {score_str} điểm"
            )
        
        final_result = "\n".join(text_parts) + "\n\n" + json_result
        logger.info(f"   ✅ Retrieved {len(results)} score record(s)")
        return final_result
    
    except PyMongoError as e:
        logger.error(f"   ❌ MongoDB error: {e}")
        return f"Lỗi cơ sở dữ liệu khi tra cứu điểm chuẩn: {str(e)}"
    
    except Exception as e:
        logger.error(f"   ❌ Error fetching historical scores: {e}")
        return f"Lỗi khi tra cứu điểm chuẩn: {str(e)}"


if __name__ == "__main__":
    # Test the tools
    logger.info("\n" + "=" * 70)
    logger.info("Testing Tools")
    logger.info("=" * 70)
    
    # Test search_admission_rules
    print("\n--- Test 1: Search Admission Rules ---")
    # SỬA Ở ĐÂY: Dùng .invoke() và truyền Dictionary
    result1 = search_admission_rules.invoke({
        "query": "Quy đổi IELTS 6.5", 
        "university": "BKA", 
        "year": "2024"
    })
    print(result1)
    
    # Test get_historical_scores
    print("\n--- Test 2: Get Historical Scores ---")
    # SỬA Ở ĐÂY: Dùng .invoke() và truyền Dictionary
    result2 = get_historical_scores.invoke({
        "university": "BKA", 
        "major": "IT1", 
        "year": "2024"
    })
    print(result2)
