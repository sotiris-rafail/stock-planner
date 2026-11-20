from __future__ import annotations

from datetime import date

from budget_plan import add_months, month_key

THIS_MONTH = month_key(date.today().replace(day=1))
END_MONTH = month_key(add_months(date.today().replace(day=1), 13))


def plan_body(**overrides):
    body = {
        "start_month": THIS_MONTH,
        "end_month": END_MONTH,
        "monthly_amount": 400,
        "currency": "EUR",
        "items": [
            {"symbol": "dte.de", "monthly_amount": 150},
            {"symbol": "VUAA.EU", "monthly_amount": 150},
        ],
    }
    body.update(overrides)
    return body


def test_budget_plans_require_auth(client):
    assert client.get("/api/budget-plans").status_code == 401
    assert client.post("/api/budget-plans", json=plan_body()).status_code == 401
    page = client.get("/budget", follow_redirects=False)
    assert page.status_code == 302
    assert "next=%2Fbudget" in page.headers["location"]


def test_budget_plan_lifecycle(auth_client):
    assert auth_client.get("/budget").status_code == 200
    assert auth_client.get("/api/budget-plans").json() == {"plans": []}

    created = auth_client.post("/api/budget-plans", json=plan_body())
    assert created.status_code == 200, created.text
    plan = created.json()
    assert plan["name"]
    assert plan["phase"] == "active"
    assert [item["symbol"] for item in plan["items"]] == ["DTE.DE", "VUAA.L"]
    assert plan["items"][1]["requested_symbol"] == "VUAA.EU"
    assert plan["budget"] == 400.0 and plan["planned"] == 300.0
    plan_id = plan["id"]

    bought = auth_client.post(
        "/api/purchases",
        json={"symbol": "DTE.DE", "shares": 5, "price_per_share": 20, "purchased_at": date.today().isoformat()},
    )
    assert bought.status_code == 200

    listed = auth_client.get("/api/budget-plans").json()["plans"]
    assert listed[0]["this_month"]["spent"] == 100.0
    assert listed[0]["this_month"]["left"] == 300.0

    detail = auth_client.get(f"/api/budget-plans/{plan_id}")
    assert detail.status_code == 200, detail.text
    data = detail.json()
    assert data["totals"]["spent_to_date"] == 100.0
    assert data["totals"]["months_total"] == 14
    assert data["this_month"]["lines"][0]["remaining"] == 50.0
    assert data["projection"] is not None
    assert data["positions"][0]["market_value"] == 100.0

    updated = auth_client.put(
        f"/api/budget-plans/{plan_id}",
        json=plan_body(name="Long run", monthly_amount=None, items=[{"symbol": "DTE.DE", "monthly_amount": 250}]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Long run"
    assert updated.json()["budget"] == 250.0
    refreshed = auth_client.get(f"/api/budget-plans/{plan_id}").json()
    assert refreshed["allocation"]["budget"] == 250.0

    assert auth_client.delete(f"/api/budget-plans/{plan_id}").json() == {"ok": True}
    assert auth_client.delete(f"/api/budget-plans/{plan_id}").status_code == 404
    assert auth_client.get(f"/api/budget-plans/{plan_id}").status_code == 404
    assert auth_client.put(f"/api/budget-plans/{plan_id}", json=plan_body()).status_code == 404


def test_budget_plan_validation(auth_client, monkeypatch):
    from db import update_user_subscription

    update_user_subscription(1, subscription_tier="pro")
    backwards = auth_client.post(
        "/api/budget-plans", json=plan_body(start_month=END_MONTH, end_month=THIS_MONTH)
    )
    assert backwards.status_code == 400
    empty = auth_client.post("/api/budget-plans", json=plan_body(monthly_amount=None, items=[]))
    assert empty.status_code == 400
    twice = auth_client.post(
        "/api/budget-plans",
        json=plan_body(items=[{"symbol": "DTE.DE", "monthly_amount": 10}, {"symbol": "dte.de", "monthly_amount": 5}]),
    )
    assert twice.status_code == 400
    assert auth_client.post("/api/budget-plans", json=plan_body(currency="JPY")).status_code == 422
    assert auth_client.post("/api/budget-plans", json=plan_body(start_month="11/2026")).status_code == 400
    budget_only = auth_client.post("/api/budget-plans", json=plan_body(items=[]))
    assert budget_only.status_code == 200

    monkeypatch.setattr("main.fetch_quote", lambda *a, **k: (_ for _ in ()).throw(ValueError("nope")))
    unknown = auth_client.post(
        "/api/budget-plans", json=plan_body(items=[{"symbol": "ZZZZ", "monthly_amount": 10}])
    )
    assert unknown.status_code == 400
    assert "ZZZZ" in unknown.json()["detail"]


def test_budget_plans_are_private_and_deleted_with_account(auth_client, monkeypatch):
    from tests.conftest import VALID_PASSWORD

    plan_id = auth_client.post("/api/budget-plans", json=plan_body()).json()["id"]
    auth_client.post("/api/auth/logout")
    auth_client.post("/api/auth/register", json={"email": "other@example.com", "password": VALID_PASSWORD})
    assert auth_client.get(f"/api/budget-plans/{plan_id}").status_code == 404
    assert auth_client.get("/api/budget-plans").json() == {"plans": []}

    monkeypatch.setattr("main.delete_enabled", lambda: True)
    auth_client.post("/api/auth/logout")
    auth_client.post("/api/auth/login", json={"email": "tester@example.com", "password": VALID_PASSWORD})
    deleted = auth_client.post("/api/auth/delete-account", json={"password": VALID_PASSWORD})
    assert deleted.status_code == 200
    from db import list_budget_plans

    assert list_budget_plans(user_id=1) == []
