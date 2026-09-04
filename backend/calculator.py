"""Dollar-cost averaging buy-plan calculator."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class PeriodPlan:
    period: int
    projected_price: float
    shares_bought: float
    cost: float
    shares_owned: float
    portfolio_value: float
    total_invested: float
    period_growth: float
    accumulated_growth: float
    accumulated_growth_pct: float


@dataclass
class BuyPlanResult:
    symbol: str
    company_name: str
    currency: str
    current_price: float
    frequency: str
    period_label: str
    avg_period_growth_pct: float
    avg_monthly_growth_pct: float
    total_shares: float
    periods: int
    shares_per_period: float
    average_period_cost: float
    total_invested: float
    final_portfolio_value: float
    total_growth: float
    total_growth_pct: float
    schedule: list[PeriodPlan]

    # Backward-compatible aliases used by older clients
    @property
    def months(self) -> int:
        return self.periods

    @property
    def shares_per_month(self) -> float:
        return self.shares_per_period

    @property
    def average_monthly_cost(self) -> float:
        return self.average_period_cost


def monthly_to_yearly_growth_pct(monthly_growth_pct: float) -> float:
    return ((1 + monthly_growth_pct / 100.0) ** 12 - 1.0) * 100.0


def calculate_buy_plan(
    *,
    symbol: str,
    company_name: str,
    currency: str,
    current_price: float,
    avg_monthly_growth_pct: float,
    total_shares: float,
    periods: int,
    frequency: str = "monthly",
    growth_override_pct: float | None = None,
) -> BuyPlanResult:
    """
    Plan buying `total_shares` evenly over `periods`.

    frequency:
      - monthly: one purchase per month; growth is monthly
      - yearly: one purchase per year; growth is compounded annual
    """
    if total_shares <= 0:
        raise ValueError("total_shares must be positive")
    if periods < 1:
        raise ValueError("periods must be at least 1")
    if current_price <= 0:
        raise ValueError("current_price must be positive")

    freq = (frequency or "monthly").lower().strip()
    if freq not in {"monthly", "yearly"}:
        raise ValueError("frequency must be 'monthly' or 'yearly'")

    if growth_override_pct is not None:
        period_growth_pct = growth_override_pct
    elif freq == "yearly":
        period_growth_pct = monthly_to_yearly_growth_pct(avg_monthly_growth_pct)
    else:
        period_growth_pct = avg_monthly_growth_pct

    growth_factor = 1 + (period_growth_pct / 100.0)
    shares_per_period = total_shares / periods
    period_label = "Year" if freq == "yearly" else "Month"

    schedule: list[PeriodPlan] = []
    shares_owned = 0.0
    total_invested = 0.0
    price = current_price

    for period in range(1, periods + 1):
        cost = shares_per_period * price
        shares_owned += shares_per_period
        total_invested += cost
        portfolio_value = shares_owned * price
        accumulated_growth = portfolio_value - total_invested
        accumulated_growth_pct = (
            (accumulated_growth / total_invested) * 100 if total_invested else 0.0
        )

        if period == 1:
            period_growth = 0.0
        else:
            prior_shares = shares_owned - shares_per_period
            prior_value_before = prior_shares * (price / growth_factor)
            prior_value_after = prior_shares * price
            period_growth = prior_value_after - prior_value_before

        schedule.append(
            PeriodPlan(
                period=period,
                projected_price=round(price, 4),
                shares_bought=round(shares_per_period, 6),
                cost=round(cost, 2),
                shares_owned=round(shares_owned, 6),
                portfolio_value=round(portfolio_value, 2),
                total_invested=round(total_invested, 2),
                period_growth=round(period_growth, 2),
                accumulated_growth=round(accumulated_growth, 2),
                accumulated_growth_pct=round(accumulated_growth_pct, 2),
            )
        )

        price *= growth_factor

    final = schedule[-1]
    avg_period_cost = total_invested / periods

    return BuyPlanResult(
        symbol=symbol,
        company_name=company_name,
        currency=currency,
        current_price=round(current_price, 4),
        frequency=freq,
        period_label=period_label,
        avg_period_growth_pct=round(period_growth_pct, 4),
        avg_monthly_growth_pct=round(avg_monthly_growth_pct, 4),
        total_shares=total_shares,
        periods=periods,
        shares_per_period=round(shares_per_period, 6),
        average_period_cost=round(avg_period_cost, 2),
        total_invested=round(total_invested, 2),
        final_portfolio_value=final.portfolio_value,
        total_growth=final.accumulated_growth,
        total_growth_pct=final.accumulated_growth_pct,
        schedule=schedule,
    )


def result_to_dict(result: BuyPlanResult) -> dict:
    data = asdict(result)
    # Keep older field names for compatibility with existing UI/clients
    data["months"] = result.periods
    data["shares_per_month"] = result.shares_per_period
    data["average_monthly_cost"] = result.average_period_cost
    data["schedule"] = [
        {
            **row,
            "month": row["period"],
            "month_growth": row["period_growth"],
        }
        for row in data["schedule"]
    ]
    return data
