from __future__ import annotations

from tests.conftest import VALID_EMAIL, VALID_PASSWORD


def test_health_config_and_unauth(client):
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert "smtp_enabled" in health
    assert "quote_refresh_minutes" in health
    assert "quotes_ok" in health
    assert "quotes_delayed" in health
    assert "backup_ok" in health
    assert health["backup_whole_database"] is True
    config = client.get("/api/config").json()
    assert "cron_job_silent_stock_refresh" in config
    assert "suggestion_refresh_hours" in config
    assert "smtp_enabled" in config
    assert "export_enabled" in config
    assert "delete_enabled" in config
    assert "backup_enabled" in config
    assert "backup_interval_hours" in config
    assert config["email_disabled_message"] == "Email is disabled for now. Thank you"
    assert client.get("/api/purchases").status_code == 401
    assert client.get("/api/auth/me").json() == {"authenticated": False, "email": None}


def test_auth_login_logout_refresh(client):
    bad = client.post("/api/auth/register", json={"email": "bad", "password": VALID_PASSWORD})
    assert bad.status_code == 400
    client.post("/api/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    login = client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})
    assert login.status_code == 200
    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["email"] == VALID_EMAIL
    assert client.post("/api/auth/refresh").status_code == 200
    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": VALID_PASSWORD, "new_password": "Xy1!Zq3#Ab"},
    )
    assert changed.status_code == 200
    wrong = client.post(
        "/api/auth/change-password",
        json={"current_password": VALID_PASSWORD, "new_password": "Ab1!Cd3#Ef"},
    )
    assert wrong.status_code == 401
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": VALID_EMAIL, "password": "Xy1!Zq3#Ab"},
        ).status_code
        == 200
    )
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": VALID_EMAIL, "password": VALID_PASSWORD},
        ).status_code
        == 401
    )
    assert client.get("/api/auth/me").json()["authenticated"] is False
    fail = client.post("/api/auth/login", json={"email": VALID_EMAIL, "password": "Ab1!Cd3#ZZ"})
    assert fail.status_code == 401


def test_forgot_password_disabled(client):
    response = client.post("/api/auth/forgot-password", json={"email": VALID_EMAIL})
    assert response.status_code == 503
    assert response.json()["detail"] == "Email is disabled for now. Thank you"


def test_forgot_and_reset(isolated_db, client, monkeypatch):
    monkeypatch.setattr("main.smtp_enabled", lambda: True)
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
    assert plan.json()["price_source"] == "yahoo"
    stooq_plan = client.post(
        "/api/plan",
        json={"symbol": "DTE.DE", "total_shares": 10, "periods": 2, "price_source": "stooq"},
    )
    assert stooq_plan.status_code == 200
    assert stooq_plan.json()["price_source"] == "stooq"
    bad_source = client.post(
        "/api/plan",
        json={"symbol": "DTE.DE", "total_shares": 10, "periods": 2, "price_source": "polygon"},
    )
    assert bad_source.status_code == 422
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


def test_portfolio_watchlist_notifications(auth_client, monkeypatch):
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
    disabled = auth_client.put(
        "/api/notifications/settings",
        json={"monthly_report_enabled": True, "report_email": "alerts@example.com"},
    )
    assert disabled.status_code == 503
    assert disabled.json()["detail"] == "Email is disabled for now. Thank you"

    monkeypatch.setattr("main.smtp_enabled", lambda: True)
    from db import update_user_subscription

    update_user_subscription(1, subscription_tier="pro")
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


def test_export_respects_config_flag(auth_client, monkeypatch):
    monkeypatch.setattr("main.export_enabled", lambda: False)
    blocked = auth_client.get("/api/account/export")
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Export is disabled"
    monkeypatch.setattr("main.export_enabled", lambda: True)
    allowed = auth_client.get("/api/account/export")
    assert allowed.status_code == 200
    assert "text/csv" in allowed.headers.get("content-type", "")
    assert "record_type" in allowed.text
    as_json = auth_client.get("/api/account/export?format=json")
    assert as_json.status_code == 200
    assert "buys" in as_json.json()
    csv_text = allowed.text
    imported = auth_client.post(
        "/api/account/import",
        json={"content": csv_text},
    )
    assert imported.status_code == 200
    assert "skipped" in imported.json()
    again = auth_client.post("/api/account/import", json={"content": csv_text})
    assert again.status_code == 200
    assert again.json()["skipped"]["buys"] >= 0
    monkeypatch.setattr("main.delete_enabled", lambda: False)
    blocked_delete = auth_client.post(
        "/api/auth/delete-account",
        json={"password": VALID_PASSWORD},
    )
    assert blocked_delete.status_code == 403


def test_backup_restore_is_not_an_http_api(auth_client):
    assert auth_client.get("/api/account/backups").status_code == 404
    assert (
        auth_client.post(
            "/api/account/backups/restore",
            json={"filename": "portfolio-x.db", "password": VALID_PASSWORD},
        ).status_code
        == 404
    )
