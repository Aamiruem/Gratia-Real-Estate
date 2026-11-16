import os
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError as JWTError
from pwdlib import PasswordHash

from . import config  # noqa: F401

PASSWORD_HASHER = PasswordHash.recommended()

JWT_ALGORITHM = "HS256"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

if not JWT_SECRET_KEY or not JWT_REFRESH_SECRET_KEY:
    raise RuntimeError("JWT secrets are missing from backend/.env")


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return PASSWORD_HASHER.verify(password, password_hash)


# A session that isn't "remembered" lasts at most this long (and its cookie
# ends when the browser closes).
SHORT_SESSION_HOURS = 12


def _create_token(user_id: int, secret: str, expires_delta: timedelta, token_type: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int, version: int = 0) -> str:
    """`version` is the user's token_version: bumping it signs out every session."""
    return _create_token(
        user_id=user_id,
        secret=JWT_SECRET_KEY,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        token_type="access",
        extra={"ver": version},
    )


def create_refresh_token(user_id: int, version: int = 0, remember: bool = True) -> str:
    return _create_token(
        user_id=user_id,
        secret=JWT_REFRESH_SECRET_KEY,
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS) if remember else timedelta(hours=SHORT_SESSION_HOURS),
        token_type="refresh",
        extra={"ver": version, "rem": remember},
    )


def decode_claims(token: str, token_type: str) -> dict:
    secret = JWT_SECRET_KEY if token_type == "access" else JWT_REFRESH_SECRET_KEY
    payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])

    if payload.get("type") != token_type:
        raise JWTError("Invalid token type")
    if not payload.get("sub"):
        raise JWTError("Token subject missing")
    return payload


def decode_token(token: str, token_type: str) -> int:
    return int(decode_claims(token, token_type)["sub"])


def token_is_current(claims: dict, user) -> bool:
    """False once the user's sessions were revoked (password reset, sign out everywhere)."""
    return int(claims.get("ver", 0) or 0) == int(getattr(user, "token_version", 0) or 0)
