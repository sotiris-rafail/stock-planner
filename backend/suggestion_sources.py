"""Fetch candidate symbols from public index pages and fund universes."""

from __future__ import annotations

import math
import re
from io import StringIO
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import pandas as pd

LIST_SOURCES = (
    "Wikipedia · S&P 500",
    "Wikipedia · FTSE 100",
    "Wikipedia · DAX",
    "Wikipedia · CAC 40",
    "Provider ETF universe",
    "Provider mutual-fund universe",
)

# Fallback pools when live index pages are unreachable.
FALLBACK_STOCKS: list[dict[str, str]] = [
    {"symbol": "AAPL", "name": "Apple", "region": "US", "list_source": "S&P 500", "theme": "Technology"},
    {"symbol": "MSFT", "name": "Microsoft", "region": "US", "list_source": "S&P 500", "theme": "Technology"},
    {"symbol": "NVDA", "name": "NVIDIA", "region": "US", "list_source": "S&P 500", "theme": "Technology"},
    {"symbol": "AMZN", "name": "Amazon", "region": "US", "list_source": "S&P 500", "theme": "Consumer"},
    {"symbol": "GOOGL", "name": "Alphabet", "region": "US", "list_source": "S&P 500", "theme": "Technology"},
    {"symbol": "JPM", "name": "JPMorgan Chase", "region": "US", "list_source": "S&P 500", "theme": "Financials"},
    {"symbol": "JNJ", "name": "Johnson & Johnson", "region": "US", "list_source": "S&P 500", "theme": "Healthcare"},
    {"symbol": "SAP.DE", "name": "SAP", "region": "EU", "list_source": "DAX", "theme": "Technology"},
    {"symbol": "SHEL.L", "name": "Shell", "region": "EU", "list_source": "FTSE 100", "theme": "Energy"},
    {"symbol": "NESN.SW", "name": "Nestlé", "region": "EU", "list_source": "SMI", "theme": "Consumer staples"},
]

ETF_UNIVERSE: list[dict[str, str]] = [
    {"symbol": "VTI", "name": "Vanguard Total Stock Market", "region": "US", "list_source": "Vanguard ETFs", "theme": "US total market"},
    {"symbol": "VOO", "name": "Vanguard S&P 500", "region": "US", "list_source": "Vanguard ETFs", "theme": "US large cap"},
    {"symbol": "SPY", "name": "SPDR S&P 500", "region": "US", "list_source": "SPDR ETFs", "theme": "US large cap"},
    {"symbol": "QQQ", "name": "Invesco QQQ", "region": "US", "list_source": "Nasdaq ETFs", "theme": "US growth"},
    {"symbol": "VXUS", "name": "Vanguard Total International", "region": "US", "list_source": "Vanguard ETFs", "theme": "Ex-US equities"},
    {"symbol": "EFA", "name": "iShares MSCI EAFE", "region": "US", "list_source": "iShares ETFs", "theme": "Developed ex-US"},
    {"symbol": "IEMG", "name": "iShares MSCI Emerging", "region": "US", "list_source": "iShares ETFs", "theme": "Emerging markets"},
    {"symbol": "BND", "name": "Vanguard Total Bond", "region": "US", "list_source": "Vanguard ETFs", "theme": "US bonds"},
    {"symbol": "AGG", "name": "iShares US Aggregate Bond", "region": "US", "list_source": "iShares ETFs", "theme": "US bonds"},
    {"symbol": "VYM", "name": "Vanguard High Dividend Yield", "region": "US", "list_source": "Vanguard ETFs", "theme": "Dividend equity"},
    {"symbol": "GLD", "name": "SPDR Gold Shares", "region": "US", "list_source": "SPDR ETFs", "theme": "Gold"},
    {"symbol": "SCHD", "name": "Schwab US Dividend Equity", "region": "US", "list_source": "Schwab ETFs", "theme": "Dividend equity"},
    {"symbol": "VTV", "name": "Vanguard Value", "region": "US", "list_source": "Vanguard ETFs", "theme": "US value"},
    {"symbol": "VUG", "name": "Vanguard Growth", "region": "US", "list_source": "Vanguard ETFs", "theme": "US growth"},
    {"symbol": "XLK", "name": "Technology Select Sector", "region": "US", "list_source": "SPDR sector", "theme": "Technology"},
    {"symbol": "VWCE.DE", "name": "Vanguard FTSE All-World", "region": "EU", "list_source": "Vanguard UCITS", "theme": "Global equity"},
    {"symbol": "IWDA.AS", "name": "iShares MSCI World", "region": "EU", "list_source": "iShares UCITS", "theme": "Developed world"},
    {"symbol": "CSPX.L", "name": "iShares Core S&P 500 UCITS", "region": "EU", "list_source": "iShares UCITS", "theme": "US large cap"},
    {"symbol": "XDWD.DE", "name": "Xtrackers MSCI World", "region": "EU", "list_source": "DWS Xtrackers", "theme": "Developed world"},
    {"symbol": "EUNL.DE", "name": "iShares Core MSCI Europe", "region": "EU", "list_source": "iShares UCITS", "theme": "Europe equity"},
    {"symbol": "IVV", "name": "iShares Core S&P 500", "region": "US", "list_source": "iShares ETFs", "theme": "US large cap"},
    {"symbol": "ITOT", "name": "iShares Core S&P Total US", "region": "US", "list_source": "iShares ETFs", "theme": "US total market"},
    {"symbol": "SCHF", "name": "Schwab International Equity", "region": "US", "list_source": "Schwab ETFs", "theme": "Developed ex-US"},
    {"symbol": "VEA", "name": "Vanguard FTSE Developed", "region": "US", "list_source": "Vanguard ETFs", "theme": "Developed ex-US"},
    {"symbol": "VWO", "name": "Vanguard FTSE Emerging", "region": "US", "list_source": "Vanguard ETFs", "theme": "Emerging markets"},
    {"symbol": "IJH", "name": "iShares Core S&P Mid-Cap", "region": "US", "list_source": "iShares ETFs", "theme": "US mid cap"},
    {"symbol": "IJR", "name": "iShares Core S&P Small-Cap", "region": "US", "list_source": "iShares ETFs", "theme": "US small cap"},
    {"symbol": "XLF", "name": "Financial Select Sector", "region": "US", "list_source": "SPDR sector", "theme": "Financials"},
    {"symbol": "XLV", "name": "Health Care Select Sector", "region": "US", "list_source": "SPDR sector", "theme": "Healthcare"},
    {"symbol": "XLE", "name": "Energy Select Sector", "region": "US", "list_source": "SPDR sector", "theme": "Energy"},
    {"symbol": "JEPI", "name": "JPMorgan Equity Premium Income", "region": "US", "list_source": "JPMorgan ETFs", "theme": "Income / options"},
    {"symbol": "IAU", "name": "iShares Gold Trust", "region": "US", "list_source": "iShares ETFs", "theme": "Gold"},
    {"symbol": "VGK", "name": "Vanguard FTSE Europe", "region": "US", "list_source": "Vanguard ETFs", "theme": "Europe equity"},
    {"symbol": "SMEA.L", "name": "iShares MSCI EM IMI", "region": "EU", "list_source": "iShares UCITS", "theme": "Emerging markets"},
]

MF_UNIVERSE: list[dict[str, str]] = [
    {"symbol": "VFIAX", "name": "Vanguard 500 Index Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US large cap index"},
    {"symbol": "FXAIX", "name": "Fidelity 500 Index", "region": "US", "list_source": "Fidelity funds", "theme": "US large cap index"},
    {"symbol": "VTSAX", "name": "Vanguard Total Stock Market Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US total market"},
    {"symbol": "VTIAX", "name": "Vanguard Total International Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "Ex-US equities"},
    {"symbol": "VBTLX", "name": "Vanguard Total Bond Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US bonds"},
    {"symbol": "FSKAX", "name": "Fidelity Total Market Index", "region": "US", "list_source": "Fidelity funds", "theme": "US total market"},
    {"symbol": "FSPSX", "name": "Fidelity International Index", "region": "US", "list_source": "Fidelity funds", "theme": "Developed ex-US"},
    {"symbol": "SWPPX", "name": "Schwab S&P 500 Index", "region": "US", "list_source": "Schwab funds", "theme": "US large cap index"},
    {"symbol": "VWENX", "name": "Vanguard Wellington Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "Balanced"},
    {"symbol": "AGTHX", "name": "American Funds Growth Fund", "region": "US", "list_source": "Morningstar growth", "theme": "US growth active"},
    {"symbol": "PONAX", "name": "PIMCO Income", "region": "US", "list_source": "PIMCO funds", "theme": "Multi-sector bonds"},
    {"symbol": "TRBCX", "name": "T. Rowe Price Blue Chip Growth", "region": "US", "list_source": "T. Rowe Price", "theme": "US growth active"},
    {"symbol": "FXNAX", "name": "Fidelity US Bond Index", "region": "US", "list_source": "Fidelity funds", "theme": "US bonds"},
    {"symbol": "VIMAX", "name": "Vanguard Mid-Cap Index Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US mid cap"},
    {"symbol": "VSMAX", "name": "Vanguard Small-Cap Index Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US small cap"},
    {"symbol": "VIGAX", "name": "Vanguard Growth Index Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US growth"},
    {"symbol": "VVIAX", "name": "Vanguard Value Index Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US value"},
    {"symbol": "PRGFX", "name": "T. Rowe Price Growth Stock", "region": "US", "list_source": "T. Rowe Price", "theme": "US growth active"},
    {"symbol": "FBGRX", "name": "Fidelity Blue Chip Growth", "region": "US", "list_source": "Fidelity funds", "theme": "US growth active"},
    {"symbol": "VWUSX", "name": "Vanguard US Growth Admiral", "region": "US", "list_source": "Vanguard funds", "theme": "US growth active"},
    {"symbol": "VMFXX", "name": "Vanguard Federal Money Market", "region": "US", "list_source": "Vanguard funds", "theme": "Cash / money market"},
    {"symbol": "SWISX", "name": "Schwab International Index", "region": "US", "list_source": "Schwab funds", "theme": "Developed ex-US"},
    {"symbol": "PRWCX", "name": "T. Rowe Price Capital Appreciation", "region": "US", "list_source": "T. Rowe Price", "theme": "Blend"},
    {"symbol": "ABALX", "name": "American Funds American Balanced", "region": "US", "list_source": "American Funds", "theme": "Balanced"},
]


def _http_get(url: str, timeout: float = 15.0) -> str:
    req = Request(url, headers={"User-Agent": "StockBuyPlanner/1.2"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _wiki_tables(url: str) -> list[pd.DataFrame]:
    html = _http_get(url)
    return pd.read_html(StringIO(html))


def _clean_symbol(raw: str) -> str:
    sym = (raw or "").strip().upper().replace(" ", "")
    if sym.count(".") == 1 and sym.endswith((".B", ".A")):
        sym = sym.replace(".", "-")
    return sym


def fetch_sp500_candidates() -> list[dict[str, str]]:
    try:
        tables = _wiki_tables("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")
        df = tables[0]
        sector_col = "GICS Sector" if "GICS Sector" in df.columns else None
        out: list[dict[str, str]] = []
        for _, row in df.iterrows():
            sym = _clean_symbol(str(row.get("Symbol", "")))
            if not sym:
                continue
            name = str(row.get("Security") or row.get("Company") or sym)
            theme = str(row[sector_col]) if sector_col and pd.notna(row.get(sector_col)) else "Equity"
            out.append(
                {
                    "category": "stocks",
                    "symbol": sym,
                    "name": name,
                    "region": "US",
                    "list_source": "Wikipedia · S&P 500",
                    "theme": theme,
                }
            )
        return out
    except (URLError, TimeoutError, ValueError, KeyError, pd.errors.ParserError):
        return [
            {**item, "category": "stocks", "list_source": item["list_source"]}
            for item in FALLBACK_STOCKS
            if item["region"] == "US"
        ]


def _wiki_index_table(url: str, suffix: str, region: str, list_source: str) -> list[dict[str, str]]:
    try:
        tables = _wiki_tables(url)
        out: list[dict[str, str]] = []
        for df in tables:
            cols = {str(c).lower(): c for c in df.columns}
            sym_col = None
            name_col = None
            for key, col in cols.items():
                if sym_col is None and any(k in key for k in ("ticker", "epic", "symbol")):
                    sym_col = col
                if name_col is None and any(k in key for k in ("company", "name", "constituent")):
                    name_col = col
            if not sym_col:
                continue
            for _, row in df.iterrows():
                raw = str(row.get(sym_col) or "").strip()
                if not raw or raw.lower() in {"ticker", "symbol", "epic"}:
                    continue
                base = _clean_symbol(raw.split()[0])
                if not base or len(base) > 12:
                    continue
                symbol = base if "." in base else f"{base}.{suffix}"
                name = str(row.get(name_col) or base) if name_col else base
                out.append(
                    {
                        "category": "stocks",
                        "symbol": symbol,
                        "name": name,
                        "region": region,
                        "list_source": list_source,
                        "theme": "Equity",
                    }
                )
            if out:
                return out
        return []
    except (URLError, TimeoutError, ValueError, pd.errors.ParserError):
        return []


def fetch_eu_stock_candidates() -> list[dict[str, str]]:
    pools = [
        _wiki_index_table(
            "https://en.wikipedia.org/wiki/FTSE_100_Index",
            "L",
            "EU",
            "Wikipedia · FTSE 100",
        ),
        _wiki_index_table(
            "https://en.wikipedia.org/wiki/DAX",
            "DE",
            "EU",
            "Wikipedia · DAX",
        ),
        _wiki_index_table(
            "https://en.wikipedia.org/wiki/CAC_40",
            "PA",
            "EU",
            "Wikipedia · CAC 40",
        ),
    ]
    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for pool in pools:
        for item in pool:
            sym = item["symbol"]
            if sym in seen:
                continue
            seen.add(sym)
            merged.append(item)
    if merged:
        return merged
    return [
        {**item, "category": "stocks", "list_source": item["list_source"]}
        for item in FALLBACK_STOCKS
        if item["region"] == "EU"
    ]


def etf_candidates() -> list[dict[str, str]]:
    return [{**item, "category": "etfs"} for item in ETF_UNIVERSE]


def mutual_fund_candidates() -> list[dict[str, str]]:
    return [{**item, "category": "mutual_funds"} for item in MF_UNIVERSE]


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


def score_stock_candidate(metrics: dict[str, Any]) -> float:
    """Higher = more interesting right now (quality + momentum, penalize crashes)."""
    cap = _safe_float(metrics.get("market_cap")) or 0.0
    change = _safe_float(metrics.get("change_6m_pct")) or 0.0
    volume = _safe_float(metrics.get("avg_volume")) or 0.0
    cap_score = math.log10(cap + 1.0) * 2.0
    momentum = max(min(change, 40.0), -25.0)
    liquidity = math.log10(volume + 1.0) * 0.5
    return cap_score + momentum * 0.55 + liquidity


def score_etf_candidate(metrics: dict[str, Any]) -> float:
    assets = _safe_float(metrics.get("total_assets")) or 0.0
    expense = _safe_float(metrics.get("expense_ratio_pct"))
    volume = _safe_float(metrics.get("avg_volume")) or 0.0
    expense_penalty = (expense or 0.15) * 8.0
    return math.log10(assets + 1.0) * 3.0 + math.log10(volume + 1.0) - expense_penalty


def score_mutual_fund_candidate(metrics: dict[str, Any]) -> float:
    assets = _safe_float(metrics.get("total_assets")) or 0.0
    expense = _safe_float(metrics.get("expense_ratio_pct"))
    ret = _safe_float(metrics.get("change_6m_pct")) or 0.0
    expense_penalty = (expense or 0.5) * 6.0
    return math.log10(assets + 1.0) * 3.0 + ret * 0.25 - expense_penalty


def selection_reason(category: str, metrics: dict[str, Any], score: float) -> str:
    change = metrics.get("change_6m_pct")
    if category == "stocks":
        cap = metrics.get("market_cap")
        if cap and change is not None:
            return f"Ranked by size + 6m momentum (score {score:.1f})"
        return "Ranked from live index constituents"
    if category == "etfs":
        expense = metrics.get("expense_ratio_pct")
        if expense is not None:
            return f"Ranked by AUM, liquidity, low fees ({expense:.2f}% exp.)"
        return "Ranked by AUM and liquidity"
    expense = metrics.get("expense_ratio_pct")
    if expense is not None:
        return f"Ranked by AUM, returns, fees ({expense:.2f}% exp.)"
    return "Ranked from provider fund universe"
