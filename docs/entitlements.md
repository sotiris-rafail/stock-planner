# Entitlements matrix (Free vs Pro)

Implementation should gate **API routes and UI** using these rules. Error responses: `403` with `{ "code": "pro_required", "feature": "..." }` or domain-specific codes below.

## Summary

| Area | Free | Pro |
|------|------|-----|
| Auth, account, delete account | ✓ | ✓ |
| Plan calculator (single stock) | ✓ unlimited | ✓ |
| Progress (buys, sells, lots) | ✓ | ✓ |
| Budget plans | **1 active plan** | **Unlimited** |
| Budget plan length | **Max 24 months** | **Max 120 months** (existing backend cap) |
| Budget items per plan | Max 25 (global cap) | Max 25 |
| Home / markets / watchlist | ✓ | ✓ |
| Track watchlist | Max **10** symbols | Max **50** symbols (soft cap; tune later) |
| Ideas / Suggestions | Browse + refresh (existing limits) | Same (not a paywall driver) |
| Monthly email report | **Disabled** | **Enabled** |
| JSON account export | ✓ (trust / GDPR) | ✓ |
| Force refresh rate limits | Stricter (e.g. manual refresh 1×/15 min on Budget detail) | Relaxed (existing behaviour) |
| Projection on ended/active plans | ✓ on free plan within 24 mo window | ✓ |

## Budget-specific gates

| Action | Free | Pro |
|--------|------|-----|
| `POST /api/budget-plans` when user already has ≥1 plan | **Block** | Allow |
| `POST` with span &gt; 24 months | **Block** | Allow up to 120 |
| `PUT /api/budget-plans/{id}` extending end beyond 24 months from start | **Block** | Allow |
| `GET /api/budget-plans/{id}` for existing plan over limits | **Allow read** (grandfather: if created as Pro then downgraded, read-only + banner) | Allow |

**Grandfathering policy (v1):** If a user downgrades, they keep read access to all plans but cannot create a second plan or edit a plan longer than 24 months until they delete extras or upgrade.

## Notifications gate

| Action | Free | Pro |
|--------|------|-----|
| Enable monthly email in notifications settings | **Block** | Allow |
| If Pro lapses while email enabled | **Auto-disable** on webhook; email last sent month only | — |

## Track gate

| Action | Free | Pro |
|--------|------|-----|
| Add watchlist symbol when count ≥ 10 | **Block** | Allow up to 50 |

## Not paywalled (acquisition)

- Register / login / password reset
- Single-stock Plan page
- Progress logging (do not cap buys on free — kills the funnel)
- Dividend Ideas and Suggestions (discovery)

## UI upgrade touchpoints

1. **Budget:** “New plan” when one plan exists → upgrade modal.
2. **Budget form:** End month &gt; 24 months away → upgrade hint.
3. **Notifications:** Toggle monthly report → upgrade.
4. **Track:** Add symbol at limit → upgrade.
5. **Account:** Pro status, “Manage subscription” (Stripe Portal), upgrade CTA.

## Engineering checklist (when building billing)

- [ ] `users.subscription_tier` (`free` | `pro`) + Stripe ids + `current_period_end`
- [ ] `assert_pro(user, feature)` helper used in budget create, notifications save, track add
- [x] Frontend maps `pro_required` to pricing/upgrade flow (`frontend/static/billing-ui.js`, Budget / Notifications / Track)
- [ ] Tests: free user cannot create 2nd plan; pro can; email toggle blocked on free

## Related

- [Positioning](positioning.md)
- [Release plan](release-plan.md)