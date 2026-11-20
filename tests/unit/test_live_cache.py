from __future__ import annotations

import pytest

from live_cache import (
    RateLimited,
    clear_memory_cache,
    quote_status,
    refresh_cached_payloads,
    run_silent_quote_refresh,
    serve,
    warm_live_cache,
)


@pytest.fixture(autouse=True)
def _reset_memory_cache():
    clear_memory_cache()
    yield
    clear_memory_cache()


def test_serve_returns_cached_payload():
    calls = {"n": 0}

    def builder():
        calls["n"] += 1
        return {"value": calls["n"]}

    first = serve("demo", 1, builder)
    second = serve("demo", 1, builder)
    assert first == {"value": 1}
    assert second == {"value": 1}
    assert calls["n"] == 1
    third = serve("demo", 1, builder, force=True)
    assert third == {"value": 2}


def test_manual_refresh_rate_limit(monkeypatch):
    monkeypatch.setattr("live_cache.silent_stock_refresh_minutes", lambda: 15)
    monkeypatch.setattr("live_cache.MANUAL_REFRESH_LIMIT", 2)
    calls = {"n": 0}

    def builder():
        calls["n"] += 1
        return {"n": calls["n"]}

    serve("demo", 2, builder, force=True, manual=True)
    serve("demo", 2, builder, force=True, manual=True)
    with pytest.raises(RateLimited):
        serve("demo", 2, builder, force=True, manual=True)


def test_silent_refresh_rebuilds_existing_entries(monkeypatch):
    calls = {"n": 0}

    def builder():
        calls["n"] += 1
        return {"n": calls["n"]}

    serve("suggestions", 0, builder)
    monkeypatch.setattr("live_cache.get_suggestions", lambda **k: builder())
    refresh_cached_payloads()
    assert calls["n"] >= 2


def test_run_silent_quote_refresh_respects_interval(monkeypatch):
    ran = {"n": 0}
    monkeypatch.setattr("live_cache.silent_stock_refresh_minutes", lambda: 15)
    monkeypatch.setattr("live_cache.refresh_cached_payloads", lambda: ran.__setitem__("n", ran["n"] + 1))
    import live_cache as mod

    mod._last_silent_refresh = None
    run_silent_quote_refresh()
    run_silent_quote_refresh()
    assert ran["n"] == 1
    run_silent_quote_refresh(force=True)
    assert ran["n"] == 2


def test_warm_live_cache_fills_memory_without_ui(monkeypatch):
    calls = []
    monkeypatch.setattr("live_cache.get_suggestions", lambda **k: calls.append("suggestions") or {"ok": True})
    monkeypatch.setattr(
        "live_cache.get_dividend_ideas",
        lambda user_id=None, **k: calls.append(("ideas", user_id)) or {"ok": True},
    )
    monkeypatch.setattr("live_cache.get_progress", lambda user_id, **k: calls.append(("progress", user_id)) or {"ok": True})
    monkeypatch.setattr("live_cache.get_watchlist", lambda user_id, **k: calls.append(("watchlist", user_id)) or {"ok": True})
    monkeypatch.setattr("db.list_users", lambda: [{"id": 7}])
    warm_live_cache()
    assert "suggestions" in calls
    assert ("ideas", None) in calls
    assert ("progress", 7) in calls
    assert ("watchlist", 7) in calls
    assert ("ideas", 7) in calls


def test_quote_status_tracks_refresh_health(monkeypatch):
    import live_cache as mod

    monkeypatch.setattr("live_cache.silent_stock_refresh_minutes", lambda: 15)
    monkeypatch.setattr("live_cache.get_suggestions", lambda **k: {"ok": True})
    serve("suggestions", 0, lambda: {"ok": True})
    refresh_cached_payloads()
    status = quote_status()
    assert status["quotes_ok"] is True
    assert status["quotes_delayed"] is False
    assert status["quote_refresh_minutes"] == 15
    monkeypatch.setattr(
        "live_cache.get_suggestions",
        lambda **k: (_ for _ in ()).throw(RuntimeError("down")),
    )
    refresh_cached_payloads()
    assert quote_status()["quotes_ok"] is False
    mod._last_silent_refresh = None
    assert quote_status()["last_refresh_at"] is None


def test_suggestions_api_uses_backend_cache(client):
    first = client.get("/api/suggestions")
    second = client.get("/api/suggestions")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
