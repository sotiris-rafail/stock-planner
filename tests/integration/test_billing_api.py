from __future__ import annotations

from db import update_user_subscription


def test_billing_providers_empty_when_disabled(auth_client):
    data = auth_client.get("/api/billing/providers").json()
    assert "providers" in data
    assert data["providers"] == []


def test_checkout_503_when_not_configured(auth_client):
    resp = auth_client.post(
        "/api/billing/checkout",
        json={"interval": "month", "provider": "stripe"},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "billing_not_configured"


def test_portal_requires_customer(auth_client):
    resp = auth_client.post("/api/billing/portal")
    assert resp.status_code in (400, 503)
    body = resp.json()
    assert body["detail"]["code"] in {"no_billing_customer", "billing_not_configured", "portal_not_supported"}


def test_portal_503_without_stripe_keys(auth_client, monkeypatch):
    update_user_subscription(
        1,
        stripe_customer_id="cus_test_123",
        billing_customer_id="cus_test_123",
        billing_provider="stripe",
    )
    resp = auth_client.post("/api/billing/portal")
    assert resp.status_code == 503


def test_auth_me_portal_flag(auth_client):
    me = auth_client.get("/api/auth/me").json()
    assert me["billing_portal_available"] is False
    update_user_subscription(1, stripe_customer_id="cus_portal")
    me2 = auth_client.get("/api/auth/me").json()
    assert me2["billing_portal_available"] is False  # still false until Stripe is configured