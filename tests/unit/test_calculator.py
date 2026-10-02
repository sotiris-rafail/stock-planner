from __future__ import annotations

import pytest

from calculator import calculate_buy_plan, monthly_to_yearly_growth_pct, result_to_dict


def test_monthly_plan_even_shares_and_growth():
    result = calculate_buy_plan(
        symbol="DTE.DE",
        company_name="DT",
        currency="EUR",
        current_price=10.0,
        avg_monthly_growth_pct=10.0,
        total_shares=4,
        periods=2,
        frequency="monthly",
    )
    assert result.shares_per_period == 2.0
    assert result.months == 2
    assert result.schedule[0].period_growth == 0.0
    assert result.schedule[1].projected_price == 11.0
    assert result.total_invested == 42.0
    data = result_to_dict(result)
    assert data["months"] == 2
    assert data["schedule"][0]["month"] == 1


def test_yearly_uses_compounded_growth():
    yearly = monthly_to_yearly_growth_pct(10)
    result = calculate_buy_plan(
        symbol="X",
        company_name="X",
        currency="USD",
        current_price=100,
        avg_monthly_growth_pct=10,
        total_shares=2,
        periods=1,
        frequency="yearly",
    )
    assert result.avg_period_growth_pct == round(yearly, 4)
    assert result.period_label == "Year"


def test_growth_override_and_validation():
    result = calculate_buy_plan(
        symbol="X",
        company_name="X",
        currency="USD",
        current_price=50,
        avg_monthly_growth_pct=1,
        total_shares=10,
        periods=1,
        growth_override_pct=0,
    )
    assert result.avg_period_growth_pct == 0
    with pytest.raises(ValueError):
        calculate_buy_plan(
            symbol="X", company_name="X", currency="USD",
            current_price=0, avg_monthly_growth_pct=1, total_shares=1, periods=1,
        )
    with pytest.raises(ValueError):
        calculate_buy_plan(
            symbol="X", company_name="X", currency="USD",
            current_price=1, avg_monthly_growth_pct=1, total_shares=1, periods=1,
            frequency="weekly",
        )
