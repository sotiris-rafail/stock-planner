from __future__ import annotations

import json
from datetime import datetime, timezone

from dividend_ideas import (
    _match_owned,
    _normalize_currency,
    _owned_lookup,
    _parse_iso,
    _safe_float,
    _symbol_keys,
    build_dividend_ideas,
)
from properties import load_property_map, resolve_value
from suggestions import _normalize_currency as sug_norm
from suggestions import _parse_iso as sug_parse
from suggestions import _safe_float as sug_float
from suggestions import _to_stooq_symbol, build_suggestions


def test_dividend_ideas_helpers(isolated_db):
    assert _safe_float("1.5") == 1.5
    assert _safe_float("x") is None
    assert _parse_iso(None) is None
    assert _parse_iso("bad") is None
    assert _parse_iso("2026-01-01T00:00:00+00:00")
    gbp, price, divs = _normalize_currency("GBp", 1500.0, {"2024": 100.0})
    assert gbp == "GBP" and price == 15.0 and divs["2024"] == 1.0
    keys = _symbol_keys("DTE.DE")
    assert "DTE.DE" in keys and "DTE" in keys
    assert _owned_lookup(None) == {}
    assert _match_owned("DTE.DE", {"DTE": {"owned_shares": 1}})["owned_shares"] == 1


def test_build_dividend_ideas_mocked(monkeypatch, isolated_db):
    monkeypatch.setattr(
        "dividend_ideas._fetch_all_rows",
        lambda **k: [
            {
                "symbol": "JNJ",
                "name": "JNJ",
                "region": "US",
                "owned": False,
                "dividends_by_year": {"2024": 1.0},
            }
        ],
    )
    payload = build_dividend_ideas(user_id=None)
    assert payload["items"][0]["symbol"] == "JNJ"
    from auth import register_user
    from tests.conftest import VALID_PASSWORD

    user_id = register_user(email="di@example.com", password=VALID_PASSWORD)
    cached = build_dividend_ideas(user_id=user_id)
    again = build_dividend_ideas(user_id=user_id)
    assert cached["items"][0]["symbol"] == again["items"][0]["symbol"]


def test_suggestions_helpers_and_cache(isolated_db, monkeypatch):
    assert sug_float(float("nan")) is None
    assert sug_parse("nope") is None
    assert sug_norm("GBp", 200) == ("GBP", 2.0)
    assert _to_stooq_symbol("") is None
    assert _to_stooq_symbol("SAP.DE") == "sap.de"
    assert _to_stooq_symbol("AAPL") == "aapl.us"
    assert _to_stooq_symbol("FOO.ZZ") is None
    now = datetime.now(timezone.utc).isoformat()
    cached = {
        "symbols_updated_at": now,
        "quotes_updated_at": now,
        "tabs": {},
    }
    monkeypatch.setattr(
        "suggestions.get_suggestion_cache",
        lambda: {"payload": json.dumps(cached)},
    )
def test_build_suggestions_rebuild(isolated_db, monkeypatch):
    monkeypatch.setattr("suggestions.get_suggestion_cache", lambda: None)
    monkeypatch.setattr(
        "suggestions._select_symbol_universe",
        lambda: [
            {
                "category": "stocks",
                "symbol": "AAPL",
                "name": "Apple",
                "region": "US",
                "list_source": "test",
                "theme": "tech",
                "selection_score": 1,
                "selection_reason": "r",
            }
        ],
    )
    monkeypatch.setattr(
        "suggestions._fetch_one",
        lambda item: {
            **item,
            "price": 10,
            "currency": "USD",
            "change_6m_pct": 5,
            "dividend_yield_pct": 1,
            "expense_ratio_pct": None,
            "price_source": "yahoo",
            "error": None,
        },
    )
    payload = build_suggestions(force=True)
    assert payload["tabs"]["stocks"]["items"]


def test_properties_file_and_http(tmp_path, monkeypatch):
    import properties as props

    values = tmp_path / "values.yml"
    values.write_text("APP_SECRET_KEY: hello\nNESTED:\n  X: 1\n", encoding="utf-8")
    props_file = tmp_path / "properties.yml"
    props_file.write_text("provider:\n  type: file\n  file: values.yml\n", encoding="utf-8")
    monkeypatch.setattr(props, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(props, "PROPERTIES_PATH", props_file)
    props._property_cache = None
    props._property_cache_stamp = None
    mapping = load_property_map()
    assert mapping["APP_SECRET_KEY"] == "hello"
    assert resolve_value("${APP_SECRET_KEY}") == "hello"

    monkeypatch.setattr(
        props,
        "_provider_config",
        lambda: {"type": "http", "url": "https://example.test/p", "timeout": 1, "headers": {"A": "B"}},
    )

    class Resp:
        headers = {"Content-Type": "application/json"}

        def read(self):
            return b'{"FOO": "bar"}'

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr("properties.urlopen", lambda *a, **k: Resp())
    props._property_cache = None
    http_map = load_property_map()
    assert http_map["FOO"] == "bar"
