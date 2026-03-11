import jwt
import bcrypt
import os
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends, Header
from typing import Optional

SECRET_KEY = os.getenv("JWT_SECRET", "autolauncher-pro-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
GUEST_LINK_EXPIRE_HOURS = 48

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: int, email: str, expire_hours: int = ACCESS_TOKEN_EXPIRE_HOURS) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=expire_hours)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_guest_token(user_id: int, email: str) -> str:
    """Create a guest access token valid for 48 hours."""
    expire = datetime.now(timezone.utc) + timedelta(hours=GUEST_LINK_EXPIRE_HOURS)
    nonce = secrets.token_hex(8)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "type": "guest",
        "nonce": nonce,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_guest_token(token: str) -> dict:
    """Decode and validate a guest token. Returns payload or raises."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "guest":
            raise HTTPException(status_code=401, detail="Invalid guest token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Guest link expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid guest link")

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    return decode_token(token)
