# Stock Buy Planner — UML

Render these diagrams in GitHub, VS Code/Cursor (Mermaid preview), or any Mermaid viewer.

---

## 1. Component diagram

```mermaid
flowchart TB
  subgraph Client
    Pages["HTML pages\nlogin, plan, progress, track,\nideas, suggestions, notifications"]
    JS["static JS\nauth.js, prefetch.js,\npage scripts"]
  end

  subgraph FastAPI["backend/main.py"]
    API["REST /api/*"]
    UI["FileResponse pages"]
  end

  subgraph Domain
    Auth["auth / auth_crypto / deps"]
    Plan["calculator / stock_service"]
    Port["portfolio / db / pricing_rules / fx"]
    Ideas["suggestions / dividend_ideas / watchlist"]
    Mail["mailer / monthly_report / scheduler"]
  end

  subgraph Config
    YML["application.yml\nsecret_key, smtp, cron_job"]
    Props["properties.py"]
    Settings["settings.py"]
    Values["values.yml or HTTP"]
  end

  subgraph Data
    SQLite[("data/portfolio.db")]
    Outbox["data/outbox"]
  end

  Yahoo["Yahoo Finance\n(yfinance)"]

  Pages --> JS
  JS --> API
  JS --> UI
  JS -->|"GET /api/config"| API
  API --> Auth
  API --> Plan
  API --> Port
  API --> Ideas
  API --> Mail
  Auth --> SQLite
  Port --> SQLite
  Ideas --> SQLite
  Plan --> Yahoo
  Port --> Yahoo
  Ideas --> Yahoo
  Mail --> Outbox
  Mail --> SMTP["SMTP"]
  Props --> Values
  Settings --> YML
  Settings --> Props
  Auth --> Settings
  Mail --> Settings
  FastAPI --> Config
```

---

## 2. Deployment / runtime

```mermaid
flowchart LR
  Browser["Browser\n127.0.0.1:8000"]
  UV["Uvicorn\nmain:app"]
  Disk["Project root YAML\n+ data/"]
  Net["Yahoo Finance\noptional HTTP properties"]

  Browser -->|HTTP + cookie sbp_session| UV
  UV --> Disk
  UV --> Net
```

---

## 3. Package / class view (backend)

```mermaid
classDiagram
  class FastAPIApp {
    +on_startup()
    +GET /api/config
    +routes /api/*
    +FileResponse pages
  }
  class deps {
    +get_optional_user_id()
    +require_user_id()
  }
  class auth {
    +register_user()
    +authenticate_user()
    +create_session_token()
    +request_password_reset()
    +reset_password_with_hash()
  }
  class auth_crypto {
    +encrypt_email()
    +decrypt_email()
    +hash_password()
    +verify_password()
  }
  class db {
    +init_db()
    +create_user()
    +add_purchase()
    +execute_sale()
    +list_positions()
    +watchlist CRUD
  }
  class calculator {
    +calculate_buy_plan()
    +BuyPlanResult
  }
  class stock_service {
    +fetch_quote()
    +fetch_dividends()
  }
  class portfolio {
    +build_progress()
    +build_progress_summary()
  }
  class watchlist {
    +create_watchlist_entry()
    +build_watchlist()
  }
  class properties {
    +load_property_map()
    +resolve_value()
  }
  class settings {
    +secret_key()
    +smtp_config()
    +silent_stock_refresh_minutes()
    +prepare_config_files()
  }
  class mailer {
    +send_reset_email()
    +send_monthly_report_email()
  }
  class scheduler {
    +start_scheduler()
    +run_due_monthly_reports()
  }

  FastAPIApp --> deps
  FastAPIApp --> auth
  FastAPIApp --> calculator
  FastAPIApp --> portfolio
  FastAPIApp --> watchlist
  FastAPIApp --> settings
  FastAPIApp --> properties
  deps --> auth
  auth --> auth_crypto
  auth --> db
  auth --> mailer
  auth_crypto --> settings
  calculator --> stock_service
  portfolio --> db
  portfolio --> stock_service
  watchlist --> db
  watchlist --> stock_service
  settings --> properties
  mailer --> settings
  scheduler --> mailer
  scheduler --> db
```

---

## 4. Entity-relationship (SQLite)

```mermaid
erDiagram
  users ||--o{ purchases : owns
  users ||--o{ sales : owns
  users ||--o{ watchlist_items : tracks
  users ||--o| dividend_ideas_cache : caches
  users ||--o| notification_settings : configures

  users {
    int id PK
    text email_encrypted UK
    text password_hash
    text created_at
  }
  purchases {
    int id PK
    int user_id FK
    text symbol
    text currency
    real shares
    real price_per_share
    text purchased_at
  }
  sales {
    int id PK
    int user_id FK
    text symbol
    real shares
    real price_per_share
    real cost_basis
    real proceeds
    real realized_gain
  }
  watchlist_items {
    int id PK
    int user_id FK
    text symbol
    text asset_type
    real price_at_add
  }
  suggestion_cache {
    int id PK
    text payload
  }
  dividend_ideas_cache {
    int user_id PK
    text payload
  }
  notification_settings {
    int user_id PK
    int monthly_report_enabled
    text report_email
    text last_sent_month
  }
```

Sells apply FIFO: `execute_sale` reduces or deletes matching `purchases` lots.

---

## 5. Sequence — login / session

```mermaid
sequenceDiagram
  actor User
  participant Login as login.js
  participant API as POST /api/auth/login
  participant Auth as auth.authenticate_user
  participant Crypto as auth_crypto
  participant DB as db

  User->>Login: email + password
  Login->>API: JSON credentials
  API->>Auth: authenticate_user()
  Auth->>Crypto: encrypt_email()
  Auth->>DB: get_user_by_encrypted_email()
  Auth->>Crypto: verify_password()
  Auth-->>API: user_id
  API-->>Login: Set-Cookie sbp_session (JWT)
  Login->>User: redirect /plan
```

Register is the same cookie path after `register_user` → `create_user`.

---

## 6. Sequence — password reset

```mermaid
sequenceDiagram
  actor User
  participant UI as forgot / reset pages
  participant Forgot as POST /api/auth/forgot-password
  participant Reset as POST /api/auth/reset-password
  participant Auth as auth
  participant Mail as mailer
  participant DB as db

  User->>UI: email
  UI->>Forgot: { email }
  Forgot->>Auth: request_password_reset()
  Auth->>DB: lookup user
  Auth->>Auth: HMAC hash(email | registration day | reset=true)
  Auth->>Mail: send_reset_email(link?hash=)
  Mail-->>User: email or data/outbox
  User->>UI: open /reset-password?hash=
  User->>UI: new password twice
  UI->>Reset: { hash, password }
  Reset->>Auth: reset_password_with_hash()
  Auth->>DB: match hash, update password_hash
```

---

## 7. Sequence — buy plan

```mermaid
sequenceDiagram
  actor User
  participant Plan as app.js /plan
  participant API as POST /api/plan
  participant Stock as stock_service
  participant Price as pricing_rules
  participant Calc as calculator
  participant Yahoo as Yahoo Finance

  User->>Plan: symbol, shares, periods
  Plan->>API: PlanRequest
  API->>Stock: fetch_quote()
  Stock->>Yahoo: yfinance
  API->>Price: quote_in_preferred_currency()
  API->>Calc: calculate_buy_plan()
  Calc-->>API: BuyPlanResult
  API-->>Plan: month/year cash + growth
```

No login required.

---

## 8. Sequence — buy / sell (progress)

```mermaid
sequenceDiagram
  actor User
  participant UI as progress.js
  participant API as FastAPI
  participant Deps as require_user_id
  participant Price as pricing_rules
  participant DB as db.execute_sale / add_purchase
  participant Port as portfolio.build_progress

  User->>UI: log buy or sell
  UI->>API: POST /api/purchases or /api/sales
  API->>Deps: JWT cookie
  API->>Price: normalize_user_price()
  alt buy
    API->>DB: add_purchase()
  else sell
    API->>DB: execute_sale() FIFO lots
  end
  UI->>API: GET /api/progress
  API->>Port: live quotes + P/L
  Port-->>UI: positions and growth
```

---

## 9. Sequence — config at runtime

```mermaid
sequenceDiagram
  participant Start as on_startup
  participant Prep as prepare_config_files
  participant Props as properties.load_property_map
  participant File as values.yml
  participant Web as HTTP properties URL
  participant AppYml as application.yml
  participant Settings as settings.resolve_value

  Start->>Prep: write dummy yml files if missing
  Start->>Props: read properties.yml
  alt type file
    Props->>File: LOCAL keys
  else type http
    Props->>Web: WEB keys
  end
  Note over AppYml: secret_key ${APP_SECRET_KEY}<br/>smtp ${SMTP_*}<br/>cron_job ${cron_job_silent_stock_refresh}
  Settings->>Props: map placeholders to values
```

---

## 10. Frontend pages

```mermaid
flowchart LR
  Login["/login"] --> Plan["/plan"]
  Login --> Forgot["/forgot-password"]
  Forgot --> Reset["/reset-password"]
  Reset --> Login
  Plan --> Progress["/progress"]
  Plan --> Track["/track"]
  Plan --> Ideas["/ideas"]
  Plan --> Sugg["/suggestions"]
  Progress --> Notes["/notifications"]
```

Cookie-gated: `/progress`, `/track`, `/notifications`.

`prefetch.js` on each page calls `GET /api/config` and uses the resolved minutes (JSON field `cron_job_silent_stock_refresh`). In YAML this is `cron_job: ${cron_job_silent_stock_refresh}`, loaded from `values.yml` or HTTP, default **15** if the key is missing.

---

## 11. Sequence — silent stock refresh (`cron_job`)

Interval comes from `application.yml` → property key `cron_job_silent_stock_refresh` (default 15 minutes). It is **not** the monthly-report thread in `scheduler.py`.

```mermaid
sequenceDiagram
  participant Yml as application.yml
  participant Values as values.yml / HTTP
  participant Settings as silent_stock_refresh_minutes()
  participant Config as GET /api/config
  participant Prefetch as prefetch.js
  participant IdeasAPI as GET /api/suggestions<br/>GET /api/dividend-ideas
  participant Cache as SQLite quote caches

  Yml->>Settings: cron_job: ${cron_job_silent_stock_refresh}
  Settings->>Values: fetch cron_job_silent_stock_refresh
  Note over Settings: fallback 15 if omitted
  Prefetch->>Config: on page load
  Config->>Settings: read minutes
  Config-->>Prefetch: { cron_job_silent_stock_refresh }
  loop every N minutes
    Prefetch->>Prefetch: refresh stale sessionStorage quotes
  end
  IdeasAPI->>Settings: same minutes
  IdeasAPI->>Cache: next_quotes_refresh_at = last + N minutes
```
