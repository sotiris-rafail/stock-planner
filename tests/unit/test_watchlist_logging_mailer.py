from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pandas as pd

from app_logging import archive_completed_months, monthly_archive_name, setup_logging
from mailer import send_monthly_report_email, send_reset_email
from watchlist import asset_type_label, infer_asset_type, create_watchlist_entry, remove_watchlist_entry, build_watchlist


def test_watchlist_helpers_and_create(isolated_db, monkeypatch):
    from types import SimpleNamespace

    from auth import register_user
    from tests.conftest import VALID_PASSWORD
    from watchlist import create_watchlist_entry, remove_watchlist_entry, build_watchlist

    user_id = register_user(email="wl@example.com", password=VALID_PASSWORD)
    assert infer_asset_type({"quoteType": "ETF"}) == "etf"
    assert infer_asset_type({}) == "stock"
    assert asset_type_label("mutual_fund") == "Mutual fund"
    monkeypatch.setattr(
        "watchlist.resolve_tradable_symbol",
        lambda symbol: (
            "AAPL",
            SimpleNamespace(history=lambda **k: None),
            {"shortName": "Apple", "currency": "USD", "quoteType": "EQUITY", "country": "United States"},
            100.0,
            99.0,
        ),
    )
    monkeypatch.setattr(
        "watchlist._period_changes",
        lambda *a, **k: {"change_1m_pct": 1, "change_6m_pct": 2, "change_1y_pct": 3},
    )
    row = create_watchlist_entry(user_id=user_id, symbol="aapl")
    listed = build_watchlist(user_id=user_id)
    assert listed["count"] == 1
    assert listed["items"][0]["market"] == "United States"
    assert remove_watchlist_entry(row["id"], user_id=user_id)


def test_infer_market_and_sort():
    from watchlist import infer_market, sort_watchlist_items

    us = infer_market(symbol="AAPL", info={"country": "United States", "exchange": "NMS"})
    assert us["market"] == "United States"
    htht = infer_market(
        symbol="HTHT",
        info={"country": "China", "exchange": "NMS", "fullExchangeName": "NasdaqGS"},
    )
    assert htht["market"] == "United States"
    de = infer_market(symbol="DTE.DE", info={"country": "Germany"})
    assert de["market"] == "Germany"
    bare = infer_market(symbol="MSFT", info={})
    assert bare["market"] == "United States"
    ordered = sort_watchlist_items(
        [
            {"market": "United States", "company_name": "Zebra", "symbol": "Z"},
            {"market": "Germany", "company_name": "Deutsche Telekom", "symbol": "DTE.DE"},
            {"market": "Germany", "company_name": "Adidas", "symbol": "ADS.DE"},
        ]
    )
    assert [row["symbol"] for row in ordered] == ["ADS.DE", "DTE.DE", "Z"]


def test_logging_archive(tmp_path, monkeypatch):
    monkeypatch.setattr("app_logging.LOG_DIR", tmp_path)
    old = tmp_path / "app.log.2020-01-15"
    old.write_text("old", encoding="utf-8")
    archive_completed_months(tmp_path)
    zip_name = monthly_archive_name(2020, 1)
    assert (tmp_path / zip_name).exists()
    assert not old.exists()
    logger = setup_logging()
    assert logger.name == "sbp"


def test_mailer_skips_without_host(tmp_path, monkeypatch):
    monkeypatch.setattr("mailer.DATA_DIR", tmp_path)
    monkeypatch.setattr("mailer.OUTBOX_DIR", tmp_path / "outbox")
    monkeypatch.setattr("mailer.smtp_config", lambda: {"host": "", "from": "a@b.c", "port": 587, "user": "", "password": ""})
    send_reset_email(to_email="x@y.z", reset_url="http://r", reset_hash="abc")
    send_monthly_report_email(to_email="x@y.z", subject="s", text_body="t", html_body="<p>h</p>")
    assert list((tmp_path / "outbox").glob("*.txt"))


def test_mailer_smtp_starttls(tmp_path, monkeypatch):
    monkeypatch.setattr("mailer.DATA_DIR", tmp_path)
    monkeypatch.setattr("mailer.OUTBOX_DIR", tmp_path / "outbox")
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    monkeypatch.setattr("mailer.smtplib.SMTP", lambda *a, **k: smtp)
    monkeypatch.setattr(
        "mailer.smtp_config",
        lambda: {"host": "smtp.example.com", "from": "a@b.c", "port": 587, "user": "u", "password": "p"},
    )
    send_reset_email(to_email="x@y.z", reset_url="http://r", reset_hash="h")
    smtp.starttls.assert_called()
    smtp.login.assert_called_once_with("u", "p")
    smtp.send_message.assert_called()
