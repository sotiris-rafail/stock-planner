const form = document.getElementById("plan-form");
const submitBtn = document.getElementById("submit-btn");
const formError = document.getElementById("form-error");
const results = document.getElementById("results");
const placeholder = document.getElementById("placeholder");
const quoteBar = document.getElementById("quote-bar");
const summary = document.getElementById("summary");
const scheduleBody = document.getElementById("schedule-body");
const yearlyToggle = document.getElementById("yearly");
const periodsInput = document.getElementById("periods");
const periodsLabel = document.getElementById("periods-label");
const growthLabel = document.getElementById("growth-label");
const pageTitle = document.getElementById("page-title");
const pageLede = document.getElementById("page-lede");
const periodCol = document.getElementById("period-col");
const growthCol = document.getElementById("growth-col");
const disclaimer = document.getElementById("disclaimer");
const placeholderCopy = document.getElementById("placeholder-copy");
const dividendAccordion = document.getElementById("dividend-accordion");
const dividendPanel = document.getElementById("dividend-panel");
const dividendHint = document.getElementById("dividend-hint");

let currentPlan = null;
let dividendCache = {
  symbol: null,
  loaded: false,
  loading: false,
  data: null,
};

const money = (value, currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const num = (value, digits = 2) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);

const growthClass = (value) => (value > 0 ? "pos" : value < 0 ? "neg" : "");

function isYearly() {
  return yearlyToggle.checked;
}

function syncFrequencyUi() {
  const yearly = isYearly();
  periodsLabel.textContent = yearly ? "Years" : "Months";
  growthLabel.textContent = yearly
    ? "Growth override % / year"
    : "Growth override % / month";
  periodsInput.max = yearly ? "40" : "120";
  if (yearly && Number(periodsInput.value) > 40) {
    periodsInput.value = "40";
  }

  pageTitle.textContent = yearly
    ? "How much do you need each year?"
    : "How much do you need each month?";
  pageLede.textContent = yearly
    ? "Pick a stock, set how many shares you want and over how many years. We pull a live price and estimate yearly growth from recent history."
    : "Pick a stock, set how many shares you want and over how many months. We pull a live price and estimate monthly growth from recent history.";
  periodCol.textContent = yearly ? "Year" : "Month";
  growthCol.textContent = yearly ? "Year growth" : "Month growth";
  disclaimer.textContent = yearly
    ? "Projections use live market data and a historical average yearly return (compounded from monthly history). Past performance is not a guarantee of future results."
    : "Projections use live market data and a historical average monthly return. Past performance is not a guarantee of future results.";
  placeholderCopy.innerHTML = yearly
    ? "Enter a ticker and hit calculate. Defaults are set to Deutsche Telekom (<strong>DTE.DE</strong>): 50 shares over 10 years."
    : "Enter a ticker and hit calculate. Defaults are set to Deutsche Telekom (<strong>DTE.DE</strong>): 50 shares over 10 months.";
}

function showError(message) {
  formError.hidden = !message;
  formError.textContent = message || "";
}

function resetDividendAccordion() {
  dividendAccordion.open = false;
  dividendCache = {
    symbol: currentPlan ? currentPlan.symbol : null,
    loaded: false,
    loading: false,
    data: null,
  };
  dividendHint.textContent = "Open to load yield and payout history";
  dividendPanel.innerHTML =
    `<p class="empty-copy">Open this section to load dividend data.</p>`;
}

function renderDividendContent(payload) {
  const dividend = payload.dividend || {};
  const currency = payload.currency || (currentPlan && currentPlan.currency) || "USD";

  if (!dividend.pays_dividend) {
    dividendHint.textContent = "No dividends reported";
    dividendPanel.innerHTML =
      `<p class="empty-copy">No dividend data reported for ${payload.symbol || "this stock"}.</p>`;
    return;
  }

  const yieldText =
    dividend.yield_pct == null ? "—" : `${num(dividend.yield_pct, 2)}%`;
  dividendHint.textContent = `Yield ${yieldText}`;

  const payments = dividend.recent_payments || [];
  const rows = payments.length
    ? payments
        .map(
          (p) => `
      <tr>
        <td class="left">${p.date}</td>
        <td>${money(p.amount, currency)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="2" class="empty">No recent payout rows available.</td></tr>`;

  dividendPanel.innerHTML = `
    <div class="dividend-heading">
      <h3>${payload.symbol || "Dividends"}</h3>
      <span class="currency-meta">
        Yield ${yieldText}
        ${dividend.annual_rate == null ? "" : `· ~${money(dividend.annual_rate, currency)} / share / year`}
      </span>
    </div>
    <div class="table-wrap dividend-table">
      <table>
        <thead>
          <tr>
            <th>Previous payout</th>
            <th>Amount / share</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadDividendsIfNeeded() {
  if (!currentPlan) return;
  const symbol = currentPlan.symbol;
  if (dividendCache.loaded && dividendCache.symbol === symbol) {
    renderDividendContent(dividendCache.data);
    return;
  }
  if (dividendCache.loading) return;

  dividendCache.loading = true;
  dividendHint.textContent = "Loading…";
  dividendPanel.innerHTML = `<p class="empty-copy">Loading dividend data…</p>`;

  try {
    const res = await fetch(`/api/dividends/${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Failed to load dividends");
    }
    dividendCache = {
      symbol,
      loaded: true,
      loading: false,
      data,
    };
    renderDividendContent(data);
  } catch (err) {
    dividendCache.loading = false;
    dividendHint.textContent = "Failed to load";
    dividendPanel.innerHTML = `<p class="error">${err.message || "Failed to load dividends"}</p>`;
  }
}

function render(plan) {
  currentPlan = plan;
  const c = plan.currency || "USD";
  const yearly = plan.frequency === "yearly";
  const periodWord = yearly ? "year" : "month";
  const growthPct = plan.avg_period_growth_pct ?? plan.avg_monthly_growth_pct;
  const change = plan.change_pct;
  const changeHtml =
    change == null
      ? ""
      : `<span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${num(change, 2)}% today</span>`;

  periodCol.textContent = plan.period_label || (yearly ? "Year" : "Month");
  growthCol.textContent = yearly ? "Year growth" : "Month growth";

  quoteBar.innerHTML = `
    <span class="name stock-name">
      <span class="stock-icon-wrap" aria-hidden="true">
        <img class="stock-icon" src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(plan.symbol)}.png" alt="" loading="lazy" referrerpolicy="no-referrer"
          onerror="const w=this.parentElement; this.remove(); const f=w&&w.querySelector('.stock-icon-fallback'); if(f) f.hidden=false;" />
        <span class="stock-icon-fallback" hidden>${(plan.symbol || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?"}</span>
      </span>
      <span class="stock-name-text">${plan.company_name} (${plan.symbol})</span>
    </span>
    <span class="meta">${money(plan.current_price, c)} · ${changeHtml}</span>
    <span class="meta">Est. ${periodWord}ly growth: ${num(growthPct, 2)}%</span>
    ${plan.requested_symbol ? `<span class="meta">Resolved from ${plan.requested_symbol}</span>` : ""}
  `;

  summary.innerHTML = `
    <div class="stat">
      <span class="label">Avg. needed / ${periodWord}</span>
      <span class="value">${money(plan.average_period_cost ?? plan.average_monthly_cost, c)}</span>
    </div>
    <div class="stat">
      <span class="label">Total invested</span>
      <span class="value">${money(plan.total_invested, c)}</span>
    </div>
    <div class="stat">
      <span class="label">Final portfolio value</span>
      <span class="value">${money(plan.final_portfolio_value, c)}</span>
    </div>
    <div class="stat">
      <span class="label">Accumulated growth</span>
      <span class="value ${growthClass(plan.total_growth)}">${money(plan.total_growth, c)} (${num(plan.total_growth_pct, 2)}%)</span>
    </div>
  `;

  scheduleBody.innerHTML = plan.schedule
    .map((row) => {
      const period = row.period ?? row.month;
      const periodGrowth = row.period_growth ?? row.month_growth;
      return `
      <tr>
        <td>${period}</td>
        <td>${money(row.projected_price, c)}</td>
        <td>${num(row.shares_bought, 4)}</td>
        <td>${money(row.cost, c)}</td>
        <td>${num(row.shares_owned, 4)}</td>
        <td>${money(row.portfolio_value, c)}</td>
        <td>${money(row.total_invested, c)}</td>
        <td class="${growthClass(periodGrowth)}">${money(periodGrowth, c)}</td>
        <td class="${growthClass(row.accumulated_growth)}">${money(row.accumulated_growth, c)} (${num(row.accumulated_growth_pct, 2)}%)</td>
      </tr>`;
    })
    .join("");

  resetDividendAccordion();
  placeholder.hidden = true;
  results.hidden = false;
}

yearlyToggle.addEventListener("change", () => {
  syncFrequencyUi();
});

dividendAccordion.addEventListener("toggle", () => {
  if (dividendAccordion.open) {
    loadDividendsIfNeeded();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  submitBtn.disabled = true;
  submitBtn.textContent = "Calculating…";

  const growthRaw = document.getElementById("growth_override_pct").value.trim();
  const body = {
    symbol: document.getElementById("symbol").value.trim(),
    total_shares: Number(document.getElementById("total_shares").value),
    periods: Number(periodsInput.value),
    frequency: isYearly() ? "yearly" : "monthly",
    lookback_months: Number(document.getElementById("lookback_months").value),
    growth_override_pct: growthRaw === "" ? null : Number(growthRaw),
  };

  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Request failed");
    }
    render(data);
  } catch (err) {
    showError(err.message || "Something went wrong");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Calculate plan";
  }
});

window.addEventListener("DOMContentLoaded", () => {
  syncFrequencyUi();
  form.requestSubmit();
});
