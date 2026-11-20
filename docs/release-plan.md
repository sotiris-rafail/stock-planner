# Release plan — Pro subscription (€1.99/mo)

Phased checklist from current repo to paid launch. **Phase 0 is done** when the three decision docs exist and match product intent:

- [positioning.md](positioning.md)
- [entitlements.md](entitlements.md)
- [hosting.md](hosting.md)

## Phase 0 — Scope ✅ (documentation)

- [x] ICP and one-line pitch
- [x] Pricing: €1.99/mo, €19.99/yr, 14-day trial (recommended)
- [x] Free vs Pro matrix
- [x] Hosting: Postgres for SaaS

**Owner review:** Read the three docs above and comment if anything should change before build.

---

## Phase 1 — Trust & onboarding (2–3 weeks)

- [x] Guest landing: `/pricing` (signed-out `/` → pricing)
- [x] `/help/calculations` — FIFO, FX, budget matching, sells caveat
- [x] Post-register onboarding: `/welcome` after register
- [x] Mobile QA: Plan + Progress single-column rows ≤560px
- [x] Account: help/pricing links, subscription tier line
- [ ] **Exit:** 3–5 beta users complete plan → buy → month status unaided (manual)

---

## Phase 2 — Billing & entitlements (3–4 weeks) — ~85% in repo

- [x] DB: subscription fields on user
- [x] Stripe: Checkout + webhook (+ customer lookup on subscription events)
- [x] API gates per [entitlements.md](entitlements.md)
- [x] UI: multi-provider pricing checkout, Account tier + portal, shared 402 on Budget / Notifications / Track
- [x] Stripe Customer Portal API (`POST /api/billing/portal`) — **needs live keys on staging**
- [ ] **Exit:** Test card → Pro → 2 plans + email; cancel via portal → lose Pro (manual staging)

**Step-by-step build notes:** [release-steps.md](release-steps.md) · **Config / Stripe CLI:** [billing-config.md](billing-config.md)

---

## Phase 3 — Production readiness (2–3 weeks)

- [ ] PostgreSQL + backups ([hosting.md](hosting.md))
- [ ] Staging + Stripe CLI webhooks
- [x] Privacy, Terms drafts (`/legal/terms`, `/legal/privacy`)
- [ ] Sentry/alerts, rate limits
- [ ] **Exit:** Delete account E2E on staging

---

## Phase 4 — Launch (1 week)

- [ ] Stripe live mode
- [ ] Soft launch (10–20 users)
- [ ] Support email + FAQ
- [ ] **Exit:** First real payment

---

## Phase 5 — Post-launch (priority order)

1. Monthly email reliability (Pro hook)
2. CSV buy import (Pro or capped free)
3. Annual plan emphasis on pricing page
4. PWA / optional polish

---

## Next engineering task

1. **Phase 1 exit:** recruit 3–5 beta users (manual).
2. **Phase 2 exit:** staging Stripe + CLI webhooks + full checkout → portal cancel test ([release-steps.md](release-steps.md) §2.7).
3. **Phase 3:** Postgres, backups, Sentry, rate limits.

---

## Metrics (from launch)

| Metric | Source |
|--------|--------|
| Signup → first buy (7d) | DB / simple events |
| Signup → budget plan | DB |
| Trial → paid | Stripe |
| MRR / churn | Stripe |