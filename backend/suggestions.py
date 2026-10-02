"""Dynamic stock / ETF / mutual-fund suggestions with periodic symbol refresh."""

from __future__ import annotations

import csv
import json
import math
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from io import StringIO
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import yfinance as yf

from db import get_suggestion_cache, save_suggestion_cache
from settings import silent_stock_refresh_minutes
from yf_limit import yfinance_slot
from suggestion_sources import (
    LIST_SOURCES,
    etf_candidates,
    fetch_eu_stock_candidates,
    fetch_sp500_candidates,
    mutual_fund_candidates,
    score_etf_candidate,
    score_mutual_fund_candidate,
    score_stock_candidate,
    selection_reason,
)

SYMBOL_REFRESH_HOURS = 4
STOCK_PICKS_US = 50
STOCK_PICKS_EU = 30
ETF_PICKS = 30
MF_PICKS = 22

DATA_SOURCES = ("Yahoo Finance", "Stooq", "Wikipedia index pages")

_refresh_lock = threading.Lock()


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
        if math.isnan(result):
            return None
        return result
    except (TypeError, ValueError):
        return None


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_currency(
    currency: str | None, price: float | None
) -> tuple[str | None, float | None]:
    if currency == "GBp":
        price = price / 100.0 if price is not None else None
        return "GBP", price
    return currency, price


def _to_stooq_symbol(symbol: str) -> str | None:
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


def _http_get(url: str, timeout: float = 12.0) -> str:
    req = Request(url, headers={"User-Agent": "StockBuyPlanner/1.2"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _fetch_stooq_quote(stooq_symbol: str) -> dict[str, Any] | None:
    try:
        url = f"https://stooq.com/q/l/?s={stooq_symbol}&i=d"
        text = _http_get(url)
        rows = list(csv.reader(StringIO(text)))
        if len(rows) < 2 or len(rows[1]) < 7 or rows[1][6] in ("", "N/D"):
            return None
        close = _safe_float(rows[1][6])
        return {"price": close, "currency": None} if close is not None else None
    except (URLError, TimeoutError, ValueError, csv.Error):
        return None


def _fetch_stooq_history_change(stooq_symbol: str, days: int = 183) -> float | None:
    try:
        url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d"
        text = _http_get(url, timeout=15.0)
        rows = list(csv.reader(StringIO(text)))
        closes = [
            v
            for row in rows[1:]
            if len(row) >= 5 and (v := _safe_float(row[4])) is not None
        ]
        if len(closes) < 2:
            return None
        window = closes[-min(len(closes), days) :]
        p0, p1 = window[0], window[-1]
        return (p1 / p0 - 1.0) * 100.0 if p0 else None
    except (URLError, TimeoutError, ValueError, csv.Error):
        return None


def _yahoo_metrics(symbol: str) -> dict[str, Any]:
    with yfinance_slot():
        ticker = yf.Ticker(symbol)
        try:
            info = ticker.info or {}
        except Exception:
            info = {}

        price = (
            _safe_float(info.get("regularMarketPrice"))
            or _safe_float(info.get("currentPrice"))
            or _safe_float(info.get("previousClose"))
        )
        currency = info.get("currency")
        yield_pct = _safe_float(info.get("dividendYield"))
        if yield_pct is not None and yield_pct < 1:
            yield_pct *= 100.0

        expense = _safe_float(info.get("annualReportExpenseRatio"))
        if expense is not None and expense < 1:
            expense *= 100.0
        if expense is None:
            expense = _safe_float(info.get("netExpenseRatio"))
            if expense is not None and expense < 1:
                expense *= 100.0

        now = datetime.now(timezone.utc)
        start = now - timedelta(days=183)
        hist = ticker.history(start=start.strftime("%Y-%m-%d"), auto_adjust=True)
        change_6m_pct = None
        if hist is not None and not hist.empty:
            closes = hist["Close"].dropna()
            if len(closes) >= 2:
                p0 = float(closes.iloc[0])
                p1 = float(closes.iloc[-1])
                if p0:
                    change_6m_pct = (p1 / p0 - 1.0) * 100.0
                if price is None:
                    price = p1

        currency, price = _normalize_currency(currency, price)
        return {
            "price": price,
            "currency": currency,
            "change_6m_pct": change_6m_pct,
            "dividend_yield_pct": yield_pct,
            "expense_ratio_pct": expense,
            "display_name": info.get("shortName") or info.get("longName"),
            "market_cap": _safe_float(info.get("marketCap")),
            "total_assets": _safe_float(info.get("totalAssets")),
            "avg_volume": _safe_float(info.get("averageVolume")),
            "price_source": "yahoo",
        }


def _merge_quote(symbol: str, yahoo: dict[str, Any]) -> dict[str, Any]:
    stooq_sym = _to_stooq_symbol(symbol)
    if not stooq_sym:
        return yahoo

    needs_price = yahoo.get("price") is None
    needs_change = yahoo.get("change_6m_pct") is None
    if not needs_price and not needs_change:
        return yahoo

    if needs_price:
        stooq = _fetch_stooq_quote(stooq_sym)
        if stooq and stooq.get("price") is not None:
            yahoo["price"] = stooq["price"]
            yahoo["price_source"] = "stooq"

    if yahoo.get("change_6m_pct") is None:
        change = _fetch_stooq_history_change(stooq_sym)
        if change is not None:
            yahoo["change_6m_pct"] = change
            src = yahoo.get("price_source") or "yahoo"
            yahoo["price_source"] = "yahoo+stooq" if src == "yahoo" else src

    return yahoo


def _screen_candidate(item: dict[str, str]) -> tuple[dict[str, str], dict[str, Any], float]:
    symbol = item["symbol"]
    try:
        metrics = _yahoo_metrics(symbol)
    except Exception:
        metrics = {}
    category = item["category"]
    if category == "stocks":
        score = score_stock_candidate(metrics)
    elif category == "etfs":
        score = score_etf_candidate(metrics)
    else:
        score = score_mutual_fund_candidate(metrics)
    return item, metrics, score


def _rank_pool(
    pool: list[dict[str, str]],
    *,
    limit: int,
    max_screen: int | None = None,
) -> list[dict[str, str]]:
    if not pool:
        return []
    screen_pool = pool[: max_screen or len(pool)]
    scored: list[tuple[float, dict[str, str], dict[str, Any]]] = []

    with ThreadPoolExecutor(max_workers=8) as pool_exec:
        futures = [pool_exec.submit(_screen_candidate, item) for item in screen_pool]
        for fut in as_completed(futures):
            item, metrics, score = fut.result()
            scored.append((score, item, metrics))

    scored.sort(key=lambda row: row[0], reverse=True)
    selected: list[dict[str, str]] = []
    seen: set[str] = set()
    rank_metrics: dict[str, dict[str, Any]] = {}
    rank_scores: dict[str, float] = {}

    for score, item, metrics in scored:
        sym = item["symbol"]
        if sym in seen:
            continue
        seen.add(sym)
        enriched = dict(item)
        enriched["selection_score"] = round(score, 2)
        enriched["selection_reason"] = selection_reason(item["category"], metrics, score)
        rank_metrics[sym] = metrics
        rank_scores[sym] = score
        selected.append(enriched)
        if len(selected) >= limit:
            break

    for item in selected:
        item["_metrics"] = rank_metrics.get(item["symbol"], {})
    return selected


def _merge_unique(*groups: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            sym = item["symbol"]
            if sym in seen:
                continue
            seen.add(sym)
            out.append(item)
    return out


def _select_symbol_universe() -> list[dict[str, str]]:
    us_pool = fetch_sp500_candidates()
    eu_pool = fetch_eu_stock_candidates()

    us_ranked = _rank_pool(us_pool, limit=STOCK_PICKS_US, max_screen=200)
    eu_ranked = _rank_pool(eu_pool, limit=STOCK_PICKS_EU, max_screen=120)
    etf_ranked = _rank_pool(etf_candidates(), limit=ETF_PICKS)
    mf_ranked = _rank_pool(mutual_fund_candidates(), limit=MF_PICKS)

    stocks = _merge_unique(us_ranked, eu_ranked)
    etfs = etf_ranked
    funds = mf_ranked

    universe: list[dict[str, str]] = []
    for item in stocks:
        item = dict(item)
        item["category"] = "stocks"
        universe.append(item)
    for item in etfs:
        item = dict(item)
        item["category"] = "etfs"
        universe.append(item)
    for item in funds:
        item = dict(item)
        item["category"] = "mutual_funds"
        universe.append(item)
    return universe


def _fetch_one(item: dict[str, str]) -> dict[str, Any]:
    symbol = item["symbol"]
    cached_metrics = item.pop("_metrics", None)
    base = {
        "category": item["category"],
        "region": item["region"],
        "name": item["name"],
        "symbol": symbol,
        "list_source": item["list_source"],
        "theme": item["theme"],
        "selection_score": item.get("selection_score"),
        "selection_reason": item.get("selection_reason"),
        "price": None,
        "currency": None,
        "change_6m_pct": None,
        "dividend_yield_pct": None,
        "expense_ratio_pct": None,
        "price_source": None,
        "error": None,
    }
    try:
        if cached_metrics:
            quote = _merge_quote(symbol, dict(cached_metrics))
        else:
            quote = _merge_quote(symbol, _yahoo_metrics(symbol))
        base["name"] = quote.get("display_name") or item["name"]
        base["price"] = quote.get("price")
        base["currency"] = quote.get("currency")
        base["change_6m_pct"] = quote.get("change_6m_pct")
        base["dividend_yield_pct"] = quote.get("dividend_yield_pct")
        base["expense_ratio_pct"] = quote.get("expense_ratio_pct")
        base["price_source"] = quote.get("price_source")
        if base["price"] is None and base["change_6m_pct"] is None:
            base["error"] = "No live quote from Yahoo Finance or Stooq"
    except Exception as exc:
        base["error"] = str(exc)

    return base


def _build_payload(
    universe: list[dict[str, str]],
    *,
    symbols_updated_at: datetime,
    quotes_updated_at: datetime,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_fetch_one, dict(item)) for item in universe]
        for fut in as_completed(futures):
            rows.append(fut.result())

    rows.sort(
        key=lambda r: (
            {"stocks": 0, "etfs": 1, "mutual_funds": 2}.get(r.get("category") or "", 9),
            0 if r.get("region") == "US" else 1,
            -(r.get("selection_score") or 0),
            r.get("symbol") or "",
        )
    )

    tabs: dict[str, dict[str, Any]] = {}
    for category, label in (
        ("stocks", "Stocks"),
        ("etfs", "ETFs"),
        ("mutual_funds", "Mutual funds"),
    ):
        items = [r for r in rows if r["category"] == category]
        tabs[category] = {
            "label": label,
            "items": items,
            "count": len(items),
        }

    next_symbols = symbols_updated_at + timedelta(hours=SYMBOL_REFRESH_HOURS)
    quote_refresh_minutes = silent_stock_refresh_minutes()
    next_quotes = quotes_updated_at + timedelta(minutes=quote_refresh_minutes)

    return {
        "as_of": quotes_updated_at.isoformat(),
        "symbols_updated_at": symbols_updated_at.isoformat(),
        "quotes_updated_at": quotes_updated_at.isoformat(),
        "next_symbols_refresh_at": next_symbols.isoformat(),
        "next_quotes_refresh_at": next_quotes.isoformat(),
        "symbol_refresh_hours": SYMBOL_REFRESH_HOURS,
        "quote_refresh_minutes": quote_refresh_minutes,
        "dynamic": True,
        "list_sources": list(LIST_SOURCES),
        "data_sources": list(DATA_SOURCES),
        "disclaimer": (
            "Suggestions are rebuilt from live index constituents (Wikipedia) and "
            "provider fund universes, then ranked by market data every "
            f"{SYMBOL_REFRESH_HOURS} hours. Quotes refresh about every "
            f"{quote_refresh_minutes} minutes from Yahoo Finance with Stooq fallback. "
            "Not investment advice."
        ),
        "tabs": tabs,
    }


def _full_rebuild(now: datetime) -> dict[str, Any]:
    universe = _select_symbol_universe()
    return _build_payload(
        universe,
        symbols_updated_at=now,
        quotes_updated_at=now,
    )


def _refresh_quotes_only(payload: dict[str, Any], now: datetime) -> dict[str, Any]:
    universe: list[dict[str, str]] = []
    for tab in payload.get("tabs", {}).values():
        for row in tab.get("items", []):
            universe.append(
                {
                    "category": row["category"],
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "region": row["region"],
                    "list_source": row["list_source"],
                    "theme": row["theme"],
                    "selection_score": row.get("selection_score"),
                    "selection_reason": row.get("selection_reason"),
                }
            )
    symbols_at = _parse_iso(payload.get("symbols_updated_at")) or now
    rebuilt = _build_payload(
        universe,
        symbols_updated_at=symbols_at,
        quotes_updated_at=now,
    )
    return rebuilt


def build_suggestions(*, force: bool = False) -> dict[str, Any]:
    with _refresh_lock:
        now = datetime.now(timezone.utc)
        cached_row = None if force else get_suggestion_cache()

        if cached_row:
            try:
                payload = json.loads(cached_row["payload"])
            except json.JSONDecodeError:
                payload = None
        else:
            payload = None

        if payload and not force:
            symbols_at = _parse_iso(payload.get("symbols_updated_at"))
            quotes_at = _parse_iso(payload.get("quotes_updated_at"))
            symbols_age_h = (
                (now - symbols_at).total_seconds() / 3600 if symbols_at else 999
            )
            quotes_age_m = (
                (now - quotes_at).total_seconds() / 60 if quotes_at else 999
            )

            quote_refresh_minutes = silent_stock_refresh_minutes()
            if symbols_age_h < SYMBOL_REFRESH_HOURS and quotes_age_m < quote_refresh_minutes:
                return payload

            if symbols_age_h < SYMBOL_REFRESH_HOURS:
                payload = _refresh_quotes_only(payload, now)
            else:
                payload = _full_rebuild(now)
        else:
            payload = _full_rebuild(now)

        save_suggestion_cache(json.dumps(payload))
        return payload
