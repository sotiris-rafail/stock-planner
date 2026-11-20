"""Portfolio progress: aggregate remaining lots with live quotes, by currency."""

from __future__ import annotations

from dividends import (
    dividend_withholding_pct,
    dividends_earned_for_lots,
    fetch_stock_splits,
)
from fx import convert_amount
from stock_service import fetch_quote, resolve_tradable_symbol


def _money_change(current_value: float | None, change_pct: float | None) -> float | None:
    if current_value is None or change_pct is None:
        return None
    return round(current_value * change_pct / (100.0 + change_pct), 2) if change_pct != -100 else None


def build_progress_summary(
    purchases: list[dict], sales: list[dict] | None = None
) -> dict:
    """
    Fast currency rollup without live quotes or dividend history.

    Used for the initial Progress page; holdings/live metrics load lazily.
    """
    sales = sales or []
    by_symbol: dict[str, list[dict]] = {}
    for purchase in purchases:
        by_symbol.setdefault(purchase["symbol"], []).append(purchase)

    realized_by_symbol: dict[str, dict] = {}
    for sale in sales:
        symbol = sale["symbol"]
        bucket = realized_by_symbol.setdefault(
            symbol,
            {
                "realized_gain": 0.0,
                "currency": sale.get("currency") or "USD",
            },
        )
        bucket["realized_gain"] += float(sale.get("realized_gain") or 0)
        if sale.get("currency"):
            bucket["currency"] = sale["currency"]

    holdings = []
    all_symbols = set(by_symbol.keys()) | set(realized_by_symbol.keys())
    for symbol in sorted(all_symbols):
        rows = by_symbol.get(symbol, [])
        shares = sum(r["shares"] for r in rows)
        invested = sum(r["cost"] for r in rows)
        avg_cost = invested / shares if shares else 0.0
        company_name = next(
            (r["company_name"] for r in rows if r.get("company_name")),
            next(
                (
                    s.get("company_name")
                    for s in sales
                    if s.get("symbol") == symbol and s.get("company_name")
                ),
                symbol,
            ),
        )
        currency = next(
            (r.get("currency") for r in rows if r.get("currency")),
            realized_by_symbol.get(symbol, {}).get("currency") or "USD",
        )
        currency = (currency or "USD").upper()
        realized = realized_by_symbol.get(symbol, {})
        realized_gain = round(float(realized.get("realized_gain") or 0), 2)

        if shares <= 0 and not realized:
            continue

        holdings.append(
            {
                "symbol": symbol,
                "company_name": company_name,
                "currency": currency,
                "shares": round(shares, 6),
                "total_invested": round(invested, 2),
                "avg_cost_per_share": round(avg_cost, 4) if shares else None,
                "current_price": None,
                "change_pct": None,
                "market_value": None,
                "unrealized_gain": None,
                "unrealized_gain_pct": None,
                "realized_gain": realized_gain,
                "realized_gain_pct": None,
                "shares_sold": 0,
                "sale_count": 0,
                "purchase_count": len(rows),
                "lots": [],
                "quote_error": None,
                "dividend": {
                    "pays_dividend": False,
                    "yield_pct": None,
                    "annual_rate": None,
                    "recent_payments": [],
                },
                "dividends_earned": 0.0,
                "dividends_earned_gross": 0.0,
                "dividends_tax": 0.0,
                "dividends_withholding_pct": 0.0,
                "dividends_earned_pct": None,
                "dividend_events": [],
            }
        )

    by_currency = _group_by_currency(purchases, holdings, sales)
    # Summary mode: hide live-dependent fields until full progress loads
    for group in by_currency:
        group["total_market_value"] = None
        group["total_unrealized_gain"] = None
        group["total_unrealized_gain_pct"] = None
        group["total_dividends_earned"] = None
        group["total_dividends_earned_pct"] = None
        group["total_daily_change"] = None
        group["total_daily_change_pct"] = None
        group["total_monthly_change"] = None
        group["total_monthly_change_pct"] = None
        group["holdings"] = []
        group["summary_only"] = True

    return {
        "purchases": [],
        "sales": [],
        "holdings": [],
        "by_currency": by_currency,
        "totals": {
            "purchase_count": len(purchases),
            "sale_count": len(sales),
            "symbol_count": len([h for h in holdings if h["shares"] > 0]),
            "currency_count": len(by_currency),
        },
        "summary_only": True,
    }


def build_progress(purchases: list[dict], sales: list[dict] | None = None) -> dict:
    """Group remaining buy lots by symbol, then roll up progress per currency."""
    sales = sales or []
    by_symbol: dict[str, list[dict]] = {}
    for purchase in purchases:
        by_symbol.setdefault(purchase["symbol"], []).append(purchase)

    realized_by_symbol: dict[str, dict] = {}
    for sale in sales:
        symbol = sale["symbol"]
        bucket = realized_by_symbol.setdefault(
            symbol,
            {
                "realized_gain": 0.0,
                "proceeds": 0.0,
                "cost_basis": 0.0,
                "shares_sold": 0.0,
                "sale_count": 0,
                "currency": sale.get("currency") or "USD",
            },
        )
        bucket["realized_gain"] += float(sale.get("realized_gain") or 0)
        bucket["proceeds"] += float(sale.get("proceeds") or 0)
        bucket["cost_basis"] += float(sale.get("cost_basis") or 0)
        bucket["shares_sold"] += float(sale.get("shares") or 0)
        bucket["sale_count"] += 1
        if sale.get("currency"):
            bucket["currency"] = sale["currency"]

    holdings = []

    # Include symbols that were fully sold so realized gains still show
    all_symbols = set(by_symbol.keys()) | set(realized_by_symbol.keys())

    for symbol in sorted(all_symbols):
        rows = by_symbol.get(symbol, [])
        shares = sum(r["shares"] for r in rows)
        invested = sum(r["cost"] for r in rows)
        avg_cost = invested / shares if shares else 0.0
        company_name = next(
            (r["company_name"] for r in rows if r.get("company_name")),
            next(
                (
                    s.get("company_name")
                    for s in sales
                    if s.get("symbol") == symbol and s.get("company_name")
                ),
                symbol,
            ),
        )
        # Prefer the currency lots were booked in (e.g. VUAA.EU in USD)
        currency = next(
            (r.get("currency") for r in rows if r.get("currency")),
            realized_by_symbol.get(symbol, {}).get("currency") or "USD",
        )
        currency = (currency or "USD").upper()

        quote_error = None
        current_price = None
        previous_close = None
        change_pct = None
        change_1m_pct = None
        daily_change = None
        monthly_change = None
        market_value = None
        unrealized = None
        unrealized_pct = None
        dividend = {
            "pays_dividend": False,
            "yield_pct": None,
            "annual_rate": None,
            "recent_payments": [],
        }
        dividends_earned = 0.0
        dividends_earned_gross = 0.0
        dividends_tax = 0.0
        dividends_withholding_pct = 0.0
        dividends_earned_pct = None
        dividend_events: list[dict] = []

        realized = realized_by_symbol.get(symbol, {})
        realized_gain = round(float(realized.get("realized_gain") or 0), 2)
        realized_basis = float(realized.get("cost_basis") or 0)
        realized_gain_pct = (
            round((realized_gain / realized_basis) * 100, 2) if realized_basis else None
        )

        try:
            quote = fetch_quote(symbol)
            quote_ccy = (quote.currency or currency).upper()
            current_price = quote.price
            previous_close = quote.previous_close
            if quote_ccy != currency:
                current_price = round(
                    convert_amount(quote.price, quote_ccy, currency),
                    4,
                )
                if previous_close is not None:
                    previous_close = round(
                        convert_amount(previous_close, quote_ccy, currency),
                        4,
                    )
            change_pct = quote.change_pct
            change_1m_pct = quote.change_1m_pct
            company_name = quote.name or company_name
            if shares > 0:
                market_value = round(shares * current_price, 2)
                unrealized = round(market_value - invested, 2)
                unrealized_pct = (
                    round((unrealized / invested) * 100, 2) if invested else 0.0
                )
                if previous_close is not None:
                    daily_change = round(shares * (current_price - previous_close), 2)
                else:
                    daily_change = _money_change(market_value, change_pct)
                monthly_change = _money_change(market_value, change_1m_pct)
            dividend = quote.dividend.to_dict()
            if rows:
                try:
                    _resolved, ticker, _info, _price, _prev = resolve_tradable_symbol(symbol)
                    splits = fetch_stock_splits(ticker)
                except Exception:
                    splits = []
                wh_pct = dividend_withholding_pct(symbol, country=quote.country)
                (
                    dividends_earned,
                    dividends_earned_gross,
                    dividends_tax,
                    dividend_events,
                ) = dividends_earned_for_lots(
                    rows,
                    quote.dividend.all_payments,
                    splits=splits,
                    withholding_pct=wh_pct,
                )
                dividends_withholding_pct = wh_pct
                if quote_ccy != currency:
                    if dividends_earned:
                        dividends_earned = round(
                            convert_amount(dividends_earned, quote_ccy, currency),
                            2,
                        )
                    if dividends_earned_gross:
                        dividends_earned_gross = round(
                            convert_amount(dividends_earned_gross, quote_ccy, currency),
                            2,
                        )
                    if dividends_tax:
                        dividends_tax = round(
                            convert_amount(dividends_tax, quote_ccy, currency),
                            2,
                        )
                dividends_earned_pct = (
                    round((dividends_earned / invested) * 100, 2) if invested else 0.0
                )
        except Exception as exc:
            quote_error = str(exc)

        # Skip fully sold symbols with no remaining shares and no realized data edge case
        if shares <= 0 and not realized:
            continue

        holdings.append(
            {
                "symbol": symbol,
                "company_name": company_name,
                "currency": currency,
                "shares": round(shares, 6),
                "total_invested": round(invested, 2),
                "avg_cost_per_share": round(avg_cost, 4) if shares else None,
                "current_price": current_price,
                "previous_close": previous_close,
                "change_pct": change_pct,
                "change_1m_pct": change_1m_pct,
                "daily_change": daily_change,
                "monthly_change": monthly_change,
                "market_value": market_value,
                "unrealized_gain": unrealized,
                "unrealized_gain_pct": unrealized_pct,
                "realized_gain": realized_gain,
                "realized_gain_pct": realized_gain_pct,
                "shares_sold": round(float(realized.get("shares_sold") or 0), 6),
                "sale_count": int(realized.get("sale_count") or 0),
                "purchase_count": len(rows),
                "lots": sorted(
                    rows,
                    key=lambda r: (r.get("purchased_at") or "", r.get("id") or 0),
                ),
                "quote_error": quote_error,
                "dividend": dividend,
                "dividends_earned": dividends_earned,
                "dividends_earned_gross": dividends_earned_gross,
                "dividends_tax": dividends_tax,
                "dividends_withholding_pct": dividends_withholding_pct,
                "dividends_earned_pct": dividends_earned_pct,
                "dividend_events": dividend_events,
            }
        )

    by_currency = _group_by_currency(purchases, holdings, sales)

    return {
        "purchases": purchases,
        "sales": sales,
        "holdings": holdings,
        "by_currency": by_currency,
        "totals": {
            "purchase_count": len(purchases),
            "sale_count": len(sales),
            "symbol_count": len([h for h in holdings if h["shares"] > 0]),
            "currency_count": len(by_currency),
        },
    }


def _group_by_currency(
    purchases: list[dict], holdings: list[dict], sales: list[dict]
) -> list[dict]:
    currency_map: dict[str, dict] = {}

    def bucket_for(currency: str) -> dict:
        return currency_map.setdefault(
            currency,
            {
                "currency": currency,
                "holdings": [],
                "purchases": [],
                "sales": [],
                "total_invested": 0.0,
                "total_market_value": 0.0,
                "total_daily_change": 0.0,
                "total_monthly_change": 0.0,
                "daily_change_holdings": 0,
                "monthly_change_holdings": 0,
                "total_dividends_earned": 0.0,
                "total_realized_gain": 0.0,
                "valued_holdings": 0,
                "purchase_count": 0,
                "sale_count": 0,
                "symbol_count": 0,
            },
        )

    for holding in holdings:
        # Open holdings only in the combined table; fully sold still counted for realized
        currency = (holding.get("currency") or "USD").upper()
        bucket = bucket_for(currency)
        if holding.get("shares", 0) > 0:
            bucket["holdings"].append(holding)
            bucket["symbol_count"] += 1
            bucket["total_invested"] += holding["total_invested"] or 0.0
            bucket["total_dividends_earned"] += holding.get("dividends_earned") or 0.0
            if holding["market_value"] is not None:
                bucket["total_market_value"] += holding["market_value"]
                bucket["valued_holdings"] += 1
            if holding.get("daily_change") is not None:
                bucket["total_daily_change"] += holding["daily_change"]
                bucket["daily_change_holdings"] += 1
            if holding.get("monthly_change") is not None:
                bucket["total_monthly_change"] += holding["monthly_change"]
                bucket["monthly_change_holdings"] += 1
        bucket["total_realized_gain"] += holding.get("realized_gain") or 0.0

    symbol_currency = {h["symbol"]: h["currency"] for h in holdings}
    for purchase in purchases:
        currency = (
            symbol_currency.get(purchase["symbol"])
            or purchase.get("currency")
            or "USD"
        ).upper()
        bucket = bucket_for(currency)
        bucket["purchases"].append(purchase)
        bucket["purchase_count"] += 1

    for sale in sales:
        currency = (
            symbol_currency.get(sale["symbol"]) or sale.get("currency") or "USD"
        ).upper()
        bucket = bucket_for(currency)
        bucket["sales"].append(sale)
        bucket["sale_count"] += 1

    results = []
    for currency in sorted(currency_map.keys()):
        bucket = currency_map[currency]
        invested = round(bucket["total_invested"], 2)
        has_value = bucket["valued_holdings"] > 0
        market_value = round(bucket["total_market_value"], 2) if has_value else None
        unrealized = (
            round(market_value - invested, 2) if market_value is not None else None
        )
        unrealized_pct = (
            round((unrealized / invested) * 100, 2)
            if unrealized is not None and invested
            else None
        )
        dividends_earned = round(bucket["total_dividends_earned"], 2)
        dividends_earned_pct = (
            round((dividends_earned / invested) * 100, 2) if invested else 0.0
        )
        realized_gain = round(bucket["total_realized_gain"], 2)
        daily_change = (
            round(bucket["total_daily_change"], 2)
            if bucket["daily_change_holdings"]
            else None
        )
        monthly_change = (
            round(bucket["total_monthly_change"], 2)
            if bucket["monthly_change_holdings"]
            else None
        )
        previous_market = (
            round(market_value - daily_change, 2)
            if market_value is not None and daily_change is not None
            else None
        )
        daily_change_pct = (
            round((daily_change / previous_market) * 100, 2)
            if daily_change is not None and previous_market
            else None
        )
        previous_month_market = (
            round(market_value - monthly_change, 2)
            if market_value is not None and monthly_change is not None
            else None
        )
        monthly_change_pct = (
            round((monthly_change / previous_month_market) * 100, 2)
            if monthly_change is not None and previous_month_market
            else None
        )
        results.append(
            {
                "currency": currency,
                "purchase_count": bucket["purchase_count"],
                "sale_count": bucket["sale_count"],
                "symbol_count": bucket["symbol_count"],
                "total_invested": invested,
                "total_market_value": market_value,
                "total_daily_change": daily_change,
                "total_daily_change_pct": daily_change_pct,
                "total_monthly_change": monthly_change,
                "total_monthly_change_pct": monthly_change_pct,
                "total_unrealized_gain": unrealized,
                "total_unrealized_gain_pct": unrealized_pct,
                "total_realized_gain": realized_gain,
                "total_dividends_earned": dividends_earned,
                "total_dividends_earned_pct": dividends_earned_pct,
                "holdings": bucket["holdings"],
                "purchases": bucket["purchases"],
                "sales": bucket["sales"],
            }
        )

    return results
