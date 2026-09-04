"""Per-symbol price input rules (e.g. VUAA.EU always entered in USD)."""

from __future__ import annotations

from dataclasses import dataclass

from fx import convert_amount
from stock_service import StockQuote

# Broker symbols where the user always types prices in this currency,
# even if some Yahoo listings quote in another currency.
PRICE_INPUT_CURRENCY: dict[str, str] = {
    "VUAA.EU": "USD",
    "DTE.DE": "EUR",
    "DTE": "EUR",
    "ETE.GR": "EUR",
    "ETE.AT": "EUR",
}


@dataclass
class NormalizedTradePrice:
    price: float
    currency: str
    market_currency: str
    converted: bool
    fx_rate: float | None = None
    conversion_note: str | None = None


def preferred_price_currency(requested_symbol: str | None) -> str | None:
    if not requested_symbol:
        return None
    return PRICE_INPUT_CURRENCY.get(requested_symbol.upper().strip())


def quote_in_preferred_currency(
    quote: StockQuote,
    requested_symbol: str | None,
    on_date: str | None = None,
) -> StockQuote:
    """
    Return a quote whose price/currency match the user's preferred input currency.

    For VUAA.EU this converts an EUR listing into USD when needed.
    """
    preferred = preferred_price_currency(requested_symbol or quote.requested_symbol)
    market = (quote.currency or "USD").upper()
    if not preferred or preferred == market:
        return quote

    rate = convert_amount(1.0, market, preferred, on_date)
    converted_price = round(quote.price * rate, 4)
    prev = None
    if quote.previous_close is not None:
        prev = round(quote.previous_close * rate, 4)

    return StockQuote(
        symbol=quote.symbol,
        name=quote.name,
        currency=preferred,
        price=converted_price,
        previous_close=prev,
        change_pct=quote.change_pct,
        avg_monthly_growth_pct=quote.avg_monthly_growth_pct,
        lookback_months=quote.lookback_months,
        as_of=quote.as_of,
        dividend=quote.dividend,
        requested_symbol=quote.requested_symbol or (requested_symbol.upper().strip() if requested_symbol else None),
        country=quote.country,
    )


def normalize_user_price(
    *,
    requested_symbol: str,
    price: float | None,
    quote: StockQuote,
    on_date: str | None = None,
) -> NormalizedTradePrice:
    """
    Treat user-entered prices as the preferred input currency when configured.

    Stores/trades in that preferred currency (USD for VUAA.EU). If live fill is
    used and the market quotes elsewhere, convert into the preferred currency.
    """
    preferred = preferred_price_currency(requested_symbol) or (quote.currency or "USD").upper()
    market = (quote.currency or "USD").upper()

    if price is None:
        if preferred == market:
            return NormalizedTradePrice(
                price=quote.price,
                currency=preferred,
                market_currency=market,
                converted=False,
            )
        rate = convert_amount(1.0, market, preferred, on_date)
        return NormalizedTradePrice(
            price=round(quote.price * rate, 4),
            currency=preferred,
            market_currency=market,
            converted=True,
            fx_rate=round(rate, 6),
            conversion_note=f"Converted live {market} price to {preferred} (rate {rate:.4f})",
        )

    # User typed a price: keep it in preferred currency (no silent rewrite).
    return NormalizedTradePrice(
        price=price,
        currency=preferred,
        market_currency=market,
        converted=False,
    )
