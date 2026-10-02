from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

VALID_PASSWORD = "Ab1!Cd3#Ef"
VALID_EMAIL = "tester@example.com"


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    import db

    db.close_db()
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "portfolio.db")
    db.init_db()
    yield tmp_path
    db.close_db()


@pytest.fixture
def quote():
    from dividends import DividendInfo
    from stock_service import StockQuote

    return StockQuote(
        symbol="DTE.DE",
        name="Deutsche Telekom",
        currency="EUR",
        price=20.0,
        previous_close=19.5,
        change_pct=2.56,
        avg_monthly_growth_pct=1.0,
        lookback_months=12,
        as_of="2026-01-01T00:00:00+00:00",
        dividend=DividendInfo(
            pays_dividend=False,
            yield_pct=None,
            annual_rate=None,
            recent_payments=[],
            all_payments=[],
        ),
        requested_symbol=None,
        country="Germany",
    )


@pytest.fixture
def client(isolated_db, monkeypatch, quote):
    monkeypatch.setattr("scheduler.start_scheduler", lambda: None)
    monkeypatch.setattr("scheduler.stop_scheduler", lambda: None)
    monkeypatch.setattr("app_logging.setup_logging", lambda: None)

    def fake_quote(symbol, lookback_months=12, include_dividends=True):
        from dataclasses import replace

        requested = symbol.upper().strip()
        return replace(
            quote,
            symbol=requested if requested != "VUAA.EU" else "VUAA.L",
            requested_symbol="VUAA.EU" if requested == "VUAA.EU" else None,
        )

    monkeypatch.setattr("stock_service.fetch_quote", fake_quote)
    monkeypatch.setattr("main.fetch_quote", fake_quote)
    monkeypatch.setattr("portfolio.fetch_quote", fake_quote)
    monkeypatch.setattr(
        "stock_service.fetch_dividends",
        lambda symbol: {
            "symbol": symbol.upper().strip(),
            "requested_symbol": None,
            "currency": "EUR",
            "price": 20.0,
            "dividend": {"pays_dividend": False, "yield_pct": None, "annual_rate": None, "recent_payments": []},
        },
    )
    monkeypatch.setattr("main.fetch_dividends", lambda symbol: {
        "symbol": symbol.upper().strip(),
        "requested_symbol": None,
        "currency": "EUR",
        "price": 20.0,
        "dividend": {"pays_dividend": False, "yield_pct": None, "annual_rate": None, "recent_payments": []},
    })
    monkeypatch.setattr(
        "pricing_rules.convert_amount",
        lambda amount, fr, to, on_date=None: amount * (1.1 if fr != to else 1.0),
    )
    monkeypatch.setattr(
        "portfolio.convert_amount",
        lambda amount, fr, to, on_date=None: amount * (1.1 if fr != to else 1.0),
    )
    monkeypatch.setattr("suggestions.build_suggestions", lambda: {"as_of": "now", "items": []})
    monkeypatch.setattr("main.build_suggestions", lambda: {"as_of": "now", "items": []})
    monkeypatch.setattr(
        "dividend_ideas.build_dividend_ideas",
        lambda user_id=None: {"as_of": "now", "items": [], "user_id": user_id},
    )
    monkeypatch.setattr(
        "main.build_dividend_ideas",
        lambda user_id=None: {"as_of": "now", "items": [], "user_id": user_id},
    )

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_client(client):
    response = client.post(
        "/api/auth/register",
        json={"email": VALID_EMAIL, "password": VALID_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return client
