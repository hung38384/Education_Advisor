"""
Clean the MongoDB database before testing
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def clean_database():
    """Delete all admission scores from database"""
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    
    try:
        collection = db["admission_scores"]
        result = await collection.delete_many({})
        logger.info(f"✅ Deleted {result.deleted_count} records from database")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(clean_database())
