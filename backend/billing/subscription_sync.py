"""Map provider webhooks to local subscription_tier."""

from __future__ import annotations

from db import update_user_subscription


def apply_subscription_state(
    *,
    user_id: int,
    provider: str,
    tier: str,
    customer_id: str | None = None,
    subscription_id: str | None = None,
    status: str | None = None,
) -> None:
    stripe_customer = customer_id if provider == "stripe" else None
    stripe_sub = subscription_id if provider == "stripe" else None
    update_user_subscription(
        user_id=user_id,
        subscription_tier=tier,
        billing_provider=provider,
        billing_customer_id=customer_id,
        billing_subscription_id=subscription_id,
        subscription_status=status,
        stripe_customer_id=stripe_customer,
        stripe_subscription_id=stripe_sub,
    )