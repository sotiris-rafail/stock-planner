# Stock Buy Planner

Plan monthly stock purchases with live market data.

## What it does

Given a ticker (default **DTE.DE** / Deutsche Telekom), total shares, and a number of months, the app:

1. Fetches the **live stock price** (Yahoo Finance)
2. Estimates **average monthly growth** from recent history
3. Builds a month-by-month buy plan showing:
   - Money needed each month
   - Projected price path
   - Monthly growth on holdings
   - Accumulated growth at the end of the buy period

You need **Python 3.10+**, **pip**, and an internet connection (package install plus live quotes). The SQLite database at `data/portfolio.db` is created automatically on first start.

Optional: config YAML files hold **keys** such as `${APP_SECRET_KEY}` and `${SMTP_HOST}`. Real values are loaded at runtime from `values.yml` (file) or an HTTP/cloud URL set in `properties.yml`. Run `python prepare_config.py` (or start the app) to create those files with the dummy values below. Keep `APP_SECRET_KEY` stable, or existing accounts will not match after a restart.

After the server is running, open [http://127.0.0.1:8000](http://127.0.0.1:8000). Create an account on **Sign in** (password: at least 10 characters, uppercase and lowercase, at least 2 digits that are not next to each other, at least 2 symbols). Stop the server with `Ctrl+C`.

---

## Windows

1. Install Python 3.10 or newer from [python.org](https://www.python.org/downloads/). During setup, check **Add python.exe to PATH**.
2. Confirm the install in **Command Prompt** or **PowerShell**:

   ```powershell
   python --version
   ```

3. Open a terminal in the project folder (or `cd` into it after cloning):

   ```powershell
   cd path\to\stock-buy-planner
   ```

4. Create and activate a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

   If PowerShell blocks the script, run this once, then activate again:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

   In Command Prompt, use:

   ```cmd
   .venv\Scripts\activate.bat
   ```

5. Install dependencies:

   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

6. Create dummy config files (skipped if they already exist):

   ```powershell
   python prepare_config.py
   ```

7. Start the app:

   ```powershell
   cd backend
   uvicorn main:app --reload --port 8000
   ```

8. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser.

---

## macOS

1. Install Python 3.10 or newer. With Homebrew:

   ```bash
   brew install python
   ```

   Or download from [python.org](https://www.python.org/downloads/).

2. Confirm:

   ```bash
   python3 --version
   ```

3. Open a terminal in the project folder:

   ```bash
   cd /path/to/stock-buy-planner
   ```

4. Create and activate a virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

5. Install dependencies:

   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

6. Create dummy config files (skipped if they already exist):

   ```bash
   python prepare_config.py
   ```

7. Start the app:

   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

8. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser.

---

## Linux

1. Install Python 3.10 or newer and venv support. Examples:

   **Debian / Ubuntu**

   ```bash
   sudo apt update
   sudo apt install python3 python3-venv python3-pip
   ```

   **Fedora**

   ```bash
   sudo dnf install python3 python3-pip
   ```

2. Confirm:

   ```bash
   python3 --version
   ```

3. Open a terminal in the project folder:

   ```bash
   cd /path/to/stock-buy-planner
   ```

4. Create and activate a virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

5. Install dependencies:

   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

6. Create dummy config files (skipped if they already exist):

   ```bash
   python prepare_config.py
   ```

7. Start the app:

   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

8. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser.

---

## Configuration

These files are gitignored. Copy the dummy contents below, or run `python prepare_config.py`.

`application.yml` — keys only; values come from `values.yml` or HTTP:

```yaml
secret_key: ${APP_SECRET_KEY}

# Silent background quote refresh interval in minutes.
# Value is loaded from the property key cron_job_silent_stock_refresh (default 15).
cron_job: ${cron_job_silent_stock_refresh}

# Suggestions symbol-universe rebuild interval in hours.
# Value is loaded from the property key suggestion.refresh.time (default 4).
suggestion_refresh: ${suggestion.refresh.time}

smtp:
  enabled: ${smtp.enabled}
  host: ${SMTP_HOST}
  port: ${SMTP_PORT}
  from: ${SMTP_FROM}
  user: ${SMTP_USER}
  password: ${SMTP_PASSWORD}

# CSV export of holdings, lots, and watchlist.
# Value is loaded from the property key export.enabled.
export:
  enabled: ${export.enabled}

# Account deletion from the Account page.
# Value is loaded from the property key delete.enabled.
delete:
  enabled: ${delete.enabled}

# Periodic copy of the whole SQLite file (all accounts). Restore is CLI-only on this machine.
# Values are loaded from backup.enabled, backup.interval.hours, backup.keep, backup.directory.
backup:
  enabled: ${backup.enabled}
  interval_hours: ${backup.interval.hours}
  keep: ${backup.keep}
  directory: ${backup.directory}
```

`properties.yml` — choose local file or HTTP:

```yaml
# Local file: keys in application.yml are filled from values.yml
provider:
  type: file
  file: values.yml

# Cloud / HTTP: GET a JSON (or YAML) object of the same keys.
# Uncomment this block and comment out the file provider above to use it.
#
# provider:
#   type: http
#   url: https://your-config-host/properties
#   token_url: https://your-config-host/auth/token
#   client_id: your-client-id
#   client_secret: your-client-secret
#   timeout: 15
```

For HTTP/cloud, the app obtains a token then GETs `url`:

1. **POST** `token_url` with JSON `{"clientId":"…","clientSecret":"…"}` (configure `client_id` / `client_secret`, or `username` / `password` as aliases).
2. **GET** `url` with `Authorization: Bearer …` using `access_token` / `token` from the response.

If `token_url` is omitted, `client_id` + `client_secret` (or username + password) use HTTP Basic auth on the config GET instead.

Fetched WEB properties are kept in memory and refreshed at most every **`refresh_seconds`** (default **300**, i.e. 5 minutes). Changing `properties.yml` or the local fallback file on disk invalidates the HTTP cache; `application.yml` reloads within **30 seconds** when its files change.

By default (`merge_local: true`), **`fallback_file`** (default **`values.yml`**) is merged under the remote map: keys from the config server win; local keys fill gaps. Set `merge_local: false` to use only the remote payload.

`values.yml` — dummy local values (replace before production):

```yaml
APP_SECRET_KEY: dummy-change-me-before-production
SMTP_HOST: smtp.example.com
SMTP_PORT: 587
SMTP_FROM: noreply@example.com
SMTP_USER: smtp-user
SMTP_PASSWORD: dummy-smtp-password
smtp.enabled: false
export.enabled: true
delete.enabled: true
backup.enabled: true
backup.interval.hours: 24
backup.keep: 14
backup.directory: data/backups
cron_job_silent_stock_refresh: 15
suggestion.refresh.time: 4
```

## Pages

- **Sign in** (`/login`) — create an account or log in
- **Plan** (`/`) — project monthly cash needed and growth for a buy target
- **Progress** (`/progress`) — log real monthly purchases and track live P&amp;L

Purchases are stored locally in `data/portfolio.db`.

## Database backup

When `backup.enabled` is true, the server writes copies under `data/backups` (or `backup.directory`). Users cannot restore from the app. On the machine that runs the code, stop the server, then:

```bash
python restore_db.py list
python restore_db.py restore portfolio-YYYYMMDD-HHMMSS-xxxxxx.db
```

Start the app again after restore.

## Example

- Ticker: `DTE.DE`
- Shares: `50`
- Months: `10`

→ average monthly cash needed, plus projected growth over the 10-month period.

Then each month, open **Progress**, log the shares you actually bought, and compare cost basis vs live value.

## Product & Pro launch (in progress)

Decision docs for a €1.99/month **Pro** tier (Phase 0):

- [Positioning & pricing](docs/positioning.md)
- [Free vs Pro entitlements](docs/entitlements.md)
- [Hosting / Postgres for SaaS](docs/hosting.md)
- [Release checklist](docs/release-plan.md)

## Notes

- Projections are estimates based on historical average returns, not forecasts.
- Optional **growth override** lets you model a custom monthly % instead of history.
- If `uvicorn` is not found, activate `.venv` and install `requirements.txt` again.
- If port 8000 is in use, start with `--port 8001` instead.
- Quotes need internet access to Yahoo Finance.
