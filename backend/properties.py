"""Fetch property values from a local file or HTTP/cloud source and resolve keys."""

from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx
import yaml

from app_logging import get_logger

logger = get_logger("properties")

_property_cache: dict[str, str] | None = None
_property_cache_stamp: tuple[float, ...] | None = None
_property_cache_fetched_at: float = 0.0

DEFAULT_HTTP_REFRESH_SECONDS = 300
_http_load_lock = threading.Lock()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROPERTIES_PATH = PROJECT_ROOT / "properties.yml"

PLACEHOLDER_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_.]*)\}")
BARE_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return data if isinstance(data, dict) else {}


def _flatten(data: Any, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            name = str(key)
            next_prefix = f"{prefix}_{name}" if prefix else name
            if isinstance(value, dict):
                flat.update(_flatten(value, next_prefix))
            elif value is None:
                flat[next_prefix] = ""
                flat[name] = ""
            else:
                text = str(value)
                flat[next_prefix] = text
                flat[name] = text
    return flat


def _provider_config() -> dict:
    path = PROPERTIES_PATH
    data = _load_yaml(path)
    provider = data.get("provider") or {}
    return provider if isinstance(provider, dict) else {}


def _token_from_login_body(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for key in ("access_token", "token", "accessToken", "id_token"):
        value = data.get(key)
        if value:
            return str(value)
    for nested_key in ("data", "result"):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            found = _token_from_login_body(nested)
            if found:
                return found
    return None


def _parse_http_payload(
    *, text: str, content_type: str, url: str
) -> dict[str, str]:
    if "yaml" in content_type or url.endswith((".yml", ".yaml")):
        parsed = yaml.safe_load(text) or {}
    else:
        parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Cloud property source must return a JSON or YAML object")
    return _flatten(parsed)


def _oauth_client_credentials(
    *,
    client_id: str,
    client_secret: str,
    username: str,
    password: str,
) -> tuple[str, str]:
    cid = client_id.strip() or username.strip()
    secret = client_secret if client_secret else password
    return cid, secret


def _fetch_http_map(
    url: str,
    *,
    timeout: int,
    headers: dict[str, str],
    token_url: str = "",
    client_id: str = "",
    client_secret: str = "",
    username: str = "",
    password: str = "",
) -> dict[str, str]:
    cid, secret = _oauth_client_credentials(
        client_id=client_id,
        client_secret=client_secret,
        username=username,
        password=password,
    )
    token_endpoint = token_url.strip()
    if token_endpoint:
        if not cid:
            raise ValueError(
                "properties.yml client_id (or username) is required when token_url is set"
            )
        with httpx.Client(timeout=timeout) as client:
            logger.info("Fetching config token from %s", token_endpoint)
            login_response = client.post(
                token_endpoint,
                json={"clientId": cid, "clientSecret": secret},
                headers=headers,
            )
            login_response.raise_for_status()
            try:
                token = _token_from_login_body(login_response.json())
            except json.JSONDecodeError:
                token = None
            if not token:
                raise ValueError("Config server token response did not include a token")
            fetch_headers = dict(headers)
            fetch_headers["Authorization"] = f"Bearer {token}"
            response = client.get(url, headers=fetch_headers)
            response.raise_for_status()
            content_type = (response.headers.get("Content-Type") or "").lower()
            return _parse_http_payload(
                text=response.text, content_type=content_type, url=url
            )

    fetch_headers = dict(headers)
    auth: httpx.BasicAuth | None = None
    if cid and "authorization" not in {k.lower() for k in fetch_headers}:
        auth = httpx.BasicAuth(cid, secret)

    with httpx.Client(timeout=timeout, auth=auth) as client:
        response = client.get(url, headers=fetch_headers)
        response.raise_for_status()
        content_type = (response.headers.get("Content-Type") or "").lower()
        return _parse_http_payload(text=response.text, content_type=content_type, url=url)


def clear_property_cache() -> None:
    global _property_cache, _property_cache_stamp, _property_cache_fetched_at
    _property_cache = None
    _property_cache_stamp = None
    _property_cache_fetched_at = 0.0


def _http_refresh_seconds(provider: dict) -> int:
    raw = provider.get("refresh_seconds")
    if raw is None:
        raw = provider.get("cache_seconds")
    if raw is None:
        return DEFAULT_HTTP_REFRESH_SECONDS
    return max(1, int(raw))


def _merge_local_enabled(provider: dict) -> bool:
    raw = provider.get("merge_local")
    if raw is None:
        raw = provider.get("fallback_local")
    if raw is None:
        return True
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return True


def _local_fallback_path(provider: dict) -> Path:
    relative = str(provider.get("fallback_file") or "values.yml").strip()
    path = Path(relative)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def _local_fallback_map(provider: dict) -> dict[str, str]:
    if not _merge_local_enabled(provider):
        return {}
    path = _local_fallback_path(provider)
    if not path.exists():
        return {}
    return _flatten(_load_yaml(path))


def _emergency_fallback_map(provider: dict) -> dict[str, str]:
    """Used when HTTP config is empty or unreachable (ignores merge_local)."""
    path = _local_fallback_path(provider)
    if not path.exists():
        return {}
    logger.info("Using emergency fallback property file (%s)", path)
    return _flatten(_load_yaml(path))


def _merge_property_maps(
    remote: dict[str, str], local: dict[str, str]
) -> dict[str, str]:
    """Local defaults first; remote config server values override on matching keys."""
    merged = dict(local)
    merged.update(remote)
    return merged


def load_property_map() -> dict[str, str]:
    """Load key/value properties from the configured file or HTTP/cloud source."""
    global _property_cache, _property_cache_stamp, _property_cache_fetched_at
    props_path = PROPERTIES_PATH
    props_mtime = props_path.stat().st_mtime if props_path.exists() else 0.0
    provider = _provider_config()
    source_type = str(provider.get("type") or "file").strip().lower()
    if source_type in {"http", "cloud", "url"}:
        values_path = _local_fallback_path(provider)
        values_mtime = values_path.stat().st_mtime if values_path.exists() else 0.0
        stamp = (props_mtime, values_mtime)
        ttl = _http_refresh_seconds(provider)
        age = time.monotonic() - _property_cache_fetched_at
        if (
            _property_cache is not None
            and _property_cache_stamp == stamp
            and _property_cache_fetched_at > 0
            and age < ttl
        ):
            logger.debug(
                "Using cached property values from WEB (age %.0fs, refresh every %ss)",
                age,
                ttl,
            )
            return _property_cache

        with _http_load_lock:
            age = time.monotonic() - _property_cache_fetched_at
            if (
                _property_cache is not None
                and _property_cache_stamp == stamp
                and _property_cache_fetched_at > 0
                and age < ttl
            ):
                return _property_cache

            url = str(provider.get("url") or "").strip()
            if not url:
                raise ValueError("properties.yml provider.url is required when type is http/cloud")
            timeout = int(provider.get("timeout") or 15)
            headers = provider.get("headers") or {}
            if not isinstance(headers, dict):
                headers = {}
            str_headers = {str(key): str(value) for key, value in headers.items()}
            client_id = str(provider.get("client_id") or provider.get("clientId") or "")
            client_secret = str(
                provider.get("client_secret") or provider.get("clientSecret") or ""
            )
            username = str(provider.get("username") or "")
            password = str(provider.get("password") or "")
            token_url = str(
                provider.get("token_url")
                or provider.get("login_url")
                or provider.get("tokenUrl")
                or ""
            )
            logger.info("Loading property values from WEB (%s)", url)
            try:
                remote = _fetch_http_map(
                    url,
                    timeout=timeout,
                    headers=str_headers,
                    token_url=token_url,
                    client_id=client_id,
                    client_secret=client_secret,
                    username=username,
                    password=password,
                )
            except Exception as exc:
                logger.warning(
                    "Config server fetch failed (%s); using fallback_file defaults", exc
                )
                remote = {}
            local = _local_fallback_map(provider)
            if remote:
                mapping = _merge_property_maps(remote, local)
            else:
                emergency = _emergency_fallback_map(provider)
                mapping = _merge_property_maps(emergency, local)
            if local:
                local_only = sum(1 for key in local if key not in remote)
                logger.info(
                    "Loaded %s property keys from WEB + %s local-only fallback (%s total, cached %ss)",
                    len(remote),
                    local_only,
                    len(mapping),
                    ttl,
                )
            else:
                logger.info(
                    "Loaded %s property keys from WEB (cached for %ss)",
                    len(mapping),
                    ttl,
                )
            _property_cache = mapping
            _property_cache_stamp = stamp
            _property_cache_fetched_at = time.monotonic()
            return mapping

    values_path = PROJECT_ROOT / "values.yml"
    stamp = (props_mtime, values_path.stat().st_mtime if values_path.exists() else 0.0)
    if _property_cache is not None and _property_cache_stamp == stamp:
        return _property_cache

    relative = str(provider.get("file") or "values.yml").strip()
    path = Path(relative)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    logger.info("Loading property values from LOCAL (%s)", path)
    mapping = _flatten(_load_yaml(path))
    _property_cache = mapping
    _property_cache_stamp = stamp
    logger.info("Loaded %s property keys from LOCAL", len(mapping))
    return mapping


def resolve_value(value: Any, mapping: dict[str, str] | None = None) -> Any:
    """Replace ${KEY} or a bare KEY with the live value from the property map."""
    if mapping is None:
        mapping = load_property_map()
    if isinstance(value, dict):
        return {key: resolve_value(item, mapping) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve_value(item, mapping) for item in value]
    if isinstance(value, str):
        if PLACEHOLDER_RE.search(value):
            def replace(match: re.Match[str]) -> str:
                key = match.group(1)
                if key in mapping:
                    return mapping[key]
                return match.group(0)

            return PLACEHOLDER_RE.sub(replace, value)
        if BARE_KEY_RE.match(value) and value in mapping:
            return mapping[value]
    return value
