"""Payment provider interface (Stripe, PayPal, Mollie, …)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProviderPublic:
    id: str
    name: str
    methods: tuple[str, ...]
    configured: bool


class BillingProvider(ABC):
    id: str
    name: str
    methods: tuple[str, ...] = ("card",)

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    def public(self) -> ProviderPublic:
        return ProviderPublic(
            id=self.id,
            name=self.name,
            methods=self.methods,
            configured=self.is_configured(),
        )

    @abstractmethod
    def create_checkout(self, *, user_id: int, interval: str) -> dict[str, Any]:
        """Return {ok: True, url: str} or {ok: False, code: str}."""

    @abstractmethod
    def handle_webhook(self, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
        """Return {ok: True} or {ok: False, code: str}."""

    def customer_portal_url(self, *, user_id: int) -> str | None:
        return None