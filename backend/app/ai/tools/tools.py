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
chroma_dir = Path(__file__).parent.parent.parent.parent / "data" / "chroma_db"

logger.info(f"Initializing VectorDB from: {chroma_dir}")

# Initialize embeddings with Google Gemini Embedding model
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2-preview")

# Initialize Chroma vector store with persistence
vectorstore = Chroma(
    persist_directory=str(chroma_dir),
    embedding_function=embeddings,
    collection_name="admission_rules",
)

logger.info("✅ VectorDB initialized successfully")

# =============================================================================
# REFACTOR: MongoDB Connection Pooling — Global scope, maxPoolSize=50
# Không mở/đóng kết nối mỗi lần gọi tool nữa → tái sử dụng pool
# =============================================================================
import os
from pymongo import MongoClient
from pymongo.errors import PyMongoError

_MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
_MONGO_DB_NAME = os.getenv("MONGODB_DB_NAME", "admission_planner_db")

try:
    _mongo_client = MongoClient(
        _MONGO_URL,
        serverSelectionTimeoutMS=5000,
        maxPoolSize=50,  # REFACTOR: Connection Pooling cho 20+ trường
    )
    _mongo_db = _mongo_client[_MONGO_DB_NAME]
    _scores_collection = _mongo_db["admission_scores"]
    logger.info(f"✅ MongoDB connection pool initialized (maxPoolSize=50) for tools")
except Exception as e:
    logger.error(f"❌ Failed to init MongoDB for tools: {e}")
    _mongo_client = None
    _mongo_db = None
    _scores_collection = None


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
    
    # ── ƯU TIÊN 1: PHƯƠNG THỨC NGÁCH (kiểm tra trước) ──────────────────
    # 1a. Chứng chỉ quốc tế / Kết hợp / Phương thức 409
    if "chứng chỉ quốc tế" in text_lower or "409" in text_lower or "ielts" in text_lower or "ccqt" in text_lower:
        return "CHUNG_CHI_QUOC_TE"
    # 1b. Đánh giá tư duy / TSA (Bách Khoa)
    if "tsa" in text_lower or "đgtd" in text_lower or "đánh giá tư duy" in text_lower:
        return "DGTD_TSA"
    # 1c. Đánh giá năng lực / HSA (ĐHQG)
    if "hsa" in text_lower or "đgnl" in text_lower or "đánh giá năng lực" in text_lower:
        return "DGNL_HSA"
    # 1d. Xét tuyển tài năng
    if "tài năng" in text_lower or "xét tuyển tài năng" in text_lower:
        return "XET_TUYEN_TAI_NANG"

    # ── ƯU TIÊN 2: FALLBACK – TỪ KHÓA PHỔ THÔNG (kiểm tra cuối) ──────
    # 2a. Học bạ
    if "học bạ" in text_lower:
        return "HOC_BA"
    # 2b. THPT Quốc gia (chỉ khi không có từ khóa ngách nào ở trên match)
    if "thpt" in text_lower or "tốt nghiệp" in text_lower:
        return "THPT_QG"
        
    # 3. Fuzzy matching fallback cho các trường hợp còn lại
    valid_tags = ["THPT_QG", "DGTD_TSA", "XET_TUYEN_TAI_NANG", "CHUNG_CHI_QUOC_TE", "HOC_BA", "DGNL_HSA"]
    matches = difflib.get_close_matches(text.upper(), valid_tags, n=1, cutoff=0.5)
    if matches:
        return matches[0]
        
    return text.upper()

@tool
def get_historical_scores(
    university: str,
    major: str,
    year: Optional[str] = None,
    method_tag: Optional[str] = None,
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
    
    logger.info(f"📊 Fetching historical scores | University: {university} | Major: {major} | Year: {year} | Method: {processed_method_tag} (Original: {method_tag})")
    
    # REFACTOR: Normalize + Regex khử nhiễu mã trường do LLM sinh ra
    # Ví dụ: "BBKA" -> "BKA", "TTMU" -> "TMU", "QQHI" -> "QHI"
    university = str(university).strip().upper() if university else None
    if university:
        university = re.sub(r'^(.)\1+', r'\1', university)
    major = str(major).strip() if major else None
    
    try:
        # REFACTOR: Dùng global MongoDB pool thay vì tạo client mới mỗi lần
        if _scores_collection is None:
            return "Lỗi: MongoDB connection không được khởi tạo. Kiểm tra lại cấu hình."
        
        collection = _scores_collection
        
        # Build query filter
        query_filter = {"university_code": university}
        
        if major:
            query_filter["major_code"] = major
            
        if processed_method_tag:
            query_filter["method_tag"] = processed_method_tag
        
        if year:
            # Convert year to int if provided as string for proper querying
            try:
                year_int = int(year)
                query_filter["year"] = year_int
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️  Invalid year format: {year}, ignoring year filter")
        
        logger.info(f"   Query filter: {query_filter}")
        
        # TEMPORAL: Query logic
        # - Nếu có year: filter đúng năm đó (Strict Matching)
        # - Nếu không có year: lấy 3 năm gần nhất (Trend Analysis)
        results = list(
            collection.find(query_filter)
            .sort("year", -1)
            .limit(3 if not year else 5)  # Khi có year cụ thể cho limit cao hơn để đa phương thức
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
        history_items = []
        for record in results:
            score_val = record.get("score", 0)
            history_items.append({
                "year": record.get("year"),
                "major_code": record.get("major_code"),
                "method_tag": record.get("method_tag", "N/A"),
                "score": float(score_val) if isinstance(score_val, (int, float)) else 0,
            })
        
        json_result = json_lib.dumps(
            {"status": "success", "university": university, "total_records": len(results), "history": history_items},
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