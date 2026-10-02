from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest

from dividends import (
    DividendPayment,
    applies_eu_dividend_withholding,
    applies_us_dividend_withholding,
    dividend_withholding_pct,
    dividends_earned_for_lots,
    fetch_dividend_info,
    fetch_stock_splits,
)
from monthly_report import build_monthly_report
from properties import resolve_value
from settings import DEFAULT_CONFIG_FILES, prepare_config_files, silent_stock_refresh_minutes
from yf_limit import yfinance_slot


def test_withholding_and_earned_lots():
    assert applies_us_dividend_withholding("AAPL", country="United States")
    assert applies_eu_dividend_withholding("DTE.DE", country="Germany")
    assert dividend_withholding_pct("X", country="Japan") == 0.0
    net, gross, tax, events = dividends_earned_for_lots(
        [{"purchased_at": "2020-01-01", "shares": 10}],
        [DividendPayment(date="2020-06-01", amount=1.0)],
        withholding_pct=10,
    )
    assert gross == 10.0 and tax == 1.0 and net == 9.0 and events
    empty = dividends_earned_for_lots([], [])
    assert empty[:3] == (0.0, 0.0, 0.0)


def test_fetch_dividend_info_and_splits():
    idx = pd.to_datetime(["2024-01-01", "2024-06-01"])
    ticker = SimpleNamespace(
        info={"trailingAnnualDividendRate": 2.0, "dividendYield": 0.03},
        dividends=pd.Series([0.5, 0.6], index=idx),
        splits=pd.Series([2.0], index=pd.to_datetime(["2023-01-01"])),
    )
    info = fetch_dividend_info(ticker, price=20)
    assert info.pays_dividend
    assert info.yield_pct == pytest.approx(3.0)
    splits = fetch_stock_splits(ticker)
    assert splits[0][1] == 2.0
    broken = SimpleNamespace(splits=None)
    assert fetch_stock_splits(broken) == []


def test_portfolio_summary_and_progress(monkeypatch):
    from dividends import DividendInfo
    from portfolio import build_progress, build_progress_summary
    from stock_service import StockQuote

    purchases = [
        {
            "id": 1,
            "symbol": "AAA",
            "company_name": "Aaa",
            "currency": "USD",
            "shares": 2,
            "cost": 20,
            "purchased_at": "2024-01-01",
            "price_per_share": 10,
        }
    ]
    sales = [
        {
            "symbol": "AAA",
            "company_name": "Aaa",
            "currency": "USD",
            "realized_gain": 5,
            "proceeds": 15,
            "cost_basis": 10,
            "shares": 1,
        }
    ]
    summary = build_progress_summary(purchases, sales)
    assert summary["summary_only"] is True
    assert summary["totals"]["purchase_count"] == 1

    monkeypatch.setattr(
        "portfolio.fetch_quote",
        lambda symbol, **kwargs: StockQuote(
            symbol="AAA",
            name="Aaa",
            currency="USD",
            price=12,
            previous_close=11,
            change_pct=9.0,
            avg_monthly_growth_pct=1,
            lookback_months=12,
            as_of="now",
            dividend=DividendInfo(False, None, None, [], []),
        ),
    )
    monkeypatch.setattr("portfolio.resolve_tradable_symbol", lambda s: (s, None, {}, 12, 11))
    monkeypatch.setattr("portfolio.fetch_stock_splits", lambda t: [])
    full = build_progress(purchases, sales)
    assert full["holdings"][0]["current_price"] == 12
    assert full["holdings"][0]["realized_gain"] == 5.0


def test_monthly_report_empty_and_filled():
    subject, text, html = build_monthly_report(progress={"by_currency": []}, period_label="Jan 2026")
    assert "Jan 2026" in subject
    assert "no holdings" in text.lower()
    subject2, text2, html2 = build_monthly_report(
        progress={
            "by_currency": [
                {
                    "currency": "EUR",
                    "total_invested": 100,
                    "total_market_value": 110,
                    "total_unrealized_gain": 10,
                    "total_dividends_earned": 1,
                    "holdings": [
                        {
                            "symbol": "DTE.DE",
                            "company_name": "DT",
                            "shares": 2,
                            "total_invested": 100,
                            "market_value": 110,
                            "unrealized_gain": 10,
                            "unrealized_gain_pct": 10,
                            "realized_gain": 0,
                        }
                    ],
                }
            ]
        },
        period_label="Feb 2026",
    )
    assert "DTE.DE" in text2 and "EUR" in html2


def test_properties_resolve_and_settings(tmp_path, monkeypatch):
    mapping = {"APP_SECRET_KEY": "abc", "SMTP_PORT": "25"}
    resolved = resolve_value(
        {"secret_key": "${APP_SECRET_KEY}", "port": "SMTP_PORT", "keep": "${MISSING}", "n": 1},
        mapping,
    )
    assert resolved["secret_key"] == "abc"
    assert resolved["port"] == "25"
    assert resolved["keep"] == "${MISSING}"
    monkeypatch.setattr("settings.PROJECT_ROOT", tmp_path)
    created = prepare_config_files()
    assert {p.name for p in created} == set(DEFAULT_CONFIG_FILES)
    assert prepare_config_files() == []
    monkeypatch.setattr("settings._application_data", lambda: {"cron_job": "0"})
    assert silent_stock_refresh_minutes() == 15
    monkeypatch.setattr("settings._application_data", lambda: {"cron_job": "20"})
    assert silent_stock_refresh_minutes() == 20


def test_yfinance_slot():
    with yfinance_slot():
        pass
