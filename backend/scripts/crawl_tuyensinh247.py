"""
University Admission Scores API Crawler

Async API client for extracting university admission scores
from Tuyensinh247 JSON API. Fetches cutoff score data for all admission methods
and years, then stores data in MongoDB using Motor async driver.

Usage: python scripts/crawl_tuyensinh247.py
"""

import asyncio
import sys
import logging
import random
import re
from pathlib import Path
from typing import Dict, List, Optional, Any

import httpx
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.constants import TARGET_UNIVERSITIES, TARGET_YEARS, METHOD_IDS
from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Rate limiting configuration to avoid IP bans
MIN_DELAY_BETWEEN_REQUESTS = 0.5  # Min delay between API calls (seconds)
MAX_DELAY_BETWEEN_REQUESTS = 1.5  # Max delay between API calls (seconds)
DELAY_BETWEEN_UNIVERSITIES = 3    # Delay between processing different universities (seconds)
MAX_RETRIES = 3                   # Max retry attempts for failed requests
RETRY_BACKOFF = 2                 # Exponential backoff multiplier for retries


# ============================================================================
# Admission Method Categorization (Regex-based)
# ============================================================================

def categorize_method(combined_text: str) -> str:
    """
    Phân loại dựa trên Regex siêu nhạy. Đã fix lỗi phân biệt HOA/thường.
    """
    if not combined_text:
        return "UNKNOWN"
    
    # ÉP TOÀN BỘ VỀ CHỮ THƯỜNG ĐỂ MATCH REGEX
    text = combined_text.lower()

    if re.search(r'(tư duy|tsa)', text):
        return "DGTD_TSA"

    # DGNL HN - Bắt các cụm từ (tất cả đều chữ thường)
    if re.search(r'(hsa)', text) or (re.search(r'(năng lực|đgnl|dgnl)', text) and re.search(r'(hà nội|qghn|\bhn\b)', text)):
        return "DGNL_HSA"

    # DGNL HCM
    if re.search(r'(apt)', text) or (re.search(r'(năng lực|đgnl|dgnl)', text) and re.search(r'(hcm|hồ chí minh|qg hcm)', text)):
        return "DGNL_APT"

    if re.search(r'(đánh giá năng lực|đgnl|dgnl)', text):
        return "DGNL_CHUNG"

    if re.search(r'\b(sat|act|a-level|alevel)\b', text) or re.search(r'(ccqt|chứng chỉ quốc tế)', text):
        return "CHUNG_CHI_QUOC_TE"

    if re.search(r'(nước ngoài|quốc tế)', text) and re.search(r'(tốt nghiệp|bằng|chương trình)', text):
        return "TOT_NGHIEP_QUOC_TE"

    if re.search(r'(thi riêng|năng khiếu|chuyên biệt|thực hành)', text):
        return "KY_THI_RIENG"

    if re.search(r'(tài năng|xttn|phỏng vấn|hsg|học sinh giỏi|olympia|quốc gia|giải|ưu tiên xét tuyển|uu-tien-xet-tuyen|ưtxt|xt thẳng|xét tuyển thẳng|xet-tuyen-thang|tuyển thẳng)', text):
        return "XET_TUYEN_TAI_NANG"

    if re.search(r'\b(ielts|toefl|toeic|vstep)\b', text) or re.search(r'(chứng chỉ ngoại ngữ)', text):
        return "NGOAI_NGU_KET_HOP"

    if re.search(r'(tốt nghiệp thpt|thpt qg|thpt quốc gia|thi-thpt|điểm thi thpt)', text):
        return "THPT_QG"
        
    if re.search(r'(học bạ|ket-qua-thpt)', text):
        return "HOC_BA"

    if re.search(r'(kết hợp|ket-hop)', text):
        return "XET_KET_HOP_CHUNG"

    return "UNKNOWN"


class AdmissionScoreCrawler:
    """
    Async API client for university admission scores from Tuyensinh247 JSON API.
    
    Handles:
    - Async HTTP requests to the cutoff score API
    - Mapping of admission method names to standardized types
    - Data normalization and cleaning
    - Bulk insertion into MongoDB
    """
    
    API_BASE_URL = "https://diemthi.tuyensinh247.com/api/common/cutoff-score"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        """
        Initialize the crawler with a MongoDB database instance.
        
        Args:
            db: AsyncIOMotorDatabase instance for storing results
        """
        self.db = db
        self.collection = db["admission_scores"]
        self.http_client = httpx.AsyncClient(timeout=15.0)
        self.request_count = 0
        self.error_count = 0
    
    async def close(self) -> None:
        """Close the HTTP client connection."""
        await self.http_client.aclose()
    
    async def _fetch_with_retry(
        self, 
        api_url: str, 
        year: int, 
        method_id: int, 
        university_code: str,
        attempt: int = 1
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch from API with retry logic and smart rate limiting.
        
        Handles 429 (rate limit), 503 (service unavailable), and other errors.
        Uses exponential backoff on retries.
        
        Args:
            api_url: Full API URL
            year: Year parameter
            method_id: Method ID parameter
            university_code: University code
            attempt: Current attempt number
            
        Returns:
            JSON response dict or None if failed after retries
        """
        try:
            response = await self.http_client.get(api_url)
            self.request_count += 1
            
            # Handle rate limiting (429) or service unavailable (503)
            if response.status_code in [429, 503]:
                if attempt < MAX_RETRIES:
                    wait_time = (RETRY_BACKOFF ** (attempt - 1)) * (1 + random.random())
                    logger.warning(
                        f"   ⚠️  Rate limited (HTTP {response.status_code}) - {university_code}/{year}/{method_id}. "
                        f"Retrying in {wait_time:.1f}s (attempt {attempt}/{MAX_RETRIES})"
                    )
                    await asyncio.sleep(wait_time)
                    return await self._fetch_with_retry(api_url, year, method_id, university_code, attempt + 1)
                else:
                    logger.error(
                        f"   ❌ Max retries exceeded for {university_code}/{year}/{method_id} "
                        f"(HTTP {response.status_code})"
                    )
                    self.error_count += 1
                    return None
            
            response.raise_for_status()
            return response.json()
        
        except httpx.HTTPError as e:
            if attempt < MAX_RETRIES:
                wait_time = (RETRY_BACKOFF ** (attempt - 1))
                logger.debug(
                    f"   HTTP error for {year}/{method_id}: {e}. "
                    f"Retrying in {wait_time:.1f}s (attempt {attempt}/{MAX_RETRIES})"
                )
                await asyncio.sleep(wait_time)
                return await self._fetch_with_retry(api_url, year, method_id, university_code, attempt + 1)
            else:
                logger.debug(f"   ❌ Failed after {MAX_RETRIES} attempts: {year}/{method_id}")
                self.error_count += 1
                return None
    
    async def create_indexes(self) -> None:
        """
        Create compound index on university_code, year, and method_type
        for efficient querying.
        """
        try:
            logger.info("Creating database indexes...")
            await self.collection.create_index([
                ("university_code", 1),
                ("year", 1),
                ("method_type", 1)
            ], unique=False)
            logger.info("✅ Indexes created successfully")
        except Exception as e:
            logger.error(f"❌ Failed to create indexes: {e}")
            raise
    
    def _map_method_type(self, admission_name: str, university_code: str) -> str:
        """
        Fallback method for simple string matching.
        """
        if not admission_name:
            return "UNKNOWN"
        
        # SỬA .upper() THÀNH .lower() ĐỂ KHỚP VỚI REGEX BÊN DƯỚI
        name_lower = admission_name.lower()
        
        if re.search(r'(tư duy|tsa)', name_lower):
            return "DGTD_TSA"

        if re.search(r'(hsa)', name_lower) or (re.search(r'(năng lực|đgnl|dgnl)', name_lower) and re.search(r'(hà nội|qghn|\bhn\b)', name_lower)):
            return "DGNL_HSA"

        if re.search(r'(apt)', name_lower) or (re.search(r'(năng lực|đgnl|dgnl)', name_lower) and re.search(r'(hcm|hồ chí minh|qg hcm)', name_lower)):
            return "DGNL_APT"

        if re.search(r'(đánh giá năng lực|đgnl|dgnl)', name_lower):
            return "DGNL_CHUNG"

        if re.search(r'\b(sat|act|a-level|alevel)\b', name_lower) or re.search(r'(ccqt|chứng chỉ quốc tế)', name_lower):
            return "CHUNG_CHI_QUOC_TE"

        if re.search(r'(nước ngoài|quốc tế)', name_lower) and re.search(r'(tốt nghiệp|bằng|chương trình)', name_lower):
            return "TOT_NGHIEP_QUOC_TE"

        if re.search(r'(thi riêng|năng khiếu|chuyên biệt|phỏng vấn|thực hành)', name_lower):
            return "KY_THI_RIENG"

        if re.search(r'(tài năng|xttn|hsg|học sinh giỏi|olympia|quốc gia|giải|ưu tiên xét tuyển|uu-tien-xet-tuyen|ưtxt|xt thẳng|xét tuyển thẳng|xet-tuyen-thang|tuyển thẳng)', name_lower):
            return "XET_TUYEN_TAI_NANG"

        if re.search(r'\b(ielts|toefl|toeic|vstep)\b', name_lower) or re.search(r'(chứng chỉ ngoại ngữ)', name_lower):
            return "NGOAI_NGU_KET_HOP"

        if re.search(r'(tốt nghiệp thpt|thpt qg|thpt quốc gia|thi-thpt|điểm thi thpt)', name_lower):
            return "THPT_QG"
            
        if re.search(r'(học bạ|ket-qua-thpt)', name_lower):
            return "HOC_BA"

        if re.search(r'(kết hợp|ket-hop)', name_lower):
            return "XET_KET_HOP_CHUNG"

        return "UNKNOWN"
    
    async def crawl_university(
        self, 
        university_code: str, 
        school_id: int
    ) -> Dict[str, Any]:
        """
        Crawl admission scores for a single university using JSON API.
        
        Iterates through all years and method IDs, fetching data from the API.
        
        Args:
            university_code: Code of the university
            school_id: School ID for API requests
            
        Returns:
            Dictionary with crawl results (total_records, inserted, failed, errors)
        """
        result = {
            "university_code": university_code,
            "total_records": 0,
            "inserted": 0,
            "failed": 0,
            "errors": []
        }
        
        try:
            logger.info(f"🔍 Crawling {university_code} (school_id: {school_id})")
            
            all_records = []
            
            # Iterate through all years and method IDs
            for year in TARGET_YEARS:
                for method_id in METHOD_IDS:
                    try:
                        # Build API URL
                        api_url = (
                            f"{self.API_BASE_URL}?"
                            f"school_id={school_id}&"
                            f"method_id={method_id}&"
                            f"year={year}"
                        )
                        
                        # Fetch from API with retry logic
                        data = await self._fetch_with_retry(
                            api_url, year, method_id, university_code
                        )
                        
                        if not data:
                            # Random jitter to avoid synchronized requests
                            await asyncio.sleep(random.uniform(
                                MIN_DELAY_BETWEEN_REQUESTS, 
                                MAX_DELAY_BETWEEN_REQUESTS
                            ))
                            continue
                        
                        # Extract admission method name from first item (all items in response have same method)
                        items = data.get("data", [])
                        if not items:
                            continue
                        
                        # Combine multiple fields for better categorization
                        admission_name = items[0].get("admission_name", "")
                        admission_alias = items[0].get("admission_alias", "")
                        introtext = items[0].get("introtext", "")
                        combined_text = f"{admission_name} {admission_alias} {introtext}"
                        
                        # Use regex-based categorization with combined fields
                        method_type = categorize_method(combined_text)
                        
                        logger.info(f"   {year} - {admission_name} ({method_type}): {len(items)} records")
                        
                        # Process each item
                        for item in items:
                            # Tạo lại combined text cho TỪNG item (phòng trường hợp các item khác introtext)
                            ad_name = item.get("admission_name") or ""
                            ad_alias = item.get("admission_alias") or ""
                            intro = item.get("introtext") or ""
                            item_combined_context = f"{ad_name} | {ad_alias} | {intro}"
                            
                            record = {
                                "university_code": university_code,
                                "year": item.get("year"),
                                "method_name": ad_name,
                                "method_alias": ad_alias,
                                "major_code": item.get("code"),
                                "major_name": item.get("name"),
                                "score": float(item.get("mark")) if item.get("mark") else None,
                                "subject_combinations": (
                                    [c.strip() for c in item.get("block", "").split(",")]
                                    if item.get("block") else []
                                ),
                                "notes": intro or None,
                                # --- 2 TRƯỜNG QUAN TRỌNG ĐỂ AI QUERY ---
                                "raw_method_context": item_combined_context,
                                "method_tag": categorize_method(item_combined_context) 
                            }
                            all_records.append(record)
                        
                        # Smart random delay to avoid pattern detection
                        await asyncio.sleep(random.uniform(
                            MIN_DELAY_BETWEEN_REQUESTS, 
                            MAX_DELAY_BETWEEN_REQUESTS
                        ))
                    
                    except httpx.HTTPError as e:
                        logger.debug(f"   HTTP error for {year}/{method_id}: {e}")
                        continue
                    except Exception as e:
                        logger.debug(f"   Error processing {year}/{method_id}: {e}")
                        continue
            
            result["total_records"] = len(all_records)
            
            # Bulk insert into MongoDB
            if all_records:
                try:
                    insert_result = await self.collection.insert_many(all_records, ordered=False)
                    result["inserted"] = len(insert_result.inserted_ids)
                    logger.info(f"   ✅ Inserted {result['inserted']} records")
                except Exception as e:
                    logger.error(f"   ❌ Failed to insert records: {e}")
                    result["failed"] = len(all_records)
                    result["errors"].append(str(e))
        
        except Exception as e:
            logger.error(f"❌ Unexpected error crawling {university_code}: {e}")
            result["errors"].append(str(e))
        
        return result
    
    async def crawl_all_universities(self, sleep_interval: int = 3) -> None:
        """
        Crawl all target universities with smart rate limiting.
        
        Args:
            sleep_interval: Seconds to wait between universities to prevent blocking
        """
        logger.info("=" * 70)
        logger.info("🚀 Starting University Admission Scores Crawler (API Mode)")
        logger.info(f"⚙️  Rate limiting: {MIN_DELAY_BETWEEN_REQUESTS}-{MAX_DELAY_BETWEEN_REQUESTS}s between requests")
        logger.info(f"⚙️  {DELAY_BETWEEN_UNIVERSITIES}s between universities")
        logger.info(f"⚙️  Max {MAX_RETRIES} retries with {RETRY_BACKOFF}x backoff")
        logger.info("=" * 70)
        
        results = []
        total_universities = sum(1 for u in TARGET_UNIVERSITIES if u["school_id"] != 0)
        processed = 0
        
        for i, university in enumerate(TARGET_UNIVERSITIES, 1):
            code = university["code"]
            school_id = university["school_id"]
            
            # Skip universities without school_id
            if school_id == 0:
                logger.warning(f"⚠️  Skipping {code}: school_id not configured")
                continue
            
            processed += 1
            logger.info(f"\n[{processed}/{total_universities}] Processing {code}...")
            result = await self.crawl_university(code, school_id)
            results.append(result)
            
            # Smart delay between universities to avoid pattern detection
            if processed < total_universities:
                delay = DELAY_BETWEEN_UNIVERSITIES + random.uniform(-0.5, 0.5)
                logger.info(f"⏳ Waiting {delay:.1f}s before next university...")
                await asyncio.sleep(delay)
        
        # Print summary
        logger.info("\n" + "=" * 70)
        logger.info("📊 Crawl Summary")
        logger.info("=" * 70)
        
        total_inserted = sum(r["inserted"] for r in results)
        total_failed = sum(r["failed"] for r in results)
        total_errors = sum(len(r["errors"]) for r in results)
        total_requests = self.request_count
        total_http_errors = self.error_count
        
        for result in results:
            status = "✅" if result["inserted"] > 0 else "⚠️"
            logger.info(
                f"{status} {result['university_code']}: "
                f"{result['inserted']} inserted, {result['failed']} failed"
            )
        
        logger.info("\n" + "-" * 70)
        logger.info(f"📈 Statistics:")
        logger.info(f"   Total API Requests: {total_requests}")
        logger.info(f"   Failed Requests: {total_http_errors}")
        logger.info(f"   Total Inserted: {total_inserted}")
        logger.info(f"   Total Failed: {total_failed}")
        logger.info(f"   Total Errors: {total_errors}")
        logger.info(f"   Success Rate: {(total_requests - total_http_errors) / max(total_requests, 1) * 100:.1f}%")
        logger.info("=" * 70)


async def main():
    """
    Main entry point for the crawler.
    
    Initializes database connection and starts crawling.
    """
    client = None
    
    try:
        # Initialize MongoDB connection
        logger.info(f"Connecting to MongoDB: {settings.MONGODB_URL}")
        client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = client[settings.MONGODB_DB_NAME]
        
        # Verify connection
        await db.command("ping")
        logger.info(f"✅ Connected to database: {settings.MONGODB_DB_NAME}\n")
        
        # Initialize crawler
        crawler = AdmissionScoreCrawler(db)
        
        # Create indexes
        await crawler.create_indexes()
        
        # Start crawling
        await crawler.crawl_all_universities(sleep_interval=2)
        
        logger.info("\n✅ Crawling completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
    
    finally:
        if client:
            logger.info("\nClosing MongoDB connection...")
            client.close()
            logger.info("✅ Connection closed")
    
    return True


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
