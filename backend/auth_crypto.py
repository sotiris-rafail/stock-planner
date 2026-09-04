"""Email encryption and password rules for multi-user auth."""

from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
from functools import lru_cache

import bcrypt
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not EMAIL_RE.match(normalized):
        raise ValueError("Enter a valid email address")
    return normalized


def validate_password(password: str) -> None:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")

    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include an uppercase letter")

    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include a lowercase letter")

    digit_positions = [index for index, char in enumerate(password) if char.isdigit()]
    if len(digit_positions) < 2:
        raise ValueError("Password must include at least 2 numbers")

    for index in range(len(digit_positions) - 1):
        if digit_positions[index + 1] - digit_positions[index] == 1:
            raise ValueError("Password numbers cannot be placed next to each other")

    symbol_count = sum(1 for char in password if not char.isalnum())
    if symbol_count < 2:
        raise ValueError("Password must include at least 2 symbols")


@lru_cache(maxsize=1)
def _secret_key() -> bytes:
    secret = os.environ.get("SBP_SECRET_KEY", "dev-change-me-before-production")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_email(email: str) -> str:
    """Deterministic AES-CBC encryption for login matching."""
    normalized = normalize_email(email)
    key = _secret_key()
    iv = hashlib.sha256(normalized.encode("utf-8")).digest()[:16]
    padder = padding.PKCS7(128).padder()
    padded = padder.update(normalized.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return base64.urlsafe_b64encode(iv + ciphertext).decode("ascii")


def emails_match(provided_email: str, stored_encrypted_email: str) -> bool:
    try:
        return secrets.compare_digest(encrypt_email(provided_email), stored_encrypted_email)
    except Exception:
        return False


def hash_password(password: str) -> str:
    validate_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False
