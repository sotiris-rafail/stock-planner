"""User watchlist — track stocks, ETFs, and mutual funds with live performance."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import yfinance as yf

from db import add_watchlist_item, delete_watchlist_item, list_watchlist_items
from stock_service import resolve_tradable_symbol

ASSET_TYPES = {"stock", "etf", "mutual_fund"}

_QUOTE_TYPE_MAP = {
    "EQUITY": "stock",
    "ETF": "etf",
    "MUTUALFUND": "mutual_fund",
}

# Yahoo suffixes → listing market when country/exchange metadata is missing.
_SUFFIX_MARKETS = {
    "DE": "Germany",
    "F": "Germany",
    "PA": "France",
    "AS": "Netherlands",
    "L": "United Kingdom",
    "SW": "Switzerland",
    "MI": "Italy",
    "MC": "Spain",
    "BR": "Belgium",
    "LS": "Portugal",
    "HE": "Finland",
    "OL": "Norway",
    "CO": "Denmark",
    "ST": "Sweden",
    "AT": "Greece",
    "IR": "Ireland",
    "TO": "Canada",
    "V": "Canada",
    "HK": "Hong Kong",
    "T": "Japan",
    "AX": "Australia",
    "NS": "India",
    "BO": "India",
    "SA": "Brazil",
    "MX": "Mexico",
    "SS": "China",
    "SZ": "China",
}


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


def _pct_change(from_price: float | None, to_price: float | None) -> float | None:
    if from_price is None or to_price is None or from_price <= 0:
        return None
    return round((to_price / from_price - 1.0) * 100.0, 2)


def _price_on_or_before(closes, target) -> float | None:
    subset = closes[closes.index <= target]
    if subset.empty:
        return _safe_float(closes.iloc[0])
    return _safe_float(subset.iloc[-1])


def _period_changes(ticker: yf.Ticker, current_price: float | None) -> dict[str, float | None]:
    hist = ticker.history(period="2y", interval="1d", auto_adjust=True)
    if hist is None or hist.empty:
        return {
            "change_1m_pct": None,
            "change_6m_pct": None,
            "change_1y_pct": None,
        }

    closes = hist["Close"].dropna()
    if closes.empty:
        return {
            "change_1m_pct": None,
            "change_6m_pct": None,
            "change_1y_pct": None,
        }

    live = current_price if current_price is not None else _safe_float(closes.iloc[-1])
    if live is None:
        return {
            "change_1m_pct": None,
            "change_6m_pct": None,
            "change_1y_pct": None,
        }

    as_of = closes.index[-1]
    return {
        "change_1m_pct": _pct_change(
            _price_on_or_before(closes, as_of - timedelta(days=30)), live
        ),
        "change_6m_pct": _pct_change(
            _price_on_or_before(closes, as_of - timedelta(days=183)), live
        ),
        "change_1y_pct": _pct_change(
            _price_on_or_before(closes, as_of - timedelta(days=365)), live
        ),
    }


def infer_asset_type(info: dict, fallback: str = "stock") -> str:
    quote_type = (info.get("quoteType") or "").upper()
    mapped = _QUOTE_TYPE_MAP.get(quote_type)
    if mapped:
        return mapped
    return fallback if fallback in ASSET_TYPES else "stock"


def asset_type_label(asset_type: str) -> str:
    labels = {
        "stock": "Stock",
        "etf": "ETF",
        "mutual_fund": "Mutual fund",
    }
    return labels.get(asset_type, asset_type.replace("_", " ").title())


_US_EXCHANGES = {
    "NMS",
    "NCM",
    "NGM",
    "NYQ",
    "NYE",
    "ASE",
    "AMX",
    "PCX",
    "BTS",
    "NASDAQ",
    "NASDAQGS",
    "NASDAQGM",
    "NASDAQCM",
    "NYSE",
    "NYSEARCA",
    "NYSEMKT",
    "AMEX",
    "BATS",
    "CBOE",
    "OTC",
    "PNK",
    "OTCBB",
    "OTCQX",
    "OTCQB",
}


def _normalize_exchange(exchange: str) -> str:
    return (
        exchange.upper()
        .replace(" ", "")
        .replace("-", "")
        .replace(".", "")
    )


def infer_market(*, symbol: str, info: dict | None = None) -> dict[str, str]:
    """Group by listing venue (where the ticker trades), not company nationality."""
    info = info or {}
    raw = (symbol or "").upper().strip()
    if "." in raw:
        suffix = raw.rsplit(".", 1)[-1]
        market = _SUFFIX_MARKETS.get(suffix, suffix)
        return {"market": market, "market_label": market}

    exchange = str(
        info.get("fullExchangeName")
        or info.get("exchangeName")
        or info.get("exchange")
        or ""
    ).strip()
    compact = _normalize_exchange(exchange)
    if compact in _US_EXCHANGES or compact.startswith("NASDAQ") or compact.startswith("NYSE"):
        return {"market": "United States", "market_label": "United States"}

    return {"market": "United States", "market_label": "United States"}


def sort_watchlist_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda row: (
            (row.get("market") or "Other").casefold(),
            (row.get("company_name") or row.get("symbol") or "").casefold(),
            (row.get("symbol") or "").casefold(),
        ),
    )


def create_watchlist_entry(
    *,
    user_id: int,
    symbol: str,
    asset_type: str | None = None,
) -> dict:
    requested = symbol.upper().strip()
    resolved, ticker, info, price, _previous = resolve_tradable_symbol(requested)
    if price is None:
        raise ValueError(f"Could not resolve a live price for {requested}")

    resolved_type = infer_asset_type(info, fallback=(asset_type or "stock"))
    if asset_type and asset_type in ASSET_TYPES:
        resolved_type = asset_type

    name = info.get("shortName") or info.get("longName") or resolved
    currency = (info.get("currency") or "USD").upper()
    added_at = datetime.now(timezone.utc).date().isoformat()

    row = add_watchlist_item(
        user_id=user_id,
        symbol=resolved,
        requested_symbol=requested if requested != resolved else None,
        company_name=name,
        asset_type=resolved_type,
        currency=currency,
        added_at=added_at,
        price_at_add=round(float(price), 4),
    )
    return _enrich_from_quote(
        row,
        resolved=resolved,
        ticker=ticker,
        info=info,
        price=float(price),
    )


def _enrich_from_quote(
    row: dict[str, Any],
    *,
    resolved: str,
    ticker: yf.Ticker,
    info: dict,
    price: float | None,
) -> dict[str, Any]:
    if price is None:
        hist = ticker.history(period="5d", auto_adjust=True)
        if hist is not None and not hist.empty:
            price = _safe_float(hist["Close"].iloc[-1])

    display_name = (
        info.get("shortName")
        or info.get("longName")
        or row.get("company_name")
        or resolved
    )
    currency = (info.get("currency") or row.get("currency") or "USD").upper()
    live_price = round(float(price), 4) if price is not None else None
    price_at_add = _safe_float(row.get("price_at_add"))
    changes = _period_changes(ticker, live_price)
    market = infer_market(symbol=resolved, info=info)

    return {
        **row,
        "symbol": resolved,
        "company_name": display_name,
        "currency": currency,
        "asset_type_label": asset_type_label(row.get("asset_type") or "stock"),
        "live_price": live_price,
        "price_at_add": price_at_add,
        "change_since_added_pct": _pct_change(price_at_add, live_price),
        **market,
        **changes,
        "error": None,
    }


def _enrich_row(row: dict[str, Any]) -> dict[str, Any]:
    symbol = row["symbol"]
    try:
        resolved, ticker, info, price, _previous = resolve_tradable_symbol(symbol)
        return _enrich_from_quote(
            row,
            resolved=resolved,
            ticker=ticker,
            info=info,
            price=price,
        )
    except Exception as exc:
        price_at_add = _safe_float(row.get("price_at_add"))
        market = infer_market(symbol=symbol, info={})
        return {
            **row,
            "asset_type_label": asset_type_label(row.get("asset_type") or "stock"),
            "live_price": None,
            "price_at_add": price_at_add,
            "change_since_added_pct": None,
            "change_1m_pct": None,
            "change_6m_pct": None,
            "change_1y_pct": None,
            **market,
            "error": str(exc),
        }


def build_watchlist(*, user_id: int) -> dict[str, Any]:
    rows = list_watchlist_items(user_id=user_id)
    items: list[dict[str, Any]] = []

    if rows:
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(_enrich_row, row): row for row in rows}
            for future in as_completed(futures):
                items.append(future.result())

        items = sort_watchlist_items(items)

    now = datetime.now(timezone.utc)
    return {
        "as_of": now.isoformat(),
        "count": len(items),
        "items": items,
        "disclaimer": (
            "Tracked symbols are stored locally. Live prices and percentage changes "
            "use Yahoo Finance adjusted closes. Past performance is not a guarantee "
            "of future results."
        ),
    }


def remove_watchlist_entry(item_id: int, *, user_id: int) -> bool:
    return delete_watchlist_item(item_id, user_id=user_id)
