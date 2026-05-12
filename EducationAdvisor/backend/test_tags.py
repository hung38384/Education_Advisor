import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['admission_planner_db']
    docs = await db.admission_scores.find({'university_code': 'TMU', 'major_code': 'TM04'}).to_list(None)
    tags = set(d.get('method_tag') for d in docs)
    print(f"Các method_tag của TM04 (TMU) trong DB: {tags}")
    
    for d in docs:
        if d.get('method_tag') not in ('THPT_QG', 'HOC_BA'):
            print(f"Sample doc: {d}")

asyncio.run(test())
