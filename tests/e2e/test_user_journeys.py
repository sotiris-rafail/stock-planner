from __future__ import annotations

import pytest

from tests.conftest import VALID_EMAIL, VALID_PASSWORD

PAGES = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/plan",
    "/ideas",
    "/suggestions",
    "/static/styles.css",
    "/static/auth.js",
]


@pytest.mark.e2e
def test_public_pages_and_root_redirect(client):
    root = client.get("/", follow_redirects=False)
    assert root.status_code == 302
    assert "/login" in root.headers["location"]
    legacy = client.get("/index", follow_redirects=False)
    assert legacy.status_code == 302
    for path in PAGES:
        response = client.get(path)
        assert response.status_code == 200, path


@pytest.mark.e2e
def test_protected_pages_redirect_then_allow(client):
    for path in ("/progress", "/track", "/notifications"):
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 302
        assert "/login" in response.headers["location"]
    client.post("/api/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    for path in ("/progress", "/track", "/notifications"):
        assert client.get(path).status_code == 200


@pytest.mark.e2e
def test_full_investing_journey(auth_client, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        "watchlist.resolve_tradable_symbol",
        lambda symbol: (
            symbol.upper(),
            SimpleNamespace(history=lambda **k: None, info={}),
            {"shortName": "Deutsche Telekom", "currency": "EUR", "quoteType": "EQUITY"},
            20.0,
            19.5,
        ),
    )
    monkeypatch.setattr(
        "watchlist._period_changes",
        lambda ticker, price: {"change_1m_pct": 1.0, "change_6m_pct": 2.0, "change_1y_pct": 3.0},
    )

    plan = auth_client.post(
        "/api/plan",
        json={"symbol": "DTE.DE", "total_shares": 30, "months": 3, "growth_override_pct": 1},
    )
    assert plan.status_code == 200
    buy = auth_client.post(
        "/api/purchases",
        json={"symbol": "dte.de", "shares": 10, "price_per_share": 20, "notes": "first lot"},
    )
    assert buy.status_code == 200
    second = auth_client.post(
        "/api/purchases",
        json={"symbol": "DTE.DE", "shares": 5, "price_per_share": 21},
    )
    assert second.status_code == 200
    sell = auth_client.post("/api/sales", json={"symbol": "DTE.DE", "shares": 3, "price_per_share": 22})
    assert sell.status_code == 200
    progress = auth_client.get("/api/progress")
    holding = next(h for h in progress.json()["holdings"] if h["symbol"] == "DTE.DE")
    assert holding["shares"] == pytest.approx(12)

    added = auth_client.post("/api/watchlist", json={"symbol": "DTE.DE"})
    assert added.status_code == 200
    item_id = added.json()["id"]
    listed = auth_client.get("/api/watchlist")
    assert listed.json()["count"] >= 1
    assert auth_client.delete(f"/api/watchlist/{item_id}").json()["ok"] is True
    missing = auth_client.delete("/api/watchlist/99999")
    assert missing.status_code == 404

    guest = auth_client.post("/api/auth/logout")
    assert guest.status_code == 200
    watch = auth_client.get("/api/watchlist")
    assert watch.json().get("guest") is True
