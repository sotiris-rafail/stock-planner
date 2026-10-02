from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from scheduler import run_due_monthly_reports, scheduler_timezone, start_scheduler, stop_scheduler


def test_timezone_fallback(monkeypatch):
    monkeypatch.setenv("SBP_TIMEZONE", "Not/AZone")
    assert scheduler_timezone() == ZoneInfo("UTC")
    monkeypatch.setenv("SBP_TIMEZONE", "Europe/Berlin")
    assert scheduler_timezone().key == "Europe/Berlin"


def test_run_due_skips_when_not_first(monkeypatch):
    class FakeNow(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 3, 15, 12, 0, tzinfo=tz or ZoneInfo("UTC"))

    monkeypatch.setattr("scheduler.datetime", FakeNow)
    run_due_monthly_reports()  # should return immediately


def test_run_due_sends(monkeypatch, isolated_db):
    from auth import register_user
    from db import upsert_notification_settings
    from tests.conftest import VALID_PASSWORD

    user_id = register_user(email="rep@example.com", password=VALID_PASSWORD)
    upsert_notification_settings(
        user_id=user_id, monthly_report_enabled=True, report_email="rep@example.com"
    )
    sent = []

    class DT:
        @staticmethod
        def now(tz=None):
            return datetime(2026, 4, 1, 0, 10, tzinfo=tz or ZoneInfo("UTC"))

    monkeypatch.setattr("scheduler.datetime", DT)
    monkeypatch.setattr("portfolio.build_progress", lambda p, s: {"by_currency": []})
    monkeypatch.setattr(
        "monthly_report.build_monthly_report",
        lambda **k: ("subj", "text", "<p>html</p>"),
    )
    monkeypatch.setattr("mailer.send_monthly_report_email", lambda **k: sent.append(k))
    run_due_monthly_reports()
    assert sent
    run_due_monthly_reports()
    assert len(sent) == 1


def test_start_stop_scheduler(monkeypatch):
    monkeypatch.setattr("scheduler._loop", lambda: None)
    start_scheduler()
    start_scheduler()
    stop_scheduler()
