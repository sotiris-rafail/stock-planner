# Hosting & data store (Pro SaaS)

Decision for Phase 0 — implement before marketing to paying users at scale.

## Recommendation

| Environment | Database | Rationale |
|-------------|----------|-----------|
| **Local / self-host** (current) | SQLite in `data/portfolio.db` | Simple, matches README and tests |
| **Staging SaaS** | Managed **PostgreSQL** | Same code path as production |
| **Production SaaS** | Managed **PostgreSQL** | Concurrent users, backups, no single-file lock issues |

**Do not** run multi-tenant paid hosting on SQLite long term.

## Target architecture (v1 SaaS)

```text
Browser → HTTPS → App (uvicorn/gunicorn, 2+ workers)
                  → PostgreSQL
                  → Stripe webhooks
                  → SMTP (monthly reports)
                  → External config (existing properties HTTP) + secrets in env
```

- **Backups:** Daily automated DB snapshot; retention 30 days; test restore quarterly.
- **Secrets:** `STRIPE_*`, `APP_SECRET_KEY`, SMTP in env or properties server — never in git.
- **Static frontend:** Served by FastAPI (current) or CDN in front; either is fine for v1.

## Migration path from SQLite

1. Introduce `DATABASE_URL` in settings; if unset, keep SQLite (dev/self-host).
2. Use SQL compatible with both where possible, or Alembic migrations for Postgres-only deploy.
3. One-off import script: SQLite → Postgres for your own data before cutover.

## Related

- [Release plan](release-plan.md) Phase 3