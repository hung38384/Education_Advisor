"""
LangGraph Multi-Agent System Tools

This module defines the tools (functions) that LLM agents will use to retrieve data:
- search_admission_rules: Query admission rules, IELTS conversions, and prerequisites
- get_historical_scores: Query historical admission scores from MongoDB

Each tool is decorated with @tool for LangChain integration.
"""

import logging
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
        # Build filter dictionary for metadata filtering
        # Chroma requires filters in a specific format with $and operator for multiple conditions
        filter_dict = None
        if university or year:
            filter_conditions = []
            if university:
                filter_conditions.append({"university": university})
            if year:
                filter_conditions.append({"year": year})
            
            # Use $and operator for multiple conditions
            if len(filter_conditions) > 1:
                filter_dict = {"$and": filter_conditions}
            else:
                filter_dict = filter_conditions[0]
        
        # Perform similarity search with filter
        results = vectorstore.similarity_search(query, k=2, filter=filter_dict)
        
        if not results:
            logger.info(f"   ⚠️  No results found for query: '{query}'")
            return (
                f"Xin lỗi, không tìm thấy thông tin liên quan đến '{query}'. "
                f"Vui lòng thử lại với từ khóa khác hoặc kiểm tra xem trường/năm bạn tìm kiếm có tồn tại không."
            )
        
        # Format results
        formatted_results = []
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
        logger.info(f"   ✅ Found {len(results)} result(s)")
        return final_result
    
    except Exception as e:
        logger.error(f"   ❌ Error searching admission rules: {e}")
        return f"Lỗi khi tìm kiếm: {str(e)}"


@tool
def get_historical_scores(
    university: str,
    major: Optional[str] = None,
    year: Optional[str] = None,
    method_tag: Optional[str] = None,
) -> str:
    """
    Truy vấn Điểm Chuẩn Lịch Sử từ MongoDB.
    
    Tool này được sử dụng để cung cấp thông tin về điểm chuẩn (điểm tối thiểu để được đăng ký nguyện vọng) 
    của các trường đại học trong các năm xét tuyển khác nhau, bao gồm:
    - Điểm chuẩn theo ngành học/chuyên ngành
    - Điểm chuẩn theo phương pháp xét tuyển (THPT, TSA, IELTS, HSA, APT, v.v.)
    - Dữ liệu lịch sử so sánh giữa các năm
    - Xu hướng tăng/giảm điểm qua các năm
    
    Kết quả trả về các điểm chuẩn được lưu trữ trong MongoDB, giúp agent trả lời các câu hỏi 
    về ngưỡng điểm vào trường, dự báo xu hướng, và so sánh điểm giữa các trường/năm.
    
    Args:
        university: Mã trường đại học (Bắt buộc, VD: "BKA", "QHI", "BVH")
        major: Mã ngành học hoặc tên ngành (Tùy chọn, VD: "IT1", "NK", "C01")
        year: Năm xét tuyển (Tùy chọn, VD: "2023", "2024", "2025")
        method_tag: Tên tag phương thức (Tùy chọn, BẮT BUỘC map vào 1 trong 3: "THPT_QG", "DGTD_TSA", "XET_TUYEN_TAI_NANG")
    
    Returns:
        Chuỗi văn bản chứa thông tin điểm chuẩn lịch sử được định dạng.
        Bao gồm trường, năm, ngành, và các điểm chuẩn tương ứng.
    
    Example:
        >>> get_historical_scores("BKA", major="IT1", year="2024", method_tag="DGTD_TSA")
        'Kết quả tra cứu điểm chuẩn trường BKA...'
    """
    import os
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
    
    logger.info(f"📊 Fetching historical scores | University: {university} | Major: {major} | Year: {year} | Method: {method_tag}")
    
    client = None
    try:
        # Get MongoDB connection parameters from environment
        mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
        mongodb_db_name = os.getenv("MONGODB_DB_NAME", "admission_planner_db")
        
        logger.info(f"   Connecting to MongoDB: {mongodb_url}")
        
        # Create MongoDB client (synchronous)
        client = MongoClient(mongodb_url, serverSelectionTimeoutMS=5000)
        db = client[mongodb_db_name]
        collection = db["admission_scores"]
        
        # Verify connection
        client.admin.command("ping")
        logger.info(f"   ✅ Connected to MongoDB database: {mongodb_db_name}")
        
        # Build query filter
        query_filter = {"university_code": university}
        
        if major:
            query_filter["major_code"] = major
            
        if method_tag:
            query_filter["method_tag"] = method_tag
        
        if year:
            # Convert year to int if provided as string for proper querying
            try:
                year_int = int(year)
                query_filter["year"] = year_int
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️  Invalid year format: {year}, ignoring year filter")
        
        logger.info(f"   Query filter: {query_filter}")
        
        # Query MongoDB with limit and sort by year descending
        results = list(
            collection.find(query_filter)
            .sort("year", -1)
            .limit(20)
        )
        
        if not results:
            logger.info(f"   ⚠️  No scores found for {university}")
            major_text = f" ngành {major}" if major else ""
            year_text = f" năm {year}" if year else ""
            return (
                f"Xin lỗi, không tìm thấy thông tin điểm chuẩn cho trường {university}{major_text}{year_text}. "
                f"Vui lòng kiểm tra lại mã trường hoặc thử tìm kiếm với thông tin khác."
            )
        
        # Format results for LLM
        result_parts = [f"📊 Kết quả tra cứu điểm chuẩn lịch sử trường {university}:\n"]
        
        # Group results by year and major for better readability
        grouped = {}
        for record in results:
            key = (record.get("year"), record.get("major_code"), record.get("major_name"))
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)
        
        # Format grouped results
        for (result_year, major_code, major_name), records in sorted(grouped.items(), reverse=True):
            result_parts.append(f"\n📅 Năm {result_year} - Ngành {major_code} ({major_name}):")
            
            for record in records:
                method_type = record.get("method_type", "N/A")
                method_name = record.get("method_name", "N/A")
                score = record.get("score", "N/A")
                
                # Format score nicely
                if isinstance(score, (int, float)):
                    score_str = f"{score:.2f}"
                else:
                    score_str = str(score)
                
                result_parts.append(
                    f"  • Phương thức {method_type} ({method_name}): {score_str} điểm"
                )
                
                # Add subject combinations if available
                subjects = record.get("subject_combinations", [])
                if subjects:
                    subjects_str = ", ".join(subjects)
                    result_parts.append(f"    Tổ hợp môn: {subjects_str}")
        
        final_result = "\n".join(result_parts)
        logger.info(f"   ✅ Retrieved {len(results)} score record(s)")
        return final_result
    
    except PyMongoError as e:
        logger.error(f"   ❌ MongoDB error: {e}")
        return f"Lỗi cơ sở dữ liệu khi tra cứu điểm chuẩn: {str(e)}"
    
    except Exception as e:
        logger.error(f"   ❌ Error fetching historical scores: {e}")
        return f"Lỗi khi tra cứu điểm chuẩn: {str(e)}"
    
    finally:
        # Always close the MongoDB connection
        if client:
            try:
                client.close()
                logger.info("   ✅ MongoDB connection closed")
            except Exception as e:
                logger.error(f"   Error closing MongoDB connection: {e}")


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