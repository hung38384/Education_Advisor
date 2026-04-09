"""
Quick test: Crawl a single university via JSON API
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.constants import TARGET_UNIVERSITIES, TARGET_YEARS, METHOD_IDS
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import the crawler class
from crawl_tuyensinh247 import AdmissionScoreCrawler


async def test_single_university():
    """Test crawling a single university via API"""
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    
    try:
        # Initialize crawler
        crawler = AdmissionScoreCrawler(db)
        await crawler.create_indexes()
        
        # Test with BKA (has school_id)
        univ = next((u for u in TARGET_UNIVERSITIES if u["code"] == "BKA"), None)
        if not univ:
            logger.error("BKA not found in TARGET_UNIVERSITIES")
            return False
        
        logger.info(f"\n🔍 Testing single university: {univ['code']}")
        logger.info(f"   Name: {univ['name']}")
        logger.info(f"   School ID: {univ['school_id']}\n")
        
        result = await crawler.crawl_university(univ['code'], univ['school_id'])
        
        logger.info(f"\n✅ Crawl Results:")
        logger.info(f"   Total Records Found: {result['total_records']}")
        logger.info(f"   Inserted: {result['inserted']}")
        logger.info(f"   Failed: {result['failed']}")
        if result['errors']:
            logger.info(f"   Errors: {result['errors']}")
        
        # Check database
        collection = db["admission_scores"]
        count = await collection.count_documents({})
        logger.info(f"\n📊 Database Records: {count}")
        
        if count > 0:
            sample = await collection.find_one({})
            logger.info(f"\n📄 Sample Record:")
            for key, val in sample.items():
                if key != '_id':
                    logger.info(f"   {key}: {val}")
        
        await crawler.close()
        return result['inserted'] > 0
        
    finally:
        client.close()


if __name__ == "__main__":
    success = asyncio.run(test_single_university())
    sys.exit(0 if success else 1)
