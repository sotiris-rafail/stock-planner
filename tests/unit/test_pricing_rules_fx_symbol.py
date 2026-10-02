from __future__ import annotations

from types import SimpleNamespace

import pandas as pd
import pytest

from dividends import DividendInfo
from pricing_rules import (
    normalize_user_price,
    preferred_price_currency,
    quote_in_preferred_currency,
)
from stock_service import StockQuote
from symbol_resolver import candidate_symbols


def _quote(**kwargs):
    defaults = dict(
        symbol="VUAA.L",
        name="VUAA",
        currency="EUR",
        price=100.0,
        previous_close=99.0,
        change_pct=1.0,
        avg_monthly_growth_pct=0.5,
        lookback_months=12,
        as_of="now",
        dividend=DividendInfo(False, None, None, [], []),
        requested_symbol="VUAA.EU",
        country="United Kingdom",
    )
    defaults.update(kwargs)
    return StockQuote(**defaults)


def test_preferred_currency_and_passthrough():
    assert preferred_price_currency("vuaa.eu") == "USD"
    assert preferred_price_currency(None) is None
    q = _quote(currency="USD")
    assert quote_in_preferred_currency(q, "VUAA.EU") is q


def test_quote_and_normalize_convert(monkeypatch):
    monkeypatch.setattr("pricing_rules.convert_amount", lambda amount, fr, to, on_date=None: 2.0 * amount)
    converted = quote_in_preferred_currency(_quote(), "VUAA.EU")
    assert converted.currency == "USD"
    assert converted.price == 200.0
    live = normalize_user_price(requested_symbol="VUAA.EU", price=None, quote=_quote())
    assert live.converted and live.price == 200.0
    typed = normalize_user_price(requested_symbol="VUAA.EU", price=50.0, quote=_quote())
    assert typed.price == 50.0 and not typed.converted
    same = normalize_user_price(requested_symbol="AAPL", price=None, quote=_quote(currency="USD", symbol="AAPL"))
    assert same.price == 100.0 and not same.converted


def test_candidate_symbols_aliases():
    vuaa = candidate_symbols("vuaa.eu")
    assert vuaa[0] == "VUAA.EU"
    assert "VUAA.L" in vuaa
    dte = candidate_symbols("FOO.EU")
    assert "FOO.DE" in dte
    gr = candidate_symbols("ETE.GR")
    assert "ETE.AT" in gr


def test_fx_same_currency_and_cache(monkeypatch):
    import fx

    fx._CACHE.clear()
    assert fx.get_fx_rate("EUR", "EUR") == 1.0
    with pytest.raises(ValueError):
        fx.get_fx_rate("", "USD")

    hist = pd.DataFrame({"Close": [1.1]}, index=pd.to_datetime(["2026-01-15"]))

    class Ticker:
        def history(self, **kwargs):
            return hist

    monkeypatch.setattr(fx, "yf", SimpleNamespace(Ticker=lambda symbol: Ticker()), raising=False)
    rate = fx.get_fx_rate("USD", "EUR", "2026-01-15")
    assert rate == pytest.approx(1.1)
    assert fx.convert_amount(10, "USD", "EUR", "2026-01-15") == pytest.approx(11.0)
    assert fx.get_fx_rate("USD", "EUR", "2026-01-15") == pytest.approx(1.1)
