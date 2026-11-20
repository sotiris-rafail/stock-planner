"""Live stock quotes and historical growth estimates via Yahoo Finance."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import yfinance as yf

from dividends import DividendInfo, fetch_dividend_info
from stooq import period_changes, resolve_stooq_quote
from symbol_resolver import candidate_symbols
from yf_limit import yfinance_slot

PRICE_SOURCES = ("yahoo", "stooq")
PRICE_SOURCE_LABELS = {
    "yahoo": "Yahoo Finance",
    "stooq": "Stooq",
}


@dataclass
class StockQuote:
    symbol: str
    name: str
    currency: str
    price: float
    previous_close: float | None
    change_pct: float | None
    avg_monthly_growth_pct: float
    lookback_months: int
    as_of: str
    dividend: DividendInfo
    requested_symbol: str | None = None
    country: str | None = None
    price_source: str = "yahoo"
    change_1m_pct: float | None = None


def _safe_float(value) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
        if result != result:  # NaN
            return None
        return result
    except (TypeError, ValueError):
        return None


def _extract_price(info: dict, ticker: yf.Ticker) -> tuple[float | None, float | None]:
    price = (
        _safe_float(info.get("regularMarketPrice"))
        or _safe_float(info.get("currentPrice"))
        or _safe_float(info.get("previousClose"))
    )
    previous_close = _safe_float(info.get("regularMarketPreviousClose")) or _safe_float(
        info.get("previousClose")
    )

    if price is None:
        hist = ticker.history(period="5d")
        if not hist.empty:
            price = float(hist["Close"].iloc[-1])
            if previous_close is None and len(hist) >= 2:
                previous_close = float(hist["Close"].iloc[-2])
    return price, previous_close


def _load_ticker(symbol: str) -> tuple[yf.Ticker, dict, float, float | None] | None:
    with yfinance_slot():
        ticker = yf.Ticker(symbol)
        try:
            info = ticker.info or {}
        except Exception:
            info = {}
        price, previous_close = _extract_price(info, ticker)
        if price is None:
            return None
        return ticker, info, price, previous_close


def resolve_tradable_symbol(symbol: str) -> tuple[str, yf.Ticker, dict, float, float | None]:
    """
    Resolve a user/broker symbol to a Yahoo-tradable ticker.

    Example: VUAA.EU -> VUAA.DE
    """
    requested = symbol.upper().strip()
    tried = []
    for candidate in candidate_symbols(requested):
        tried.append(candidate)
        loaded = _load_ticker(candidate)
        if loaded is not None:
            ticker, info, price, previous_close = loaded
            return candidate, ticker, info, price, previous_close

    tried_list = ", ".join(tried)
    raise ValueError(
        f"Could not fetch price data for symbol '{requested}'. Tried: {tried_list}."
    )


def _normalize_price_source(source: str | None) -> str:
    raw = (source or "yahoo").strip().lower()
    if raw not in PRICE_SOURCES:
        raise ValueError("price_source must be 'yahoo' or 'stooq'")
    return raw


def fetch_quote(
    symbol: str,
    lookback_months: int = 12,
    *,
    include_dividends: bool = True,
    source: str = "yahoo",
) -> StockQuote:
    """Fetch live price and estimate average monthly growth from history."""
    requested = symbol.upper().strip()
    price_source = _normalize_price_source(source)
    if price_source == "stooq":
        return _quote_from_stooq(
            requested,
            lookback_months=lookback_months,
            include_dividends=include_dividends,
        )
    resolved, ticker, info, price, previous_close = resolve_tradable_symbol(requested)

    change_pct = None
    if previous_close and previous_close > 0:
        change_pct = ((price - previous_close) / previous_close) * 100

    monthly_closes = _monthly_close_series(ticker, lookback_months)
    avg_monthly = _avg_monthly_growth_from_closes(monthly_closes, lookback_months)
    change_1m = _change_1m_pct_from_closes(monthly_closes)
    if include_dividends:
        dividend = fetch_dividend_info(ticker, price=price)
    else:
        dividend = DividendInfo(
            pays_dividend=False,
            yield_pct=None,
            annual_rate=None,
            recent_payments=[],
            all_payments=[],
        )

    name = info.get("shortName") or info.get("longName") or resolved
    currency = info.get("currency") or "USD"
    country = info.get("country")

    return StockQuote(
        symbol=resolved,
        name=name,
        currency=currency,
        price=round(price, 4),
        previous_close=round(previous_close, 4) if previous_close is not None else None,
        change_pct=round(change_pct, 2) if change_pct is not None else None,
        avg_monthly_growth_pct=round(avg_monthly, 4),
        lookback_months=lookback_months,
        as_of=datetime.now(timezone.utc).isoformat(),
        dividend=dividend,
        requested_symbol=requested if requested != resolved else None,
        country=country,
        price_source="yahoo",
        change_1m_pct=round(change_1m, 2) if change_1m is not None else None,
    )


def _quote_from_stooq(
    requested: str,
    *,
    lookback_months: int,
    include_dividends: bool,
) -> StockQuote:
    data = resolve_stooq_quote(requested, lookback_months=lookback_months)
    resolved = data["symbol"]
    price = float(data["price"])
    previous_close = data.get("previous_close")
    if include_dividends:
        try:
            _, ticker, _info, yahoo_price, _ = resolve_tradable_symbol(resolved)
            dividend = fetch_dividend_info(ticker, price=yahoo_price or price)
        except Exception:
            dividend = DividendInfo(False, None, None, [], [])
    else:
        dividend = DividendInfo(
            pays_dividend=False,
            yield_pct=None,
            annual_rate=None,
            recent_payments=[],
            all_payments=[],
        )
    month_changes = period_changes(data.get("closes") or [], price)
    change_1m = month_changes.get("change_1m_pct")
    return StockQuote(
        symbol=resolved,
        name=data.get("name") or resolved,
        currency=data.get("currency") or "USD",
        price=round(price, 4),
        previous_close=round(previous_close, 4) if previous_close is not None else None,
        change_pct=round(data["change_pct"], 2) if data.get("change_pct") is not None else None,
        avg_monthly_growth_pct=round(float(data.get("avg_monthly_growth_pct") or 0.0), 4),
        lookback_months=lookback_months,
        as_of=datetime.now(timezone.utc).isoformat(),
        dividend=dividend,
        requested_symbol=requested if requested != resolved else None,
        country=None,
        price_source="stooq",
        change_1m_pct=round(change_1m, 2) if change_1m is not None else None,
    )


def fetch_dividends(symbol: str) -> dict:
    """Fetch dividend yield and payout history for a symbol only."""
    requested = symbol.upper().strip()
    resolved, ticker, info, price, _previous_close = resolve_tradable_symbol(requested)
    currency = info.get("currency") or "USD"
    dividend = fetch_dividend_info(ticker, price=price)
    return {
        "symbol": resolved,
        "requested_symbol": requested if requested != resolved else None,
        "currency": currency,
        "price": round(price, 4) if price is not None else None,
        "dividend": dividend.to_dict(),
    }


def _monthly_close_series(ticker: yf.Ticker, lookback_months: int):
    """Monthly close series used for growth estimates."""
    period = f"{max(lookback_months + 1, 6)}mo"
    hist = ticker.history(period=period, interval="1mo", auto_adjust=True)
    if hist.empty or len(hist) < 2:
        hist = ticker.history(period="1y", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            return None
        monthly = hist["Close"].resample("ME").last().dropna()
    else:
        monthly = hist["Close"].dropna()
    if len(monthly) < 2:
        return None
    return monthly.tail(lookback_months + 1)


def _avg_monthly_growth_from_closes(closes, _lookback_months: int) -> float:
    if closes is None or len(closes) < 2:
        return 0.0
    start = float(closes.iloc[0])
    end = float(closes.iloc[-1])
    n = len(closes) - 1
    if start <= 0 or n <= 0:
        return 0.0
    ratio = end / start
    return float((ratio ** (1 / n) - 1) * 100)


def _change_1m_pct_from_closes(closes) -> float | None:
    if closes is None or len(closes) < 2:
        return None
    start = float(closes.iloc[-2])
    end = float(closes.iloc[-1])
    if start <= 0:
        return None
    return (end / start - 1.0) * 100.0


def _estimate_avg_monthly_growth(ticker: yf.Ticker, lookback_months: int) -> float:
    """Compound average monthly return from monthly closes over lookback window."""
    return _avg_monthly_growth_from_closes(
        _monthly_close_series(ticker, lookback_months), lookback_months
    )
