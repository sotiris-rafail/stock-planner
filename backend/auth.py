"""User registration, login, and session tokens."""

from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from hashlib import sha256

import jwt

from auth_crypto import (
    _secret_key,
    decrypt_email,
    emails_match,
    encrypt_email,
    hash_password,
    normalize_email,
    validate_email,
    validate_password,
    verify_password,
)
from db import (
    create_user,
    get_user_by_encrypted_email,
    get_user_by_id,
    list_users,
    update_user_password,
)
from mailer import send_reset_email

JWT_ALGORITHM = "HS256"
SESSION_COOKIE = "sbp_session"
SESSION_DAYS = 30
RESET_FLAG = "reset=true"


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


def registration_day(created_at: str) -> str:
    parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).date().isoformat()


def reset_hash_for(*, email: str, created_at: str) -> str:
    normalized = normalize_email(email)
    material = f"{normalized}|{registration_day(created_at)}|{RESET_FLAG}".encode("utf-8")
    return hmac.new(_secret_key(), material, sha256).hexdigest()


def request_password_reset(*, email: str, base_url: str) -> None:
    normalized = validate_email(email)
    user = get_user_by_encrypted_email(encrypt_email(normalized))
    if not user:
        return
    token = reset_hash_for(email=normalized, created_at=user["created_at"])
    reset_url = f"{base_url.rstrip('/')}/reset-password?hash={token}"
    send_reset_email(to_email=normalized, reset_url=reset_url, reset_hash=token)


def user_id_for_reset_hash(reset_hash: str) -> int | None:
    if not reset_hash:
        return None
    for user in list_users():
        try:
            email = decrypt_email(user["email_encrypted"])
        except Exception:
            continue
        expected = reset_hash_for(email=email, created_at=user["created_at"])
        if hmac.compare_digest(expected, reset_hash):
            return int(user["id"])
    return None


def reset_password_with_hash(*, reset_hash: str, password: str) -> None:
    validate_password(password)
    user_id = user_id_for_reset_hash(reset_hash)
    if user_id is None:
        raise ValueError("Invalid or expired reset link")
    update_user_password(user_id=user_id, password_hash=hash_password(password))
