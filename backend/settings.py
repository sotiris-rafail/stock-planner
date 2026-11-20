"""Load application.yml, then resolve property keys at runtime."""

from __future__ import annotations

import time
from pathlib import Path

import yaml

from properties import clear_property_cache, resolve_value

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "application.yml"
DEFAULT_SECRET = "dev-change-me-before-production"
DEFAULT_SILENT_STOCK_REFRESH_MINUTES = 15
DEFAULT_SUGGESTION_REFRESH_HOURS = 4
DEFAULT_SMTP_ENABLED = False
DEFAULT_EXPORT_ENABLED = False
DEFAULT_DELETE_ENABLED = True
DEFAULT_BACKUP_ENABLED = False
DEFAULT_BACKUP_INTERVAL_HOURS = 24
DEFAULT_BACKUP_KEEP = 14
DEFAULT_BACKUP_DIRECTORY = "data/backups"
DEFAULT_BILLING_ENABLED = False
DEFAULT_BILLING_ENFORCE_PAYWALL = True
DEFAULT_BILLING_TRIAL_DAYS = 14
DEFAULT_BILLING_PUBLIC_URL = "http://127.0.0.1:8000"
DEFAULT_ENABLED_PROVIDERS = ("stripe",)
DEFAULT_FREE_MAX_BUDGET_PLANS = 1
DEFAULT_FREE_MAX_PLAN_MONTHS = 24
DEFAULT_PRO_MAX_PLAN_MONTHS = 120
DEFAULT_FREE_MAX_WATCHLIST = 10
DEFAULT_PRO_MAX_WATCHLIST = 50
DEFAULT_GUEST_HOME = "pricing"
EXPORT_DISABLED_MESSAGE = "Export is disabled"
DELETE_DISABLED_MESSAGE = "Account deletion is disabled"
CONFIG_RELOAD_SECONDS = 30
EMAIL_DISABLED_MESSAGE = "Email is disabled for now. Thank you"
DEFAULT_CONFIG_FILES: dict[str, str] = {
    "application.yml": """secret_key: ${APP_SECRET_KEY}

# Silent background quote refresh interval in minutes.
# Value is loaded from the property key cron_job_silent_stock_refresh (default 15).
cron_job: ${cron_job_silent_stock_refresh}

# Suggestions symbol-universe rebuild interval in hours.
# Value is loaded from the property key suggestion.refresh.time (default 4).
suggestion_refresh: ${suggestion.refresh.time}

smtp:
  enabled: ${smtp.enabled}
  host: ${SMTP_HOST}
  port: ${SMTP_PORT}
  from: ${SMTP_FROM}
  user: ${SMTP_USER}
  password: ${SMTP_PASSWORD}

# CSV export of holdings, lots, and watchlist.
# Value is loaded from the property key export.enabled.
export:
  enabled: ${export.enabled}

# Account deletion from the Account page.
# Value is loaded from the property key delete.enabled.
delete:
  enabled: ${delete.enabled}

# Periodic copy of data/portfolio.db.
# Values are loaded from backup.enabled, backup.interval.hours, backup.keep, backup.directory.
backup:
  enabled: ${backup.enabled}
  interval_hours: ${backup.interval.hours}
  keep: ${backup.keep}
  directory: ${backup.directory}

# Pro billing (values from config server). When billing.enabled is false, checkout is off
# but entitlements still apply unless billing.enforce_paywall is false.
billing:
  enabled: ${billing.enabled}
  enforce_paywall: ${billing.enforce_paywall}
  default_provider: ${billing.default_provider}
  enabled_providers: ${billing.enabled_providers}
  trial_days: ${billing.trial_days}
  public_url: ${billing.public_url}

entitlements:
  free:
    max_budget_plans: ${entitlements.free.max_budget_plans}
    max_plan_months: ${entitlements.free.max_plan_months}
    max_watchlist: ${entitlements.free.max_watchlist}
  pro:
    max_plan_months: ${entitlements.pro.max_plan_months}
    max_watchlist: ${entitlements.pro.max_watchlist}

site:
  guest_home: ${site.guest_home}

stripe:
  secret_key: ${STRIPE_SECRET_KEY}
  webhook_secret: ${STRIPE_WEBHOOK_SECRET}
  price_monthly: ${STRIPE_PRICE_MONTHLY}
  price_yearly: ${STRIPE_PRICE_YEARLY}

mollie:
  api_key: ${MOLLIE_API_KEY}
  amount_monthly: ${MOLLIE_AMOUNT_MONTHLY}
  amount_yearly: ${MOLLIE_AMOUNT_YEARLY}
  currency: ${MOLLIE_CURRENCY}
  description: ${MOLLIE_DESCRIPTION}
  checkout_implemented: ${MOLLIE_CHECKOUT_IMPLEMENTED}
  webhook_implemented: ${MOLLIE_WEBHOOK_IMPLEMENTED}

paypal:
  client_id: ${PAYPAL_CLIENT_ID}
  client_secret: ${PAYPAL_CLIENT_SECRET}
  plan_monthly: ${PAYPAL_PLAN_MONTHLY}
  plan_yearly: ${PAYPAL_PLAN_YEARLY}
  checkout_implemented: ${PAYPAL_CHECKOUT_IMPLEMENTED}
  webhook_implemented: ${PAYPAL_WEBHOOK_IMPLEMENTED}
""",
    "properties.yml": """# Local file: keys in application.yml are filled from values.yml
provider:
  type: file
  file: values.yml

# Cloud / HTTP: GET a JSON (or YAML) object of the same keys.
# Uncomment this block and comment out the file provider above to use it.
#
# provider:
#   type: http
#   url: https://your-config-host/properties
#   token_url: https://your-config-host/auth/token
#   client_id: your-client-id
#   client_secret: your-client-secret
#   timeout: 15
#   refresh_seconds: 300
#   merge_local: true
#   fallback_file: values.yml
""",
    "values.yml": """APP_SECRET_KEY: dummy-change-me-before-production
SMTP_HOST: smtp.example.com
SMTP_PORT: 587
SMTP_FROM: noreply@example.com
SMTP_USER: smtp-user
SMTP_PASSWORD: dummy-smtp-password
smtp.enabled: false
export.enabled: true
delete.enabled: true
backup.enabled: true
backup.interval.hours: 24
backup.keep: 14
backup.directory: data/backups
cron_job_silent_stock_refresh: 15
suggestion.refresh.time: 4
billing.enabled: false
billing.enforce_paywall: true
billing.default_provider: stripe
billing.enabled_providers: stripe
billing.trial_days: 14
billing.public_url: http://127.0.0.1:8000
entitlements.free.max_budget_plans: 1
entitlements.free.max_plan_months: 24
entitlements.free.max_watchlist: 10
entitlements.pro.max_plan_months: 120
entitlements.pro.max_watchlist: 50
site.guest_home: pricing
STRIPE_SECRET_KEY: ""
STRIPE_WEBHOOK_SECRET: ""
STRIPE_PRICE_MONTHLY: ""
STRIPE_PRICE_YEARLY: ""
MOLLIE_API_KEY: ""
MOLLIE_AMOUNT_MONTHLY: ""
MOLLIE_AMOUNT_YEARLY: ""
MOLLIE_CURRENCY: EUR
MOLLIE_DESCRIPTION: Stock Buy Planner Pro
MOLLIE_CHECKOUT_IMPLEMENTED: false
MOLLIE_WEBHOOK_IMPLEMENTED: false
PAYPAL_CLIENT_ID: ""
PAYPAL_CLIENT_SECRET: ""
PAYPAL_PLAN_MONTHLY: ""
PAYPAL_PLAN_YEARLY: ""
PAYPAL_CHECKOUT_IMPLEMENTED: false
PAYPAL_WEBHOOK_IMPLEMENTED: false
""",
}
_app_data_cache: dict | None = None
_app_data_stamp: tuple | None = None
_app_data_loaded_at: float = 0.0


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return data if isinstance(data, dict) else {}


def prepare_config_files(*, overwrite: bool = False) -> list[Path]:
    """Create application.yml, properties.yml, and values.yml if they are missing."""
    created: list[Path] = []
    for name, contents in DEFAULT_CONFIG_FILES.items():
        target = PROJECT_ROOT / name
        if target.exists() and not overwrite:
            continue
        target.write_text(contents, encoding="utf-8")
        created.append(target)
    return created


def _config_stamp() -> tuple:
    values_path = PROJECT_ROOT / "values.yml"
    props_path = PROJECT_ROOT / "properties.yml"
    return (
        CONFIG_PATH.stat().st_mtime if CONFIG_PATH.exists() else 0.0,
        values_path.stat().st_mtime if values_path.exists() else 0.0,
        props_path.stat().st_mtime if props_path.exists() else 0.0,
    )


def reload_configuration() -> None:
    """Drop cached application.yml and property-map values so the next read is live."""
    global _app_data_cache, _app_data_stamp, _app_data_loaded_at
    clear_property_cache()
    _app_data_cache = None
    _app_data_stamp = None
    _app_data_loaded_at = 0.0


def _application_data() -> dict:
    global _app_data_cache, _app_data_stamp, _app_data_loaded_at
    now = time.monotonic()
    stamp = _config_stamp()
    if (
        _app_data_cache is not None
        and _app_data_stamp == stamp
        and (now - _app_data_loaded_at) < CONFIG_RELOAD_SECONDS
    ):
        return _app_data_cache
    data = resolve_value(_load_yaml(CONFIG_PATH))
    if not isinstance(data, dict):
        data = {}
    _app_data_cache = data
    _app_data_stamp = stamp
    _app_data_loaded_at = now
    return data


def load_application_config() -> dict:
    data = _application_data()
    smtp = data.get("smtp") or {}
    if not isinstance(smtp, dict):
        smtp = {}
    port_raw = smtp.get("port") or 587
    try:
        port = int(port_raw)
    except (TypeError, ValueError):
        port = 587
    return {
        "smtp": {
            "enabled": _as_bool(smtp.get("enabled"), DEFAULT_SMTP_ENABLED),
            "host": str(smtp.get("host") or "").strip(),
            "port": port,
            "from": str(smtp.get("from") or "noreply@localhost").strip(),
            "user": str(smtp.get("user") or "").strip(),
            "password": str(smtp.get("password") or ""),
        },
    }


def secret_key() -> str:
    data = _application_data()
    return str(data.get("secret_key") or DEFAULT_SECRET)


def smtp_config() -> dict:
    return load_application_config()["smtp"]


def smtp_enabled() -> bool:
    return bool(smtp_config().get("enabled"))


def _section_flag(section: str, *, default: bool) -> bool:
    data = _application_data()
    block = data.get(section) if isinstance(data.get(section), dict) else {}
    raw = (block or {}).get("enabled")
    if raw is None or raw == "" or (isinstance(raw, str) and raw.startswith("${")):
        raw = data.get(f"{section}.enabled")
    return _as_bool(raw, default)


def export_enabled() -> bool:
    return _section_flag("export", default=DEFAULT_EXPORT_ENABLED)


def delete_enabled() -> bool:
    return _section_flag("delete", default=DEFAULT_DELETE_ENABLED)


def _section_raw(section: str, field: str):
    data = _application_data()
    block = data.get(section) if isinstance(data.get(section), dict) else {}
    raw = (block or {}).get(field)
    if raw is None or raw == "" or (isinstance(raw, str) and str(raw).startswith("${")):
        dotted = data.get(f"{section}.{field}")
        if dotted is not None and dotted != "":
            return dotted
        return None
    return raw


def backup_enabled() -> bool:
    return _section_flag("backup", default=DEFAULT_BACKUP_ENABLED)


def backup_interval_hours() -> int:
    raw = _section_raw("backup", "interval_hours")
    try:
        hours = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_BACKUP_INTERVAL_HOURS
    if hours <= 0:
        return DEFAULT_BACKUP_INTERVAL_HOURS
    return hours


def backup_keep() -> int:
    raw = _section_raw("backup", "keep")
    try:
        keep = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_BACKUP_KEEP
    if keep <= 0:
        return DEFAULT_BACKUP_KEEP
    return min(keep, 365)


def backup_directory() -> Path:
    raw = _section_raw("backup", "directory")
    text = str(raw or DEFAULT_BACKUP_DIRECTORY).strip() or DEFAULT_BACKUP_DIRECTORY
    path = Path(text)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def _unresolved(raw) -> bool:
    if raw is None or raw == "":
        return True
    text = str(raw).strip()
    return text.startswith("${")


def _cfg_str(raw, default: str = "") -> str:
    if _unresolved(raw):
        return default
    return str(raw).strip()


def _cfg_int(raw, default: int) -> int:
    if _unresolved(raw):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _cfg_int_nonneg(raw, default: int) -> int:
    if _unresolved(raw):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value >= 0 else default


def _parse_provider_list(raw, default: tuple[str, ...]) -> list[str]:
    if _unresolved(raw) or raw is None or raw == "":
        return list(default)
    if isinstance(raw, list):
        return [str(item).strip().lower() for item in raw if str(item).strip()]
    return [part.strip().lower() for part in str(raw).split(",") if part.strip()]


def _provider_block(data: dict, name: str, defaults: dict) -> dict:
    block = data.get(name) if isinstance(data.get(name), dict) else {}
    out = {}
    for key, default in defaults.items():
        raw = block.get(key)
        if raw is None or _unresolved(raw):
            raw = data.get(f"{name}.{key}")
        if isinstance(default, bool):
            out[key] = _as_bool(raw, default)
        elif isinstance(default, int):
            out[key] = _cfg_int(raw, default)
        else:
            out[key] = _cfg_str(raw, str(default))
    return out


def _as_bool(raw, default: bool = False) -> bool:
    if _unresolved(raw):
        return default
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def silent_stock_refresh_minutes() -> int:
    """Background quote refresh interval from cron_job (minutes), default 15."""
    data = _application_data()
    raw = data.get("cron_job", DEFAULT_SILENT_STOCK_REFRESH_MINUTES)
    try:
        minutes = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_SILENT_STOCK_REFRESH_MINUTES
    if minutes <= 0:
        return DEFAULT_SILENT_STOCK_REFRESH_MINUTES
    return minutes


def billing_config() -> dict:
    data = _application_data()
    root = data.get("billing") if isinstance(data.get("billing"), dict) else {}
    ent = data.get("entitlements") if isinstance(data.get("entitlements"), dict) else {}
    free = ent.get("free") if isinstance(ent.get("free"), dict) else {}
    pro = ent.get("pro") if isinstance(ent.get("pro"), dict) else {}
    site = data.get("site") if isinstance(data.get("site"), dict) else {}
    enabled = _as_bool(root.get("enabled", data.get("billing.enabled")), DEFAULT_BILLING_ENABLED)
    return {
        "enabled": enabled,
        "enforce_paywall": _as_bool(
            root.get("enforce_paywall", data.get("billing.enforce_paywall")),
            DEFAULT_BILLING_ENFORCE_PAYWALL,
        ),
        "default_provider": _cfg_str(
            root.get("default_provider", data.get("billing.default_provider")), "stripe"
        ).lower(),
        "enabled_providers": _parse_provider_list(
            root.get("enabled_providers", data.get("billing.enabled_providers")),
            DEFAULT_ENABLED_PROVIDERS,
        ),
        "trial_days": _cfg_int_nonneg(
            root.get("trial_days", data.get("billing.trial_days")), DEFAULT_BILLING_TRIAL_DAYS
        ),
        "public_url": _cfg_str(
            root.get("public_url", data.get("billing.public_url")), DEFAULT_BILLING_PUBLIC_URL
        ).rstrip("/"),
        "entitlements": {
            "free_max_budget_plans": _cfg_int(
                free.get("max_budget_plans", data.get("entitlements.free.max_budget_plans")),
                DEFAULT_FREE_MAX_BUDGET_PLANS,
            ),
            "free_max_plan_months": _cfg_int(
                free.get("max_plan_months", data.get("entitlements.free.max_plan_months")),
                DEFAULT_FREE_MAX_PLAN_MONTHS,
            ),
            "pro_max_plan_months": _cfg_int(
                pro.get("max_plan_months", data.get("entitlements.pro.max_plan_months")),
                DEFAULT_PRO_MAX_PLAN_MONTHS,
            ),
            "free_max_watchlist": _cfg_int(
                free.get("max_watchlist", data.get("entitlements.free.max_watchlist")),
                DEFAULT_FREE_MAX_WATCHLIST,
            ),
            "pro_max_watchlist": _cfg_int(
                pro.get("max_watchlist", data.get("entitlements.pro.max_watchlist")),
                DEFAULT_PRO_MAX_WATCHLIST,
            ),
        },
        "site": {
            "guest_home": _cfg_str(
                site.get("guest_home", data.get("site.guest_home")), DEFAULT_GUEST_HOME
            ).lower(),
        },
        "stripe": _provider_block(
            data,
            "stripe",
            {
                "secret_key": "",
                "webhook_secret": "",
                "price_monthly": "",
                "price_yearly": "",
            },
        ),
        "mollie": _provider_block(
            data,
            "mollie",
            {
                "api_key": "",
                "amount_monthly": "",
                "amount_yearly": "",
                "currency": "EUR",
                "description": "Stock Buy Planner Pro",
                "checkout_implemented": False,
                "webhook_implemented": False,
            },
        ),
        "paypal": _provider_block(
            data,
            "paypal",
            {
                "client_id": "",
                "client_secret": "",
                "plan_monthly": "",
                "plan_yearly": "",
                "checkout_implemented": False,
                "webhook_implemented": False,
            },
        ),
    }


def billing_enabled() -> bool:
    return bool(billing_config()["enabled"])


def paywall_enabled() -> bool:
    return bool(billing_config()["enforce_paywall"])


def site_guest_home() -> str:
    return billing_config()["site"]["guest_home"]


def billing_public_config() -> dict:
    cfg = billing_config()
    return {
        "billing_enabled": cfg["enabled"],
        "enforce_paywall": cfg["enforce_paywall"],
        "default_provider": cfg["default_provider"],
        "trial_days": cfg["trial_days"],
        "entitlements": cfg["entitlements"],
        "guest_home": cfg["site"]["guest_home"],
    }


def suggestion_refresh_hours() -> int:
    """Suggestions universe rebuild interval from suggestion_refresh (hours), default 4."""
    data = _application_data()
    raw = data.get("suggestion_refresh", DEFAULT_SUGGESTION_REFRESH_HOURS)
    try:
        hours = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_SUGGESTION_REFRESH_HOURS
    if hours <= 0:
        return DEFAULT_SUGGESTION_REFRESH_HOURS
    return hours
