"""Stock Buy Planner API + UI."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from auth import (
    SESSION_COOKIE,
    SESSION_DAYS,
    authenticate_user,
    create_session_token,
    register_user,
    request_password_reset,
    reset_password_with_hash,
)
from auth_crypto import decrypt_email, validate_email
from deps import get_optional_user_id, require_user_id

from calculator import calculate_buy_plan, result_to_dict
from db import (
    add_purchase,
    clear_dividend_ideas_cache,
    delete_purchase,
    execute_sale,
    get_notification_settings,
    get_user_by_id,
    init_db,
    list_positions,
    list_purchases,
    list_purchases_page,
    list_sales,
    list_transactions_page,
    owned_shares,
    today_iso,
    upsert_notification_settings,
)
from portfolio import build_progress, build_progress_summary
from pricing_rules import (
    normalize_user_price,
    preferred_price_currency,
    quote_in_preferred_currency,
)
from dividend_ideas import build_dividend_ideas
from suggestions import build_suggestions
from stock_service import fetch_dividends, fetch_quote
from watchlist import ASSET_TYPES, build_watchlist, create_watchlist_entry, remove_watchlist_entry
from app_logging import setup_logging
from settings import prepare_config_files, silent_stock_refresh_minutes
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

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, value: str) -> str:
        freq = (value or "monthly").lower().strip()
        if freq not in {"monthly", "yearly"}:
            raise ValueError("frequency must be 'monthly' or 'yearly'")
        return freq

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
    return {"status": "ok"}


@app.get("/api/config")
def app_config():
    minutes = silent_stock_refresh_minutes()
    return {"cron_job_silent_stock_refresh": minutes}


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
    return {"authenticated": user_id is not None}


@app.post("/api/auth/refresh")
def auth_refresh(response: Response, user_id: int = Depends(require_user_id)):
    """Issue a new session cookie for an already-authenticated user."""
    _set_session_cookie(response, user_id)
    return {"ok": True, "authenticated": True}


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request):
    try:
        base = str(request.base_url).rstrip("/")
        request_password_reset(email=body.email, base_url=base)
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
        "avg_monthly_growth_pct": q.avg_monthly_growth_pct,
        "lookback_months": q.lookback_months,
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
    clear_dividend_ideas_cache(user_id=user_id)
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
    clear_dividend_ideas_cache(user_id=user_id)
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
    clear_dividend_ideas_cache(user_id=user_id)
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
def progress(symbol: str | None = None, user_id: int = Depends(require_user_id)):
    purchases = list_purchases(user_id=user_id, symbol=symbol)
    sales = list_sales(user_id=user_id, symbol=symbol)
    payload = build_progress(purchases, sales)
    # History is loaded lazily via /api/transactions
    payload["purchases"] = []
    payload["sales"] = []
    payload["summary_only"] = False
    return payload


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
    }


@app.put("/api/notifications/settings")
def update_notifications_settings(
    body: NotificationSettingsRequest,
    user_id: int = Depends(require_user_id),
):
    report_email = body.report_email.strip()
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
def dividend_ideas(request: Request):
    try:
        user_id = get_optional_user_id(request)
        return build_dividend_ideas(user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/suggestions")
def suggestions():
    try:
        return build_suggestions()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/watchlist")
def get_watchlist(request: Request):
    try:
        user_id = get_optional_user_id(request)
        if user_id is None:
            from datetime import datetime, timezone

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
        return build_watchlist(user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/watchlist")
def add_watchlist(body: WatchlistRequest, user_id: int = Depends(require_user_id)):
    try:
        return create_watchlist_entry(
            user_id=user_id,
            symbol=body.symbol,
            asset_type=body.asset_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/watchlist/{item_id}")
def remove_watchlist(item_id: int, user_id: int = Depends(require_user_id)):
    if not remove_watchlist_entry(item_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    return {"ok": True}


@app.get("/")
def root():
    return RedirectResponse(url="/login", status_code=302)


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


@app.get("/notifications")
def notifications_page(request: Request):
    if get_optional_user_id(request) is None:
        return RedirectResponse(url="/login?next=%2Fnotifications", status_code=302)
    path = FRONTEND_DIR / "notifications.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Notifications page not found")
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
