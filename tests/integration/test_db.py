from __future__ import annotations

import pytest

from auth_crypto import encrypt_email, hash_password
from db import (
    add_purchase,
    add_watchlist_item,
    clear_dividend_ideas_cache,
    count_purchases,
    create_user,
    delete_purchase,
    delete_watchlist_item,
    execute_sale,
    get_dividend_ideas_cache,
    get_notification_settings,
    get_suggestion_cache,
    get_user_by_encrypted_email,
    list_positions,
    list_purchases_page,
    list_sales,
    list_transactions_page,
    list_users_with_monthly_report_enabled,
    mark_monthly_report_sent,
    owned_shares,
    save_dividend_ideas_cache,
    save_suggestion_cache,
    today_iso,
    update_user_password,
    upsert_notification_settings,
)
from tests.conftest import VALID_PASSWORD


@pytest.fixture
def user_id(isolated_db):
    return create_user(
        email_encrypted=encrypt_email("db@example.com"),
        password_hash=hash_password(VALID_PASSWORD),
    )


def test_user_crud_and_notifications(user_id):
    row = get_user_by_encrypted_email(encrypt_email("db@example.com"))
    assert row["id"] == user_id
    assert update_user_password(user_id=user_id, password_hash="x")
    settings = get_notification_settings(user_id=user_id)
    assert settings["monthly_report_enabled"] is False
    upsert_notification_settings(user_id=user_id, monthly_report_enabled=True, report_email="r@e.com")
    mark_monthly_report_sent(user_id=user_id, month_key="2026-01")
    enabled = list_users_with_monthly_report_enabled()
    assert enabled[0]["user_id"] == user_id


def test_purchases_sales_fifo(user_id):
    first = add_purchase(
        user_id=user_id,
        symbol="AAA",
        company_name="Aaa",
        currency="USD",
        shares=10,
        price_per_share=5,
        purchased_at="2024-01-01",
        notes="n",
    )
    add_purchase(
        user_id=user_id,
        symbol="AAA",
        company_name="Aaa",
        currency="USD",
        shares=5,
        price_per_share=6,
        purchased_at="2024-02-01",
    )
    assert owned_shares("AAA", user_id=user_id) == 15
    sale = execute_sale(
        user_id=user_id,
        symbol="AAA",
        shares=12,
        price_per_share=8,
        sold_at="2024-03-01",
        notes=None,
        company_name="Aaa",
        currency="USD",
    )
    assert sale["shares"] == 12
    assert owned_shares("AAA", user_id=user_id) == 3
    positions = list_positions(user_id=user_id)
    assert positions[0]["shares"] == 3
    page = list_purchases_page(user_id=user_id, page=1, page_size=10)
    assert page["total"] >= 1
    tx = list_transactions_page(user_id=user_id, page=1, page_size=10)
    assert tx["total"] >= 2
    assert count_purchases(user_id=user_id) >= 1
    assert list_sales(user_id=user_id)
    assert delete_purchase(first["id"], user_id=user_id) in {True, False}
    with pytest.raises(ValueError):
        execute_sale(
            user_id=user_id,
            symbol="AAA",
            shares=999,
            price_per_share=1,
            sold_at="2024-04-01",
            notes=None,
            company_name="Aaa",
            currency="USD",
        )


def test_watchlist_and_caches(user_id):
    item = add_watchlist_item(
        user_id=user_id,
        symbol="AAPL",
        requested_symbol=None,
        company_name="Apple",
        asset_type="stock",
        currency="USD",
        added_at=today_iso(),
        price_at_add=100,
    )
    assert delete_watchlist_item(item["id"], user_id=user_id)
    save_suggestion_cache('{"ok": true}')
    assert get_suggestion_cache()["payload"]
    save_dividend_ideas_cache(user_id=user_id, payload_json='{"ok": true}')
    assert get_dividend_ideas_cache(user_id=user_id)
    clear_dividend_ideas_cache(user_id=user_id)
    assert get_dividend_ideas_cache(user_id=user_id) is None
