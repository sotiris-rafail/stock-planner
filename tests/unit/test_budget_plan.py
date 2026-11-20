from __future__ import annotations

from datetime import date

import pytest

from budget_plan import (
    build_budget_progress,
    month_span,
    parse_month,
    summarize_budget_plan,
    validate_window,
)
from dividends import DividendInfo, DividendPayment
from stock_service import StockQuote


def make_quote(symbol, price, currency="EUR", *, country="Germany", payments=(), growth=1.0, yield_pct=None):
    payments = [DividendPayment(date=day, amount=amount) for day, amount in payments]
    return StockQuote(
        symbol=symbol,
        name=f"{symbol} Inc",
        currency=currency,
        price=price,
        previous_close=price,
        change_pct=0.0,
        avg_monthly_growth_pct=growth,
        lookback_months=12,
        as_of="2027-01-15T00:00:00+00:00",
        dividend=DividendInfo(
            pays_dividend=bool(payments),
            yield_pct=yield_pct,
            annual_rate=None,
            recent_payments=payments[-8:],
            all_payments=payments,
        ),
        country=country,
    )


def lot(symbol, shares, price, day, currency="EUR"):
    return {
        "symbol": symbol,
        "company_name": None,
        "currency": currency,
        "shares": shares,
        "price_per_share": price,
        "purchased_at": day,
    }


PLAN = {
    "id": 1,
    "name": "Nov 2026 – Dec 2027",
    "start_month": "2026-11",
    "end_month": "2027-12",
    "monthly_amount": 400.0,
    "currency": "EUR",
    "include_unplanned": True,
    "items": [
        {"symbol": "AAA.DE", "requested_symbol": None, "company_name": "Aaa", "monthly_amount": 200.0},
        {"symbol": "BBB.DE", "requested_symbol": None, "company_name": "Bbb", "monthly_amount": 100.0},
    ],
}

PURCHASES = [
    lot("AAA.DE", 1, 20, "2026-10-01"),
    lot("AAA.DE", 10, 20, "2026-11-05"),
    lot("BBB.DE", 5, 20, "2026-11-06"),
    lot("CCC", 2, 25, "2026-12-03", currency="USD"),
    lot("AAA.DE", 7.5, 20, "2026-12-20"),
    lot("AAA.DE", 10, 20, "2027-01-10"),
]

QUOTES = {
    "AAA.DE": make_quote(
        "AAA.DE",
        22.0,
        payments=[("2026-06-01", 1.0), ("2026-12-10", 0.5)],
        yield_pct=3.0,
    ),
    "BBB.DE": make_quote("BBB.DE", 18.0, growth=0.0),
    "CCC": make_quote("CCC", 30.0, "USD", country="United States", growth=0.0),
}


@pytest.fixture
def market(monkeypatch):
    def fake_fx(fr, to, on_date=None):
        rates = {("USD", "EUR"): 0.9, ("GBP", "EUR"): 1.2}
        return rates[(fr, to)]

    monkeypatch.setattr("budget_plan.fetch_quote", lambda symbol: QUOTES[symbol])
    monkeypatch.setattr("budget_plan.get_fx_rate", fake_fx)


def test_month_helpers_and_validation():
    assert parse_month("2026-11") == date(2026, 11, 1)
    assert parse_month("2026-11-18") == date(2026, 11, 1)
    assert month_span(date(2026, 11, 1), date(2027, 12, 1)) == 14
    assert validate_window("2026-11", "2027-12") == ("2026-11", "2027-12")
    with pytest.raises(ValueError):
        parse_month("11/2026")
    with pytest.raises(ValueError):
        validate_window("2027-01", "2026-12")
    with pytest.raises(ValueError):
        validate_window("2020-01", "2030-12")


def test_progress_months_cash_dividends_and_growth(market):
    data = build_budget_progress(PLAN, PURCHASES, [], today=date(2027, 1, 15))
    assert data["phase"] == "active"
    assert data["allocation"] == {
        "budget": 400.0,
        "planned": 300.0,
        "unallocated": 100.0,
        "over_allocated": 0.0,
    }

    nov, dec, jan = data["months"][:3]
    assert (nov["status"], dec["status"], jan["status"]) == ("past", "past", "current")
    assert nov["spent"] == 300.0 and nov["left"] == 100.0 and nov["on_track"]
    assert [row["state"] for row in nov["items"]] == ["done", "done"]
    assert dec["spent"] == 195.0 and dec["unplanned_spent"] == 45.0
    assert [row["state"] for row in dec["items"]] == ["partial", "missed"]
    assert not dec["on_track"]
    assert dec["set_aside"] == 305.0
    assert dec["dividends"] == 4.75
    assert data["months"][3]["status"] == "upcoming"
    assert data["months"][3]["left"] is None

    totals = data["totals"]
    assert totals["months_total"] == 14
    assert totals["months_elapsed"] == 3
    assert totals["months_left"] == 11
    assert totals["months_on_track"] == 1
    assert totals["on_track_streak"] == 0
    assert totals["budget_to_date"] == 1200.0
    assert totals["spent_to_date"] == 695.0
    assert totals["unspent_past"] == 305.0
    assert totals["current_month_left"] == 200.0
    assert totals["unspent_total"] == 505.0
    assert totals["dividends_gross"] == 5.0
    assert totals["dividends_tax"] == 0.25
    assert totals["dividends_net"] == 4.75
    assert totals["open_cost"] == 695.0
    assert totals["market_value"] == 749.0
    assert totals["unrealized_gain"] == 54.0
    assert totals["total_return"] == 58.75
    assert totals["cash_available"] == 509.75

    positions = {p["symbol"]: p for p in data["positions"]}
    assert positions["AAA.DE"]["spent"] == 550.0
    assert positions["AAA.DE"]["target_to_date"] == 600.0
    assert positions["AAA.DE"]["dividends"] == 4.75
    assert positions["CCC"]["planned"] is False
    assert positions["CCC"]["price"] == 27.0

    lines = {line["symbol"]: line for line in data["this_month"]["lines"]}
    assert lines["AAA.DE"]["remaining"] == 0.0 and lines["AAA.DE"]["state"] == "done"
    assert lines["BBB.DE"]["remaining"] == 100.0
    assert lines["BBB.DE"]["whole_shares"] == 5
    assert lines["BBB.DE"]["est_shares"] == pytest.approx(5.5556)

    projection = data["projection"]
    assert projection["months_ahead"] == 11
    assert projection["contributions"] == 3400.0
    assert projection["invested"] == 4095.0
    assert projection["cash_set_aside"] == 1505.0
    assert projection["value"] > projection["invested"] - 695.0
    assert projection["annual_dividends"] > 0


def test_unplanned_buys_can_be_left_out(market):
    plan = {**PLAN, "include_unplanned": False}
    data = build_budget_progress(plan, PURCHASES, [], today=date(2027, 1, 15))
    assert data["months"][1]["spent"] == 150.0
    assert data["warnings"]["excluded_buys"] == 1
    assert data["warnings"]["excluded_total"] == 45.0
    assert all(p["planned"] for p in data["positions"])


def test_budget_only_plan_counts_every_buy(market):
    plan = {**PLAN, "items": [], "include_unplanned": False}
    data = build_budget_progress(plan, PURCHASES, [], today=date(2027, 1, 15), with_market=False)
    assert data["months"][0]["on_track"] is False
    assert data["totals"]["spent_to_date"] == 695.0
    assert data["totals"]["market_value"] is None
    assert data["projection"] is None


def test_upcoming_and_ended_phases(market):
    upcoming = build_budget_progress(PLAN, PURCHASES, [], today=date(2026, 9, 10))
    assert upcoming["phase"] == "upcoming"
    assert upcoming["starts_in_months"] == 2
    assert upcoming["this_month"] is None
    assert upcoming["totals"]["spent_to_date"] == 0.0
    assert upcoming["projection"]["contributions"] == 300.0 * 14

    ended = build_budget_progress(PLAN, PURCHASES, [], today=date(2028, 2, 1))
    assert ended["phase"] == "ended"
    assert ended["projection"] is None
    assert ended["this_month"] is None
    assert ended["totals"]["months_past"] == 14
    assert ended["totals"]["time_progress_pct"] == 100.0


def test_pence_quotes_are_scaled_to_pounds(monkeypatch):
    plan = {
        **PLAN,
        "items": [{"symbol": "ULVR.L", "requested_symbol": None, "company_name": None, "monthly_amount": 100.0}],
    }
    monkeypatch.setattr(
        "budget_plan.fetch_quote",
        lambda symbol: make_quote(symbol, 1500.0, "GBp", country="United Kingdom"),
    )
    monkeypatch.setattr("budget_plan.get_fx_rate", lambda fr, to, on_date=None: 1.2)
    data = build_budget_progress(
        plan,
        [lot("ULVR.L", 5, 15, "2026-11-10", currency="GBP")],
        [],
        today=date(2026, 11, 20),
    )
    position = data["positions"][0]
    assert position["price_native"] == 15.0
    assert position["price_currency"] == "GBP"
    assert position["market_value"] == 90.0


def test_missing_fx_is_reported_not_fatal(monkeypatch):
    def broken_fx(*args, **kwargs):
        raise ValueError("offline")

    monkeypatch.setattr("budget_plan.get_fx_rate", broken_fx)
    data = build_budget_progress(
        {**PLAN, "items": []},
        [lot("CCC", 2, 25, "2026-11-03", currency="USD")],
        [],
        today=date(2026, 11, 20),
        with_market=False,
    )
    assert data["warnings"]["fx_missing"] == ["USD"]
    assert data["warnings"]["unconverted_buys"] == 1
    assert data["totals"]["spent_to_date"] == 0.0


def test_sells_keep_plan_spending(isolated_db):
    from db import (
        add_purchase,
        create_user,
        execute_sale,
        list_purchases,
        list_sale_lot_allocations,
    )

    user_id = create_user(email_encrypted="enc", password_hash="hash")
    add_purchase(
        user_id=user_id, symbol="AAA.DE", company_name="Aaa", currency="EUR",
        shares=10, price_per_share=20, purchased_at="2026-11-05",
    )
    add_purchase(
        user_id=user_id, symbol="AAA.DE", company_name="Aaa", currency="EUR",
        shares=5, price_per_share=22, purchased_at="2026-12-05",
    )
    execute_sale(
        user_id=user_id, symbol="AAA.DE", shares=12, price_per_share=25, sold_at="2027-01-05",
    )
    allocations = list_sale_lot_allocations(user_id=user_id)
    assert [(a["purchased_at"], a["shares"]) for a in allocations] == [
        ("2026-11-05", 10.0),
        ("2026-12-05", 2.0),
    ]

    plan = {**PLAN, "items": [PLAN["items"][0]]}
    data = summarize_budget_plan(
        plan,
        list_purchases(user_id=user_id),
        allocations,
        today=date(2027, 1, 15),
    )
    assert data["spent_to_date"] == 310.0

    full = build_budget_progress(
        plan, list_purchases(user_id=user_id), allocations,
        today=date(2027, 1, 15), with_market=False,
    )
    assert full["totals"]["sale_proceeds"] == 300.0
    assert full["totals"]["realized_gain"] == 56.0
    assert full["positions"][0]["shares_held"] == 3.0
