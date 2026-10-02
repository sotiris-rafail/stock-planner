from __future__ import annotations

from types import SimpleNamespace

import pandas as pd
import pytest

from dividends import DividendInfo
from suggestion_sources import (
    _clean_symbol,
    etf_candidates,
    fetch_eu_stock_candidates,
    fetch_sp500_candidates,
    mutual_fund_candidates,
    score_etf_candidate,
    score_mutual_fund_candidate,
    score_stock_candidate,
    selection_reason,
)
from stock_service import StockQuote, _estimate_avg_monthly_growth, _safe_float, fetch_dividends, fetch_quote


def test_safe_float_and_growth():
    assert _safe_float(None) is None
    assert _safe_float("x") is None
    assert _safe_float(float("nan")) is None
    idx = pd.date_range("2024-01-01", periods=4, freq="ME")
    hist = pd.DataFrame({"Close": [100, 110, 121, 133.1]}, index=idx)
    ticker = SimpleNamespace(history=lambda **k: hist)
    growth = _estimate_avg_monthly_growth(ticker, 3)
    assert growth > 0


def test_fetch_quote_mocked(monkeypatch):
    info = {"shortName": "DT", "currency": "EUR", "country": "Germany", "regularMarketPrice": 20, "previousClose": 19}
    monthly = pd.DataFrame(
        {"Close": [10.0, 11.0, 12.0]},
        index=pd.date_range("2024-01-31", periods=3, freq="ME"),
    )

    class Ticker:
        def __init__(self):
            self.info = info

        def history(self, **kwargs):
            return monthly

    monkeypatch.setattr("stock_service.yf.Ticker", lambda symbol: Ticker())
    monkeypatch.setattr(
        "stock_service.fetch_dividend_info",
        lambda *a, **k: DividendInfo(False, None, None, [], []),
    )
    q = fetch_quote("dte.de", include_dividends=False)
    assert isinstance(q, StockQuote)
    assert q.symbol == "DTE.DE"
    assert q.price == 20
    divs = fetch_dividends("DTE.DE")
    assert divs["symbol"] == "DTE.DE"


def test_suggestion_sources_scores(monkeypatch):
    assert _clean_symbol("BRK.B") == "BRK-B"
    assert etf_candidates()
    assert mutual_fund_candidates()
    assert score_stock_candidate({"market_cap": 1e11, "change_6m_pct": 10, "avg_volume": 1e6}) > 0
    assert score_etf_candidate({"total_assets": 1e10, "expense_ratio_pct": 0.03, "avg_volume": 1e6}) > 0
    assert score_mutual_fund_candidate({"total_assets": 1e9, "expense_ratio_pct": 0.1, "change_6m_pct": 5}) > 0
    reason = selection_reason("stocks", {"market_cap": 1e11, "change_6m_pct": 12}, 50)
    assert "momentum" in reason
    assert "AUM" in selection_reason("etfs", {"expense_ratio_pct": 0.05}, 1)
    assert "provider" in selection_reason("mutual_funds", {}, 1)
    monkeypatch.setattr(
        "suggestion_sources._wiki_tables",
        lambda url: (_ for _ in ()).throw(ValueError("offline")),
    )
    assert fetch_sp500_candidates()
    assert fetch_eu_stock_candidates()
