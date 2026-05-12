import os
import time
import logging
from typing import Optional

from pymongo import MongoClient
from pymongo.errors import PyMongoError
from thefuzz import process

logger = logging.getLogger(__name__)

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

def get_standard_method_tag(user_query: str, university_code: str) -> str:
    """
    Xác định method_tag theo thuật toán 2 bước: Exact Match và Weighted Fuzzy Match.
    Khắc phục lỗi 'Tag Trap' khi các tag phổ biến đè bẹp các tag đặc thù.
    """
    if not user_query or _taxonomy_collection is None:
        return "THPT_QG"
        
    query_lower = user_query.lower()
    best_tag = "THPT_QG"
    
    try:
        documents = _get_taxonomy_docs()
        
        # =========================================================
        # BƯỚC 1: EXACT MATCH (Ưu tiên tuyệt đối)
        # =========================================================
        for doc in documents:
            tag = doc.get("tag")
            if not tag:
                continue
                
            exact_keywords = doc.get("exact_keywords", [])
            for keyword in exact_keywords:
                if keyword and str(keyword).lower() in query_lower:
                    logger.info(f"   🎯 [Exact Match] Taxonomy Engine chốt ngay tag: '{tag}' nhờ keyword: '{keyword}'")
                    return tag
        
        # =========================================================
        # BƯỚC 2: WEIGHTED FUZZY MATCH (Kết hợp trọng số Priority)
        # =========================================================
        highest_weighted_score = 0
        best_raw_score = 0
        best_priority = 1
        
        for doc in documents:
            tag = doc.get("tag")
            if not tag:
                continue
                
            priority = doc.get("priority", 1)
            
            # Gom tất cả keyword/alias (global + specific) thành một chuỗi đại diện để fuzzy
            global_keywords = doc.get("global_keywords", [])
            university_specific = doc.get("university_specific", {})
            uni_aliases = university_specific.get(university_code, [])
            
            all_aliases = [str(k) for k in (global_keywords + uni_aliases) if k]
            if not all_aliases:
                continue
                
            combined_keywords = " ".join(all_aliases).lower()
            
            # Tính raw fuzzy score bằng token_set_ratio (tốt cho query dài chứa keyword)
            raw_score = fuzz.token_set_ratio(query_lower, combined_keywords)
            
            # Tính weighted score: nhân raw score với trọng số ưu tiên
            weighted_score = raw_score * (1 + (priority / 100))
            
            if raw_score > 60 and weighted_score > highest_weighted_score:
                highest_weighted_score = weighted_score
                best_raw_score = raw_score
                best_priority = priority
                best_tag = tag
        
        if highest_weighted_score > 0:
            logger.info(
                f"   ⚖️ [Weighted Fuzzy] Taxonomy Engine chọn tag: '{best_tag}' "
                f"(raw_score={best_raw_score}, priority={best_priority}, weighted={highest_weighted_score:.2f})"
            )
        else:
            logger.info("   ⚠️ Taxonomy Engine không match được tag nào. Fallback về 'THPT_QG'")
            
    except PyMongoError as e:
        logger.error(f"   ❌ Lỗi truy vấn MongoDB trong taxonomy_engine: {e}")
    except Exception as e:
        logger.error(f"   ❌ Lỗi không xác định trong taxonomy_engine: {e}")
        
    return best_tag