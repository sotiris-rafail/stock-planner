"""User registration, login, and session tokens."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from auth_crypto import (
    _secret_key,
    emails_match,
    encrypt_email,
    hash_password,
    normalize_email,
    validate_email,
    validate_password,
    verify_password,
)
from db import create_user, get_user_by_encrypted_email, get_user_by_id

JWT_ALGORITHM = "HS256"
SESSION_COOKIE = "sbp_session"
SESSION_DAYS = 30


def create_session_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=SESSION_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _secret_key(), algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> int:
    payload = jwt.decode(token, _secret_key(), algorithms=[JWT_ALGORITHM])
    return int(payload["sub"])


def register_user(*, email: str, password: str) -> int:
    normalized = validate_email(email)
    validate_password(password)
    encrypted = encrypt_email(normalized)
    if get_user_by_encrypted_email(encrypted):
        raise ValueError("An account with this email already exists")
    password_hash = hash_password(password)
    return create_user(email_encrypted=encrypted, password_hash=password_hash)


def authenticate_user(*, email: str, password: str) -> int:
    normalized = validate_email(email)
    encrypted = encrypt_email(normalized)
    user = get_user_by_encrypted_email(encrypted)
    if not user or not emails_match(normalized, user["email_encrypted"]):
        raise ValueError("Invalid email or password")
    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid email or password")
    return int(user["id"])


def get_authenticated_user_id(user_id: int) -> dict:
    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("User not found")
    return user
