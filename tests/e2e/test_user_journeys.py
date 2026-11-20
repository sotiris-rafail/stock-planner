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
    assert "/pricing" in root.headers["location"]
    legacy = client.get("/index", follow_redirects=False)
    assert legacy.status_code == 302
    for path in PAGES:
        response = client.get(path)
        assert response.status_code == 200, path
    login = client.get("/login").text
    assert "register-mail-note" in login
    assert "login.noRecovery" in login
    assert "auth-password-rules" in login
    assert "Sign in to your account" not in login
    assert "forgot.smtpOff" in client.get("/forgot-password").text
    assert "reset.smtpOff" in client.get("/reset-password").text


@pytest.mark.e2e
def test_protected_pages_redirect_then_allow(client):
    guest_root = client.get("/", follow_redirects=False)
    assert guest_root.status_code == 302
    assert "/pricing" in guest_root.headers["location"]
    for path in ("/home", "/budget", "/progress", "/track", "/notifications", "/account"):
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 302
        assert "/login" in response.headers["location"]
    client.post("/api/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    home = client.get("/", follow_redirects=False)
    assert home.status_code == 302
    assert "/home" in home.headers["location"]
    for path in ("/home", "/budget", "/progress", "/track", "/notifications", "/account"):
        assert client.get(path).status_code == 200
    assert "home-markets" in client.get("/home").text
    assert "bento-grid" in client.get("/home").text
    assert "bento-grid" in client.get("/plan").text
    home = client.get("/home").text
    assert "quote-status" in home
    assert "symbol-sheet.js" in home
    assert "symbol-sheet.js" in client.get("/track").text
    assert "notifications.smtpOff" in client.get("/notifications").text
    assert "account.back" in client.get("/notifications").text
    account = client.get("/account").text
    assert "data-account-export" in account
    assert "account-flags" in account
    assert "data-account-signout" in account


@pytest.mark.e2e
def test_sheet_compare_and_mobile_contracts(client):
    ideas = client.get("/ideas").text
    assert "symbol-sheet.js" in ideas
    assert "sbp-guest-cta" in ideas
    ideas_js = client.get("/static/ideas.js").text
    assert "ideas-cards" in ideas_js
    assert "data-open-sheet" in ideas_js
    assert "preferTabWithRows" in ideas_js
    suggestions = client.get("/suggestions").text
    assert "symbol-sheet.js" in suggestions
    assert "sbp-guest-cta" in suggestions
    assert "compare-strip" in suggestions
    sugg_js = client.get("/static/suggestions.js").text
    assert "compare.sameArea" in sugg_js
    assert "data-open-sheet" in sugg_js
    plan = client.get("/plan").text
    assert "schedule-cards" in plan
    assert "plan-schedule-cards" in plan
    sheet = client.get("/static/symbol-sheet.js").text
    assert "progress.thisMonth" in sheet
    assert "guest.trackCtaPlain" in sheet
    assert "sheet.yieldOnCost" in sheet
    assert "data-open-history" in sheet


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
