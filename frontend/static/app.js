const LAST_SEARCH_KEY = "sbp:plan:lastSearch";
const DEFAULT_SYMBOL = "DTE.DE";

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

const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;

function syncFrequencyUi() {
  const yearly = isYearly();
  periodsLabel.textContent = yearly ? t("plan.years") : t("plan.months");
  growthLabel.textContent = yearly
    ? t("plan.growthYear")
    : t("plan.growth");
  periodsInput.max = yearly ? "40" : "120";
  if (yearly && Number(periodsInput.value) > 40) {
    periodsInput.value = "40";
  }

  pageTitle.textContent = yearly ? t("plan.titleYear") : t("plan.title");
  pageLede.textContent = yearly ? t("plan.ledeYear") : t("plan.lede");
  periodCol.textContent = yearly ? t("plan.year") : t("plan.month");
  growthCol.textContent = yearly ? t("plan.yearGrowth") : t("plan.monthGrowth");
  disclaimer.textContent = yearly ? t("plan.disclaimerYear") : t("plan.disclaimer");
  placeholderCopy.innerHTML = yearly ? t("plan.placeholderYear") : t("plan.placeholder");
}

function readLastSearch() {
  try {
    const raw = localStorage.getItem(LAST_SEARCH_KEY) || sessionStorage.getItem(LAST_SEARCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastSearch(state) {
  try {
    localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function persistCurrentSearch() {
  const symbol = document.getElementById("symbol").value.trim();
  if (!symbol) return;
  writeLastSearch(currentSearchState(symbol));
}

function applyLastSearch(state) {
  if (!state) return;
  const symbol = (state.symbol || "").trim();
  if (symbol) document.getElementById("symbol").value = symbol;
  if (state.total_shares != null) {
    document.getElementById("total_shares").value = state.total_shares;
  }
  if (state.periods != null) periodsInput.value = state.periods;
  if (state.lookback_months != null) {
    document.getElementById("lookback_months").value = state.lookback_months;
  }
  yearlyToggle.checked = Boolean(state.yearly);
  const growth = document.getElementById("growth_override_pct");
  if (state.growth_override_pct == null || state.growth_override_pct === "") {
    growth.value = "";
  } else {
    growth.value = state.growth_override_pct;
  }
  const source = document.getElementById("price_source");
  if (source && (state.price_source === "yahoo" || state.price_source === "stooq")) {
    source.value = state.price_source;
  }
}

function currentSearchState(resolvedSymbol) {
  const growthRaw = document.getElementById("growth_override_pct").value.trim();
  return {
    symbol: (resolvedSymbol || document.getElementById("symbol").value).trim(),
    total_shares: Number(document.getElementById("total_shares").value),
    periods: Number(periodsInput.value),
    lookback_months: Number(document.getElementById("lookback_months").value),
    yearly: isYearly(),
    growth_override_pct: growthRaw === "" ? null : Number(growthRaw),
    price_source: document.getElementById("price_source")?.value || "yahoo",
  };
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
  dividendHint.textContent = t("plan.divHint");
  dividendPanel.innerHTML =
    `<p class="empty-copy">Open this section to load dividend data.</p>`;
}

function renderDividendContent(payload) {
  const dividend = payload.dividend || {};
  const currency = payload.currency || (currentPlan && currentPlan.currency) || "USD";

  if (!dividend.pays_dividend) {
    dividendHint.textContent = t("plan.divNone");
    dividendPanel.innerHTML =
      `<p class="empty-copy">No dividend data reported for ${payload.symbol || "this stock"}.</p>`;
    return;
  }

  const yieldText =
    dividend.yield_pct == null ? "—" : `${num(dividend.yield_pct, 2)}%`;
  dividendHint.textContent = t("plan.yield", { value: yieldText });

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
  dividendHint.textContent = t("common.loading");
  dividendPanel.innerHTML = `<p class="empty-copy">Loading dividend data…</p>`;

  try {
    const res = await fetch(`/api/dividends/${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || t("plan.divFailed"));
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
    dividendHint.textContent = t("common.failedLoad");
    dividendPanel.innerHTML = `<p class="error">${err.message || t("plan.divFailed")}</p>`;
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

  periodCol.textContent = plan.period_label || (yearly ? t("plan.year") : t("plan.month"));
  growthCol.textContent = yearly ? t("plan.yearGrowth") : t("plan.monthGrowth");

  quoteBar.innerHTML = `
    <span class="name stock-name">
      <span class="stock-icon-wrap" aria-hidden="true">
        <img class="stock-icon" src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(plan.symbol)}.png" alt="" loading="lazy" referrerpolicy="no-referrer"
          onerror="const w=this.parentElement; this.remove(); const f=w&&w.querySelector('.stock-icon-fallback'); if(f) f.hidden=false;" />
        <span class="stock-icon-fallback" hidden>${(plan.symbol || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?"}</span>
      </span>
      <span class="stock-name-text"><button type="button" class="sheet-name" data-open-sheet="${plan.symbol}">${plan.company_name} (${plan.symbol})</button></span>
    </span>
    <span class="meta">${money(plan.current_price, c)} · ${changeHtml}</span>
    <span class="meta">Est. ${periodWord}ly growth: ${num(growthPct, 2)}%</span>
    <span class="meta data-chip">${t("plan.source", { source: plan.price_source_label || plan.price_source || t("common.yahoo") })}${
      plan.quote_as_of
        ? ` · ${new Date(plan.quote_as_of).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
        : ""
    }</span>
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

  const scheduleCards = document.getElementById("schedule-cards");
  if (scheduleCards) {
    scheduleCards.innerHTML = plan.schedule
      .map((row) => {
        const period = row.period ?? row.month;
        const periodGrowth = row.period_growth ?? row.month_growth;
        return `<article class="plan-period-card">
          <h3>${yearly ? t("plan.year") : t("plan.month")} ${period}</h3>
          <dl>
            <div><dt>${t("plan.price")}</dt><dd>${money(row.projected_price, c)}</dd></div>
            <div><dt>${t("plan.sharesBought")}</dt><dd>${num(row.shares_bought, 4)}</dd></div>
            <div><dt>${t("plan.cost")}</dt><dd>${money(row.cost, c)}</dd></div>
            <div><dt>${t("plan.owned")}</dt><dd>${num(row.shares_owned, 4)}</dd></div>
            <div><dt>${yearly ? t("plan.yearGrowth") : t("plan.monthGrowth")}</dt><dd class="${growthClass(periodGrowth)}">${money(periodGrowth, c)}</dd></div>
          </dl>
        </article>`;
      })
      .join("");
  }

  resetDividendAccordion();
  placeholder.hidden = true;
  results.hidden = false;

  const followups = document.getElementById("plan-followups");
  if (followups) {
    const first = (plan.schedule || [])[0] || {};
    const shares = first.shares_bought ?? "";
    const price = first.projected_price ?? plan.current_price;
    followups.hidden = false;
    followups.innerHTML = `
      <button type="button" class="row-action" data-log-buy>${t("plan.logBuy")}</button>
      <button type="button" class="row-action" data-open-ideas="${plan.symbol}">${t("plan.openIdeas")}</button>
      <button type="button" class="row-action" data-open-suggestions="${plan.symbol}">${t("plan.openSuggestions")}</button>
    `;
    followups.querySelector("[data-log-buy]")?.addEventListener("click", () => {
      window.SbpListTools?.openInProgress?.(plan.symbol, {
        shares,
        price,
        currency: c,
      });
    });
    followups.querySelector("[data-open-ideas]")?.addEventListener("click", () => {
      window.SbpListTools?.openInIdeas?.(plan.symbol);
    });
    followups.querySelector("[data-open-suggestions]")?.addEventListener("click", () => {
      window.SbpListTools?.openInSuggestions?.(plan.symbol);
    });
  }
}

yearlyToggle.addEventListener("change", () => {
  syncFrequencyUi();
  persistCurrentSearch();
});

document.getElementById("symbol").addEventListener("change", persistCurrentSearch);
document.getElementById("symbol").addEventListener("blur", persistCurrentSearch);
document.getElementById("price_source")?.addEventListener("change", persistCurrentSearch);

dividendAccordion.addEventListener("toggle", () => {
  if (dividendAccordion.open) {
    loadDividendsIfNeeded();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  submitBtn.disabled = true;
  submitBtn.textContent = t("plan.calculating");

  const growthRaw = document.getElementById("growth_override_pct").value.trim();
  const body = {
    symbol: document.getElementById("symbol").value.trim(),
    total_shares: Number(document.getElementById("total_shares").value),
    periods: Number(periodsInput.value),
    frequency: isYearly() ? "yearly" : "monthly",
    lookback_months: Number(document.getElementById("lookback_months").value),
    growth_override_pct: growthRaw === "" ? null : Number(growthRaw),
    price_source: document.getElementById("price_source")?.value || "yahoo",
  };

  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || t("plan.requestFailed"));
    }
    writeLastSearch(currentSearchState(body.symbol));
    render(data);
  } catch (err) {
    showError(err.message || t("common.somethingWrong"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t("plan.submit");
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const last = readLastSearch();
  if (last?.symbol) {
    applyLastSearch(last);
  } else {
    document.getElementById("symbol").value = DEFAULT_SYMBOL;
  }
  syncFrequencyUi();
  form.requestSubmit();
});
