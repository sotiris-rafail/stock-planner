from __future__ import annotations

from settings import billing_config, reload_configuration


def test_billing_defaults_without_remote_keys(monkeypatch, isolated_db):
    reload_configuration()
    cfg = billing_config()
    assert cfg["enabled"] is False
    assert cfg["enforce_paywall"] is True
    assert cfg["entitlements"]["free_max_budget_plans"] == 1
    assert cfg["enabled_providers"] == ["stripe"]
    assert cfg["stripe"]["secret_key"] == ""