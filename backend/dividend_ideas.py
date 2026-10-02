"""Curated lower-risk dividend shortlist with live Yahoo Finance data."""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import yfinance as yf

from db import get_dividend_ideas_cache, list_positions, save_dividend_ideas_cache
from settings import silent_stock_refresh_minutes
from symbol_resolver import candidate_symbols
from yf_limit import yfinance_slot

BOARD_REFRESH_HOURS = 4

_refresh_lock = threading.Lock()

# Quality dividend names (not ultra-high yield traps). Update list carefully.
DIVIDEND_IDEAS: list[dict[str, str]] = [
    # US
    {"region": "US", "name": "Johnson & Johnson", "symbol": "JNJ"},
    {"region": "US", "name": "Procter & Gamble", "symbol": "PG"},
    {"region": "US", "name": "Coca-Cola", "symbol": "KO"},
    {"region": "US", "name": "PepsiCo", "symbol": "PEP"},
    {"region": "US", "name": "McDonald's", "symbol": "MCD"},
    {"region": "US", "name": "AbbVie", "symbol": "ABBV"},
    {"region": "US", "name": "Verizon", "symbol": "VZ"},
    {"region": "US", "name": "Realty Income", "symbol": "O"},
    {"region": "US", "name": "NextEra Energy", "symbol": "NEE"},
    {"region": "US", "name": "Chevron", "symbol": "CVX"},
    {"region": "US", "name": "Exxon Mobil", "symbol": "XOM"},
    {"region": "US", "name": "Merck", "symbol": "MRK"},
    {"region": "US", "name": "Pfizer", "symbol": "PFE"},
    {"region": "US", "name": "Colgate-Palmolive", "symbol": "CL"},
    {"region": "US", "name": "Home Depot", "symbol": "HD"},
    {"region": "US", "name": "IBM", "symbol": "IBM"},
    {"region": "US", "name": "Cisco", "symbol": "CSCO"},
    {"region": "US", "name": "Duke Energy", "symbol": "DUK"},
    {"region": "US", "name": "Southern Company", "symbol": "SO"},
    {"region": "US", "name": "AT&T", "symbol": "T"},
    # EU
    {"region": "EU", "name": "Nestlé", "symbol": "NESN.SW"},
    {"region": "EU", "name": "Unilever", "symbol": "ULVR.L"},
    {"region": "EU", "name": "Shell", "symbol": "SHEL.L"},
    {"region": "EU", "name": "TotalEnergies", "symbol": "TTE.PA"},
    {"region": "EU", "name": "Enel", "symbol": "ENEL.MI"},
    {"region": "EU", "name": "Iberdrola", "symbol": "IBE.MC"},
    {"region": "EU", "name": "Sanofi", "symbol": "SAN.PA"},
    {"region": "EU", "name": "Allianz", "symbol": "ALV.DE"},
    {"region": "EU", "name": "BASF", "symbol": "BAS.DE"},
    {"region": "EU", "name": "Deutsche Telekom", "symbol": "DTE.DE"},
    {"region": "EU", "name": "Novartis", "symbol": "NOVN.SW"},
    {"region": "EU", "name": "Roche", "symbol": "RO.SW"},
    {"region": "EU", "name": "AstraZeneca", "symbol": "AZN.L"},
    {"region": "EU", "name": "National Grid", "symbol": "NG.L"},
    {"region": "EU", "name": "Munich Re", "symbol": "MUV2.DE"},
    {"region": "EU", "name": "E.ON", "symbol": "EOAN.DE"},
    {"region": "EU", "name": "Air Liquide", "symbol": "AI.PA"},
    {"region": "EU", "name": "BP", "symbol": "BP.L"},
]


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
        if result != result:  # NaN
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
    currency: str | None, price: float | None, dividends: dict[str, float]
) -> tuple[str | None, float | None, dict[str, float]]:
    """Convert LSE pence (GBp) quotes/dividends to GBP pounds for display."""
    if currency == "GBp":
        price = price / 100.0 if price is not None else None
        dividends = {year: value / 100.0 for year, value in dividends.items()}
        return "GBP", price, dividends
    return currency, price, dividends


def _annual_dividends(ticker: yf.Ticker, years: int = 5) -> dict[str, float]:
    div = ticker.dividends
    now = datetime.now(timezone.utc)
    start_year = now.year - (years - 1)
    by_year = {str(y): 0.0 for y in range(start_year, now.year + 1)}
    if div is None or len(div) == 0:
        return by_year

    idx = div.index
    try:
        idx = idx.tz_localize(None)
    except Exception:
        try:
            idx = idx.tz_convert(None)
        except Exception:
            pass
    div = div.copy()
    div.index = idx

    for year in by_year:
        year_int = int(year)
        subset = div[div.index.year == year_int]
        by_year[year] = float(subset.sum()) if len(subset) else 0.0
    return by_year


def _symbol_keys(symbol: str) -> set[str]:
    raw = (symbol or "").upper().strip()
    keys: set[str] = set()
    if not raw:
        return keys
    for cand in candidate_symbols(raw):
        keys.add(cand)
        keys.add(cand.split(".")[0])
    return keys


def _owned_lookup(user_id: int | None) -> dict[str, dict[str, Any]]:
    if user_id is None:
        return {}
    lookup: dict[str, dict[str, Any]] = {}
    for pos in list_positions(user_id=user_id):
        shares = float(pos.get("shares") or 0)
        if shares <= 0:
            continue
        info = {
            "owned_symbol": pos.get("symbol"),
            "owned_shares": shares,
            "owned_company_name": pos.get("company_name"),
            "owned_currency": (pos.get("currency") or "").upper() or None,
        }
        for key in _symbol_keys(pos.get("symbol") or ""):
            lookup.setdefault(key, info)
    return lookup


def _match_owned(symbol: str, owned: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    for key in _symbol_keys(symbol):
        if key in owned:
            return owned[key]
    return None


def _fetch_one(item: dict[str, str]) -> dict[str, Any]:
    symbol = item["symbol"]
    name = item["name"]
    region = item["region"]
    try:
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

            dividends = _annual_dividends(ticker, years=5)
            currency, price, dividends = _normalize_currency(currency, price, dividends)
            display_name = info.get("shortName") or info.get("longName") or name

            return {
                "region": region,
                "name": display_name,
                "symbol": symbol,
                "price": price,
                "currency": currency,
                "change_6m_pct": change_6m_pct,
                "dividend_yield_pct": yield_pct,
                "dividends_by_year": dividends,
                "owned": False,
                "owned_shares": None,
                "owned_symbol": None,
                "error": None,
            }
    except Exception as exc:
        return {
            "region": region,
            "name": name,
            "symbol": symbol,
            "price": None,
            "currency": None,
            "change_6m_pct": None,
            "dividend_yield_pct": None,
            "dividends_by_year": {},
            "owned": False,
            "owned_shares": None,
            "owned_symbol": None,
            "error": str(exc),
        }


def _assemble_payload(
    rows: list[dict[str, Any]],
    *,
    quotes_updated_at: datetime,
    board_updated_at: datetime,
    data_changed: bool = True,
    last_checked_at: datetime | None = None,
) -> dict[str, Any]:
    order = {item["symbol"]: i for i, item in enumerate(DIVIDEND_IDEAS)}
    owned_items: list[dict[str, Any]] = []
    preview_items: list[dict[str, Any]] = []

    for row in rows:
        if row.get("owned"):
            owned_items.append(row)
        else:
            preview_items.append(row)

    owned_items.sort(
        key=lambda row: (0 if row["region"] == "US" else 1, order.get(row["symbol"], 999))
    )
    preview_items.sort(
        key=lambda row: (0 if row["region"] == "US" else 1, order.get(row["symbol"], 999))
    )

    years = sorted({year for row in rows for year in row.get("dividends_by_year", {})})
    checked = last_checked_at or quotes_updated_at

    quote_refresh_minutes = silent_stock_refresh_minutes()
    return {
        "as_of": quotes_updated_at.isoformat(),
        "quotes_updated_at": quotes_updated_at.isoformat(),
        "board_updated_at": board_updated_at.isoformat(),
        "last_checked_at": checked.isoformat(),
        "next_quotes_refresh_at": (
            quotes_updated_at + timedelta(minutes=quote_refresh_minutes)
        ).isoformat(),
        "next_board_refresh_at": (
            board_updated_at + timedelta(hours=BOARD_REFRESH_HOURS)
        ).isoformat(),
        "quote_refresh_minutes": quote_refresh_minutes,
        "board_refresh_hours": BOARD_REFRESH_HOURS,
        "data_changed": data_changed,
        "years": years,
        "disclaimer": (
            "Curated quality dividend names, not investment advice. "
            "“Lower risk” is relative. The current year is year-to-date only. "
            "Owned matches your Progress open lots. "
            f"Live data is checked every {quote_refresh_minutes} minutes and the board "
            f"(owned split + ordering) every {BOARD_REFRESH_HOURS} hours — the UI updates "
            "only when values actually change."
        ),
        "owned": owned_items,
        "items": preview_items,
    }


def _fetch_all_rows(*, user_id: int | None, rematch_owned: bool) -> list[dict[str, Any]]:
    owned = _owned_lookup(user_id) if rematch_owned else {}
    rows: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_fetch_one, item) for item in DIVIDEND_IDEAS]
        for fut in as_completed(futures):
            row = fut.result()
            if rematch_owned:
                match = _match_owned(row["symbol"], owned)
                if match:
                    row["owned"] = True
                    row["owned_shares"] = match.get("owned_shares")
                    row["owned_symbol"] = match.get("owned_symbol")
            rows.append(row)

    return rows


def _apply_owned_from_payload(rows: list[dict[str, Any]], cached: dict[str, Any]) -> None:
    """Keep owned flags from cache when only refreshing quotes."""
    owned_by_symbol = {
        row["symbol"]: row
        for row in (cached.get("owned") or [])
    }
    for row in rows:
        prev = owned_by_symbol.get(row["symbol"])
        if prev:
            row["owned"] = True
            row["owned_shares"] = prev.get("owned_shares")
            row["owned_symbol"] = prev.get("owned_symbol")


def _round_opt(value: Any, digits: int = 2) -> Any:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return value


def _row_fingerprint(row: dict[str, Any]) -> tuple:
    divs = tuple(
        sorted(
            (year, _round_opt(amount, 4))
            for year, amount in (row.get("dividends_by_year") or {}).items()
        )
    )
    return (
        row.get("symbol"),
        bool(row.get("owned")),
        _round_opt(row.get("owned_shares"), 4),
        row.get("owned_symbol"),
        _round_opt(row.get("price"), 2),
        _round_opt(row.get("change_6m_pct"), 2),
        _round_opt(row.get("dividend_yield_pct"), 2),
        row.get("currency"),
        divs,
        row.get("error"),
        row.get("region"),
    )


def _board_fingerprint(payload: dict[str, Any]) -> tuple:
    rows = (payload.get("owned") or []) + (payload.get("items") or [])
    return tuple(
        sorted(
            (
                row.get("symbol"),
                bool(row.get("owned")),
                _round_opt(row.get("owned_shares"), 4),
                row.get("owned_symbol"),
                row.get("region"),
            )
            for row in rows
        )
    )


def _payload_changed(previous: dict[str, Any], current_rows: list[dict[str, Any]]) -> bool:
    prev_rows = (previous.get("owned") or []) + (previous.get("items") or [])
    prev_by_symbol = {row["symbol"]: row for row in prev_rows}
    if set(prev_by_symbol) != {row["symbol"] for row in current_rows}:
        return True
    for row in current_rows:
        prev = prev_by_symbol.get(row["symbol"])
        if prev is None:
            return True
        if _row_fingerprint(prev) != _row_fingerprint(row):
            return True
    return False


def _board_changed(previous: dict[str, Any], current_rows: list[dict[str, Any]]) -> bool:
    rebuilt = _assemble_payload(
        current_rows,
        quotes_updated_at=_parse_iso(previous.get("quotes_updated_at"))
        or datetime.now(timezone.utc),
        board_updated_at=datetime.now(timezone.utc),
        data_changed=True,
    )
    return _board_fingerprint(previous) != _board_fingerprint(rebuilt)


def _build_fresh_payload(
    *,
    user_id: int | None,
    rematch_owned: bool,
    quotes_updated_at: datetime,
    board_updated_at: datetime,
    data_changed: bool,
    last_checked_at: datetime | None = None,
) -> dict[str, Any]:
    rows = _fetch_all_rows(user_id=user_id, rematch_owned=rematch_owned)
    return _assemble_payload(
        rows,
        quotes_updated_at=quotes_updated_at,
        board_updated_at=board_updated_at,
        data_changed=data_changed,
        last_checked_at=last_checked_at,
    )


def build_dividend_ideas(*, user_id: int | None = None, force: bool = False) -> dict[str, Any]:
    with _refresh_lock:
        now = datetime.now(timezone.utc)

        if user_id is None:
            return _build_fresh_payload(
                user_id=None,
                rematch_owned=False,
                quotes_updated_at=now,
                board_updated_at=now,
                data_changed=True,
                last_checked_at=now,
            )

        cached_row = None if force else get_dividend_ideas_cache(user_id=user_id)
        cached_payload: dict[str, Any] | None = None

        if cached_row:
            try:
                cached_payload = json.loads(cached_row["payload"])
            except json.JSONDecodeError:
                cached_payload = None

        if cached_payload and not force:
            quotes_at = _parse_iso(cached_payload.get("quotes_updated_at")) or _parse_iso(
                cached_payload.get("as_of")
            )
            board_at = _parse_iso(cached_payload.get("board_updated_at")) or quotes_at
            quotes_age_m = (now - quotes_at).total_seconds() / 60 if quotes_at else 999
            board_age_h = (now - board_at).total_seconds() / 3600 if board_at else 999

            quote_refresh_minutes = silent_stock_refresh_minutes()
            if quotes_age_m < quote_refresh_minutes and board_age_h < BOARD_REFRESH_HOURS:
                cached_payload["data_changed"] = False
                return cached_payload

            rematch_owned = board_age_h >= BOARD_REFRESH_HOURS
            rows = _fetch_all_rows(user_id=user_id, rematch_owned=rematch_owned)
            if not rematch_owned:
                _apply_owned_from_payload(rows, cached_payload)

            if not _payload_changed(cached_payload, rows):
                stale = dict(cached_payload)
                stale["last_checked_at"] = now.isoformat()
                stale["data_changed"] = False
                save_dividend_ideas_cache(user_id=user_id, payload_json=json.dumps(stale))
                return stale

            quotes_updated_at = now
            board_updated_at = now if rematch_owned else (board_at or now)
            if rematch_owned and not _board_changed(cached_payload, rows):
                board_updated_at = board_at or now

            payload = _assemble_payload(
                rows,
                quotes_updated_at=quotes_updated_at,
                board_updated_at=board_updated_at,
                data_changed=True,
                last_checked_at=now,
            )
            save_dividend_ideas_cache(user_id=user_id, payload_json=json.dumps(payload))
            return payload

        payload = _build_fresh_payload(
            user_id=user_id,
            rematch_owned=True,
            quotes_updated_at=now,
            board_updated_at=now,
            data_changed=True,
            last_checked_at=now,
        )
        save_dividend_ideas_cache(user_id=user_id, payload_json=json.dumps(payload))
        return payload
