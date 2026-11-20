from __future__ import annotations

from budget_plan import add_months, month_key
from datetime import date

from db import update_user_subscription

from tests.integration.test_budget_api import plan_body


def test_second_budget_plan_requires_pro(auth_client):
    first = auth_client.post("/api/budget-plans", json=plan_body())
    assert first.status_code == 200, first.text
    second = auth_client.post("/api/budget-plans", json=plan_body(name="Plan B"))
    assert second.status_code == 402
    detail = second.json()["detail"]
    assert detail["code"] == "pro_required"
    assert detail["feature"] == "budget_plans"


def test_pro_user_can_create_multiple_plans(auth_client):
    update_user_subscription(1, subscription_tier="pro")
    # resolve user id via me
    me = auth_client.get("/api/auth/me").json()
    assert me["subscription_tier"] == "pro"
    assert auth_client.post("/api/budget-plans", json=plan_body(name="One")).status_code == 200
    assert auth_client.post("/api/budget-plans", json=plan_body(name="Two")).status_code == 200


def test_free_plan_longer_than_24_months_requires_pro(auth_client):
    start = month_key(date.today().replace(day=1))
    end = month_key(add_months(date.today().replace(day=1), 30))
    body = plan_body(start_month=start, end_month=end)
    resp = auth_client.post("/api/budget-plans", json=body)
    assert resp.status_code == 402
    assert resp.json()["detail"]["feature"] == "budget_window"


def test_pricing_and_help_pages_public(client):
    assert client.get("/pricing").status_code == 200
    assert "pricing-free" in client.get("/pricing").text
    assert client.get("/help/calculations").status_code == 200
    assert client.get("/legal/terms").status_code == 200
    assert client.get("/legal/privacy").status_code == 200