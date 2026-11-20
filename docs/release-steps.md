# Release steps — what was built (Phases 0–2)

This document explains **each checklist item** in [release-plan.md](release-plan.md): what it means, which files implement it, and what is still manual.

---

## Phase 0 — Scope (documentation)

| Step | What it means | Where |
|------|----------------|--------|
| ICP and pitch | Who the product is for and the one-line value prop | [positioning.md](positioning.md) |
| Pricing (€1.99 / €19.99 / trial) | Commercial model for EU retail | [positioning.md](positioning.md) |
| Free vs Pro matrix | Features gated for paid tier | [entitlements.md](entitlements.md) |
| Hosting | SQLite for dev; Postgres for SaaS | [hosting.md](hosting.md) |

**Owner action:** Read the three docs and confirm pricing and limits before enabling billing in production.

---

## Phase 1 — Trust & onboarding

| Step | What it means | Implementation |
|------|----------------|----------------|
| Guest landing → `/pricing` | Signed-out users see pricing, not login | `settings.site_guest_home()`, `main.py` `GET /`, `frontend/pricing.html` |
| `/help/calculations` | Trust doc for FIFO, FX, budget matching | `frontend/help/calculations.html` (or static route in `main.py`) |
| Post-register `/welcome` | First-run orientation | `frontend/welcome.html`, redirect in `login.js` after register |
| Mobile QA Plan + Progress | Usable on narrow screens | `frontend/static/styles.css` breakpoints ≤560px |
| Account help/pricing + tier | User sees Free/Pro and links | `frontend/account.html`, `frontend/static/account.js`, `GET /api/auth/me` |
| **Exit: 3–5 beta users** | Real humans complete core loop | **Manual** — no code |

---

## Phase 2 — Billing & entitlements

### 2.1 Database

| Step | Detail |
|------|--------|
| Subscription columns on `users` | `subscription_tier`, `stripe_*`, `billing_provider`, `billing_customer_id`, `billing_subscription_id` — migrated in `backend/db.py` `init_db()` |
| Lookup by Stripe customer | `get_user_by_stripe_customer()` for webhooks without metadata |

### 2.2 Configuration (config server)

| Step | Detail |
|------|--------|
| Billing + entitlements in YAML | `backend/settings.py`, `values.yml`, [billing-config.md](billing-config.md) |
| HTTP failure fallback | `backend/properties.py` loads `values.yml` when config server is down |
| Public flags | `GET /api/config` — `billing_enabled`, `enforce_paywall`, limits |

### 2.3 Entitlements engine

| Step | Detail |
|------|--------|
| `entitlements.py` | Reads limits from config; `user_is_pro()` from DB tier |
| API gates | HTTP **402** with `{ "code": "pro_required", "feature", "message" }` on budget create/window, monthly email settings, watchlist add (`main.py`) |

### 2.4 Payment providers (`backend/billing/`)

| Provider | Checkout | Webhook | Customer portal |
|----------|----------|---------|-------------------|
| **Stripe** | `stripe_provider.create_checkout` | `checkout.session.completed`, subscription created/updated/deleted | `create_portal` → Billing Portal |
| Mollie | Stub until `MOLLIE_CHECKOUT_IMPLEMENTED` | Stub | N/A |
| PayPal | Stub until `PAYPAL_CHECKOUT_IMPLEMENTED` | Stub | N/A |

**API routes:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/billing/providers` | Configured providers for pricing UI |
| POST | `/api/billing/checkout` | Body: `{ interval: month\|year, provider? }` → `{ url }` |
| POST | `/api/billing/portal` | Stripe Customer Portal → `{ url }` |
| POST | `/api/billing/webhook/{provider}` | Provider webhooks |
| POST | `/api/billing/webhook` | Legacy Stripe endpoint |

**Auth:** `GET /api/auth/me` includes `billing_configured`, `billing_portal_available`.

### 2.5 Frontend

| Area | Files |
|------|--------|
| Pricing checkout | `pricing.html`, `pricing.js`, `billing-ui.js` — per-provider monthly/yearly buttons |
| Account | Tier line, upgrade link, **Manage billing** → portal |
| Paywall UX | `billing-ui.js` — shared 402 handling on `budget.js`, `notifications.js`, `track.js` |
| i18n | Keys under `pricing.*`, `billing.*`, `account.manageBilling` in `ui.js` |

### 2.6 Tests

| File | Covers |
|------|--------|
| `tests/integration/test_entitlements.py` | Budget/watchlist/window 402, Pro bypass |
| `tests/integration/test_billing_api.py` | Providers, checkout 503, portal, `auth/me` portal flag |
| `tests/unit/test_billing_settings.py` | Config resolution |

### 2.7 Still manual (Phase 2 exit)

1. Set `billing.enabled: true` and Stripe keys on **staging** ([billing-config.md](billing-config.md)).
2. Create Products/Prices in Stripe Dashboard; map to `STRIPE_PRICE_MONTHLY` / `YEARLY`.
3. Run **Stripe CLI**: `stripe listen --forward-to localhost:8000/api/billing/webhook`.
4. **Exit test:** test card → Pro → second budget plan + monthly email save → Customer Portal cancel → tier returns Free and gates return.

Phase 2 is **~85% in repo**; exit remains blocked until staging Stripe run succeeds.

---

## Phase 3+ (not started in code)

See [release-plan.md](release-plan.md) for PostgreSQL, Sentry, and launch checklists.

---

## Quick reference — enable billing on a environment

1. Merge billing section into live `application.yml` (see `application.yml.example`).
2. Set secrets on config server or `values.yml`.
3. Restart API; verify `GET /api/billing/providers` lists Stripe with `configured: true`.
4. Sign in → Pricing → checkout → complete payment → webhook updates tier.
5. Account → **Manage billing** for cancel/invoice history (Stripe Portal).