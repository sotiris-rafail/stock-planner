"""Fetch property values from a local file or HTTP/cloud source and resolve keys."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import yaml

from app_logging import get_logger

logger = get_logger("properties")

_property_cache: dict[str, str] | None = None
_property_cache_stamp: tuple[float, float] | None = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROPERTIES_PATH = PROJECT_ROOT / "properties.yml"

PLACEHOLDER_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
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


def _fetch_http_map(url: str, *, timeout: int, headers: dict[str, str]) -> dict[str, str]:
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
        content_type = (response.headers.get("Content-Type") or "").lower()
    text = raw.decode("utf-8")
    if "yaml" in content_type or url.endswith((".yml", ".yaml")):
        parsed = yaml.safe_load(text) or {}
    else:
        parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Cloud property source must return a JSON or YAML object")
    return _flatten(parsed)


def load_property_map() -> dict[str, str]:
    """Load key/value properties from the configured file or HTTP/cloud source."""
    global _property_cache, _property_cache_stamp
    props_path = PROPERTIES_PATH
    values_path = PROJECT_ROOT / "values.yml"
    stamp = (
        props_path.stat().st_mtime if props_path.exists() else 0.0,
        values_path.stat().st_mtime if values_path.exists() else 0.0,
    )
    if _property_cache is not None and _property_cache_stamp == stamp:
        return _property_cache

    provider = _provider_config()
    source_type = str(provider.get("type") or "file").strip().lower()
    if source_type in {"http", "cloud", "url"}:
        url = str(provider.get("url") or "").strip()
        if not url:
            raise ValueError("properties.yml provider.url is required when type is http/cloud")
        timeout = int(provider.get("timeout") or 15)
        headers = provider.get("headers") or {}
        if not isinstance(headers, dict):
            headers = {}
        str_headers = {str(key): str(value) for key, value in headers.items()}
        logger.debug("Reading property values from WEB (%s)", url)
        mapping = _fetch_http_map(url, timeout=timeout, headers=str_headers)
        logger.debug("Read %s property keys from WEB", len(mapping))
        return mapping

    relative = str(provider.get("file") or "values.yml").strip()
    path = Path(relative)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    logger.debug("Reading property values from LOCAL (%s)", path)
    mapping = _flatten(_load_yaml(path))
    _property_cache = mapping
    _property_cache_stamp = stamp
    logger.debug("Read %s property keys from LOCAL", len(mapping))
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
