const money = (value, currency = "EUR") => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return String(value);
  }
};

const num = (value, digits = 2) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

function setList(el, html) {
  if (el) el.innerHTML = html;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function watchlistLabel(item) {
  const symbol = (item.symbol || "").trim();
  const name = (item.company_name || item.name || "").trim();
  if (name && symbol && name.toUpperCase() !== symbol.toUpperCase()) {
    return `${name} - ${symbol}`;
  }
  return name || symbol;
}

const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || (typeof vars === "string" ? vars : key);
const CURRENCY_LABELS = { USD: "US dollar", EUR: "Euro", GBP: "Pound sterling" };

function growthClass(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  if (Number(value) > 0) return "pos";
  if (Number(value) < 0) return "neg";
  return "";
}

function signedMoney(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const formatted = money(Math.abs(n), currency);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

function signedPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${num(n, 2)}%`;
}

function renderMarkets(data) {
  const el = document.getElementById("home-markets");
  if (!el) return;
  const groups = data.by_currency || [];
  if (!groups.length) {
    el.innerHTML = `<p class="muted">${t("home.emptyMarkets", "No positions yet. Log a buy on Progress to see markets here.")}</p>`;
    return;
  }
  const live = !data.summary_only;
  el.innerHTML = groups
    .map((group) => {
      const c = group.currency;
      const label = CURRENCY_LABELS[c] ? `${c} · ${CURRENCY_LABELS[c]}` : c;
      const daily = live ? signedMoney(group.total_daily_change, c) : "—";
      const monthly = live ? signedMoney(group.total_monthly_change, c) : "—";
      const dailyPct = live ? signedPct(group.total_daily_change_pct) : "";
      const monthlyPct = live ? signedPct(group.total_monthly_change_pct) : "";
      const liveValue = live ? money(group.total_market_value, c) : "—";
      return `<article class="home-market">
        <h3>${label}</h3>
        <div class="home-market-body">
          <dl>
            <div>
              <dt>${t("home.invested", "Invested")}</dt>
              <dd>${money(group.total_invested, c)}</dd>
            </div>
            <div>
              <dt>${t("home.daily", "Daily change")}</dt>
              <dd class="${live ? growthClass(group.total_daily_change) : ""}">${daily}${dailyPct ? ` <small>${dailyPct}</small>` : ""}</dd>
            </div>
            <div>
              <dt>${t("home.monthly", "Monthly change")}</dt>
              <dd class="${live ? growthClass(group.total_monthly_change) : ""}">${monthly}${monthlyPct ? ` <small>${monthlyPct}</small>` : ""}</dd>
            </div>
          </dl>
          <dl class="home-market-value">
            <div>
              <dt>${t("home.value", "Current value")}</dt>
              <dd>${liveValue}</dd>
            </div>
          </dl>
        </div>
      </article>`;
    })
    .join("");
}

function readOpenPlan() {
  try {
    const parsed = JSON.parse(localStorage.getItem("sbp:plan:lastSearch") || "null");
    return parsed && parsed.symbol ? parsed : null;
  } catch {
    return null;
  }
}

function monthLotShares(lots) {
  const now = new Date();
  return (lots || []).reduce((sum, lot) => {
    const raw = lot.purchased_at || lot.bought_at || "";
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return sum;
    if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
    return sum + (Number(lot.shares) || 0);
  }, 0);
}

async function loadActiveBudget() {
  try {
    const res = await fetch("/api/budget-plans");
    if (!res.ok) return null;
    const data = await res.json();
    const active = (data.plans || []).filter((plan) => plan.phase === "active" && plan.this_month);
    if (!active.length) return null;
    let selected = "";
    try {
      selected = localStorage.getItem("sbp:budget:selected") || "";
    } catch {
      /* ignore */
    }
    return active.find((plan) => String(plan.id) === selected) || active[0];
  } catch {
    return null;
  }
}

function renderBudgetBriefing(el, link, plan) {
  const month = plan.this_month;
  const c = plan.currency || "EUR";
  const spentPct = Math.max(0, Math.min(100, Number(month.spent_pct) || 0));
  const left =
    month.left >= 0
      ? t("budget.monthLeft", { amount: money(month.left, c) })
      : t("budget.monthOver", { amount: money(-month.left, c) });
  el.classList.remove("muted");
  el.innerHTML = `
    <span class="home-budget-line">${escapeHtml(
      t("home.budgetMonth", {
        name: plan.name,
        spent: money(month.spent, c),
        budget: money(month.budget, c),
      })
    )} <strong class="${month.left < 0 ? "neg" : ""}">${escapeHtml(left)}</strong></span>
    <span class="budget-meter${month.left < 0 ? " is-over" : ""}" aria-hidden="true"><i style="width:${spentPct.toFixed(1)}%"></i></span>`;
  if (link) {
    link.href = "/budget";
    link.textContent = t("home.budgetOpen");
  }
}

async function renderBriefing(progress) {
  const el = document.getElementById("home-briefing");
  const link = document.querySelector("#home-briefing-card .link-btn");
  if (!el) return;
  const budget = await loadActiveBudget();
  if (budget) {
    renderBudgetBriefing(el, link, budget);
    return;
  }
  el.classList.add("muted");
  const plan = readOpenPlan();
  if (!plan) {
    el.textContent = t("home.budgetNone");
    if (link) {
      link.href = "/budget";
      link.textContent = t("home.budgetStart");
    }
    return;
  }
  if (plan.yearly) {
    el.textContent = t("sheet.yearlyPlan");
    if (link) {
      link.href = "/plan";
      link.textContent = t("home.thisMonthOpen", { symbol: plan.symbol });
    }
    return;
  }
  const target = Number(plan.total_shares) / Math.max(1, Number(plan.periods) || 1);
  const symbol = String(plan.symbol).toUpperCase();
  let bought = 0;
  for (const group of progress?.by_currency || []) {
    for (const holding of group.holdings || []) {
      if (String(holding.symbol || "").toUpperCase() === symbol) {
        bought += monthLotShares(holding.lots);
      }
    }
  }
  el.textContent = t("home.thisMonth", {
    symbol: plan.symbol,
    bought: num(bought, 4),
    target: num(target, 4),
  });
  if (link) {
    link.href = "/plan";
    link.textContent = t("home.thisMonthOpen", { symbol: plan.symbol });
  }
}

function renderStart({ hasPositions, hasWatch }) {
  const card = document.getElementById("home-start-card");
  if (!card) return;
  card.hidden = Boolean(hasPositions || hasWatch);
}

async function loadTiles() {
  const cache = window.SbpCache;
  const watchlistEl = document.getElementById("home-watchlist");
  const marketsEl = document.getElementById("home-markets");
  let progress = null;
  let hasWatch = false;

  try {
    progress = await cache.fetchKey(cache.KEYS.progress);
    renderMarkets(progress);
  } catch {
    if (marketsEl) marketsEl.innerHTML = `<p class="muted">${t("home.unavailableProgress")}</p>`;
  }
  renderBriefing(progress);

  try {
    const data = await cache.fetchKey(cache.KEYS.watchlist);
    hasWatch = (data.items || []).length > 0;
    const movers = (data.items || [])
      .filter((item) => item.error || Math.abs(Number(item.change_pct) || 0) >= 1)
      .sort((a, b) => Math.abs(Number(b.change_pct) || 0) - Math.abs(Number(a.change_pct) || 0))
      .slice(0, 6);
    setList(
      watchlistEl,
      movers.length
        ? movers
            .map((item) => {
              const daily = signedPct(item.change_pct);
              const dailyClass = growthClass(item.change_pct);
              const err = item.error ? ` <small class="neg">${t("row.errorMuted")}</small>` : "";
              return `<li>
                <span><button type="button" class="sheet-name" data-open-sheet="${escapeHtml(item.symbol)}">${escapeHtml(watchlistLabel(item))}</button>${err}</span>
                <strong>${money(item.live_price, item.currency)}</strong>
                <small>${item.price_source_label || item.price_source || "Yahoo Finance"}</small>
                <small class="home-watchlist-change ${dailyClass}">${daily ? `${daily} ${t("common.today")}` : t("common.noDaily")}</small>
              </li>`;
            })
            .join("")
        : `<li class="muted">${t("home.noMovers")}</li>`
    );
  } catch {
    setList(watchlistEl, `<li class="muted">${t("home.unavailableWatch")}</li>`);
  }

  const hasPositions = (progress?.by_currency || []).length > 0;
  renderStart({ hasPositions, hasWatch });
}

async function loadQuoteStatus() {
  const el = document.getElementById("quote-status");
  if (!el) return;
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    el.hidden = false;
    if (data.quotes_ok === false || data.quotes_delayed) {
      el.classList.add("is-stale");
      el.textContent = t("home.quotesDelayed");
      return;
    }
    el.classList.remove("is-stale");
    el.textContent = data.last_refresh_at ? t("home.quotesOk") : t("home.quotesUnknown");
  } catch {
    el.hidden = false;
    el.classList.add("is-stale");
    el.textContent = t("home.quotesDelayed");
  }
}

function boot() {
  loadTiles();
  loadQuoteStatus();
}

if (window.SbpAuth?.whenAuthReady) {
  window.SbpAuth.whenAuthReady(boot);
} else {
  boot();
}

window.addEventListener("sbp:lang-change", () => loadTiles());
