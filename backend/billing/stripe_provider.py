"""Stripe Checkout + webhooks."""

from __future__ import annotations

from typing import Any

from db import get_user_by_id
from settings import billing_config, billing_enabled

from .base import BillingProvider
from .subscription_sync import apply_subscription_state


class StripeProvider(BillingProvider):
    id = "stripe"
    name = "Stripe"
    methods = ("card", "sepa_debit", "apple_pay", "google_pay")

    def _stripe(self) -> dict:
        return billing_config()["stripe"]

    def _allowed(self) -> bool:
        cfg = billing_config()
        return billing_enabled() and self.id in cfg["enabled_providers"]

    def is_configured(self) -> bool:
        if not self._allowed():
            return False
        s = self._stripe()
        return bool(s.get("secret_key") and s.get("price_monthly"))

    def create_checkout(self, *, user_id: int, interval: str) -> dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "code": "billing_not_configured"}
        try:
            import stripe
        except ImportError:
            return {"ok": False, "code": "billing_not_configured"}

        cfg = billing_config()
        s = cfg["stripe"]
        stripe.api_key = s["secret_key"]
        user = get_user_by_id(user_id)
        if not user:
            return {"ok": False, "code": "user_not_found"}

        price_id = s["price_yearly"] if interval == "year" else s["price_monthly"]
        if not price_id:
            return {"ok": False, "code": "billing_not_configured"}

        customer_id = user.get("stripe_customer_id")
        base_url = cfg["public_url"]

        session_kwargs: dict[str, Any] = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{base_url}/account?billing=success&provider=stripe",
            "cancel_url": f"{base_url}/pricing?billing=cancel",
            "client_reference_id": str(user_id),
            "metadata": {"user_id": str(user_id), "billing_provider": "stripe"},
        }
        trial_days = cfg["trial_days"]
        if trial_days > 0:
            session_kwargs["subscription_data"] = {"trial_period_days": trial_days}

        if customer_id:
            session_kwargs["customer"] = customer_id
        else:
            session_kwargs["customer_creation"] = "always"

        session = stripe.checkout.Session.create(**session_kwargs)
        if session.customer and not customer_id:
            apply_subscription_state(
                user_id=user_id,
                provider="stripe",
                tier=user.get("subscription_tier") or "free",
                customer_id=str(session.customer),
                status="checkout_started",
            )
        return {"ok": True, "url": session.url, "provider": self.id}

    def handle_webhook(self, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
        if not self._stripe().get("webhook_secret") or not self._stripe().get("secret_key"):
            return {"ok": False, "code": "billing_not_configured"}

        try:
            import stripe
        except ImportError:
            return {"ok": False, "code": "billing_not_configured"}

        s = self._stripe()
        stripe.api_key = s["secret_key"]
        signature = headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(payload, signature, s["webhook_secret"])
        except Exception:
            return {"ok": False, "code": "invalid_signature"}

        if event["type"] == "checkout.session.completed":
            obj = event["data"]["object"]
            user_id = int(
                obj.get("metadata", {}).get("user_id") or obj.get("client_reference_id") or 0
            )
            if user_id:
                paid = obj.get("payment_status") == "paid" or obj.get("status") == "complete"
                tier = "pro" if paid else "free"
                apply_subscription_state(
                    user_id=user_id,
                    provider="stripe",
                    tier=tier,
                    customer_id=str(obj.get("customer") or "") or None,
                    subscription_id=str(obj.get("subscription") or "") or None,
                    status="active" if paid else obj.get("status"),
                )
        elif event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
            obj = event["data"]["object"]
            user_id = int(obj.get("metadata", {}).get("user_id") or 0)
            if not user_id:
                customer = str(obj.get("customer") or "")
                if customer:
                    from db import get_user_by_stripe_customer

                    match = get_user_by_stripe_customer(customer)
                    if match:
                        user_id = int(match["id"])
            if user_id:
                status = obj.get("status") or "active"
                tier = "pro" if status in ("active", "trialing") else "free"
                apply_subscription_state(
                    user_id=user_id,
                    provider="stripe",
                    tier=tier,
                    customer_id=str(obj.get("customer") or "") or None,
                    subscription_id=str(obj.get("id") or "") or None,
                    status=status,
                )
        elif event["type"] == "customer.subscription.deleted":
            obj = event["data"]["object"]
            user_id = int(obj.get("metadata", {}).get("user_id") or 0)
            if not user_id:
                customer = str(obj.get("customer") or "")
                if customer:
                    from db import get_user_by_stripe_customer

                    match = get_user_by_stripe_customer(customer)
                    if match:
                        user_id = int(match["id"])
            if user_id:
                apply_subscription_state(
                    user_id=user_id,
                    provider="stripe",
                    tier="free",
                    status="canceled",
                )
        return {"ok": True}

    def create_portal(self, *, user_id: int) -> dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "code": "billing_not_configured"}
        try:
            import stripe
        except ImportError:
            return {"ok": False, "code": "billing_not_configured"}

        user = get_user_by_id(user_id)
        if not user:
            return {"ok": False, "code": "user_not_found"}
        customer_id = user.get("stripe_customer_id") or user.get("billing_customer_id")
        if not customer_id:
            return {"ok": False, "code": "no_billing_customer"}

        stripe.api_key = self._stripe()["secret_key"]
        base_url = billing_config()["public_url"]
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{base_url}/account?billing=portal",
        )
        return {"ok": True, "url": session.url, "provider": self.id}