"""Historical FX rates via Yahoo Finance (e.g. EURUSD=X)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import yfinance as yf

_CACHE: dict[tuple[str, str, str], float] = {}


def _pair_candidates(from_ccy: str, to_ccy: str) -> list[tuple[str, bool]]:
    """Return (yahoo_symbol, invert) candidates."""
    fr = from_ccy.upper()
    to = to_ccy.upper()
    return [
        (f"{fr}{to}=X", False),
        (f"{to}{fr}=X", True),
    ]


def get_fx_rate(from_currency: str, to_currency: str, on_date: str | date | None = None) -> float:
    """
    Units of `to_currency` per 1 `from_currency` on/near `on_date`.

    Example: get_fx_rate("USD", "EUR", "2024-01-02") ≈ 0.91
    """
    fr = (from_currency or "").upper().strip()
    to = (to_currency or "").upper().strip()
    if not fr or not to:
        raise ValueError("from_currency and to_currency are required")
    if fr == to:
        return 1.0

    if on_date is None:
        day = date.today()
    elif isinstance(on_date, date):
        day = on_date
    else:
        day = date.fromisoformat(str(on_date)[:10])

    cache_key = (fr, to, day.isoformat())
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    start = day - timedelta(days=7)
    end = day + timedelta(days=3)
    last_error: Exception | None = None

    for symbol, invert in _pair_candidates(fr, to):
        try:
            hist = yf.Ticker(symbol).history(
                start=start.isoformat(),
                end=end.isoformat(),
                auto_adjust=True,
            )
            if hist.empty:
                continue
            closes = hist["Close"].dropna()
            if closes.empty:
                continue

            # Prefer exact day, else nearest prior close, else nearest overall
            target = datetime.combine(day, datetime.min.time())
            if closes.index.tz is not None:
                target = target.replace(tzinfo=closes.index.tz)

            if day.isoformat() in {idx.date().isoformat() for idx in closes.index}:
                rate = float(closes.loc[[idx for idx in closes.index if idx.date() == day][0]])
            else:
                prior = closes[closes.index <= target]
                series = prior if not prior.empty else closes
                rate = float(series.iloc[-1])

            if invert:
                if rate == 0:
                    continue
                rate = 1.0 / rate

            _CACHE[cache_key] = rate
            return rate
        except Exception as exc:  # noqa: BLE001 - try next pair
            last_error = exc
            continue

    detail = f" ({last_error})" if last_error else ""
    raise ValueError(f"Could not fetch FX rate {fr}->{to} near {day.isoformat()}{detail}")


def convert_amount(
    amount: float,
    from_currency: str,
    to_currency: str,
    on_date: str | date | None = None,
) -> float:
    rate = get_fx_rate(from_currency, to_currency, on_date)
    return amount * rate
