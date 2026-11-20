"""Monthly budget plans: planned vs actual buys, money set aside, dividends, and growth."""

from __future__ import annotations

import calendar
import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

from dividends import dividend_withholding_pct
from fx import get_fx_rate
from stock_service import fetch_quote

MAX_PLAN_MONTHS = 120
MAX_PLAN_ITEMS = 25
PLAN_CURRENCIES = ("EUR", "USD", "GBP", "CHF")
# Fractional shares and rounding rarely land exactly on the target amount.
FUNDED_RATIO = 0.99
_QUOTE_WORKERS = 4


def parse_month(value: str) -> date:
    text = str(value or "").strip()
    parts = text.split("-")
    try:
        if len(parts) < 2 or len(parts[0]) != 4:
            raise ValueError(text)
        return date(int(parts[0]), int(parts[1]), 1)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"'{text}' is not a month in YYYY-MM format") from exc


def month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def add_months(day: date, count: int) -> date:
    index = day.year * 12 + (day.month - 1) + count
    return date(index // 12, index % 12 + 1, 1)


def month_end(day: date) -> date:
    return date(day.year, day.month, calendar.monthrange(day.year, day.month)[1])


def month_span(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def validate_window(start_month: str, end_month: str) -> tuple[str, str]:
    start = parse_month(start_month)
    end = parse_month(end_month)
    if end < start:
        raise ValueError("The end month must be on or after the start month")
    if month_span(start, end) > MAX_PLAN_MONTHS:
        raise ValueError(f"A plan can cover at most {MAX_PLAN_MONTHS} months")
    return month_key(start), month_key(end)


def planned_monthly_total(plan: dict) -> float:
    return round(sum(float(item["monthly_amount"]) for item in plan.get("items") or []), 2)


def monthly_budget(plan: dict) -> float:
    amount = plan.get("monthly_amount")
    if amount:
        return round(float(amount), 2)
    return planned_monthly_total(plan)


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _pct(part: float | None, whole: float | None) -> float | None:
    if part is None or not whole:
        return None
    return round(part / whole * 100.0, 2)


def _parse_day(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _quote_unit(currency: str | None) -> tuple[str, float]:
    """LSE quotes and payouts come in pence (GBp); scale them to pounds."""
    if currency == "GBp":
        return "GBP", 0.01
    return (currency or "USD").upper(), 1.0


class _FxBook:
    """FX into the plan currency for one build, falling back to today's rate once."""

    def __init__(self, target: str) -> None:
        self.target = target.upper()
        self._rates: dict[tuple[str, str | None], float | None] = {}
        self.missing: set[str] = set()

    def rate(self, currency: str | None, on_date: date | None = None) -> float | None:
        ccy = (currency or self.target).upper()
        if ccy == self.target:
            return 1.0
        key = (ccy, on_date.isoformat() if on_date else None)
        if key not in self._rates:
            value = None
            for when in ((on_date, None) if on_date else (None,)):
                try:
                    value = float(get_fx_rate(ccy, self.target, when))
                    break
                except Exception:
                    continue
            if value is None:
                self.missing.add(ccy)
            self._rates[key] = value
        return self._rates[key]

    def convert(
        self, amount: float, currency: str | None, on_date: date | None = None
    ) -> float | None:
        rate = self.rate(currency, on_date)
        return None if rate is None else amount * rate


def _load_quotes(symbols: list[str]) -> dict[str, tuple[Any, str | None]]:
    def load(symbol: str) -> tuple[str, Any, str | None]:
        try:
            return symbol, fetch_quote(symbol), None
        except Exception as exc:
            return symbol, None, str(exc)

    if not symbols:
        return {}
    with ThreadPoolExecutor(max_workers=min(_QUOTE_WORKERS, len(symbols))) as pool:
        return {symbol: (quote, error) for symbol, quote, error in pool.map(load, symbols)}


def _item_lookup(items: list[dict]) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for item in items:
        for key in (item.get("symbol"), item.get("requested_symbol")):
            if key:
                lookup.setdefault(str(key).upper(), item)
    return lookup


def _collect_buys(
    plan: dict,
    purchases: list[dict],
    allocations: list[dict],
    *,
    first_day: date,
    last_day: date,
) -> tuple[list[dict], list[dict]]:
    """Buys inside the plan window: (counted toward the budget, other buys left out)."""
    items = plan.get("items") or []
    lookup = _item_lookup(items)
    count_unplanned = bool(plan.get("include_unplanned")) or not items
    rows = [
        {**purchase, "sold_at": None, "sale_price_per_share": None} for purchase in purchases
    ] + [dict(allocation) for allocation in allocations]

    counted: list[dict] = []
    excluded: list[dict] = []
    for row in rows:
        bought_on = _parse_day(row.get("purchased_at"))
        if bought_on is None or bought_on < first_day or bought_on > last_day:
            continue
        symbol = str(row["symbol"]).upper()
        item = lookup.get(symbol)
        sale_price = row.get("sale_price_per_share")
        buy = {
            "symbol": symbol,
            "item_symbol": item["symbol"] if item else symbol,
            "planned": item is not None,
            "company_name": row.get("company_name"),
            "currency": (row.get("currency") or "USD").upper(),
            "shares": float(row["shares"]),
            "price": float(row["price_per_share"]),
            "bought_on": bought_on,
            "month": month_key(bought_on),
            "sold_on": _parse_day(row.get("sold_at")),
            "sale_price": float(sale_price) if sale_price is not None else None,
        }
        if item is not None or count_unplanned:
            counted.append(buy)
        else:
            excluded.append(buy)
    return counted, excluded


def _dividend_events(
    buys: list[dict],
    quotes: dict[str, tuple[Any, str | None]],
    fx: _FxBook,
    *,
    first_day: date,
    last_day: date,
) -> list[dict]:
    """Net payouts per lot inside the window, matching the Progress page rules."""
    events: list[dict] = []
    for buy in buys:
        quote, _error = quotes.get(buy["symbol"], (None, None))
        payments = quote.dividend.all_payments if quote is not None else []
        if not payments:
            continue
        unit_ccy, scale = _quote_unit(quote.currency)
        withholding = dividend_withholding_pct(buy["symbol"], country=quote.country) / 100.0
        for payment in payments:
            pay_day = _parse_day(payment.date)
            if pay_day is None or pay_day < buy["bought_on"]:
                continue
            if pay_day < first_day or pay_day > last_day:
                continue
            if buy["sold_on"] is not None and pay_day >= buy["sold_on"]:
                continue
            gross = fx.convert(buy["shares"] * float(payment.amount) * scale, unit_ccy, pay_day)
            if gross is None:
                continue
            tax = gross * withholding
            events.append(
                {
                    "date": pay_day.isoformat(),
                    "month": month_key(pay_day),
                    "symbol": buy["item_symbol"],
                    "gross": gross,
                    "tax": tax,
                    "net": gross - tax,
                }
            )
    return events


def _compound(amount: float, monthly_rate: float, months: int) -> float:
    return amount * (1.0 + monthly_rate) ** max(0, months)


def build_budget_progress(
    plan: dict,
    purchases: list[dict],
    allocations: list[dict],
    *,
    today: date | None = None,
    with_market: bool = True,
) -> dict[str, Any]:
    """
    Compare a monthly budget plan with the buys actually logged on Progress.

    Amounts are in the plan currency: buys at the FX rate of their trade date,
    dividends at the rate of their payout date, live value at today's rate.
    `with_market=False` skips quotes (no live value, dividends, or projection).
    """
    today = today or date.today()
    currency = (plan.get("currency") or "EUR").upper()
    fx = _FxBook(currency)
    start = parse_month(plan["start_month"])
    end = parse_month(plan["end_month"])
    months = [add_months(start, offset) for offset in range(month_span(start, end))]
    first_day = start
    plan_last_day = month_end(end)
    last_day = min(plan_last_day, today)
    current_key = month_key(today)
    items = plan.get("items") or []
    budget = monthly_budget(plan)
    planned = planned_monthly_total(plan)

    if today < first_day:
        phase = "upcoming"
    elif today > plan_last_day:
        phase = "ended"
    else:
        phase = "active"

    counted, excluded = _collect_buys(
        plan, purchases, allocations, first_day=first_day, last_day=last_day
    )
    unconverted = 0
    for buy in counted + excluded:
        buy["cost"] = fx.convert(buy["shares"] * buy["price"], buy["currency"], buy["bought_on"])
        if buy["cost"] is None:
            unconverted += 1

    symbols = sorted({buy["symbol"] for buy in counted} | {item["symbol"].upper() for item in items})
    quotes = _load_quotes(symbols) if with_market else {}
    events = (
        _dividend_events(counted, quotes, fx, first_day=first_day, last_day=last_day)
        if with_market
        else []
    )

    for buy in counted:
        buy["proceeds"] = None
        buy["value"] = None
        if buy["sold_on"] is not None and buy["sale_price"] is not None:
            buy["proceeds"] = fx.convert(
                buy["shares"] * buy["sale_price"], buy["currency"], buy["sold_on"]
            )
            continue
        quote, _error = quotes.get(buy["symbol"], (None, None))
        if quote is not None and quote.price:
            unit_ccy, scale = _quote_unit(quote.currency)
            buy["value"] = fx.convert(buy["shares"] * quote.price * scale, unit_ccy)

    buys_by_month: dict[str, list[dict]] = defaultdict(list)
    for buy in counted:
        buys_by_month[buy["month"]].append(buy)
    dividends_by_month: dict[str, float] = defaultdict(float)
    for event in events:
        dividends_by_month[event["month"]] += event["net"]

    rows: list[dict] = []
    set_aside = 0.0
    spent_to_date = 0.0
    for month in months:
        key = month_key(month)
        if key < current_key:
            status = "past"
        elif key == current_key:
            status = "current"
        else:
            status = "upcoming"
        month_buys = buys_by_month.get(key, [])
        spent = sum(buy["cost"] or 0.0 for buy in month_buys)
        item_rows = []
        for item in items:
            target = float(item["monthly_amount"])
            got = sum(
                buy["cost"] or 0.0
                for buy in month_buys
                if buy["planned"] and buy["item_symbol"] == item["symbol"]
            )
            if got >= target * FUNDED_RATIO:
                state = "done"
            elif got > 0:
                state = "partial"
            elif status == "past":
                state = "missed"
            else:
                state = "pending"
            item_rows.append(
                {
                    "symbol": item["symbol"],
                    "target": _round(target),
                    "spent": _round(got),
                    "state": state,
                }
            )
        left = None
        if status != "upcoming":
            left = budget - spent
            spent_to_date += spent
            if status == "past":
                set_aside += left
        if status == "upcoming":
            on_track = False
        elif item_rows:
            on_track = all(row["state"] == "done" for row in item_rows)
        else:
            on_track = budget > 0 and spent >= budget * FUNDED_RATIO
        rows.append(
            {
                "month": key,
                "status": status,
                "budget": _round(budget),
                "planned": _round(planned),
                "spent": _round(spent),
                "spent_pct": _pct(spent, budget),
                "left": _round(left),
                "set_aside": _round(set_aside) if status != "upcoming" else None,
                "unplanned_spent": _round(
                    sum(buy["cost"] or 0.0 for buy in month_buys if not buy["planned"])
                ),
                "dividends": _round(dividends_by_month.get(key, 0.0)),
                "buy_count": len(month_buys),
                "on_track": on_track,
                "overspent": left is not None and left < -0.005,
                "items": item_rows,
            }
        )

    elapsed_rows = [row for row in rows if row["status"] != "upcoming"]
    past_rows = [row for row in rows if row["status"] == "past"]
    upcoming_count = len(rows) - len(elapsed_rows)
    current_row = next((row for row in rows if row["status"] == "current"), None)
    budget_to_date = budget * len(elapsed_rows)
    budget_total = budget * len(rows)
    current_left = current_row["left"] if current_row else 0.0
    streak = 0
    for row in reversed(past_rows):
        if not row["on_track"]:
            break
        streak += 1

    item_by_symbol = {item["symbol"]: item for item in items}
    unplanned_symbols = sorted({buy["item_symbol"] for buy in counted if not buy["planned"]})
    positions: list[dict] = []
    for symbol in [item["symbol"] for item in items] + unplanned_symbols:
        item = item_by_symbol.get(symbol)
        lots = [buy for buy in counted if buy["item_symbol"] == symbol]
        open_lots = [buy for buy in lots if buy["sold_on"] is None]
        sold_lots = [buy for buy in lots if buy["sold_on"] is not None]
        quote, quote_error = quotes.get(symbol.upper(), (None, None))
        price = price_native = None
        native_ccy = None
        if quote is not None and quote.price:
            native_ccy, scale = _quote_unit(quote.currency)
            price_native = quote.price * scale
            price = fx.convert(price_native, native_ccy)
        spent = sum(buy["cost"] or 0.0 for buy in lots)
        open_cost = sum(buy["cost"] or 0.0 for buy in open_lots)
        if not open_lots:
            market_value = 0.0 if with_market else None
        elif with_market and all(buy["value"] is not None for buy in open_lots):
            market_value = sum(buy["value"] for buy in open_lots)
        else:
            market_value = None
        unrealized = market_value - open_cost if market_value is not None else None
        realized = sum(
            (buy["proceeds"] or 0.0) - (buy["cost"] or 0.0)
            for buy in sold_lots
            if buy["proceeds"] is not None
        )
        target = float(item["monthly_amount"]) if item else None
        target_to_date = target * len(elapsed_rows) if target is not None else None
        name = (
            (item or {}).get("company_name")
            or (quote.name if quote is not None else None)
            or next((buy["company_name"] for buy in lots if buy.get("company_name")), None)
            or symbol
        )
        shares_bought = sum(buy["shares"] for buy in lots)
        positions.append(
            {
                "symbol": symbol,
                "requested_symbol": (item or {}).get("requested_symbol"),
                "name": name,
                "planned": item is not None,
                "monthly_target": _round(target),
                "target_to_date": _round(target_to_date),
                "spent": _round(spent),
                "spent_pct": _pct(spent, target_to_date),
                "buy_count": len(lots),
                "shares_bought": round(shares_bought, 6),
                "shares_held": round(sum(buy["shares"] for buy in open_lots), 6),
                "avg_cost": _round(spent / shares_bought, 4) if shares_bought else None,
                "open_cost": _round(open_cost),
                "market_value": _round(market_value),
                "unrealized_gain": _round(unrealized),
                "unrealized_gain_pct": _pct(unrealized, open_cost),
                "realized_gain": _round(realized),
                "dividends": _round(sum(e["net"] for e in events if e["symbol"] == symbol)),
                "price": _round(price, 4),
                "price_native": _round(price_native, 4),
                "price_currency": native_ccy,
                "yield_pct": (
                    quote.dividend.yield_pct
                    if quote is not None and quote.dividend.yield_pct is not None
                    else None
                ),
                "avg_monthly_growth_pct": (
                    quote.avg_monthly_growth_pct if quote is not None else None
                ),
                "withholding_pct": (
                    dividend_withholding_pct(symbol, country=quote.country)
                    if quote is not None
                    else None
                ),
                "quote_error": quote_error,
            }
        )

    open_cost_total = sum(p["open_cost"] or 0.0 for p in positions)
    market_complete = with_market and all(p["market_value"] is not None for p in positions)
    market_value_total = (
        sum(p["market_value"] for p in positions) if market_complete else None
    )
    unrealized_total = (
        market_value_total - open_cost_total if market_value_total is not None else None
    )
    realized_total = sum(p["realized_gain"] or 0.0 for p in positions)
    proceeds_total = sum(
        buy["proceeds"] or 0.0 for buy in counted if buy["proceeds"] is not None
    )
    dividends_net = sum(event["net"] for event in events)
    dividends_gross = sum(event["gross"] for event in events)
    unspent_past = sum(row["left"] for row in past_rows)
    unspent_total = budget_to_date - spent_to_date
    total_return = (
        unrealized_total + realized_total + dividends_net
        if unrealized_total is not None
        else None
    )
    total_days = (plan_last_day - first_day).days + 1
    elapsed_days = (
        0 if today < first_day else min(total_days, (today - first_day).days + 1)
    )

    totals = {
        "months_total": len(rows),
        "months_elapsed": len(elapsed_rows),
        "months_left": upcoming_count,
        "months_on_track": sum(1 for row in past_rows if row["on_track"]),
        "months_past": len(past_rows),
        "on_track_streak": streak,
        "budget_total": _round(budget_total),
        "budget_to_date": _round(budget_to_date),
        "spent_to_date": _round(spent_to_date),
        "spent_pct_to_date": _pct(spent_to_date, budget_to_date),
        "plan_progress_pct": _pct(spent_to_date, budget_total),
        "time_progress_pct": _pct(elapsed_days, total_days),
        "unspent_past": _round(unspent_past),
        "current_month_left": _round(current_left),
        "unspent_total": _round(unspent_total),
        "dividends_net": _round(dividends_net) if with_market else None,
        "dividends_gross": _round(dividends_gross) if with_market else None,
        "dividends_tax": _round(dividends_gross - dividends_net) if with_market else None,
        "dividend_count": len(events),
        "open_cost": _round(open_cost_total),
        "market_value": _round(market_value_total),
        "unrealized_gain": _round(unrealized_total),
        "unrealized_gain_pct": _pct(unrealized_total, open_cost_total),
        "realized_gain": _round(realized_total),
        "sale_proceeds": _round(proceeds_total),
        "total_return": _round(total_return),
        "total_return_pct": _pct(total_return, spent_to_date),
        "cash_available": _round(
            unspent_total + proceeds_total + (dividends_net if with_market else 0.0)
        ),
        "buy_count": len(counted),
    }

    position_by_symbol = {p["symbol"]: p for p in positions}
    this_month = None
    if current_row is not None:
        lines = []
        for item, item_row in zip(items, current_row["items"]):
            position = position_by_symbol[item["symbol"]]
            remaining = max(0.0, float(item["monthly_amount"]) - (item_row["spent"] or 0.0))
            price = position["price"]
            estimate = remaining / price if price else None
            lines.append(
                {
                    "symbol": item["symbol"],
                    "name": position["name"],
                    "target": item_row["target"],
                    "spent": item_row["spent"],
                    "remaining": _round(remaining),
                    "state": item_row["state"],
                    "price": price,
                    "price_native": position["price_native"],
                    "price_currency": position["price_currency"],
                    "est_shares": round(estimate, 4) if estimate is not None else None,
                    "whole_shares": math.floor(estimate) if estimate is not None else None,
                }
            )
        this_month = {
            "month": current_row["month"],
            "budget": current_row["budget"],
            "spent": current_row["spent"],
            "spent_pct": current_row["spent_pct"],
            "left": current_row["left"],
            "unplanned_spent": current_row["unplanned_spent"],
            "days_left": (month_end(today) - today).days,
            "lines": lines,
        }

    projection = None
    if with_market and phase != "ended":
        current_items = {line["symbol"]: line for line in (this_month or {}).get("lines", [])}
        projected_value = 0.0
        contributions = 0.0
        annual_dividends = 0.0
        for position in positions:
            quote, _error = quotes.get(position["symbol"].upper(), (None, None))
            rate = (quote.avg_monthly_growth_pct or 0.0) / 100.0 if quote is not None else 0.0
            value = _compound(position["market_value"] or 0.0, rate, upcoming_count)
            if position["planned"]:
                extra_now = (current_items.get(position["symbol"]) or {}).get("remaining") or 0.0
                value += _compound(extra_now, rate, upcoming_count)
                contributions += extra_now
                target = position["monthly_target"] or 0.0
                for step in range(1, upcoming_count + 1):
                    value += _compound(target, rate, upcoming_count - step)
                contributions += target * upcoming_count
            projected_value += value
            if position["yield_pct"]:
                withholding = (position["withholding_pct"] or 0.0) / 100.0
                annual_dividends += value * position["yield_pct"] / 100.0 * (1.0 - withholding)
        planned_extra_now = sum(line["remaining"] or 0.0 for line in current_items.values())
        cash_left_now = max(0.0, (current_left or 0.0) - planned_extra_now) if current_row else 0.0
        projected_invested = spent_to_date + contributions
        projected_cost_open = open_cost_total + contributions
        projection = {
            "end_month": month_key(end),
            "months_ahead": upcoming_count,
            "invested": _round(projected_invested),
            "contributions": _round(contributions),
            "value": _round(projected_value),
            "gain": _round(projected_value - projected_cost_open),
            "gain_pct": _pct(projected_value - projected_cost_open, projected_cost_open),
            "annual_dividends": _round(annual_dividends),
            "cash_set_aside": _round(
                unspent_past + cash_left_now + max(0.0, budget - planned) * upcoming_count
            ),
        }

    excluded_total = sum(buy["cost"] or 0.0 for buy in excluded)
    return {
        "plan": plan,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "today": today.isoformat(),
        "phase": phase,
        "starts_in_months": month_span(add_months(parse_month(current_key), 1), start)
        if phase == "upcoming"
        else 0,
        "currency": currency,
        "market": with_market,
        "allocation": {
            "budget": _round(budget),
            "planned": _round(planned),
            "unallocated": _round(max(0.0, budget - planned)),
            "over_allocated": _round(max(0.0, planned - budget)),
        },
        "months": rows,
        "totals": totals,
        "positions": positions,
        "this_month": this_month,
        "projection": projection,
        "warnings": {
            "fx_missing": sorted(fx.missing),
            "unconverted_buys": unconverted,
            "quote_errors": {
                symbol: error for symbol, (_quote, error) in quotes.items() if error
            },
            "excluded_buys": len(excluded),
            "excluded_total": _round(excluded_total),
        },
    }


def summarize_budget_plan(
    plan: dict,
    purchases: list[dict],
    allocations: list[dict],
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Light plan card for lists and Home: spending only, no live quotes."""
    progress = build_budget_progress(
        plan, purchases, allocations, today=today, with_market=False
    )
    totals = progress["totals"]
    this_month = progress["this_month"]
    return {
        **plan,
        "phase": progress["phase"],
        "budget": progress["allocation"]["budget"],
        "planned": progress["allocation"]["planned"],
        "months_total": totals["months_total"],
        "months_elapsed": totals["months_elapsed"],
        "budget_to_date": totals["budget_to_date"],
        "spent_to_date": totals["spent_to_date"],
        "spent_pct_to_date": totals["spent_pct_to_date"],
        "unspent_total": totals["unspent_total"],
        "this_month": (
            {
                "month": this_month["month"],
                "budget": this_month["budget"],
                "spent": this_month["spent"],
                "spent_pct": this_month["spent_pct"],
                "left": this_month["left"],
            }
            if this_month
            else None
        ),
    }
