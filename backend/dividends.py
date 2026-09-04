"""Dividend helpers: yield, history, and earnings on owned lots."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

import pandas as pd
import yfinance as yf


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


@dataclass
class DividendPayment:
    date: str
    amount: float


@dataclass
class DividendInfo:
    pays_dividend: bool
    yield_pct: float | None
    annual_rate: float | None
    recent_payments: list[DividendPayment]
    all_payments: list[DividendPayment]

    def to_dict(self) -> dict:
        return {
            "pays_dividend": self.pays_dividend,
            "yield_pct": self.yield_pct,
            "annual_rate": self.annual_rate,
            "recent_payments": [asdict(p) for p in self.recent_payments],
        }


def _normalize_yield_pct(
    raw: float | None, price: float | None, annual_rate: float | None
) -> float | None:
    """Yahoo sometimes returns yield as a fraction, sometimes already as percent."""
    if raw is not None:
        value = float(raw)
        if 0 < value < 1:
            return round(value * 100, 4)
        if value >= 1:
            return round(value, 4)
    if annual_rate is not None and price and price > 0:
        return round((annual_rate / price) * 100, 4)
    return None


def fetch_dividend_info(
    ticker: yf.Ticker,
    *,
    price: float | None = None,
    recent_limit: int = 8,
) -> DividendInfo:
    info = ticker.info or {}
    annual_rate = (
        _safe_float(info.get("trailingAnnualDividendRate"))
        or _safe_float(info.get("dividendRate"))
    )
    raw_yield = (
        _safe_float(info.get("trailingAnnualDividendYield"))
        or _safe_float(info.get("dividendYield"))
    )

    all_payments: list[DividendPayment] = []
    try:
        series = ticker.dividends
    except Exception:
        series = pd.Series(dtype=float)

    if series is not None and not getattr(series, "empty", True):
        cleaned = series.dropna()
        cleaned = cleaned[cleaned > 0]
        if not cleaned.empty:
            if annual_rate is None:
                cutoff = pd.Timestamp.now(tz=cleaned.index.tz) - pd.DateOffset(years=1)
                trailing = cleaned[cleaned.index >= cutoff]
                if not trailing.empty:
                    annual_rate = float(trailing.sum())

            for idx, amount in cleaned.items():
                ts = pd.Timestamp(idx)
                all_payments.append(
                    DividendPayment(
                        date=ts.date().isoformat(),
                        amount=round(float(amount), 6),
                    )
                )

    recent_payments = list(reversed(all_payments[-recent_limit:]))
    yield_pct = _normalize_yield_pct(raw_yield, price, annual_rate)
    pays = bool(all_payments) or (annual_rate is not None and annual_rate > 0)

    return DividendInfo(
        pays_dividend=pays,
        yield_pct=yield_pct,
        annual_rate=round(annual_rate, 6) if annual_rate is not None else None,
        recent_payments=recent_payments,
        all_payments=all_payments,
    )


def fetch_stock_splits(ticker: yf.Ticker) -> list[tuple[date, float]]:
    """Return (split_date, ratio) pairs, e.g. 6.0 for a 6-for-1 split."""
    splits: list[tuple[date, float]] = []
    try:
        series = ticker.splits
    except Exception:
        return splits
    if series is None or getattr(series, "empty", True):
        return splits
    for idx, ratio in series.dropna().items():
        try:
            value = float(ratio)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        ts = pd.Timestamp(idx)
        splits.append((ts.date(), value))
    splits.sort(key=lambda item: item[0])
    return splits


# Default US withholding on US-source dividends for foreign investors
# without a claimed treaty rate (IRS Pub 515). Treaty/W-8BEN often lowers this.
US_DIVIDEND_WITHHOLDING_PCT = 30.0

# Simplified EU dividend withholding used for portfolio netting.
EU_DIVIDEND_WITHHOLDING_PCT = 5.0

_US_COUNTRY_NAMES = {
    "united states",
    "united states of america",
    "usa",
    "u.s.",
    "u.s.a.",
    "us",
}

_EU_COUNTRY_NAMES = {
    "austria",
    "belgium",
    "bulgaria",
    "croatia",
    "cyprus",
    "czech republic",
    "czechia",
    "denmark",
    "estonia",
    "finland",
    "france",
    "germany",
    "greece",
    "hungary",
    "ireland",
    "italy",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "netherlands",
    "poland",
    "portugal",
    "romania",
    "slovakia",
    "slovenia",
    "spain",
    "sweden",
}


def _normalize_country(country: str | None) -> str:
    return (country or "").strip().lower()


def applies_us_dividend_withholding(
    symbol: str | None = None,
    *,
    country: str | None = None,
) -> bool:
    """
    True only for US-source dividends (US-incorporated companies / US-domiciled issuers).

    Foreign ADRs listed in the US (e.g. BYDDY, TSM, VALE, BIDU) are NOT US-source;
    home-country withholding applies instead, not the US 30% rate.
    """
    return _normalize_country(country) in _US_COUNTRY_NAMES


def applies_eu_dividend_withholding(
    symbol: str | None = None,
    *,
    country: str | None = None,
) -> bool:
    """True for issuers incorporated in an EU member country."""
    return _normalize_country(country) in _EU_COUNTRY_NAMES


def dividend_withholding_pct(
    symbol: str | None = None,
    *,
    country: str | None = None,
) -> float:
    if applies_us_dividend_withholding(symbol, country=country):
        return US_DIVIDEND_WITHHOLDING_PCT
    if applies_eu_dividend_withholding(symbol, country=country):
        return EU_DIVIDEND_WITHHOLDING_PCT
    return 0.0


def _shares_held_as_of(
    lots: list[tuple[date, float]],
    on_date: date,
    splits: list[tuple[date, float]] | None = None,
) -> float:
    """
    Shares owned on `on_date`, given lots stored in *current* (post-split) share units.

    Splits after `on_date` are reversed so pre-split payouts use pre-split share counts.
    """
    splits = splits or []
    total = 0.0
    for bought_on, current_shares in lots:
        if bought_on > on_date:
            continue
        factor = 1.0
        for split_date, ratio in splits:
            if bought_on < split_date and split_date > on_date:
                factor *= ratio
        if factor > 0:
            total += current_shares / factor
    return total


def dividends_earned_for_lots(
    purchases: list[dict],
    dividend_payments: list[DividendPayment] | list[dict],
    splits: list[tuple[date, float]] | None = None,
    withholding_pct: float = 0.0,
) -> tuple[float, float, float, list[dict]]:
    """
    Estimate cash dividends received.

    For each historical payout date, count shares already owned on that date
    (purchase date <= payout date) and credit shares * dividend per share.

    `purchases` shares are treated as current (post-split) quantities. Optional
    `splits` adjust those back to the share count that applied on each payout date.

    Returns (net_total, gross_total, tax_total, event_details).
    """
    if not purchases or not dividend_payments:
        return 0.0, 0.0, 0.0, []

    lots = []
    for purchase in purchases:
        try:
            bought_on = date.fromisoformat(str(purchase["purchased_at"])[:10])
        except ValueError:
            continue
        lots.append((bought_on, float(purchase["shares"])))

    if not lots:
        return 0.0, 0.0, 0.0, []

    details: list[dict] = []
    gross_total = 0.0
    tax_total = 0.0
    net_total = 0.0
    tax_rate = max(0.0, float(withholding_pct or 0.0)) / 100.0

    ordered = sorted(
        dividend_payments,
        key=lambda p: p["date"] if isinstance(p, dict) else p.date,
    )

    for payment in ordered:
        if isinstance(payment, dict):
            pay_date_raw = payment["date"]
            amount = float(payment["amount"])
        else:
            pay_date_raw = payment.date
            amount = float(payment.amount)

        try:
            pay_date = date.fromisoformat(str(pay_date_raw)[:10])
        except ValueError:
            continue

        shares_held = _shares_held_as_of(lots, pay_date, splits)
        if shares_held <= 1e-12:
            continue

        gross = shares_held * amount
        tax = gross * tax_rate
        net = gross - tax
        gross_total += gross
        tax_total += tax
        net_total += net
        details.append(
            {
                "date": pay_date.isoformat(),
                "dividend_per_share": round(amount, 6),
                "shares_held": round(shares_held, 6),
                "income_gross": round(gross, 2),
                "tax": round(tax, 2),
                "income": round(net, 2),
                "withholding_pct": round(tax_rate * 100, 2),
            }
        )

    details.reverse()  # newest first
    return (
        round(net_total, 2),
        round(gross_total, 2),
        round(tax_total, 2),
        details,
    )
