"""
FastAPI Application Entry Point

Initializes the FastAPI application with lifespan management, middleware,
and core routes. Handles database connection lifecycle and application setup.
"""

import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from app.core.config import settings
from app.db.connection import connect_to_mongo, close_mongo_connection
from app.api.routes import advisor, fast_predict

# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    
    Manages startup and shutdown events:
    - Startup: Establishes MongoDB connection
    - Shutdown: Closes MongoDB connection
    
    This replaces the deprecated @app.on_event decorator pattern.
    """
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    
    try:
        await connect_to_mongo()
        logger.info("Application startup completed successfully")
    except Exception as e:
        logger.error(f"Failed to start application: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    try:
        await close_mongo_connection()
        logger.info("Application shutdown completed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")


# Create FastAPI application instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="AI-Powered University Admission & Study Planner API",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# Add CORS middleware for cross-origin requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Routes ====================

app.include_router(advisor.router, prefix="/api/v1")
app.include_router(fast_predict.router, prefix="/api/v1")

@app.get("/", tags=["Health"])
async def root():
    """
    Root endpoint to verify API is running.
    
    Returns:
        dict: Basic application information
    """
    return {
        "message": "Welcome to Admission Planner API",
        "application": settings.PROJECT_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/api/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint for monitoring application status.
    
    Returns:
        dict: Health status information
    """
    return {
        "status": "healthy",
        "application": settings.PROJECT_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


# ==================== Main Entry Point ====================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )

