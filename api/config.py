import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgres://iscope:iscope@localhost:5432/iscope")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    mfa_token_expire_minutes: int = int(os.getenv("MFA_TOKEN_EXPIRE_MINUTES", "10"))
    password_reset_expire_minutes: int = int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "60"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    debug: bool = os.getenv("DEBUG", "false").lower() in ("1", "true", "yes")
    allow_public_register: bool = os.getenv("ALLOW_PUBLIC_REGISTER", "false").lower() in ("1", "true", "yes")

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache
def get_settings() -> Settings:
    return Settings()
