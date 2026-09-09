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

Optional: config YAML files hold **keys** such as `${APP_SECRET_KEY}` and `${SMTP_HOST}`. Real values are loaded at runtime from `values.yml` (file) or an HTTP/cloud URL set in `properties.yml`. Run `python prepare_config.py` (or start the app) to create those files from the `*.yml.example` templates. Keep `APP_SECRET_KEY` stable, or existing accounts will not match after a restart.

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

6. Create config files from the examples (skipped if they already exist):

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

6. Create config files from the examples (skipped if they already exist):

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

6. Create config files from the examples (skipped if they already exist):

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

## Pages

- **Sign in** (`/login`) — create an account or log in
- **Plan** (`/`) — project monthly cash needed and growth for a buy target
- **Progress** (`/progress`) — log real monthly purchases and track live P&amp;L

Purchases are stored locally in `data/portfolio.db`.

## Example

- Ticker: `DTE.DE`
- Shares: `50`
- Months: `10`

→ average monthly cash needed, plus projected growth over the 10-month period.

Then each month, open **Progress**, log the shares you actually bought, and compare cost basis vs live value.

## Notes

- Projections are estimates based on historical average returns, not forecasts.
- Optional **growth override** lets you model a custom monthly % instead of history.
- If `uvicorn` is not found, activate `.venv` and install `requirements.txt` again.
- If port 8000 is in use, start with `--port 8001` instead.
- Quotes need internet access to Yahoo Finance.
