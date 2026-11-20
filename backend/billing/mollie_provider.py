"""Mollie payments."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from db import get_user_by_id
from settings import billing_config, billing_enabled

from .base import BillingProvider
from .subscription_sync import apply_subscription_state


class MollieProvider(BillingProvider):
    id = "mollie"
    name = "Mollie"
    methods = ("card", "ideal", "bancontact", "sepa", "paypal")

    def _mollie(self) -> dict:
        return billing_config()["mollie"]

    def _allowed(self) -> bool:
        cfg = billing_config()
        return billing_enabled() and self.id in cfg["enabled_providers"]

    def is_configured(self) -> bool:
        if not self._allowed():
            return False
        m = self._mollie()
        return bool(m.get("api_key") and m.get("amount_monthly"))

    def _post(self, path: str, body: dict) -> dict:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.mollie.com/v2{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {self._mollie()['api_key']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    def create_checkout(self, *, user_id: int, interval: str) -> dict[str, Any]:
        if not self.is_configured():
            return {"ok": False, "code": "billing_not_configured"}
        m = self._mollie()
        user = get_user_by_id(user_id)
        if not user:
            return {"ok": False, "code": "user_not_found"}
        amount = m["amount_yearly"] if interval == "year" else m["amount_monthly"]
        if not amount:
            return {"ok": False, "code": "billing_not_configured"}
        if not m.get("checkout_implemented"):
            return {"ok": False, "code": "provider_not_implemented", "provider": self.id}

        cfg = billing_config()
        base_url = cfg["public_url"]
        try:
            payment = self._post(
                "/payments",
                {
                    "amount": {"currency": m.get("currency") or "EUR", "value": amount},
                    "description": m.get("description") or "Stock Buy Planner Pro",
                    "redirectUrl": f"{base_url}/account?billing=success&provider=mollie",
                    "cancelUrl": f"{base_url}/pricing?billing=cancel",
                    "webhookUrl": f"{base_url}/api/billing/webhook/mollie",
                    "metadata": {"user_id": str(user_id), "interval": interval},
                },
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return {"ok": False, "code": "provider_error", "provider": self.id}

        checkout = payment.get("_links", {}).get("checkout", {}).get("href")
        if not checkout:
            return {"ok": False, "code": "provider_error", "provider": self.id}
        apply_subscription_state(
            user_id=user_id,
            provider="mollie",
            tier=user.get("subscription_tier") or "free",
            customer_id=payment.get("customerId"),
            subscription_id=payment.get("id"),
            status=payment.get("status"),
        )
        return {"ok": True, "url": checkout, "provider": self.id}

    def handle_webhook(self, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
        m = self._mollie()
        if not m.get("api_key"):
            return {"ok": False, "code": "billing_not_configured"}
        if not m.get("webhook_implemented"):
            return {"ok": False, "code": "provider_not_implemented"}
        try:
            body = json.loads(payload.decode() or "{}")
        except json.JSONDecodeError:
            return {"ok": False, "code": "invalid_payload"}
        payment_id = body.get("id")
        if not payment_id:
            return {"ok": False, "code": "invalid_payload"}
        try:
            req = urllib.request.Request(
                f"https://api.mollie.com/v2/payments/{payment_id}",
                headers={"Authorization": f"Bearer {m['api_key']}"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                payment = json.loads(resp.read().decode())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return {"ok": False, "code": "provider_error"}

        meta = payment.get("metadata") or {}
        user_id = int(meta.get("user_id") or 0)
        if not user_id:
            return {"ok": True}
        paid = payment.get("status") == "paid"
        apply_subscription_state(
            user_id=user_id,
            provider="mollie",
            tier="pro" if paid else "free",
            customer_id=payment.get("customerId"),
            subscription_id=payment.get("id"),
            status=payment.get("status"),
        )
        return {"ok": True}