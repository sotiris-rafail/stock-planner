"""In-memory payload cache with silent background quote refresh."""

from __future__ import annotations

import copy
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable

from app_logging import get_logger
from db import list_purchases, list_sales
from settings import silent_stock_refresh_minutes

logger = get_logger("live_cache")

KEY_PROGRESS = "progress"
KEY_WATCHLIST = "watchlist"
KEY_SUGGESTIONS = "suggestions"
KEY_DIVIDEND_IDEAS = "dividend_ideas"
KEY_BUDGET_PREFIX = "budget_plan:"
GLOBAL_OWNER = 0
MANUAL_REFRESH_LIMIT = 5

_memory: dict[tuple[str, int], dict[str, Any]] = {}
_memory_lock = threading.RLock()
_locks: dict[tuple[str, int], threading.Lock] = defaultdict(threading.Lock)
_manual_hits: dict[tuple[str, int], list[float]] = {}
_manual_lock = threading.Lock()
_last_silent_refresh: datetime | None = None
_last_quote_ok: bool | None = None


class RateLimited(Exception):
    def __init__(self, message: str, *, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _owner(user_id: int | None) -> int:
    return int(user_id) if user_id else GLOBAL_OWNER


def _load(kind: str, owner_id: int) -> dict[str, Any] | None:
    with _memory_lock:
        data = _memory.get((kind, owner_id))
        return copy.deepcopy(data) if data is not None else None


def _store(kind: str, owner_id: int, data: dict[str, Any]) -> dict[str, Any]:
    snapshot = copy.deepcopy(data)
    with _memory_lock:
        _memory[(kind, owner_id)] = snapshot
    return copy.deepcopy(snapshot)


def cached_keys() -> list[tuple[str, int]]:
    with _memory_lock:
        return list(_memory.keys())


def clear_memory_cache() -> None:
    with _memory_lock:
        _memory.clear()
    with _manual_lock:
        _manual_hits.clear()
    global _last_silent_refresh, _last_quote_ok
    _last_silent_refresh = None
    _last_quote_ok = None


def _check_manual(kind: str, owner_id: int) -> None:
    minutes = silent_stock_refresh_minutes()
    window = max(60, minutes * 60)
    now = time.time()
    key = (kind, owner_id)
    with _manual_lock:
        hits = [stamp for stamp in _manual_hits.get(key, []) if now - stamp < window]
        if len(hits) >= MANUAL_REFRESH_LIMIT:
            raise RateLimited(
                f"Refresh limit reached ({MANUAL_REFRESH_LIMIT} per {minutes} minutes). Try again later.",
                retry_after=int(max(1, window - (now - hits[0]))),
            )
        hits.append(now)
        _manual_hits[key] = hits


def serve(
    kind: str,
    owner_id: int,
    builder: Callable[[], dict[str, Any]],
    *,
    force: bool = False,
    manual: bool = False,
) -> dict[str, Any]:
    if manual and force:
        _check_manual(kind, owner_id)
    lock = _locks[(kind, owner_id)]
    with lock:
        if not force:
            cached = _load(kind, owner_id)
            if cached is not None:
                return cached
        data = builder()
        if not isinstance(data, dict):
            data = {}
        return _store(kind, owner_id, data)


def invalidate(kind: str, user_id: int | None) -> None:
    with _memory_lock:
        _memory.pop((kind, _owner(user_id)), None)


def invalidate_progress(user_id: int) -> None:
    invalidate(KEY_PROGRESS, user_id)
    invalidate(KEY_DIVIDEND_IDEAS, user_id)
    invalidate_budget_plans(user_id)


def invalidate_budget_plans(user_id: int, plan_id: int | None = None) -> None:
    owner_id = _owner(user_id)
    with _memory_lock:
        for kind, owner in list(_memory.keys()):
            if owner != owner_id or not kind.startswith(KEY_BUDGET_PREFIX):
                continue
            if plan_id is None or kind == f"{KEY_BUDGET_PREFIX}{plan_id}":
                _memory.pop((kind, owner), None)


def budget_progress_payload(user_id: int, plan_id: int) -> dict[str, Any]:
    from budget_plan import build_budget_progress
    from db import get_budget_plan, list_sale_lot_allocations

    plan = get_budget_plan(plan_id, user_id=user_id)
    if plan is None:
        raise LookupError("Budget plan not found")
    return build_budget_progress(
        plan,
        list_purchases(user_id=user_id),
        list_sale_lot_allocations(user_id=user_id),
    )


def get_budget_progress(
    user_id: int, plan_id: int, *, force: bool = False, manual: bool = False
) -> dict[str, Any]:
    return serve(
        f"{KEY_BUDGET_PREFIX}{plan_id}",
        user_id,
        lambda: budget_progress_payload(user_id, plan_id),
        force=force,
        manual=manual,
    )


def guest_watchlist() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "as_of": now.isoformat(),
        "count": 0,
        "items": [],
        "guest": True,
        "disclaimer": (
            "Sign in to save symbols to your personal watchlist. "
            "Browse freely — adding and removing symbols requires an account."
        ),
    }


def progress_payload(user_id: int) -> dict[str, Any]:
    from portfolio import build_progress

    purchases = list_purchases(user_id=user_id)
    sales = list_sales(user_id=user_id)
    payload = build_progress(purchases, sales)
    payload["purchases"] = []
    payload["sales"] = []
    payload["summary_only"] = False
    return payload


def get_progress(user_id: int, *, force: bool = False, manual: bool = False) -> dict[str, Any]:
    return serve(
        KEY_PROGRESS,
        user_id,
        lambda: progress_payload(user_id),
        force=force,
        manual=manual,
    )


def get_watchlist(user_id: int | None, *, force: bool = False, manual: bool = False) -> dict[str, Any]:
    if user_id is None:
        return guest_watchlist()
    from watchlist import build_watchlist

    return serve(
        KEY_WATCHLIST,
        user_id,
        lambda: build_watchlist(user_id=user_id),
        force=force,
        manual=manual,
    )


def get_suggestions(*, force: bool = False, manual: bool = False) -> dict[str, Any]:
    from suggestions import build_suggestions

    return serve(
        KEY_SUGGESTIONS,
        GLOBAL_OWNER,
        lambda: build_suggestions(force=True),
        force=force,
        manual=manual,
    )


def get_dividend_ideas(
    user_id: int | None, *, force: bool = False, manual: bool = False
) -> dict[str, Any]:
    from dividend_ideas import build_dividend_ideas

    return serve(
        KEY_DIVIDEND_IDEAS,
        _owner(user_id),
        lambda: build_dividend_ideas(user_id=user_id, force=True),
        force=force,
        manual=manual,
    )


def merge_watchlist_item(user_id: int, item: dict[str, Any]) -> None:
    owner_id = _owner(user_id)
    lock = _locks[(KEY_WATCHLIST, owner_id)]
    with lock:
        cached = _load(KEY_WATCHLIST, owner_id)
        if cached is None:
            return
        from watchlist import sort_watchlist_items

        items = [
            row
            for row in (cached.get("items") or [])
            if str(row.get("id")) != str(item.get("id"))
        ]
        items.append(item)
        cached["items"] = sort_watchlist_items(items)
        cached["count"] = len(cached["items"])
        cached["guest"] = False
        cached["as_of"] = datetime.now(timezone.utc).isoformat()
        _store(KEY_WATCHLIST, owner_id, cached)


def remove_watchlist_item_from_cache(user_id: int, item_id: int) -> None:
    owner_id = _owner(user_id)
    lock = _locks[(KEY_WATCHLIST, owner_id)]
    with lock:
        cached = _load(KEY_WATCHLIST, owner_id)
        if cached is None:
            return
        cached["items"] = [
            row for row in (cached.get("items") or []) if int(row.get("id") or 0) != int(item_id)
        ]
        cached["count"] = len(cached["items"])
        cached["as_of"] = datetime.now(timezone.utc).isoformat()
        _store(KEY_WATCHLIST, owner_id, cached)


def warm_live_cache() -> None:
    """Fill memory from live market data without waiting for a UI request."""
    from db import list_users

    logger.info("Warming live cache")
    try:
        get_suggestions(force=True)
    except Exception:
        logger.exception("Cache warmup failed for suggestions")
    try:
        get_dividend_ideas(None, force=True)
    except Exception:
        logger.exception("Cache warmup failed for guest dividend ideas")

    for user in list_users():
        user_id = int(user["id"])
        try:
            get_progress(user_id, force=True)
        except Exception:
            logger.exception("Cache warmup failed for progress user %s", user_id)
        try:
            get_watchlist(user_id, force=True)
        except Exception:
            logger.exception("Cache warmup failed for watchlist user %s", user_id)
        try:
            get_dividend_ideas(user_id, force=True)
        except Exception:
            logger.exception("Cache warmup failed for dividend ideas user %s", user_id)

    global _last_silent_refresh
    _last_silent_refresh = datetime.now(timezone.utc)
    logger.info("Live cache warmup finished")


def start_cache_warmup() -> None:
    thread = threading.Thread(
        target=warm_live_cache,
        name="live-cache-warmup",
        daemon=True,
    )
    thread.start()


def refresh_cached_payloads() -> None:
    """Rebuild every payload currently held in memory."""
    global _last_quote_ok
    ok = True
    ran = False
    for kind, owner_id in cached_keys():
        try:
            if kind == KEY_SUGGESTIONS:
                ran = True
                get_suggestions(force=True)
            elif kind == KEY_DIVIDEND_IDEAS:
                ran = True
                user_id = None if owner_id == GLOBAL_OWNER else owner_id
                get_dividend_ideas(user_id, force=True)
            elif kind == KEY_PROGRESS and owner_id:
                ran = True
                get_progress(owner_id, force=True)
            elif kind == KEY_WATCHLIST and owner_id:
                ran = True
                get_watchlist(owner_id, force=True)
            elif kind.startswith(KEY_BUDGET_PREFIX) and owner_id:
                ran = True
                try:
                    get_budget_progress(
                        owner_id, int(kind[len(KEY_BUDGET_PREFIX):]), force=True
                    )
                except LookupError:
                    invalidate(kind, owner_id)
            else:
                continue
        except Exception:
            ok = False
            logger.exception("Silent refresh failed for %s owner %s", kind, owner_id)
    if ran:
        _last_quote_ok = ok


def run_silent_quote_refresh(*, force: bool = False) -> None:
    global _last_silent_refresh
    minutes = silent_stock_refresh_minutes()
    now = datetime.now(timezone.utc)
    if not force and _last_silent_refresh is not None:
        elapsed = (now - _last_silent_refresh).total_seconds()
        if elapsed < minutes * 60:
            return
    refresh_cached_payloads()
    _last_silent_refresh = now
    logger.info("Silent quote refresh completed (interval=%s min)", minutes)


def quote_status() -> dict[str, Any]:
    minutes = silent_stock_refresh_minutes()
    delayed = False
    if _last_silent_refresh is not None:
        delayed = (datetime.now(timezone.utc) - _last_silent_refresh).total_seconds() > max(
            120, minutes * 120
        )
    return {
        "quotes_ok": _last_quote_ok,
        "quotes_delayed": delayed,
        "last_refresh_at": _last_silent_refresh.isoformat() if _last_silent_refresh else None,
        "quote_refresh_minutes": minutes,
    }
