"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request

from auth import SESSION_COOKIE, decode_session_token


def get_optional_user_id(request: Request) -> int | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        return decode_session_token(token)
    except Exception:
        return None


def require_user_id(request: Request) -> int:
    user_id = get_optional_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
