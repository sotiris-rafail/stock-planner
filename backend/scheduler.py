"""Background scheduler for monthly portfolio report emails."""

from __future__ import annotations

import os
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from app_logging import get_logger

logger = get_logger("scheduler")

_stop = threading.Event()
_thread: threading.Thread | None = None


def scheduler_timezone() -> ZoneInfo:
    name = os.environ.get("SBP_TIMEZONE", "UTC").strip() or "UTC"
    try:
        return ZoneInfo(name)
    except Exception:
        logger.warning("Invalid SBP_TIMEZONE %r; falling back to UTC", name)
        return ZoneInfo("UTC")


def run_due_monthly_reports() -> None:
    """Send reports on the first day of each month during the midnight hour."""
    from auth_crypto import decrypt_email
    from db import (
        get_notification_settings,
        get_user_by_id,
        list_purchases,
        list_sales,
        list_users_with_monthly_report_enabled,
        mark_monthly_report_sent,
    )
    from mailer import send_monthly_report_email
    from monthly_report import build_monthly_report
    from portfolio import build_progress

    tz = scheduler_timezone()
    now = datetime.now(tz)
    if now.day != 1 or now.hour != 0:
        return

    month_key = now.strftime("%Y-%m")
    period_label = now.strftime("%B %Y")

    for row in list_users_with_monthly_report_enabled():
        user_id = int(row["user_id"])
        settings = get_notification_settings(user_id=user_id)
        if not settings.get("monthly_report_enabled"):
            continue
        if settings.get("last_sent_month") == month_key:
            continue

        email = (settings.get("report_email") or "").strip()
        if not email:
            user = get_user_by_id(user_id)
            if not user:
                continue
            try:
                email = decrypt_email(user["email_encrypted"])
            except Exception:
                logger.exception("Could not decrypt account email for user %s", user_id)
                continue

        try:
            purchases = list_purchases(user_id=user_id)
            sales = list_sales(user_id=user_id)
            progress = build_progress(purchases, sales)
            subject, text_body, html_body = build_monthly_report(
                progress=progress,
                period_label=period_label,
            )
            send_monthly_report_email(
                to_email=email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            mark_monthly_report_sent(user_id=user_id, month_key=month_key)
            logger.info("Sent monthly report to user %s (%s)", user_id, email)
        except Exception:
            logger.exception("Failed monthly report for user %s", user_id)


def _loop() -> None:
    while not _stop.is_set():
        try:
            run_due_monthly_reports()
        except Exception:
            logger.exception("Monthly report scheduler tick failed")
        if _stop.wait(timeout=max(1.0, 60 - datetime.now().second)):
            break


def start_scheduler() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_loop,
        name="monthly-report-scheduler",
        daemon=True,
    )
    _thread.start()
    logger.info("Monthly report scheduler started (timezone=%s)", scheduler_timezone())


def stop_scheduler() -> None:
    _stop.set()
    global _thread
    if _thread:
        _thread.join(timeout=5)
        _thread = None
