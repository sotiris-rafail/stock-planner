"""Load application.yml, then resolve property keys at runtime."""

from __future__ import annotations

from pathlib import Path

import yaml

from properties import resolve_value

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "application.yml"
DEFAULT_SECRET = "dev-change-me-before-production"
DEFAULT_SILENT_STOCK_REFRESH_MINUTES = 15
DEFAULT_CONFIG_FILES: dict[str, str] = {
    "application.yml": """secret_key: ${APP_SECRET_KEY}

# Silent background quote refresh interval in minutes.
# Value is loaded from the property key cron_job_silent_stock_refresh (default 15).
cron_job: ${cron_job_silent_stock_refresh}

smtp:
  host: ${SMTP_HOST}
  port: ${SMTP_PORT}
  from: ${SMTP_FROM}
  user: ${SMTP_USER}
  password: ${SMTP_PASSWORD}
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
#   timeout: 15
#   headers:
#     Authorization: Bearer your-token
""",
    "values.yml": """APP_SECRET_KEY: dummy-change-me-before-production
SMTP_HOST: smtp.example.com
SMTP_PORT: 587
SMTP_FROM: noreply@example.com
SMTP_USER: smtp-user
SMTP_PASSWORD: dummy-smtp-password
cron_job_silent_stock_refresh: 15
""",
}
_app_data_cache: dict | None = None
_app_data_mtime: float | None = None


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


def _application_data() -> dict:
    global _app_data_cache, _app_data_mtime
    path = CONFIG_PATH
    mtime = path.stat().st_mtime if path.exists() else 0.0
    if _app_data_cache is not None and _app_data_mtime == mtime:
        return _app_data_cache
    data = resolve_value(_load_yaml(path))
    if not isinstance(data, dict):
        data = {}
    _app_data_cache = data
    _app_data_mtime = mtime
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
