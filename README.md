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

## Run

```bash
cd ~/IdeaProjects/stock-buy-planner
source .venv/bin/activate
cd backend
uvicorn main:app --reload --port 8000
```

Or: `bash run.sh`

Open [http://127.0.0.1:8000](http://127.0.0.1:8000)

## Pages

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
