"""Stock Buy Planner API + UI."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from auth import (
    SESSION_COOKIE,
    SESSION_DAYS,
    authenticate_user,
    change_password,
    create_session_token,
    delete_account,
    register_user,
    request_password_reset,
    reset_password_with_hash,
)
from auth_crypto import decrypt_email, validate_email
from deps import get_optional_user_id, require_user_id

from account_io import export_csv, export_payload, import_payload
from billing import (
    billing_configured,
    create_billing_portal,
    create_checkout_session,
    handle_stripe_webhook,
    handle_webhook,
    list_providers_public,
    user_can_open_billing_portal,
)
from settings import billing_public_config, site_guest_home
from entitlements import (
    ProRequired,
    assert_budget_plan_create,
    assert_budget_plan_window,
    assert_monthly_email,
    assert_watchlist_add,
    user_is_pro,
)
from budget_plan import (
    MAX_PLAN_ITEMS,
    PLAN_CURRENCIES,
    parse_month,
    summarize_budget_plan,
    validate_window,
)
from calculator import calculate_buy_plan, result_to_dict
from db import (
    add_purchase,
    create_budget_plan,
    delete_budget_plan,
    delete_purchase,
    execute_sale,
    get_notification_settings,
    get_user_by_id,
    init_db,
    list_budget_plans,
    list_positions,
    list_purchases,
    list_purchases_page,
    list_sale_lot_allocations,
    list_sales,
    list_transactions_page,
    owned_shares,
    today_iso,
    update_budget_plan,
    upsert_notification_settings,
)
from portfolio import build_progress_summary
from pricing_rules import (
    normalize_user_price,
    preferred_price_currency,
    quote_in_preferred_currency,
)
from backup import backup_status
from live_cache import (
    RateLimited,
    get_budget_progress,
    get_dividend_ideas,
    get_progress,
    get_suggestions,
    get_watchlist,
    invalidate_budget_plans,
    invalidate_progress,
    merge_watchlist_item,
    quote_status,
    remove_watchlist_item_from_cache,
    start_cache_warmup,
)
from stock_service import PRICE_SOURCE_LABELS, fetch_dividends, fetch_quote
from watchlist import ASSET_TYPES, create_watchlist_entry, remove_watchlist_entry
from app_logging import setup_logging
from mailer import EmailDisabled
from settings import (
    DELETE_DISABLED_MESSAGE,
    EMAIL_DISABLED_MESSAGE,
    EXPORT_DISABLED_MESSAGE,
    backup_enabled,
    delete_enabled,
    export_enabled,
    prepare_config_files,
    silent_stock_refresh_minutes,
    smtp_enabled,
    suggestion_refresh_hours,
)
from properties import load_property_map
from scheduler import start_scheduler, stop_scheduler

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(
    title="Stock Buy Planner",
    description="Plan monthly share purchases using live market data.",
    version="1.1.0",
)


@app.on_event("startup")
def on_startup() -> None:
    setup_logging()
    prepare_config_files()
    load_property_map()
    init_db()
    start_scheduler()
    start_cache_warmup()


@app.on_event("shutdown")
def on_shutdown() -> None:
    stop_scheduler()


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetPasswordRequest(BaseModel):
    hash: str = Field(min_length=16, max_length=128)
    password: str = Field(min_length=10, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ImportAccountRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2_000_000)


class NotificationSettingsRequest(BaseModel):
    monthly_report_enabled: bool = False
    report_email: str = Field(default="", max_length=254)


def _set_session_cookie(response: Response, user_id: int) -> None:
    token = create_session_token(user_id)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 3600,
    )


class PlanRequest(BaseModel):
    symbol: str = Field(default="DTE.DE", min_length=1, max_length=20)
    total_shares: float = Field(default=50, gt=0, le=1_000_000)
    periods: int | None = Field(
        default=None,
        ge=1,
        le=120,
        description="Number of buy periods (months or years). Prefer this over months.",
    )
    months: int | None = Field(
        default=None,
        ge=1,
        le=120,
        description="Deprecated alias for periods when frequency is monthly.",
    )
    frequency: str = Field(
        default="monthly",
        description="Buy frequency: 'monthly' or 'yearly'.",
    )
    growth_override_pct: float | None = Field(
        default=None,
        description="Optional growth % override per period. If omitted, uses historical estimate.",
    )
    lookback_months: int = Field(default=12, ge=3, le=60)
    price_source: str = Field(
        default="yahoo",
        description="Quote provider: 'yahoo' or 'stooq'.",
    )

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, value: str) -> str:
        freq = (value or "monthly").lower().strip()
        if freq not in {"monthly", "yearly"}:
            raise ValueError("frequency must be 'monthly' or 'yearly'")
        return freq

    @field_validator("price_source")
    @classmethod
    def normalize_price_source(cls, value: str) -> str:
        source = (value or "yahoo").lower().strip()
        if source not in {"yahoo", "stooq"}:
            raise ValueError("price_source must be 'yahoo' or 'stooq'")
        return source

    def resolved_periods(self) -> int:
        if self.periods is not None:
            return self.periods
        if self.months is not None:
            return self.months
        return 10


class PurchaseRequest(BaseModel):
    symbol: str = Field(default="DTE.DE", min_length=1, max_length=20)
    shares: float = Field(gt=0, le=1_000_000)
    price_per_share: float | None = Field(
        default=None,
        gt=0,
        description="If omitted, uses the live market price.",
    )
    currency: str | None = Field(
        default=None,
        min_length=3,
        max_length=3,
        description="ISO currency. If omitted, taken from live quote.",
    )
    purchased_at: str | None = Field(
        default=None,
        description="Purchase date YYYY-MM-DD. Defaults to today.",
    )
    notes: str | None = Field(default=None, max_length=500)
    company_name: str | None = Field(default=None, max_length=200)

    @field_validator("purchased_at")
    @classmethod
    def validate_date(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("purchased_at must be YYYY-MM-DD") from exc
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return value.upper().strip()


class WatchlistRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    asset_type: str | None = Field(
        default=None,
        description="stock, etf, or mutual_fund. Inferred from market data when omitted.",
    )
    price_source: str = Field(
        default="yahoo",
        description="Quote provider: 'yahoo' or 'stooq'.",
    )

    @field_validator("symbol")
    @classmethod
    def normalize_watchlist_symbol(cls, value: str) -> str:
        return value.upper().strip()

    @field_validator("asset_type")
    @classmethod
    def normalize_asset_type(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        normalized = value.lower().strip().replace("-", "_").replace(" ", "_")
        if normalized in {"mutualfund", "fund"}:
            normalized = "mutual_fund"
        if normalized not in ASSET_TYPES:
            raise ValueError("asset_type must be stock, etf, or mutual_fund")
        return normalized

    @field_validator("price_source")
    @classmethod
    def normalize_watchlist_price_source(cls, value: str) -> str:
        source = (value or "yahoo").lower().strip()
        if source not in {"yahoo", "stooq"}:
            raise ValueError("price_source must be 'yahoo' or 'stooq'")
        return source


class BudgetPlanItemRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    monthly_amount: float = Field(gt=0, le=10_000_000)

    @field_validator("symbol")
    @classmethod
    def normalize_item_symbol(cls, value: str) -> str:
        return value.upper().strip()


class BudgetPlanRequest(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    start_month: str = Field(min_length=7, max_length=10, description="YYYY-MM")
    end_month: str = Field(min_length=7, max_length=10, description="YYYY-MM")
    monthly_amount: float | None = Field(
        default=None,
        ge=0,
        le=10_000_000,
        description="Money available each month. Blank = sum of the stock amounts.",
    )
    currency: str = Field(default="EUR", description="Plan currency for every amount.")
    include_unplanned: bool = Field(
        default=True,
        description="Count buys of stocks that are not in the plan toward the budget.",
    )
    items: list[BudgetPlanItemRequest] = Field(default_factory=list, max_length=MAX_PLAN_ITEMS)

    @field_validator("currency")
    @classmethod
    def normalize_plan_currency(cls, value: str) -> str:
        code = (value or "EUR").upper().strip()
        if code not in PLAN_CURRENCIES:
            raise ValueError(f"currency must be one of {', '.join(PLAN_CURRENCIES)}")
        return code

    @field_validator("name")
    @classmethod
    def normalize_plan_name(cls, value: str | None) -> str | None:
        text = (value or "").strip()
        return text or None


class SellRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    shares: float = Field(gt=0, le=1_000_000)
    price_per_share: float | None = Field(
        default=None,
        gt=0,
        description="If omitted, uses the live market price.",
    )
    sold_at: str | None = Field(
        default=None,
        description="Sell date YYYY-MM-DD. Defaults to today.",
    )
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("sold_at")
    @classmethod
    def validate_sold_at(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("sold_at must be YYYY-MM-DD") from exc
        return value

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.upper().strip()


@app.get("/api/health")
def health():
    status = quote_status()
    return {
        "status": "ok",
        "smtp_enabled": smtp_enabled(),
        **status,
        **backup_status(),
    }


@app.get("/api/config")
def app_config():
    minutes = silent_stock_refresh_minutes()
    hours = suggestion_refresh_hours()
    return {
        "cron_job_silent_stock_refresh": minutes,
        "suggestion_refresh_hours": hours,
        "smtp_enabled": smtp_enabled(),
        "export_enabled": export_enabled(),
        "delete_enabled": delete_enabled(),
        **backup_status(),
        "email_disabled_message": EMAIL_DISABLED_MESSAGE,
        **billing_public_config(),
        "billing_configured": billing_configured(),
    }


@app.post("/api/auth/register")
def register(body: AuthRequest, response: Response):
    try:
        user_id = register_user(email=body.email, password=body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session_cookie(response, user_id)
    return {"ok": True}


@app.post("/api/auth/login")
def login(body: AuthRequest, response: Response):
    try:
        user_id = authenticate_user(email=body.email, password=body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    _set_session_cookie(response, user_id)
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(request: Request):
    user_id = get_optional_user_id(request)
    if user_id is None:
        return {"authenticated": False, "email": None}
    user = get_user_by_id(user_id)
    email = None
    if user:
        try:
            email = decrypt_email(user["email_encrypted"])
        except Exception:
            email = None
    return {
        "authenticated": True,
        "email": email,
        "subscription_tier": "pro" if user_is_pro(user_id) else "free",
        "billing_configured": billing_configured(),
        "billing_portal_available": user_can_open_billing_portal(user),
    }


@app.post("/api/auth/change-password")
def change_password_endpoint(
    body: ChangePasswordRequest, user_id: int = Depends(require_user_id)
):
    try:
        change_password(
            user_id=user_id,
            current_password=body.current_password,
            new_password=body.new_password,
        )
    except ValueError as exc:
        status = 401 if "incorrect" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/api/account/export")
def export_account(
    user_id: int = Depends(require_user_id),
    format: str = Query(default="csv"),
):
    if not export_enabled():
        raise HTTPException(status_code=403, detail=EXPORT_DISABLED_MESSAGE)
    kind = (format or "csv").strip().lower()
    if kind == "json":
        return JSONResponse(
            content=export_payload(user_id),
            headers={
                "Content-Disposition": 'attachment; filename="stock-buy-planner-export.json"'
            },
        )
    if kind != "csv":
        raise HTTPException(status_code=400, detail="format must be csv or json")
    return Response(
        content=export_csv(user_id),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="stock-buy-planner-export.csv"'
        },
    )


@app.post("/api/account/import")
def import_account(
    body: ImportAccountRequest,
    user_id: int = Depends(require_user_id),
):
    if not export_enabled():
        raise HTTPException(status_code=403, detail=EXPORT_DISABLED_MESSAGE)
    try:
        result = import_payload(user_id=user_id, raw=body.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from live_cache import invalidate_progress
    from live_cache import invalidate as invalidate_cache

    invalidate_progress(user_id)
    invalidate_cache("watchlist", user_id)
    return result


@app.post("/api/auth/delete-account")
def delete_account_endpoint(
    body: DeleteAccountRequest,
    response: Response,
    user_id: int = Depends(require_user_id),
):
    if not delete_enabled():
        raise HTTPException(status_code=403, detail=DELETE_DISABLED_MESSAGE)
    try:
        delete_account(user_id=user_id, password=body.password)
    except ValueError as exc:
        status = 401 if "incorrect" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    from live_cache import invalidate_progress
    from live_cache import invalidate as invalidate_cache

    invalidate_progress(user_id)
    invalidate_cache("watchlist", user_id)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.post("/api/auth/refresh")
def auth_refresh(response: Response, user_id: int = Depends(require_user_id)):
    """Issue a new session cookie for an already-authenticated user."""
    _set_session_cookie(response, user_id)
    return {"ok": True, "authenticated": True}


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request):
    if not smtp_enabled():
        raise HTTPException(status_code=503, detail=EMAIL_DISABLED_MESSAGE)
    try:
        base = str(request.base_url).rstrip("/")
        request_password_reset(email=body.email, base_url=base)
    except EmailDisabled as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send reset email: {exc}") from exc
    return {"ok": True}


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordRequest):
    try:
        reset_password_with_hash(reset_hash=body.hash, password=body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/api/quote/{symbol}")
def quote(
    symbol: str,
    lookback_months: int = Query(default=12, ge=3, le=60),
    include_dividends: bool = Query(default=False),
):
    try:
        q = fetch_quote(
            symbol,
            lookback_months=lookback_months,
            include_dividends=include_dividends,
        )
        q = quote_in_preferred_currency(q, symbol)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    payload = {
        "symbol": q.symbol,
        "requested_symbol": q.requested_symbol,
        "name": q.name,
        "currency": q.currency,
        "price": q.price,
        "previous_close": q.previous_close,
        "change_pct": q.change_pct,
        "change_1m_pct": q.change_1m_pct,
        "avg_monthly_growth_pct": q.avg_monthly_growth_pct,
        "lookback_months": q.lookback_months,
        "price_source": q.price_source,
        "price_source_label": PRICE_SOURCE_LABELS.get(q.price_source, q.price_source),
        "as_of": q.as_of,
        "price_input_currency": preferred_price_currency(symbol),
    }
    if include_dividends:
        payload["dividend"] = q.dividend.to_dict()
    return payload


@app.get("/api/dividends/{symbol}")
def dividends(symbol: str):
    try:
        return fetch_dividends(symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Dividend data error: {exc}") from exc


@app.post("/api/plan")
def plan(body: PlanRequest):
    try:
        periods = body.resolved_periods()
        if body.frequency == "yearly" and periods > 40:
            raise ValueError("years must be between 1 and 40")
        q = fetch_quote(
            body.symbol,
            lookback_months=body.lookback_months,
            include_dividends=False,
            source=body.price_source,
        )
        q = quote_in_preferred_currency(q, body.symbol)
        result = calculate_buy_plan(
            symbol=q.symbol,
            company_name=q.name,
            currency=q.currency,
            current_price=q.price,
            avg_monthly_growth_pct=q.avg_monthly_growth_pct,
            total_shares=body.total_shares,
            periods=periods,
            frequency=body.frequency,
            growth_override_pct=body.growth_override_pct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Market data error: {exc}") from exc

    payload = result_to_dict(result)
    payload["quote_as_of"] = q.as_of
    payload["historical_avg_monthly_growth_pct"] = q.avg_monthly_growth_pct
    payload["change_pct"] = q.change_pct
    payload["requested_symbol"] = q.requested_symbol
    payload["price_source"] = q.price_source
    payload["price_source_label"] = PRICE_SOURCE_LABELS.get(q.price_source, q.price_source)
    return payload


@app.get("/api/purchases")
def get_purchases(
    symbol: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: str = Query(
        default="10",
        description="Page size: 10, 20, 30, 50, or all",
    ),
    user_id: int = Depends(require_user_id),
):
    size_raw = (page_size or "10").strip().lower()
    if size_raw == "all":
        resolved_size = None
    else:
        try:
            resolved_size = int(size_raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="page_size must be 10, 20, 30, 50, or all",
            ) from exc
        if resolved_size not in {10, 20, 30, 50}:
            raise HTTPException(
                status_code=400,
                detail="page_size must be 10, 20, 30, 50, or all",
            )
    try:
        return list_purchases_page(
            user_id=user_id,
            symbol=symbol,
            page=page,
            page_size=resolved_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/purchases")
def create_purchase(body: PurchaseRequest, user_id: int = Depends(require_user_id)):
    requested = body.symbol.upper().strip()
    company_name = body.company_name
    price = body.price_per_share

    # Always resolve via market data so broker aliases (e.g. VUAA.EU) map correctly
    try:
        q = fetch_quote(requested, include_dividends=False)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Market data error: {exc}"
        ) from exc

    trade_date = body.purchased_at or today_iso()
    try:
        normalized = normalize_user_price(
            requested_symbol=requested,
            price=price,
            quote=q,
            on_date=trade_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Explicit body.currency wins only when no symbol-specific USD rule applies
    currency = preferred_price_currency(requested) or body.currency or normalized.currency
    if not company_name:
        company_name = q.name

    try:
        purchase = add_purchase(
            user_id=user_id,
            symbol=q.symbol,
            company_name=company_name,
            currency=currency or "USD",
            shares=body.shares,
            price_per_share=normalized.price,
            purchased_at=trade_date,
            notes=body.notes,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if q.requested_symbol:
        purchase["requested_symbol"] = q.requested_symbol
    if normalized.conversion_note:
        purchase["conversion_note"] = normalized.conversion_note
    invalidate_progress(user_id)
    return purchase


@app.get("/api/positions")
def positions(user_id: int = Depends(require_user_id)):
    return {"positions": list_positions(user_id=user_id)}


@app.get("/api/positions/{symbol}")
def position_for_symbol(symbol: str, user_id: int = Depends(require_user_id)):
    shares = owned_shares(symbol, user_id=user_id)
    return {
        "symbol": symbol.upper().strip(),
        "shares": round(shares, 6),
    }


@app.post("/api/sales")
def create_sale(body: SellRequest, user_id: int = Depends(require_user_id)):
    requested = body.symbol.upper().strip()
    price = body.price_per_share

    try:
        q = fetch_quote(requested, include_dividends=False)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Market data error: {exc}"
        ) from exc

    trade_date = body.sold_at or today_iso()
    try:
        normalized = normalize_user_price(
            requested_symbol=requested,
            price=price,
            quote=q,
            on_date=trade_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    currency = preferred_price_currency(requested) or normalized.currency

    try:
        sale = execute_sale(
            user_id=user_id,
            symbol=q.symbol,
            shares=body.shares,
            price_per_share=normalized.price,
            sold_at=trade_date,
            notes=body.notes,
            company_name=q.name,
            currency=currency,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if q.requested_symbol:
        sale["requested_symbol"] = q.requested_symbol
    if normalized.conversion_note:
        sale["conversion_note"] = normalized.conversion_note
    invalidate_progress(user_id)
    return sale


@app.get("/api/transactions")
def get_transactions(
    page: int = Query(default=1, ge=1),
    page_size: str = Query(
        default="10",
        description="Page size: 10, 20, 30, 50, or all",
    ),
    user_id: int = Depends(require_user_id),
):
    size_raw = (page_size or "10").strip().lower()
    if size_raw == "all":
        resolved_size = None
    else:
        try:
            resolved_size = int(size_raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="page_size must be 10, 20, 30, 50, or all",
            ) from exc
        if resolved_size not in {10, 20, 30, 50}:
            raise HTTPException(
                status_code=400,
                detail="page_size must be 10, 20, 30, 50, or all",
            )
    try:
        return list_transactions_page(
            user_id=user_id,
            page=page,
            page_size=resolved_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/purchases/{purchase_id}")
def remove_purchase(purchase_id: int, user_id: int = Depends(require_user_id)):
    if not delete_purchase(purchase_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Purchase not found")
    invalidate_progress(user_id)
    return {"ok": True}


@app.get("/api/progress/summary")
def progress_summary(
    symbol: str | None = None,
    user_id: int = Depends(require_user_id),
):
    """Fast portfolio shell without live quotes (for lazy holdings load)."""
    purchases = list_purchases(user_id=user_id, symbol=symbol)
    sales = list_sales(user_id=user_id, symbol=symbol)
    return build_progress_summary(purchases, sales)


@app.get("/api/progress")
def progress(
    force: bool = Query(default=False),
    user_id: int = Depends(require_user_id),
):
    try:
        return get_progress(user_id, force=force, manual=force)
    except RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)}
        ) from exc


@app.get("/api/notifications/settings")
def get_notifications_settings(user_id: int = Depends(require_user_id)):
    settings = get_notification_settings(user_id=user_id)
    user = get_user_by_id(user_id)
    account_email = ""
    if user:
        try:
            account_email = decrypt_email(user["email_encrypted"])
        except Exception:
            account_email = ""
    return {
        "monthly_report_enabled": settings["monthly_report_enabled"],
        "report_email": settings["report_email"],
        "account_email": account_email,
        "last_sent_month": settings.get("last_sent_month"),
        "smtp_enabled": smtp_enabled(),
        "email_disabled_message": EMAIL_DISABLED_MESSAGE,
    }


@app.put("/api/notifications/settings")
def update_notifications_settings(
    body: NotificationSettingsRequest,
    user_id: int = Depends(require_user_id),
):
    report_email = body.report_email.strip()
    if body.monthly_report_enabled and not smtp_enabled():
        raise HTTPException(status_code=503, detail=EMAIL_DISABLED_MESSAGE)
    if body.monthly_report_enabled:
        try:
            assert_monthly_email(user_id)
        except ProRequired as exc:
            raise HTTPException(
                status_code=402,
                detail={"code": "pro_required", "feature": exc.feature, "message": exc.detail},
            ) from exc
    if body.monthly_report_enabled:
        if not report_email:
            user = get_user_by_id(user_id)
            if user:
                try:
                    report_email = decrypt_email(user["email_encrypted"])
                except Exception:
                    report_email = ""
        if not report_email:
            raise HTTPException(
                status_code=400,
                detail="Enter an email address to receive monthly reports",
            )
        try:
            report_email = validate_email(report_email)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif report_email:
        try:
            report_email = validate_email(report_email)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    saved = upsert_notification_settings(
        user_id=user_id,
        monthly_report_enabled=body.monthly_report_enabled,
        report_email=report_email,
    )
    return {
        "monthly_report_enabled": saved["monthly_report_enabled"],
        "report_email": saved["report_email"],
        "last_sent_month": saved.get("last_sent_month"),
        "ok": True,
    }


@app.get("/api/dividend-ideas")
def dividend_ideas(request: Request, force: bool = Query(default=False)):
    try:
        user_id = get_optional_user_id(request)
        return get_dividend_ideas(user_id, force=force, manual=force)
    except RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)}
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/suggestions")
def suggestions(force: bool = Query(default=False)):
    try:
        return get_suggestions(force=force, manual=force)
    except RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)}
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/watchlist")
def watchlist_get(request: Request, force: bool = Query(default=False)):
    try:
        user_id = get_optional_user_id(request)
        return get_watchlist(user_id, force=force, manual=force)
    except RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)}
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/watchlist")
def add_watchlist(body: WatchlistRequest, user_id: int = Depends(require_user_id)):
    try:
        assert_watchlist_add(user_id)
    except ProRequired as exc:
        raise HTTPException(
            status_code=402,
            detail={"code": "pro_required", "feature": exc.feature, "message": exc.detail},
        ) from exc
    try:
        item = create_watchlist_entry(
            user_id=user_id,
            symbol=body.symbol,
            asset_type=body.asset_type,
            price_source=body.price_source,
        )
        merge_watchlist_item(user_id, item)
        return item
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/watchlist/{item_id}")
def remove_watchlist(item_id: int, user_id: int = Depends(require_user_id)):
    if not remove_watchlist_entry(item_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    remove_watchlist_item_from_cache(user_id, item_id)
    return {"ok": True}


def _budget_plan_fields(body: BudgetPlanRequest) -> dict:
    try:
        start_month, end_month = validate_window(body.start_month, body.end_month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not body.items and not body.monthly_amount:
        raise HTTPException(
            status_code=400,
            detail="Add a monthly amount, at least one stock, or both",
        )

    items: list[dict] = []
    seen: set[str] = set()
    for item in body.items:
        try:
            q = fetch_quote(item.symbol, include_dividends=False)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Could not find market data for {item.symbol}",
            ) from exc
        if q.symbol in seen:
            raise HTTPException(status_code=400, detail=f"{item.symbol} is in the plan twice")
        seen.add(q.symbol)
        items.append(
            {
                "symbol": q.symbol,
                "requested_symbol": item.symbol if item.symbol != q.symbol else None,
                "company_name": q.name,
                "monthly_amount": round(item.monthly_amount, 2),
            }
        )

    start, end = parse_month(start_month), parse_month(end_month)
    return {
        "name": body.name or f"{start:%b %Y} – {end:%b %Y}",
        "start_month": start_month,
        "end_month": end_month,
        "monthly_amount": round(body.monthly_amount, 2) if body.monthly_amount else None,
        "currency": body.currency,
        "include_unplanned": body.include_unplanned,
        "items": items,
    }


def _budget_plan_summary(plan: dict, user_id: int) -> dict:
    return summarize_budget_plan(
        plan,
        list_purchases(user_id=user_id),
        list_sale_lot_allocations(user_id=user_id),
    )


@app.get("/api/budget-plans")
def budget_plans_list(user_id: int = Depends(require_user_id)):
    plans = list_budget_plans(user_id=user_id)
    if not plans:
        return {"plans": []}
    purchases = list_purchases(user_id=user_id)
    allocations = list_sale_lot_allocations(user_id=user_id)
    return {
        "plans": [summarize_budget_plan(plan, purchases, allocations) for plan in plans]
    }


def _pro_required_http(exc: ProRequired) -> HTTPException:
    return HTTPException(
        status_code=402,
        detail={"code": "pro_required", "feature": exc.feature, "message": exc.detail},
    )


@app.post("/api/budget-plans")
def budget_plan_create(body: BudgetPlanRequest, user_id: int = Depends(require_user_id)):
    try:
        assert_budget_plan_create(user_id)
        assert_budget_plan_window(
            user_id, start_month=body.start_month, end_month=body.end_month
        )
    except ProRequired as exc:
        raise _pro_required_http(exc) from exc
    plan = create_budget_plan(user_id=user_id, **_budget_plan_fields(body))
    return _budget_plan_summary(plan, user_id)


@app.put("/api/budget-plans/{plan_id}")
def budget_plan_update(
    plan_id: int, body: BudgetPlanRequest, user_id: int = Depends(require_user_id)
):
    try:
        assert_budget_plan_window(
            user_id, start_month=body.start_month, end_month=body.end_month
        )
    except ProRequired as exc:
        raise _pro_required_http(exc) from exc
    plan = update_budget_plan(plan_id, user_id=user_id, **_budget_plan_fields(body))
    if plan is None:
        raise HTTPException(status_code=404, detail="Budget plan not found")
    invalidate_budget_plans(user_id, plan_id)
    return _budget_plan_summary(plan, user_id)


@app.delete("/api/budget-plans/{plan_id}")
def budget_plan_delete(plan_id: int, user_id: int = Depends(require_user_id)):
    if not delete_budget_plan(plan_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Budget plan not found")
    invalidate_budget_plans(user_id, plan_id)
    return {"ok": True}


@app.get("/api/budget-plans/{plan_id}")
def budget_plan_progress(
    plan_id: int,
    force: bool = Query(default=False),
    user_id: int = Depends(require_user_id),
):
    try:
        return get_budget_progress(user_id, plan_id, force=force, manual=force)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Budget plan not found") from exc
    except RateLimited as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)}
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Market data error: {exc}") from exc


class BillingCheckoutRequest(BaseModel):
    interval: str = Field(default="month", pattern="^(month|year)$")
    provider: str | None = None


@app.get("/api/billing/providers")
def billing_providers_list():
    return {"providers": list_providers_public(), **billing_public_config()}


@app.post("/api/billing/checkout")
def billing_checkout(
    body: BillingCheckoutRequest, user_id: int = Depends(require_user_id)
):
    result = create_checkout_session(
        user_id=user_id, interval=body.interval, provider=body.provider
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail={"code": result.get("code", "billing_not_configured")},
        )
    return {"url": result["url"]}


@app.post("/api/billing/portal")
def billing_portal(user_id: int = Depends(require_user_id)):
    result = create_billing_portal(user_id=user_id)
    if not result.get("ok"):
        code = result.get("code", "error")
        if code == "no_billing_customer":
            raise HTTPException(status_code=400, detail={"code": code})
        if code in {"billing_not_configured", "portal_not_supported"}:
            raise HTTPException(status_code=503, detail={"code": code})
        raise HTTPException(status_code=400, detail={"code": code})
    return {"url": result["url"], "provider": result.get("provider")}


@app.post("/api/billing/webhook/{provider_id}")
async def billing_webhook_provider(provider_id: str, request: Request):
    payload = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    result = handle_webhook(provider_id, payload, headers)
    if not result.get("ok"):
        code = result.get("code", "error")
        status = 400 if code in {"invalid_signature", "invalid_payload"} else 503
        raise HTTPException(status_code=status, detail={"code": code})
    return {"ok": True}


@app.post("/api/billing/webhook")
async def billing_webhook_stripe_legacy(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    result = handle_stripe_webhook(payload, signature)
    if not result.get("ok"):
        code = result.get("code", "error")
        status = 400 if code == "invalid_signature" else 503
        raise HTTPException(status_code=status, detail={"code": code})
    return {"ok": True}


@app.get("/")
def root(request: Request):
    if get_optional_user_id(request) is None:
        target = "/pricing" if site_guest_home() == "pricing" else "/login"
        return RedirectResponse(url=target, status_code=302)
    return RedirectResponse(url="/home", status_code=302)


@app.get("/home")
def home_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fhome", status_code=302)
    path = FRONTEND_DIR / "home.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Home page not found")
    return FileResponse(path)


@app.get("/plan")
def plan_page():
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=500, detail="Frontend not found")
    return FileResponse(index_path)


@app.get("/index")
def legacy_index():
    return RedirectResponse(url="/plan", status_code=302)


@app.get("/progress")
def progress_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fprogress", status_code=302)
    path = FRONTEND_DIR / "progress.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Progress page not found")
    return FileResponse(path)


@app.get("/budget")
def budget_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fbudget", status_code=302)
    path = FRONTEND_DIR / "budget.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Budget page not found")
    return FileResponse(path)


@app.get("/ideas")
def ideas_page():
    path = FRONTEND_DIR / "ideas.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Ideas page not found")
    return FileResponse(path)


@app.get("/suggestions")
def suggestions_page():
    path = FRONTEND_DIR / "suggestions.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Suggestions page not found")
    return FileResponse(path)


@app.get("/track")
def track_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Ftrack", status_code=302)
    path = FRONTEND_DIR / "track.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Track page not found")
    return FileResponse(path)


@app.get("/account")
def account_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Faccount", status_code=302)
    path = FRONTEND_DIR / "account.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Account page not found")
    return FileResponse(path)


@app.get("/notifications")
def notifications_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fnotifications", status_code=302)
    path = FRONTEND_DIR / "notifications.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Notifications page not found")
    return FileResponse(path)


@app.get("/pricing")
def pricing_page():
    path = FRONTEND_DIR / "pricing.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Pricing page not found")
    return FileResponse(path)


@app.get("/help/calculations")
def help_calculations_page():
    path = FRONTEND_DIR / "help-calculations.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Help page not found")
    return FileResponse(path)


@app.get("/welcome")
def welcome_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fwelcome", status_code=302)
    path = FRONTEND_DIR / "welcome.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Welcome page not found")
    return FileResponse(path)


@app.get("/legal/terms")
def legal_terms_page():
    path = FRONTEND_DIR / "legal-terms.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Terms page not found")
    return FileResponse(path)


@app.get("/legal/privacy")
def legal_privacy_page():
    path = FRONTEND_DIR / "legal-privacy.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Privacy page not found")
    return FileResponse(path)


@app.get("/login")
def login_page():
    path = FRONTEND_DIR / "login.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Login page not found")
    return FileResponse(path)


@app.get("/forgot-password")
def forgot_password_page():
    path = FRONTEND_DIR / "forgot-password.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Forgot password page not found")
    return FileResponse(path)


@app.get("/reset-password")
def reset_password_page():
    path = FRONTEND_DIR / "reset-password.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Reset password page not found")
    return FileResponse(path)


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")
