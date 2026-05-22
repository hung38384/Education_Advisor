"""
Application Configuration Module

Manages application settings using Pydantic Settings V2 with environment
variable support. All configuration is centralized here for easy management
across different environments (development, staging, production).
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
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

    # Q&A cache configuration
    QA_CACHE_ENABLED: bool = Field(default=True)
    QA_CACHE_TTL_SECONDS: int = Field(default=300)
    QA_CACHE_NAMESPACE: str = Field(default="qa:answer:v1")

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
    DEEPSEEK_API_KEY: str | None = None
    DEEPSEEK_TEMPERATURE: float = 1.0
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    # Internal service-to-service authentication
    INTERNAL_API_KEY: str = Field(default="")


# Global settings instance - instantiated once and reused throughout the application
settings = Settings()
