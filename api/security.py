import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import jwt
from passlib.context import CryptContext
from config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)

def new_reset_token() -> str:
    return secrets.token_urlsafe(32)

def create_access_token(
    subject: str,
    extra: dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    now = datetime.now(timezone.utc)
    merged = {**extra, "sub": subject, "iat": now, "exp": now + expires_delta}
    if "type" not in merged:
        merged["type"] = "access"
    return jwt.encode(merged, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
