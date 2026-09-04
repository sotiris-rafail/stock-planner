"""Resolve broker-style tickers to Yahoo Finance symbols."""

from __future__ import annotations

# Broker/platform aliases (e.g. Trading 212 .EU) -> Yahoo candidates (preferred first)
# VUAA.EU is traded/entered in USD on many brokers → prefer London USD listing.
SYMBOL_ALIASES: dict[str, list[str]] = {
    "VUAA.EU": ["VUAA.L", "VUAA.DE", "VUAA.MI", "VUAA.AS"],
    "VUAA": ["VUAA.L", "VUAA.DE", "VUAA.MI"],
    "VUSA.EU": ["VUSA.DE", "VUSA.AS", "VUSA.L"],
    "VWCE.EU": ["VWCE.DE", "VWCE.AS", "VWCE.MI"],
    "SXR8.EU": ["SXR8.DE"],
    "CSPX.EU": ["CSPX.L", "CSPX.DE"],
    # Greek / Athens (.GR is common on brokers; Yahoo uses .AT)
    "ETE.GR": ["ETE.AT"],
    "EUROB.GR": ["EUROB.AT"],
    "ALPHA.GR": ["ALPHA.AT"],
    "TPEIR.GR": ["TPEIR.AT"],
    "HTO.GR": ["HTO.AT"],
    "PPC.GR": ["PPC.AT"],
    "OPAP.GR": ["OPAP.AT"],
    "MOH.GR": ["MOH.AT"],
    "BELA.GR": ["BELA.AT"],
    "MYTIL.GR": ["MYTIL.AT"],
}

# When a ticker ends with .EU (not a Yahoo exchange), try these European listings.
# Prefer EUR venues before London (.L), except where SYMBOL_ALIASES overrides.
EU_FALLBACK_SUFFIXES = (
    ".DE",
    ".AS",
    ".PA",
    ".MI",
    ".BR",
    ".LS",
    ".HE",
    ".OL",
    ".CO",
    ".ST",
    ".SW",
    ".L",
    ".AT",
)

# Brokers often use .GR for Athens; Yahoo Finance uses .AT
GR_FALLBACK_SUFFIXES = (".AT",)


def candidate_symbols(symbol: str) -> list[str]:
    """Return lookup candidates, original first, then aliases/fallbacks."""
    raw = symbol.upper().strip()
    candidates: list[str] = []

    def add(value: str) -> None:
        if value and value not in candidates:
            candidates.append(value)

    add(raw)

    for alias in SYMBOL_ALIASES.get(raw, []):
        add(alias)

    if raw.endswith(".EU"):
        root = raw[: -len(".EU")]
        if root:
            for suffix in EU_FALLBACK_SUFFIXES:
                add(f"{root}{suffix}")

    if raw.endswith(".GR"):
        root = raw[: -len(".GR")]
        if root:
            for suffix in GR_FALLBACK_SUFFIXES:
                add(f"{root}{suffix}")

    return candidates
