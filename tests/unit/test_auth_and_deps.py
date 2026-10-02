from __future__ import annotations

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from auth import (
    authenticate_user,
    create_session_token,
    decode_session_token,
    register_user,
    registration_day,
    request_password_reset,
    reset_hash_for,
    reset_password_with_hash,
    user_id_for_reset_hash,
)
from deps import get_optional_user_id, require_user_id
from tests.conftest import VALID_PASSWORD


def test_register_login_and_session(isolated_db):
    user_id = register_user(email="a@b.com", password=VALID_PASSWORD)
    token = create_session_token(user_id)
    assert decode_session_token(token) == user_id
    assert authenticate_user(email="a@b.com", password=VALID_PASSWORD) == user_id
    with pytest.raises(ValueError, match="already exists"):
        register_user(email="a@b.com", password=VALID_PASSWORD)
    with pytest.raises(ValueError, match="Invalid"):
        authenticate_user(email="a@b.com", password="Ab1!Cd3#ZZ")


def test_password_reset_flow(isolated_db, monkeypatch):
    sent = {}

    def fake_send(*, to_email, reset_url, reset_hash):
        sent["email"] = to_email
        sent["url"] = reset_url
        sent["hash"] = reset_hash

    monkeypatch.setattr("auth.send_reset_email", fake_send)
    user_id = register_user(email="reset@example.com", password=VALID_PASSWORD)
    request_password_reset(email="unknown@example.com", base_url="http://localhost")
    assert sent == {}
    request_password_reset(email="reset@example.com", base_url="http://localhost/")
    assert sent["email"] == "reset@example.com"
    assert user_id_for_reset_hash(sent["hash"]) == user_id
    reset_password_with_hash(reset_hash=sent["hash"], password="Xy1!Zq3#Ab")
    assert authenticate_user(email="reset@example.com", password="Xy1!Zq3#Ab") == user_id
    with pytest.raises(ValueError):
        reset_password_with_hash(reset_hash="deadbeef" * 4, password=VALID_PASSWORD)


def test_registration_day_naive_and_aware():
    assert registration_day("2026-01-02T03:04:05") == "2026-01-02"
    assert registration_day("2026-01-02T03:04:05Z") == "2026-01-02"


def _request(cookie=None):
    headers = []
    if cookie:
        headers.append((b"cookie", f"sbp_session={cookie}".encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "query_string": b"",
    }
    return Request(scope)


def test_deps(isolated_db):
    assert get_optional_user_id(_request()) is None
    user_id = register_user(email="dep@example.com", password=VALID_PASSWORD)
    token = create_session_token(user_id)
    assert get_optional_user_id(_request(token)) == user_id
    assert get_optional_user_id(_request("bad")) is None
    with pytest.raises(HTTPException) as exc:
        require_user_id(_request())
    assert exc.value.status_code == 401
    assert require_user_id(_request(token)) == user_id
