"""Multi-provider billing facade."""

from __future__ import annotations

from typing import Any

from .base import BillingProvider, ProviderPublic
from db import get_user_by_id
from settings import billing_config, billing_enabled

from .mollie_provider import MollieProvider
from .paypal_provider import PayPalProvider
from .stripe_provider import StripeProvider

_REGISTRY: dict[str, BillingProvider] = {
    StripeProvider.id: StripeProvider(),
    PayPalProvider.id: PayPalProvider(),
    MollieProvider.id: MollieProvider(),
}


def all_providers() -> list[BillingProvider]:
    cfg = billing_config()
    allowed = set(cfg["enabled_providers"])
    return [p for pid, p in _REGISTRY.items() if pid in allowed]


def get_provider(provider_id: str) -> BillingProvider | None:
    return _REGISTRY.get((provider_id or "").strip().lower())


def list_providers_public(*, include_unconfigured: bool = False) -> list[dict[str, Any]]:
    if not billing_enabled():
        return []
    out: list[dict[str, Any]] = []
    for provider in all_providers():
        if include_unconfigured or provider.is_configured():
            public: ProviderPublic = provider.public()
            out.append(
                {
                    "id": public.id,
                    "name": public.name,
                    "methods": list(public.methods),
                    "configured": public.configured,
                }
            )
    return out


def billing_configured() -> bool:
    return any(p.is_configured() for p in all_providers())


def default_provider_id() -> str | None:
    for provider in all_providers():
        if provider.is_configured():
            return provider.id
    return None


def create_checkout_session(
    *, user_id: int, interval: str = "month", provider: str | None = None
) -> dict[str, Any]:
    pid = (provider or default_provider_id() or "").strip().lower()
    if not pid:
        return {"ok": False, "code": "billing_not_configured"}
    impl = get_provider(pid)
    if not impl:
        return {"ok": False, "code": "unknown_provider"}
    if not impl.is_configured():
        return {"ok": False, "code": "billing_not_configured", "provider": pid}
    result = impl.create_checkout(user_id=user_id, interval=interval)
    result.setdefault("provider", pid)
    return result


def handle_webhook(provider_id: str, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
    impl = get_provider(provider_id)
    if not impl:
        return {"ok": False, "code": "unknown_provider"}
    return impl.handle_webhook(payload, headers)


# Backward-compatible alias
def handle_stripe_webhook(payload: bytes, signature: str) -> dict[str, Any]:
    return handle_webhook("stripe", payload, {"stripe-signature": signature})


def user_can_open_billing_portal(user: dict | None) -> bool:
    if not user or not billing_enabled():
        return False
    stripe = get_provider("stripe")
    if not stripe or not stripe.is_configured():
        return False
    customer = user.get("stripe_customer_id") or user.get("billing_customer_id")
    return bool(customer)


def create_billing_portal(*, user_id: int, provider: str | None = None) -> dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        return {"ok": False, "code": "user_not_found"}
    pid = (provider or user.get("billing_provider") or "stripe").strip().lower()
    impl = get_provider(pid)
    if not impl or not hasattr(impl, "create_portal"):
        return {"ok": False, "code": "portal_not_supported", "provider": pid}
    result = impl.create_portal(user_id=user_id)
    result.setdefault("provider", pid)
    return result