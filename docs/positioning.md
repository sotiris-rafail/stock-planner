# Positioning (Pro launch v1)

Locked for Phase 0 — adjust only with an explicit product decision.

## Ideal customer profile (ICP)

**Who:** Retail investors in Europe (especially EUR) who invest a **fixed amount every month** into stocks or ETFs, often with a dividend angle. They use one or two brokers, keep positions for years, and today use spreadsheets, broker apps, or mental math to stay on plan.

**Who it is not for:** Day traders, options-focused users, full tax-reporting power users (Sharesight/PP replacement), or people who only want free live quotes.

## One-line pitch

**Stick to your monthly investing plan — see what you spent, what you set aside, and what dividends paid, without a spreadsheet.**

## Problem → outcome

| Problem | Outcome with this app |
|--------|------------------------|
| “I don’t know if I actually invested my €400 this month.” | Budget plan matches Progress buys; Home and Budget show this month vs target. |
| “I split money across several stocks each month.” | Per-stock monthly targets and on-track / missed states per month. |
| “Broker app doesn’t show plan vs reality over many months.” | Month-by-month table, set-aside cash, pace vs time. |
| “I care about dividends during my DCA period.” | Dividends in the plan window, net of withholding setting. |

## Wedge (why pay)

Competitors give **prices** or **tax lots**. This app sells **monthly discipline**: budget window + automatic matching to logged buys + set-aside + dividend credit in that window.

## Messaging (draft)

- **Eyebrow:** Monthly investing, one place
- **Title:** Invest the same amount every month
- **Lede:** Set your months, your stocks, and your budget. Log buys on Progress as usual — see pace, cash on the side, and returns.
- **Disclaimer (always visible):** Not investment advice. Live data and FX can be delayed or missing; calculations are illustrative.

## Pricing (locked for implementation)

| Plan | Price | Notes |
|------|-------|--------|
| **Free** | €0 | Habit + trial of core workflow |
| **Pro monthly** | **€1.99 / month** | Primary SKU |
| **Pro yearly** | **€19.99 / year** | ~17% off; offer on pricing page after monthly works |

**Trial:** 14-day Pro trial on first signup (Stripe trial or `trial_ends_at` — pick one in billing implementation; default recommendation: Stripe trial on yearly/monthly checkout).

## Success criteria (first 90 days post-launch)

- 30+ paying Pro subscribers
- &lt;10% monthly churn on Pro (after month 2)
- Zero unresolved “wrong number” incidents on Budget/Progress for paying users

## Related docs

- [Entitlements](entitlements.md) — what Free vs Pro includes
- [Release plan](release-plan.md) — phased checklist
- [Hosting](hosting.md) — SQLite vs Postgres for SaaS