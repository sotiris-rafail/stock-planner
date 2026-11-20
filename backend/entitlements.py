"""Free vs Pro feature gates (see docs/entitlements.md)."""

from __future__ import annotations

from datetime import datetime, timezone

from budget_plan import month_span, parse_month
from db import count_budget_plans, count_watchlist_items, get_user_by_id
from settings import billing_config, paywall_enabled


def _limits() -> dict:
    return billing_config()["entitlements"]


def user_is_pro(user_id: int) -> bool:
    user = get_user_by_id(user_id)
    if not user:
        return False
    tier = (user.get("subscription_tier") or "free").lower()
    if tier == "pro":
        return True
    trial_ends = user.get("trial_ends_at")
    if trial_ends:
        try:
            ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=timezone.utc)
            if ends > datetime.now(timezone.utc):
                return True
        except ValueError:
            pass
    return False


class ProRequired(Exception):
    def __init__(self, feature: str, detail: str):
        self.feature = feature
        self.detail = detail
        super().__init__(detail)


def require_pro(user_id: int, feature: str, *, detail: str | None = None) -> None:
    if not paywall_enabled():
        return
    if user_is_pro(user_id):
        return
    raise ProRequired(feature, detail or "Pro subscription required")


def assert_budget_plan_create(user_id: int) -> None:
    lim = _limits()
    if not paywall_enabled() or user_is_pro(user_id):
        return
    if count_budget_plans(user_id=user_id) >= lim["free_max_budget_plans"]:
        raise ProRequired(
            "budget_plans",
            "Free accounts can have one budget plan. Upgrade to Pro for unlimited plans.",
        )


def assert_budget_plan_window(user_id: int, *, start_month: str, end_month: str) -> None:
    lim = _limits()
    try:
        start = parse_month(start_month)
        end = parse_month(end_month)
    except ValueError:
        return
    if not start or not end:
        return
    span = month_span(start, end)
    pro_max = lim["pro_max_plan_months"]
    free_max = lim["free_max_plan_months"]
    max_months = pro_max if user_is_pro(user_id) or not paywall_enabled() else free_max
    if span > max_months:
        if max_months == free_max:
            raise ProRequired(
                "budget_window",
                f"Free accounts can plan up to {free_max} months. Upgrade to Pro for longer plans.",
            )
        raise ValueError(f"A plan can cover at most {pro_max} months.")


def assert_monthly_email(user_id: int) -> None:
    require_pro(
        user_id,
        "monthly_email",
        detail="Monthly email reports are included with Pro.",
    )


def assert_watchlist_add(user_id: int) -> None:
    lim = _limits()
    if not paywall_enabled() or user_is_pro(user_id):
        return
    if count_watchlist_items(user_id=user_id) >= lim["free_max_watchlist"]:
        raise ProRequired(
            "watchlist",
            f"Free accounts can track up to {lim['free_max_watchlist']} symbols. Upgrade to Pro for more.",
        )