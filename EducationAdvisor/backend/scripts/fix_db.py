import os
import asyncio
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

async def fix():
    url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "admission_planner_db")
    
    print(f"Connecting to MongoDB: {url}")
    client = AsyncIOMotorClient(url)
    db = client[db_name]
    
    r = await db['admission_scores'].update_many({'university_code': 'TMA'}, {'$set': {'university_code': 'TMU'}})
    print(f"Đã cập nhật {r.modified_count} bản ghi từ TMA thành TMU")
    client.close()

if __name__ == "__main__":
    asyncio.run(fix())
