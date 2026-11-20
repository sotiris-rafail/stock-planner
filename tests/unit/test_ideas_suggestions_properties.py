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

import httpx


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
        lambda: {
            "type": "http",
            "url": "https://example.test/p",
            "timeout": 1,
            "client_id": "u",
            "client_secret": "p",
        },
    )

    def fake_fetch(url, *, timeout, headers, token_url="", client_id="", client_secret="", username="", password=""):
        assert url == "https://example.test/p"
        assert client_id == "u"
        return {"FOO": "bar"}

    monkeypatch.setattr(props, "_fetch_http_map", fake_fetch)
    props._property_cache = None
    props._property_cache_stamp = None
    props._property_cache_fetched_at = 0.0
    http_map = load_property_map()
    assert http_map["FOO"] == "bar"
    assert http_map["APP_SECRET_KEY"] == "hello"
    assert http_map["NESTED_X"] == "1"

    def fake_fetch_remote_only(**kwargs):
        return {"FOO": "remote", "APP_SECRET_KEY": "remote-secret"}

    monkeypatch.setattr(props, "_fetch_http_map", lambda *a, **k: fake_fetch_remote_only())
    props.clear_property_cache()
    merged = load_property_map()
    assert merged["FOO"] == "remote"
    assert merged["APP_SECRET_KEY"] == "remote-secret"
    assert merged["NESTED_X"] == "1"


def test_properties_http_merge_local_disabled(tmp_path, monkeypatch):
    import properties as props

    values = tmp_path / "values.yml"
    values.write_text("ONLY_LOCAL: 1\n", encoding="utf-8")
    props_file = tmp_path / "properties.yml"
    props_file.write_text(
        "provider:\n  type: http\n  url: https://example.test/p\n  merge_local: false\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(props, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(props, "PROPERTIES_PATH", props_file)
    monkeypatch.setattr(props, "_fetch_http_map", lambda *a, **k: {"FOO": "bar"})
    props.clear_property_cache()
    mapping = load_property_map()
    assert mapping == {"FOO": "bar"}


def test_properties_http_cache_respects_ttl(monkeypatch):
    import properties as props

    fetch_count = 0
    clock = {"now": 1000.0}

    def fake_fetch(**kwargs):
        nonlocal fetch_count
        fetch_count += 1
        return {"FOO": str(fetch_count)}

    monkeypatch.setattr(props, "_fetch_http_map", lambda *a, **k: fake_fetch())
    monkeypatch.setattr(
        props,
        "_provider_config",
        lambda: {
            "type": "http",
            "url": "https://example.test/p",
            "refresh_seconds": 300,
        },
    )
    monkeypatch.setattr(props.time, "monotonic", lambda: clock["now"])

    props.clear_property_cache()
    assert load_property_map()["FOO"] == "1"
    assert fetch_count == 1

    clock["now"] += 60
    assert load_property_map()["FOO"] == "1"
    assert fetch_count == 1

    clock["now"] += 300
    assert load_property_map()["FOO"] == "2"
    assert fetch_count == 2


def test_properties_http_token_then_fetch():
    import properties as props

    calls: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, str(request.url), body))
        if request.url.path == "/auth/token":
            assert body == {
                "clientId": "cfg",
                "clientSecret": "pw",
            }
            return httpx.Response(200, json={"access_token": "secret-token"})
        assert request.headers.get("Authorization") == "Bearer secret-token"
        return httpx.Response(200, json={"APP_SECRET_KEY": "from-web"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.Client

    class PatchedClient(original_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    httpx.Client = PatchedClient  # type: ignore[misc, assignment]
    try:
        mapping = props._fetch_http_map(
            "https://example.test/config/rich",
            timeout=5,
            headers={},
            token_url="https://example.test/auth/token",
            client_id="cfg",
            client_secret="pw",
        )
    finally:
        httpx.Client = original_client

    assert calls[0][0] == "POST"
    assert calls[1][0] == "GET"
    assert mapping["APP_SECRET_KEY"] == "from-web"


def test_properties_http_basic_auth():
    import properties as props

    seen_auth: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_auth.append(request.headers.get("Authorization"))
        return httpx.Response(200, json={"FOO": "bar"})

    transport = httpx.MockTransport(handler)
    original_client = httpx.Client

    class PatchedClient(original_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    httpx.Client = PatchedClient  # type: ignore[misc, assignment]
    try:
        mapping = props._fetch_http_map(
            "https://example.test/properties",
            timeout=5,
            headers={},
            client_id="cfg",
            client_secret="pw",
        )
    finally:
        httpx.Client = original_client

    assert seen_auth == ["Basic Y2ZnOnB3"]
    assert mapping["FOO"] == "bar"
