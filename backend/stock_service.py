"""Live stock quotes and historical growth estimates via Yahoo Finance."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import yfinance as yf

from dividends import DividendInfo, fetch_dividend_info
from symbol_resolver import candidate_symbols
from yf_limit import yfinance_slot


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


def fetch_quote(
    symbol: str,
    lookback_months: int = 12,
    *,
    include_dividends: bool = True,
) -> StockQuote:
    """Fetch live price and estimate average monthly growth from history."""
    requested = symbol.upper().strip()
    resolved, ticker, info, price, previous_close = resolve_tradable_symbol(requested)

    change_pct = None
    if previous_close and previous_close > 0:
        change_pct = ((price - previous_close) / previous_close) * 100

    avg_monthly = _estimate_avg_monthly_growth(ticker, lookback_months)
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


def _estimate_avg_monthly_growth(ticker: yf.Ticker, lookback_months: int) -> float:
    """Compound average monthly return from monthly closes over lookback window."""
    period = f"{max(lookback_months + 1, 6)}mo"
    hist = ticker.history(period=period, interval="1mo", auto_adjust=True)
    if hist.empty or len(hist) < 2:
        # Fallback: daily data aggregated roughly
        hist = ticker.history(period="1y", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            return 0.0
        monthly = hist["Close"].resample("ME").last().dropna()
    else:
        monthly = hist["Close"].dropna()

    if len(monthly) < 2:
        return 0.0

    # Use at most lookback_months intervals
    closes = monthly.tail(lookback_months + 1)
    if len(closes) < 2:
        return 0.0

    start = float(closes.iloc[0])
    end = float(closes.iloc[-1])
    n = len(closes) - 1
    if start <= 0 or n <= 0:
        return 0.0

    # Geometric average monthly growth
    ratio = end / start
    avg = (ratio ** (1 / n) - 1) * 100
    return float(avg)
