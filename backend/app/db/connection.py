"""
MongoDB Connection Manager

Handles AsyncIO MongoDB connections using Motor driver. Provides database
connection lifecycle management and dependency injection for FastAPI routes.
"""

from typing import Optional
import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global database client and instance
mongodb_client: Optional[AsyncIOMotorClient] = None
mongodb_db: Optional[AsyncIOMotorDatabase] = None


async def connect_to_mongo() -> None:
    """
    Establish asynchronous connection to MongoDB.
    
    Called during application startup. Creates a Motor AsyncIOMotorClient
    and stores it globally for use throughout the application.
    
    Raises:
        Exception: If connection to MongoDB fails.
    """
    global mongodb_client, mongodb_db
    
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}")
        mongodb_client = AsyncIOMotorClient(settings.MONGODB_URL)
        mongodb_db = mongodb_client[settings.MONGODB_DB_NAME]
        
        # Verify connection by running a ping command
        await mongodb_db.command("ping")
        logger.info(f"Successfully connected to MongoDB database: {settings.MONGODB_DB_NAME}")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {str(e)}")
        raise


async def close_mongo_connection() -> None:
    """
    Close MongoDB connection.
    
    Called during application shutdown. Properly closes the Motor client
    connection to ensure graceful database disconnection.
    """
    global mongodb_client, mongodb_db
    
    if mongodb_client is None:
        logger.warning("MongoDB client was not initialized")
        return
    
    try:
        logger.info("Closing MongoDB connection")
        mongodb_client.close()
        mongodb_client = None
        mongodb_db = None
        logger.info("MongoDB connection closed successfully")
    except Exception as e:
        logger.error(f"Error closing MongoDB connection: {str(e)}")
        raise


async def get_db() -> AsyncIOMotorDatabase:
    """
    Dependency function to provide database instance to FastAPI routes.
    
    Can be used as a dependency in FastAPI route handlers:
    
    Example:
        @app.get("/users")
        async def get_users(db: AsyncIOMotorDatabase = Depends(get_db)):
            return await db["users"].find_one()
    
    Returns:
        AsyncIOMotorDatabase: The MongoDB database instance.
        
    Raises:
        RuntimeError: If database connection was not established.
    """
    if mongodb_db is None:
        raise RuntimeError("Database connection not initialized. Call connect_to_mongo() first.")
    
    return mongodb_db
