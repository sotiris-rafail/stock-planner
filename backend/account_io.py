"""Export and import holdings, lots, and watchlist."""

from __future__ import annotations

import csv
import io
import json
from datetime import date

from db import (
    add_purchase,
    add_watchlist_item,
    execute_sale,
    list_budget_plans,
    list_positions,
    list_purchases,
    list_sales,
    list_watchlist_items,
)

CSV_FIELDS = [
    "record_type",
    "id",
    "symbol",
    "company_name",
    "currency",
    "shares",
    "price_per_share",
    "date",
    "notes",
    "cost_basis",
    "proceeds",
    "realized_gain",
    "invested",
    "avg_cost_per_share",
    "asset_type",
    "price_at_add",
]


def _cell(row: dict, *keys, default=""):
    for key in keys:
        if row.get(key) not in (None, ""):
            return row.get(key)
    return default


def export_payload(user_id: int) -> dict:
    return {
        "version": 1,
        "positions": list_positions(user_id=user_id),
        "buys": list_purchases(user_id=user_id),
        "sells": list_sales(user_id=user_id),
        "watchlist": list_watchlist_items(user_id=user_id),
        "budget_plans": list_budget_plans(user_id=user_id),
    }


def export_csv(user_id: int) -> str:
    payload = export_payload(user_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_FIELDS)
    for row in payload["positions"]:
        writer.writerow(
            [
                "position",
                "",
                row.get("symbol"),
                row.get("company_name"),
                row.get("currency"),
                row.get("shares"),
                "",
                "",
                "",
                "",
                "",
                "",
                row.get("invested"),
                row.get("avg_cost_per_share"),
                "",
                "",
            ]
        )
    for row in payload["buys"]:
        writer.writerow(
            [
                "buy",
                row.get("id"),
                row.get("symbol"),
                row.get("company_name"),
                row.get("currency"),
                row.get("shares"),
                row.get("price_per_share"),
                row.get("purchased_at"),
                row.get("notes") or "",
                "",
                "",
                "",
                row.get("cost"),
                "",
                "",
                "",
            ]
        )
    for row in payload["sells"]:
        writer.writerow(
            [
                "sell",
                row.get("id"),
                row.get("symbol"),
                row.get("company_name"),
                row.get("currency"),
                row.get("shares"),
                row.get("price_per_share"),
                row.get("sold_at"),
                row.get("notes") or "",
                row.get("cost_basis"),
                row.get("proceeds"),
                row.get("realized_gain"),
                "",
                "",
                "",
                "",
            ]
        )
    for row in payload["watchlist"]:
        writer.writerow(
            [
                "watchlist",
                row.get("id"),
                row.get("symbol"),
                row.get("company_name"),
                row.get("currency"),
                "",
                "",
                row.get("added_at"),
                row.get("requested_symbol") or "",
                "",
                "",
                "",
                "",
                "",
                row.get("asset_type"),
                row.get("price_at_add"),
            ]
        )
    return buffer.getvalue()


def _as_float(value, default=None):
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _records_from_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _records_from_json(text: str) -> list[dict]:
    data = json.loads(text)
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        raise ValueError("Import JSON must be an object or array")
    if isinstance(data.get("records"), list):
        return data["records"]
    rows: list[dict] = []
    for kind, key in (("buy", "buys"), ("sell", "sells"), ("watchlist", "watchlist")):
        for item in data.get(key) or []:
            if isinstance(item, dict):
                rows.append({**item, "record_type": item.get("record_type") or kind})
    return rows


def import_payload(*, user_id: int, raw: str) -> dict:
    text = (raw or "").lstrip("\ufeff").strip()
    if not text:
        raise ValueError("Import file is empty")
    if text.startswith("{") or text.startswith("["):
        records = _records_from_json(text)
    else:
        records = _records_from_csv(text)

    buys = []
    sells = []
    watch = []
    for row in records:
        kind = str(row.get("record_type") or row.get("type") or "").strip().lower()
        if kind in {"buy", "purchase"}:
            buys.append(row)
        elif kind in {"sell", "sale"}:
            sells.append(row)
        elif kind == "watchlist":
            watch.append(row)

    def sort_key(row):
        return str(_cell(row, "date", "purchased_at", "sold_at", "added_at") or "")

    buys.sort(key=sort_key)
    sells.sort(key=sort_key)

    counts = {"buys": 0, "sells": 0, "watchlist": 0}
    skipped = {"buys": 0, "sells": 0, "watchlist": 0}
    errors: list[str] = []
    today = date.today().isoformat()

    def lot_key(row, date_keys):
        return (
            str(_cell(row, "symbol") or "").upper(),
            str(_cell(row, *date_keys) or "")[:10],
            round(_as_float(row.get("shares"), 0) or 0, 6),
            round(_as_float(row.get("price_per_share"), 0) or 0, 4),
        )

    existing_buys = {
        lot_key(item, ("purchased_at", "date"))
        for item in list_purchases(user_id=user_id)
    }
    existing_sells = {
        lot_key(item, ("sold_at", "date"))
        for item in list_sales(user_id=user_id)
    }
    existing_watch = {
        str(item.get("symbol") or "").upper()
        for item in list_watchlist_items(user_id=user_id)
    }

    for row in buys:
        key = lot_key(row, ("date", "purchased_at"))
        if key in existing_buys:
            skipped["buys"] += 1
            continue
        try:
            add_purchase(
                user_id=user_id,
                symbol=str(_cell(row, "symbol")),
                company_name=str(_cell(row, "company_name") or "") or None,
                currency=str(_cell(row, "currency") or "USD"),
                shares=_as_float(row.get("shares"), 0) or 0,
                price_per_share=_as_float(row.get("price_per_share"), 0) or 0,
                purchased_at=str(_cell(row, "date", "purchased_at") or today),
                notes=str(_cell(row, "notes") or "") or None,
            )
            existing_buys.add(key)
            counts["buys"] += 1
        except Exception as exc:
            errors.append(f"buy {row.get('symbol')}: {exc}")

    for row in sells:
        key = lot_key(row, ("date", "sold_at"))
        if key in existing_sells:
            skipped["sells"] += 1
            continue
        try:
            execute_sale(
                user_id=user_id,
                symbol=str(_cell(row, "symbol")),
                shares=_as_float(row.get("shares"), 0) or 0,
                price_per_share=_as_float(row.get("price_per_share"), 0) or 0,
                sold_at=str(_cell(row, "date", "sold_at") or today),
                notes=str(_cell(row, "notes") or "") or None,
                company_name=str(_cell(row, "company_name") or "") or None,
                currency=str(_cell(row, "currency") or "") or None,
            )
            existing_sells.add(key)
            counts["sells"] += 1
        except Exception as exc:
            errors.append(f"sell {row.get('symbol')}: {exc}")

    for row in watch:
        symbol = str(_cell(row, "symbol") or "").upper()
        if symbol in existing_watch:
            skipped["watchlist"] += 1
            continue
        try:
            price = _as_float(row.get("price_at_add"), 1.0) or 1.0
            add_watchlist_item(
                user_id=user_id,
                symbol=str(_cell(row, "symbol")),
                requested_symbol=str(_cell(row, "notes", "requested_symbol") or "") or None,
                company_name=str(_cell(row, "company_name") or "") or None,
                asset_type=str(_cell(row, "asset_type") or "stock"),
                currency=str(_cell(row, "currency") or "USD"),
                added_at=str(_cell(row, "date", "added_at") or today),
                price_at_add=price,
            )
            existing_watch.add(symbol)
            counts["watchlist"] += 1
        except Exception as exc:
            message = str(exc)
            if "already on your watchlist" in message.lower():
                skipped["watchlist"] += 1
            else:
                errors.append(f"watchlist {row.get('symbol')}: {exc}")

    return {"ok": True, "imported": counts, "skipped": skipped, "errors": errors}
