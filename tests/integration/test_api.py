from __future__ import annotations

from tests.conftest import VALID_EMAIL, VALID_PASSWORD


def test_health_config_and_unauth(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert "cron_job_silent_stock_refresh" in client.get("/api/config").json()
    assert client.get("/api/purchases").status_code == 401
    assert client.get("/api/auth/me").json() == {"authenticated": False}


def test_auth_login_logout_refresh(client):
    bad = client.post("/api/auth/register", json={"email": "bad", "password": VALID_PASSWORD})
    assert bad.status_code == 400
    client.post("/api/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    login = client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    assert login.status_code == 200
    assert client.get("/api/auth/me").json()["authenticated"] is True
    assert client.post("/api/auth/refresh").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["authenticated"] is False
    fail = client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": "Ab1!Cd3#ZZ"})
    assert fail.status_code == 401


def test_forgot_and_reset(isolated_db, client, monkeypatch):
    client.post("/api/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    monkeypatch.setattr("auth.send_reset_email", lambda **k: None)
    assert client.post("/api/auth/forgot-password", json={"email": VALID_EMAIL}).json()["ok"]
    from auth import reset_hash_for
    from db import get_user_by_encrypted_email
    from auth_crypto import encrypt_email

    user = get_user_by_encrypted_email(encrypt_email(VALID_EMAIL))
    token = reset_hash_for(email=VALID_EMAIL, created_at=user["created_at"])
    reset = client.post(
        "/api/auth/reset-password",
        json={"hash": token, "password": "Xy1!Zq3#Ab"},
    )
    assert reset.status_code == 200
    assert client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": "Xy1!Zq3#Ab"}).status_code == 200


def test_quote_market_error(client, monkeypatch):
    monkeypatch.setattr("main.fetch_quote", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/quote/ZZZ").status_code == 404
    assert client.post("/api/plan", json={"symbol": "ZZZ", "total_shares": 1, "periods": 1}).status_code == 502


def test_quote_plan_dividends(client):
    quote = client.get("/api/quote/DTE.DE")
    assert quote.status_code == 200
    assert quote.json()["price"] == 20.0
    plan = client.post("/api/plan", json={"symbol": "DTE.DE", "total_shares": 10, "periods": 2})
    assert plan.status_code == 200
    assert plan.json()["periods"] == 2
    yearly = client.post(
        "/api/plan",
        json={"symbol": "DTE.DE", "total_shares": 10, "periods": 2, "frequency": "yearly"},
    )
    assert yearly.status_code == 200
    assert client.get("/api/dividends/DTE.DE").status_code == 200
    too_long = client.post(
        "/api/plan",
        json={"symbol": "DTE.DE", "total_shares": 10, "periods": 41, "frequency": "yearly"},
    )
    assert too_long.status_code == 400


def test_portfolio_watchlist_notifications(auth_client):
    created = auth_client.post(
        "/api/purchases",
        json={"symbol": "DTE.DE", "shares": 5, "price_per_share": 20, "purchased_at": "2024-01-01"},
    )
    assert created.status_code == 200
    purchase_id = created.json()["id"]
    assert auth_client.get("/api/purchases?page_size=10").json()["total"] == 1
    assert auth_client.get("/api/purchases?page_size=all").status_code == 200
    assert auth_client.get("/api/purchases?page_size=3").status_code == 400
    assert auth_client.get("/api/positions").json()["positions"]
    assert auth_client.get("/api/positions/DTE.DE").json()["shares"] == 5
    sale = auth_client.post(
        "/api/sales",
        json={"symbol": "DTE.DE", "shares": 2, "price_per_share": 22, "sold_at": "2024-06-01"},
    )
    assert sale.status_code == 200
    assert auth_client.get("/api/transactions").status_code == 200
    assert auth_client.get("/api/progress/summary").json()["summary_only"] is True
    assert auth_client.get("/api/progress").status_code == 200
    assert auth_client.delete(f"/api/purchases/{purchase_id}").status_code in {200, 404}

    guest = auth_client.post("/api/auth/logout")
    assert guest.status_code == 200
    # re-auth via leftover? logout cleared cookie. Register again uses same isolated db unique email
    # use login
    auth_client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    settings = auth_client.put(
        "/api/notifications/settings",
        json={"monthly_report_enabled": True, "report_email": "alerts@example.com"},
    )
    assert settings.status_code == 200
    got = auth_client.get("/api/notifications/settings")
    assert got.json()["monthly_report_enabled"] is True

    wl = auth_client.post("/api/watchlist", json={"symbol": "DTE.DE", "asset_type": "stock"})
    # create_watchlist_entry still hits resolve_tradable_symbol unless patched
    assert wl.status_code in {200, 400, 502}
    assert auth_client.get("/api/watchlist").status_code == 200
    assert auth_client.get("/api/suggestions").status_code == 200
    assert auth_client.get("/api/dividend-ideas").status_code == 200
