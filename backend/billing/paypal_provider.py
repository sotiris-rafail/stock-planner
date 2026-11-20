"""PayPal Subscriptions."""

from __future__ import annotations

from typing import Any

from db import get_user_by_id
from settings import billing_config, billing_enabled

from .base import BillingProvider


class PayPalProvider(BillingProvider):
    id = "paypal"
    name = "PayPal"
    methods = ("paypal", "card")

    def _paypal(self) -> dict:
        return billing_config()["paypal"]

    def _allowed(self) -> bool:
        cfg = billing_config()
        return billing_enabled() and self.id in cfg["enabled_providers"]

    def is_configured(self) -> bool:
        if not self._allowed():
            return False
        p = self._paypal()
        return bool(p.get("client_id") and p.get("client_secret") and p.get("plan_monthly"))

    def create_checkout(self, *, user_id: int, interval: str) -> dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "code": "billing_not_configured"}
        p = self._paypal()
        plan_id = p["plan_yearly"] if interval == "year" else p["plan_monthly"]
        if not plan_id:
            return {"ok": False, "code": "billing_not_configured"}
        if not get_user_by_id(user_id):
            return {"ok": False, "code": "user_not_found"}
        if not p.get("checkout_implemented"):
            return {"ok": False, "code": "provider_not_implemented", "provider": self.id}
        return {"ok": False, "code": "provider_not_implemented", "provider": self.id}

    def handle_webhook(self, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "code": "billing_not_configured"}
        if not self._paypal().get("webhook_implemented"):
            return {"ok": False, "code": "provider_not_implemented"}
        return {"ok": True}