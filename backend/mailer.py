"""Outbound email for password reset and monthly portfolio reports."""

from __future__ import annotations

import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from settings import smtp_config

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUTBOX_DIR = DATA_DIR / "outbox"


def send_reset_email(*, to_email: str, reset_url: str, reset_hash: str) -> None:
    subject = "Reset your Stock Buy Planner password"
    text = (
        "Use this link to choose a new password:\n\n"
        f"{reset_url}\n\n"
        "Reset hash (included in the link):\n"
        f"{reset_hash}\n\n"
        "If you did not ask to reset your password, you can ignore this message.\n"
    )
    html = (
        "<p>Use this link to choose a new password:</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        f"<p>Reset hash: <code>{reset_hash}</code></p>"
        "<p>If you did not ask to reset your password, you can ignore this message.</p>"
    )

    _write_outbox(to_email=to_email, subject=subject, body=text)
    print(f"Password reset link for {to_email}: {reset_url}")

    _deliver_email(
        to_email=to_email,
        subject=subject,
        text_body=text,
        html_body=html,
    )


def send_monthly_report_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    _write_outbox(to_email=to_email, subject=subject, body=text_body, html_body=html_body)
    print(f"Monthly portfolio report for {to_email}: {subject}")
    _deliver_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def _deliver_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    config = smtp_config()
    host = config["host"]
    if not host:
        return

    from_addr = config["from"]
    port = config["port"]
    user = config["user"]
    password = config["password"]

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def _write_outbox(*, to_email: str, subject: str, body: str, html_body: str | None = None) -> None:
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = to_email.replace("@", "_at_").replace("/", "_")
    path = OUTBOX_DIR / f"{stamp}-{safe}.txt"
    content = f"To: {to_email}\nSubject: {subject}\n\n{body}"
    if html_body:
        content += f"\n\n--- HTML ---\n{html_body}"
    path.write_text(content, encoding="utf-8")
