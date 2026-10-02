"""HTML and plain-text monthly portfolio report for email."""

from __future__ import annotations

import html
from datetime import datetime, timezone


def build_monthly_report(*, progress: dict, period_label: str) -> tuple[str, str, str]:
    subject = f"Your Stock Buy Planner report — {period_label}"
    text = _build_text(progress=progress, period_label=period_label)
    html_body = _build_html(progress=progress, period_label=period_label)
    return subject, text, html_body


def _money(amount: float | None, currency: str) -> str:
    if amount is None:
        return "—"
    symbol = {"USD": "$", "EUR": "€", "GBP": "£"}.get(currency.upper(), f"{currency} ")
    if currency.upper() in {"USD", "EUR", "GBP"}:
        return f"{symbol}{amount:,.2f}"
    return f"{amount:,.2f} {currency}"


def _num(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "—"
    return f"{value:,.{digits}f}"


def _growth_class(value: float | None) -> str:
    if value is None or value == 0:
        return ""
    return "pos" if value > 0 else "neg"


def _build_text(*, progress: dict, period_label: str) -> str:
    lines = [
        "Stock Buy Planner — monthly portfolio report",
        period_label,
        "",
    ]
    groups = progress.get("by_currency") or []
    if not groups:
        lines.append("You have no holdings to report this month.")
        lines.append("")
        lines.append("View your portfolio: open the Progress page in Stock Buy Planner.")
        return "\n".join(lines)

    for group in groups:
        currency = group.get("currency") or "USD"
        lines.append(f"=== {currency} ===")
        lines.append(
            f"Invested: {_money(group.get('total_invested'), currency)} · "
            f"Value: {_money(group.get('total_market_value'), currency)} · "
            f"Unrealized: {_money(group.get('total_unrealized_gain'), currency)} · "
            f"Dividends: {_money(group.get('total_dividends_earned'), currency)}"
        )
        lines.append("")
        for holding in group.get("holdings") or []:
            lines.append(
                f"{holding.get('symbol')} · {holding.get('company_name') or holding.get('symbol')}"
            )
            lines.append(
                f"  Shares {_num(holding.get('shares'), 4)} · "
                f"Invested {_money(holding.get('total_invested'), currency)} · "
                f"Value {_money(holding.get('market_value'), currency)} · "
                f"Unrealized {_money(holding.get('unrealized_gain'), currency)}"
            )
        lines.append("")

    lines.append("Generated automatically from your Progress holdings.")
    return "\n".join(lines)


def _build_html(*, progress: dict, period_label: str) -> str:
    generated = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    groups = progress.get("by_currency") or []
    sections: list[str] = []

    if not groups:
        sections.append(
            '<p class="empty">You have no open holdings to report this month.</p>'
        )
    else:
        for group in groups:
            sections.append(_currency_section(group))

    sections_html = "\n".join(sections)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(subject_safe(period_label))}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f1;font-family:Roboto,system-ui,sans-serif;color:#1a2826;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#f8f6f1;border:1px solid #d8e3df;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(26,40,38,0.08);">
          <tr>
            <td style="padding:28px 28px 12px;background:linear-gradient(135deg,#e8f0ed,#f8f6f1);border-bottom:1px solid #d8e3df;">
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5a726c;">Stock Buy Planner</p>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#163028;">Monthly portfolio report</h1>
              <p style="margin:0;font-size:15px;color:#4a5c57;">{html.escape(period_label)} · lighter snapshot of your Progress holdings</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 12px;">
              {sections_html}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <p style="margin:0;font-size:12px;color:#6b7d78;">Generated {generated}. Only sent because you enabled monthly reports.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def subject_safe(period_label: str) -> str:
    return f"Monthly report — {period_label}"


def _currency_section(group: dict) -> str:
    currency = (group.get("currency") or "USD").upper()
    holdings = group.get("holdings") or []
    rows = "\n".join(_holding_row(holding, currency) for holding in holdings)
    if not rows:
        rows = (
            f'<tr><td colspan="6" style="padding:12px;color:#6b7d78;">'
            f"No open holdings in {html.escape(currency)}.</td></tr>"
        )

    unrealized = group.get("total_unrealized_gain")
    unrealized_class = _growth_class(unrealized)
    unrealized_color = _color_for(unrealized_class)

    return f"""
<section style="margin-bottom:24px;">
  <div style="padding:14px 16px;background:#edf5f2;border:1px solid #cfe0da;border-radius:12px;margin-bottom:12px;">
    <h2 style="margin:0 0 10px;font-size:18px;color:#163028;">{html.escape(currency)}</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#4a5c57;">
      <tr>
        <td style="padding:4px 8px 4px 0;">Invested<br><strong style="color:#163028;">{_money(group.get('total_invested'), currency)}</strong></td>
        <td style="padding:4px 8px;">Market value<br><strong style="color:#163028;">{_money(group.get('total_market_value'), currency)}</strong></td>
        <td style="padding:4px 8px;">Unrealized<br><strong style="color:{unrealized_color};">{_money(unrealized, currency)}</strong></td>
        <td style="padding:4px 0 4px 8px;">Dividends earned<br><strong style="color:#2d6a4f;">{_money(group.get('total_dividends_earned'), currency)}</strong></td>
      </tr>
    </table>
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f0ebe3;color:#5a726c;text-align:left;">
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Holding</th>
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Shares</th>
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Invested</th>
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Value</th>
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Unrealized</th>
        <th style="padding:10px 8px;border-bottom:1px solid #ddd6cb;">Realized</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>
</section>"""


def _holding_row(holding: dict, currency: str) -> str:
    name = html.escape(holding.get("company_name") or holding.get("symbol") or "")
    symbol = html.escape(holding.get("symbol") or "")
    unrealized = holding.get("unrealized_gain")
    realized = holding.get("realized_gain")
    unrealized_color = _color_for(_growth_class(unrealized))
    realized_color = _color_for(_growth_class(realized))
    unrealized_pct = holding.get("unrealized_gain_pct")
    unrealized_suffix = (
        f" ({_num(unrealized_pct, 2)}%)" if unrealized_pct is not None else ""
    )
    return f"""
<tr style="border-bottom:1px solid #ece7df;">
  <td style="padding:10px 8px;vertical-align:top;">
    <strong style="color:#163028;">{name}</strong><br>
    <span style="color:#6b7d78;font-size:12px;">{symbol}</span>
  </td>
  <td style="padding:10px 8px;vertical-align:top;">{_num(holding.get('shares'), 4)}</td>
  <td style="padding:10px 8px;vertical-align:top;">{_money(holding.get('total_invested'), currency)}</td>
  <td style="padding:10px 8px;vertical-align:top;">{_money(holding.get('market_value'), currency)}</td>
  <td style="padding:10px 8px;vertical-align:top;color:{unrealized_color};">{_money(unrealized, currency)}{unrealized_suffix}</td>
  <td style="padding:10px 8px;vertical-align:top;color:{realized_color};">{_money(realized, currency)}</td>
</tr>"""


def _color_for(growth_class: str) -> str:
    if growth_class == "pos":
        return "#2d6a4f"
    if growth_class == "neg":
        return "#b54a4a"
    return "#163028"
