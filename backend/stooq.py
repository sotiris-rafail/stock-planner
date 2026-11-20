"""Stooq delayed quotes and daily history (no API key)."""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
from io import StringIO
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from symbol_resolver import candidate_symbols

PRICE_SOURCE = "stooq"


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
        if result != result:
            return None
        return result
    except (TypeError, ValueError):
        return None


def to_stooq_symbol(symbol: str) -> str | None:
    raw = (symbol or "").strip()
    if not raw:
        return None
    if "." in raw:
        base, suffix = raw.rsplit(".", 1)
        mapping = {
            "DE": "de",
            "L": "uk",
            "PA": "pa",
            "MI": "mi",
            "MC": "mc",
            "SW": "ch",
            "AS": "nl",
            "TO": "ca",
            "HK": "hk",
        }
        stooq_suffix = mapping.get(suffix.upper())
        if not stooq_suffix:
            return None
        return f"{base.lower()}.{stooq_suffix}"
    return f"{raw.lower()}.us"


def currency_for_symbol(symbol: str) -> str:
    suffix = (symbol or "").rsplit(".", 1)[-1].upper() if "." in (symbol or "") else "US"
    return {
        "DE": "EUR",
        "PA": "EUR",
        "AS": "EUR",
        "MI": "EUR",
        "MC": "EUR",
        "L": "GBP",
        "UK": "GBP",
        "TO": "CAD",
        "SW": "CHF",
        "CH": "CHF",
        "HK": "HKD",
    }.get(suffix, "USD")


def _http_get(url: str, timeout: float = 12.0) -> str:
    req = Request(url, headers={"User-Agent": "StockBuyPlanner/1.2"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_stooq_quote(stooq_symbol: str) -> dict[str, Any] | None:
    try:
        url = f"https://stooq.com/q/l/?s={stooq_symbol}&i=d"
        text = _http_get(url)
        rows = list(csv.reader(StringIO(text)))
        if len(rows) < 2 or len(rows[1]) < 7 or rows[1][6] in ("", "N/D"):
            return None
        close = _safe_float(rows[1][6])
        return {"price": close} if close is not None else None
    except (URLError, TimeoutError, ValueError, csv.Error, OSError):
        return None


def fetch_stooq_closes(stooq_symbol: str) -> list[tuple[datetime, float]]:
    try:
        url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d"
        text = _http_get(url, timeout=15.0)
        rows = list(csv.reader(StringIO(text)))
        points: list[tuple[datetime, float]] = []
        for row in rows[1:]:
            if len(row) < 5:
                continue
            close = _safe_float(row[4])
            if close is None:
                continue
            try:
                day = datetime.strptime(row[0], "%Y-%m-%d")
            except ValueError:
                continue
            points.append((day, close))
        return points
    except (URLError, TimeoutError, ValueError, csv.Error, OSError):
        return []


def fetch_stooq_history_change(stooq_symbol: str, days: int = 183) -> float | None:
    points = fetch_stooq_closes(stooq_symbol)
    if len(points) < 2:
        return None
    window = points[-min(len(points), days) :]
    p0, p1 = window[0][1], window[-1][1]
    return (p1 / p0 - 1.0) * 100.0 if p0 else None


def estimate_avg_monthly_growth(closes: list[tuple[datetime, float]], lookback_months: int) -> float:
    if len(closes) < 2:
        return 0.0
    by_month: dict[tuple[int, int], float] = {}
    for day, close in closes:
        by_month[(day.year, day.month)] = close
    monthly = [by_month[key] for key in sorted(by_month)]
    if len(monthly) < 2:
        return 0.0
    window = monthly[-(lookback_months + 1) :]
    if len(window) < 2:
        return 0.0
    start, end = window[0], window[-1]
    n = len(window) - 1
    if start <= 0 or n <= 0:
        return 0.0
    return float((end / start) ** (1 / n) - 1) * 100


def resolve_stooq_quote(symbol: str, lookback_months: int = 12) -> dict[str, Any]:
    requested = symbol.upper().strip()
    tried: list[str] = []
    for candidate in candidate_symbols(requested):
        stooq_sym = to_stooq_symbol(candidate)
        if not stooq_sym:
            continue
        tried.append(stooq_sym)
        quote = fetch_stooq_quote(stooq_sym)
        if not quote or quote.get("price") is None:
            continue
        closes = fetch_stooq_closes(stooq_sym)
        previous_close = closes[-2][1] if len(closes) >= 2 else None
        price = float(quote["price"])
        change_pct = None
        if previous_close and previous_close > 0:
            change_pct = ((price - previous_close) / previous_close) * 100
        return {
            "symbol": candidate,
            "name": candidate,
            "currency": currency_for_symbol(candidate),
            "price": price,
            "previous_close": previous_close,
            "change_pct": change_pct,
            "avg_monthly_growth_pct": estimate_avg_monthly_growth(closes, lookback_months),
            "price_source": PRICE_SOURCE,
            "closes": closes,
        }

    tried_list = ", ".join(tried) or requested
    raise ValueError(
        f"Could not fetch Stooq price data for symbol '{requested}'. Tried: {tried_list}."
    )


def period_changes(
    closes: list[tuple[datetime, float]], current_price: float | None = None
) -> dict[str, float | None]:
    empty = {
        "change_1m_pct": None,
        "change_6m_pct": None,
        "change_1y_pct": None,
    }
    if len(closes) < 2:
        return empty
    live = current_price if current_price is not None else closes[-1][1]
    as_of = closes[-1][0]

    def _price_on_or_before(target: datetime) -> float | None:
        chosen = None
        for day, close in closes:
            if day <= target:
                chosen = close
            else:
                break
        return chosen if chosen is not None else closes[0][1]

    def _pct(from_price: float | None) -> float | None:
        if from_price is None or live is None or from_price <= 0:
            return None
        return round((live / from_price - 1.0) * 100.0, 2)

    return {
        "change_1m_pct": _pct(_price_on_or_before(as_of - timedelta(days=30))),
        "change_6m_pct": _pct(_price_on_or_before(as_of - timedelta(days=183))),
        "change_1y_pct": _pct(_price_on_or_before(as_of - timedelta(days=365))),
    }
