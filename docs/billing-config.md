# Billing configuration (config server)

Billing, paywall limits, and payment providers are loaded like SMTP: **`application.yml` placeholders** → resolved from the **config server** or **`values.yml` fallback**.

## Flow

1. `properties.yml` points at HTTP or local `values.yml`.
2. On HTTP **failure** or empty response, keys are loaded from **`fallback_file`** (default `values.yml`) — even when `merge_local: false`.
3. `application.yml` is resolved with `resolve_value()`.
4. Code reads via `settings.billing_config()`, `settings.paywall_enabled()`, `billing/*` providers.

## Enable Pro checkout

On the config server (or `values.yml`):

```yaml
billing.enabled: true
billing.default_provider: stripe
billing.enabled_providers: stripe,mollie,paypal
billing.public_url: https://your-app.example
billing.trial_days: 14
STRIPE_SECRET_KEY: sk_live_...
STRIPE_WEBHOOK_SECRET: whsec_...
STRIPE_PRICE_MONTHLY: price_...
STRIPE_PRICE_YEARLY: price_...
```

Only providers listed in **`billing.enabled_providers`** with valid credentials appear on `GET /api/billing/providers`.

## Defaults when keys are missing

| Setting | Default |
|---------|---------|
| `billing.enabled` | `false` (checkout off) |
| `billing.enforce_paywall` | `true` |
| `billing.enabled_providers` | `stripe` |
| `billing.trial_days` | `14` |
| `billing.public_url` | `http://127.0.0.1:8000` |
| `entitlements.free.max_budget_plans` | `1` |
| `entitlements.free.max_plan_months` | `24` |
| `entitlements.pro.max_plan_months` | `120` |
| `entitlements.free.max_watchlist` | `10` |
| `entitlements.pro.max_watchlist` | `50` |
| `site.guest_home` | `pricing` |

Unset or unresolved `${...}` placeholders use these defaults via `settings.py`.

## Public API (no secrets)

- `GET /api/config` — `billing_enabled`, `enforce_paywall`, `trial_days`, `entitlements`, `guest_home`, `billing_configured`
- `GET /api/billing/providers` — configured provider ids, names, payment methods

## Webhooks

| Provider | URL |
|----------|-----|
| Stripe | `POST /api/billing/webhook` or `/api/billing/webhook/stripe` |
| Mollie | `POST /api/billing/webhook/mollie` |
| PayPal | `POST /api/billing/webhook/paypal` (when implemented) |

## Customer portal

| Step | Action |
|------|--------|
| 1 | In Stripe Dashboard → **Settings → Billing → Customer portal**, enable cancel and invoice history. |
| 2 | User must have completed at least one Checkout (stores `stripe_customer_id` / `billing_customer_id`). |
| 3 | App: **Account → Manage billing** calls `POST /api/billing/portal` and redirects to Stripe. |
| 4 | Return URL: `{billing.public_url}/account?billing=portal` |

## Staging checklist (Phase 2 exit)

| # | Step |
|---|------|
| 1 | Set `billing.enabled: true`, `billing.public_url` to staging origin, all `STRIPE_*` test keys. |
| 2 | Create test Product + monthly/yearly Prices; set `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`. |
| 3 | Install [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe login` |
| 4 | Forward webhooks: `stripe listen --forward-to https://staging.example/api/billing/webhook` (copy `whsec_` into config). |
| 5 | Sign in → **Pricing** → monthly checkout with card `4242…` → confirm `GET /api/auth/me` shows `pro`. |
| 6 | Create 2nd budget plan + enable monthly email (Notifications). |
| 7 | **Manage billing** → cancel subscription → webhook `customer.subscription.deleted` → tier `free`, gates return 402. |

See [release-steps.md](release-steps.md) for file-level detail.

## Mollie / PayPal

Set `*_CHECKOUT_IMPLEMENTED` and `*_WEBHOOK_IMPLEMENTED` to `true` only after the REST flows are complete; until then providers stay hidden from checkout (`configured: false`).