"""
Application Configuration Module

Manages application settings using Pydantic Settings V2 with environment
variable support. All configuration is centralized here for easy management
across different environments (development, staging, production).
"""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    Application settings with environment variable support.
    
    Loads from .env file and environment variables. Environment variables
    take precedence over .env file values.
    """

    # Application Configuration
    PROJECT_NAME: str = Field(default="AI-Powered University Admission Planner")
    APP_VERSION: str = Field(default="0.1.0")
    DEBUG: bool = Field(default=False)
    ENVIRONMENT: str = Field(default="development")

    # MongoDB Configuration
    MONGODB_URL: str = Field(default="mongodb://localhost:27017")
    MONGODB_DB_NAME: str = Field(default="admission_planner_db")

    # Redis Configuration
    REDIS_URL: str = Field(default="redis://localhost:6379")

    # Vector Database (Chroma)
    CHROMA_HOST: str = Field(default="localhost")
    CHROMA_PORT: int = Field(default=8001)

    # LLM / OpenAI Configuration
    OPENAI_API_KEY: str = Field(default="")
    OPENAI_MODEL: str = Field(default="gpt-4")
    OPENAI_TEMPERATURE: float = Field(default=0.7)
    GOOGLE_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None
    LLAMA_CLOUD_API_KEY: str | None = None

    # Security Configuration
    SECRET_KEY: str = Field(default="your-secret-key-change-this-in-production")
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)

    # CORS Configuration
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"]
    )

    # Logging Configuration
    LOG_LEVEL: str = Field(default="INFO")

    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance - instantiated once and reused throughout the application
settings = Settings()
