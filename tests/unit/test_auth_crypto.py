from __future__ import annotations

import pytest

from auth_crypto import (
    decrypt_email,
    emails_match,
    encrypt_email,
    hash_password,
    normalize_email,
    validate_email,
    validate_password,
    verify_password,
)


def test_email_normalize_and_encrypt_roundtrip():
    assert normalize_email("  A@B.COM ") == "a@b.com"
    assert validate_email("User@Example.com") == "user@example.com"
    token = encrypt_email("User@Example.com")
    assert decrypt_email(token) == "user@example.com"
    assert emails_match("user@example.com", token)
    assert not emails_match("other@example.com", token)
    assert not emails_match("x", "not-base64")


def test_invalid_email():
    with pytest.raises(ValueError):
        validate_email("not-an-email")


@pytest.mark.parametrize(
    "password,fragment",
    [
        ("short", "10 characters"),
        ("abcdefghij", "uppercase"),
        ("ABCDEFGHIJ", "lowercase"),
        ("Abcdefghij!", "2 numbers"),
        ("Ab1!cdefgh", "2 numbers"),
        ("Ab12!cdefg#", "next to each other"),
        ("Ab1!Cd3efgh", "2 symbols"),
    ],
)
def test_password_rules(password, fragment):
    with pytest.raises(ValueError, match=fragment):
        validate_password(password)


def test_hash_and_verify():
    password = "Ab1!Cd3#Ef"
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password("wrong-password", hashed)
    assert not verify_password("x", "not-a-hash")
