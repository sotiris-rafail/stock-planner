const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const form = document.getElementById("trade-form");
const submitBtn = document.getElementById("submit-btn");
const fillPriceBtn = document.getElementById("fill-price-btn");
const formError = document.getElementById("form-error");
const formOk = document.getElementById("form-ok");
const currencySections = document.getElementById("currency-sections");
const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const purchasesBody = document.getElementById("purchases-body");
const tradeDate = document.getElementById("trade_date");
const historyAccordion = document.getElementById("history-accordion");
const historyHint = document.getElementById("history-hint");
const historyPagination = document.getElementById("history-pagination");
const historyPageSize = document.getElementById("history-page-size");
const historyPrev = document.getElementById("history-prev");
const historyNext = document.getElementById("history-next");
const historyPageStatus = document.getElementById("history-page-status");
const lotsAccordion = document.getElementById("lots-accordion");
const lotsHint = document.getElementById("lots-hint");
const lotsPagination = document.getElementById("lots-pagination");
const lotsPageSize = document.getElementById("lots-page-size");
const lotsPrev = document.getElementById("lots-prev");
const lotsNext = document.getElementById("lots-next");
const lotsPageStatus = document.getElementById("lots-page-status");
const lotsBody = document.getElementById("lots-body");
const progressStatus = document.getElementById("progress-status");
const progressRefreshBtn = document.getElementById("progress-refresh-btn");
const lotsSearch = document.getElementById("lots-search");
const historySearch = document.getElementById("history-search");
const lotsTable = document.getElementById("lots-table");
const historyTable = document.getElementById("history-table");
const tabBuy = document.getElementById("tab-buy");
const tabSell = document.getElementById("tab-sell");
const tradePanelTitle = document.getElementById("trade-panel-title");
const sharesLabel = document.getElementById("shares-label");
const dateLabel = document.getElementById("date-label");
const ownedHint = document.getElementById("owned-hint");
const priceHint = document.getElementById("price-hint");
const priceCurrencyHint = document.getElementById("price-currency-hint");

// Broker aliases → stored Yahoo symbols (keep in sync with backend symbol_resolver)
const SYMBOL_ALIASES = {
  "VUAA.EU": ["VUAA.L", "VUAA.DE", "VUAA.MI", "VUAA.AS"],
  VUAA: ["VUAA.L", "VUAA.DE", "VUAA.MI"],
};

const USD_PRICE_SYMBOLS = new Set(["VUAA.EU"]);
const EUR_PRICE_SYMBOLS = new Set(["DTE.DE", "DTE"]);
const symbolInput = document.getElementById("symbol");
const symbolOptions = document.getElementById("symbol-options");
const notesInput = document.getElementById("notes");

const CURRENCY_LABELS = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CHF: "Swiss Franc",
  JPY: "Japanese Yen",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
};

let tradeMode = "buy";
let positions = [];
let remainingLots = [];
let historyAllTransactions = [];
let progressCache = null;
let progressFullLoaded = false;
let progressLoading = false;
let progressRefreshBound = false;

const historyState = {
  loaded: false,
  loading: false,
  page: 1,
  pageSize: "10",
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
  search: "",
  sortKey: "date",
  sortDir: "desc",
};

const lotsState = {
  loaded: false,
  page: 1,
  pageSize: "10",
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
  search: "",
  sortKey: "date",
  sortDir: "desc",
};

const money = (value, currency = "USD") => {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${num(value, 2)} ${currency}`;
  }
};

const num = (value, digits = 2) => {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
};

const growthClass = (value) => (value > 0 ? "pos" : value < 0 ? "neg" : "");

function stockLogoUrl(symbol) {
  if (!symbol) return "";
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`;
}

function stockIconHtml(symbol) {
  const initial = (symbol || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";
  const url = stockLogoUrl(symbol);
  return `
    <span class="stock-icon-wrap" aria-hidden="true">
      <img class="stock-icon" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="const w=this.parentElement; this.remove(); const f=w&&w.querySelector('.stock-icon-fallback'); if(f) f.hidden=false;" />
      <span class="stock-icon-fallback" hidden>${initial}</span>
    </span>`;
}

function currencyTitle(code) {
  const label = CURRENCY_LABELS[code];
  return label ? `${code} · ${label}` : code;
}

function todayLocalISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function showError(message) {
  formError.hidden = !message;
  formError.textContent = message || "";
  if (message) formOk.hidden = true;
}

function showOk(message) {
  formOk.hidden = !message;
  formOk.textContent = message || "";
  if (message) formError.hidden = true;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatYield(dividend) {
  if (!dividend || !dividend.pays_dividend) return "—";
  if (dividend.yield_pct == null) return "Pays";
  return `${num(dividend.yield_pct, 2)}%`;
}

function recentPayoutsHtml(dividend, currency) {
  const payments = (dividend && dividend.recent_payments) || [];
  if (!payments.length) return `<div class="sub">No recent payouts</div>`;
  return payments
    .slice(0, 4)
    .map((p) => `<div class="sub">${p.date}: ${money(p.amount, currency)}</div>`)
    .join("");
}

function findPosition(symbol) {
  const upper = (symbol || "").trim().toUpperCase();
  if (!upper) return null;
  const exact = positions.find((p) => p.symbol === upper);
  if (exact) return exact;
  for (const alt of SYMBOL_ALIASES[upper] || []) {
    const match = positions.find((p) => p.symbol === alt);
    if (match) return match;
  }
  return null;
}

function updatePriceCurrencyHint() {
  const symbol = symbolInput.value.trim().toUpperCase();
  if (USD_PRICE_SYMBOLS.has(symbol)) {
    if (priceHint) priceHint.textContent = t("progress.usdRule");
    if (priceCurrencyHint) {
      priceCurrencyHint.hidden = false;
      priceCurrencyHint.textContent =
        t("progress.vuaaUsd");
    }
  } else if (EUR_PRICE_SYMBOLS.has(symbol)) {
    if (priceHint) priceHint.textContent = t("progress.eurRule");
    if (priceCurrencyHint) {
      priceCurrencyHint.hidden = false;
      priceCurrencyHint.textContent = t("progress.dteEur");
    }
  } else {
    if (priceHint) priceHint.textContent = t("progress.blankLive");
    if (priceCurrencyHint) {
      priceCurrencyHint.hidden = true;
      priceCurrencyHint.textContent = "";
    }
  }
}

function setTradeMode(mode) {
  tradeMode = mode === "sell" ? "sell" : "buy";
  tabBuy.classList.toggle("active", tradeMode === "buy");
  tabSell.classList.toggle("active", tradeMode === "sell");
  tradePanelTitle.textContent = tradeMode === "sell" ? t("progress.logSell") : t("progress.logBuy");
  sharesLabel.textContent = tradeMode === "sell" ? t("progress.sharesSold") : t("progress.sharesBought");
  dateLabel.textContent = tradeMode === "sell" ? t("progress.sellDate") : t("progress.purchaseDate");
  submitBtn.textContent = tradeMode === "sell" ? t("progress.saveSell") : t("progress.saveBuy");
  notesInput.placeholder = " ";
  updateOwnedHint();
}

function updateOwnedHint() {
  updatePriceCurrencyHint();
  if (tradeMode !== "sell") {
    ownedHint.hidden = true;
    ownedHint.textContent = "";
    return;
  }
  const symbol = symbolInput.value.trim().toUpperCase();
  const pos = findPosition(symbol);
  if (!symbol) {
    ownedHint.hidden = false;
    ownedHint.textContent = t("progress.enterOwn");
    return;
  }
  if (!pos || pos.shares <= 0) {
    ownedHint.hidden = false;
    ownedHint.textContent = t("progress.noPos", { symbol });
    return;
  }
  ownedHint.hidden = false;
  ownedHint.innerHTML = `${t("progress.sellAvail")}<strong>${num(pos.shares, 4)}</strong> ${pos.symbol} · ${t("progress.avgCostHint")} ${money(pos.avg_cost_per_share, pos.currency)}`;
}

function renderSymbolOptions() {
  symbolOptions.innerHTML = positions
    .map((p) => `<option value="${p.symbol}">${p.symbol} (${num(p.shares, 4)} sh)</option>`)
    .join("");
}

const holdingsModal = document.getElementById("holdings-modal");
const holdingsModalBody = document.getElementById("holdings-modal-body");
const holdingsModalTitle = document.getElementById("holdings-modal-title");
const holdingsModalMeta = document.getElementById("holdings-modal-meta");
let holdingsModalCurrency = null;

function holdingStat(label, value, className = "") {
  return `<div class="holding-stat">
    <span class="holding-stat-label">${escapeHtml(label)}</span>
    <span class="holding-stat-value ${className}">${value}</span>
  </div>`;
}

function renderHoldingCard(h, currency) {
  const c = h.currency || currency;
  const change =
    h.change_pct == null
      ? ""
      : `<span class="sub ${h.change_pct >= 0 ? "pos" : "neg"}">${h.change_pct >= 0 ? "+" : ""}${num(h.change_pct, 2)}${t("progress.pctToday")}</span>`;
  const div = h.dividend || {};
  const earned = h.dividends_earned || 0;
  const earnedGross = h.dividends_earned_gross;
  const earnedTax = h.dividends_tax;
  const whPct = h.dividends_withholding_pct || 0;
  const earnedPct = h.dividends_earned_pct;
  const buyLabel =
    h.purchase_count === 1
      ? t("progress.lot1", { n: num(h.purchase_count || 0, 0) })
      : t("progress.lotN", { n: num(h.purchase_count || 0, 0) });
  const taxNote =
    whPct > 0 && earnedGross
      ? `<span class="sub">gross ${money(earnedGross, c)} − ${num(whPct, 0)}% tax ${money(earnedTax, c)}</span>`
      : "";
  const lots = (h.lots || [])
    .map(
      (lot) =>
        `<li><span>${escapeHtml(lot.purchased_at || "—")}</span><strong>${num(lot.shares, 4)} @ ${money(lot.price_per_share, c)}</strong></li>`
    )
    .join("");

  return `<article class="holding-card panel">
    <header class="holding-card-head">
      ${stockIconHtml(h.symbol)}
      <div>
        <h3><button type="button" class="sheet-name" data-open-sheet="${escapeHtml(h.symbol)}">${escapeHtml(h.company_name || h.symbol)}</button></h3>
        <p>${escapeHtml(h.symbol)} · ${buyLabel}</p>
      </div>
    </header>
    <div class="holding-card-stats">
      ${holdingStat(t("progress.shares"), num(h.shares, 4))}
      ${holdingStat(t("progress.avgCost"), money(h.avg_cost_per_share, c))}
      ${holdingStat(t("home.invested"), money(h.total_invested, c))}
      ${holdingStat(t("progress.livePrice"), `${money(h.current_price, c)}${change ? ` ${change}` : ""}`)}
      ${holdingStat(t("progress.value"), money(h.market_value, c))}
      ${holdingStat(t("progress.unrealized"), `${money(h.unrealized_gain, c)} (${num(h.unrealized_gain_pct, 2)}%)`, growthClass(h.unrealized_gain))}
      ${holdingStat(t("progress.realized"), `${money(h.realized_gain, c)}${h.realized_gain_pct == null ? "" : ` (${num(h.realized_gain_pct, 2)}%)`}`, growthClass(h.realized_gain))}
    </div>
    <details class="holding-dividends">
      <summary>
        <span>${t("plan.dividends")}</span>
        <span class="holding-dividends-hint">${formatYield(div)}${earned ? ` · ${money(earned, c)} ${t("progress.earned")}` : ""}</span>
      </summary>
      <div class="holding-card-stats">
        ${holdingStat(t("progress.divYield"), `${formatYield(div)}${div.annual_rate != null ? `<span class="sub">~${money(div.annual_rate, c)}/sh/yr</span>` : ""}`)}
        ${holdingStat(t("progress.divNet"), `${money(earned, c)}${taxNote}`, growthClass(earned))}
        ${holdingStat(t("progress.divPct"), earnedPct == null ? "—" : `${num(earnedPct, 2)}%`, growthClass(earnedPct))}
      </div>
      <div class="holding-card-payouts">${recentPayoutsHtml(div, c)}</div>
    </details>
    ${
      lots
        ? `<details class="holding-lots">
      <summary>
        <span>${t("progress.lotsLabel")}</span>
        <span class="holding-lots-hint">${buyLabel}</span>
      </summary>
      <ul class="holding-card-lots">${lots}</ul>
    </details>`
        : ""
    }
    ${planVsLotsHtml(h)}
    <div class="row-actions holding-links">
      <button type="button" class="row-action" data-open-plan="${escapeHtml(h.symbol)}">${t("progress.openPlan")}</button>
      <button type="button" class="row-action" data-open-ideas="${escapeHtml(h.symbol)}">${t("progress.openIdeas")}</button>
      <button type="button" class="row-action" data-open-suggestions="${escapeHtml(h.symbol)}">${t("progress.openSuggestions")}</button>
    </div>
  </article>`;
}

function planVsLotsHtml(holding) {
  try {
    const plan = JSON.parse(localStorage.getItem("sbp:plan:lastSearch") || "null");
    if (!plan?.symbol || plan.yearly) return "";
    if (String(plan.symbol).toUpperCase() !== String(holding.symbol || "").toUpperCase()) return "";
    const target = Number(plan.total_shares) / Math.max(1, Number(plan.periods) || 1);
    const now = new Date();
    const bought = (holding.lots || []).reduce((sum, lot) => {
      const date = lot.purchased_at ? new Date(lot.purchased_at) : null;
      if (!date || date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
      return sum + (Number(lot.shares) || 0);
    }, 0);
    return `<p class="plan-vs-lots">${t("progress.thisMonth", { bought: num(bought, 4), target: num(target, 4) })}</p>`;
  } catch {
    return "";
  }
}

function renderHoldingsModalBody(group, { loading = false } = {}) {
  if (!holdingsModalBody) return;
  const c = group?.currency || holdingsModalCurrency || "";
  if (holdingsModalTitle) {
    holdingsModalTitle.textContent = currencyTitle(c) || t("progress.openHoldings");
  }
  if (loading) {
    if (holdingsModalMeta) holdingsModalMeta.textContent = t("progress.loadingLive");
    holdingsModalBody.innerHTML = `<p class="muted holdings-modal-empty">${t("progress.loadHoldings")}</p>`;
    return;
  }
  const holdings = group?.holdings || [];
  if (holdingsModalMeta) {
    holdingsModalMeta.textContent =
      holdings.length === 1
        ? t("progress.holdingOne", { n: holdings.length })
        : t("progress.holdingsCount", { n: holdings.length });
  }
  holdingsModalBody.innerHTML = holdings.length
    ? holdings
        .map(
          (h) => `
      <button type="button" class="holding-pick" data-open-sheet="${escapeHtml(h.symbol)}">
        <strong>${escapeHtml(h.company_name || h.symbol)}</strong>
        <span>${escapeHtml(h.symbol)}</span>
        <span>${money(h.market_value, h.currency || c)}</span>
      </button>`
        )
        .join("")
    : `<p class="muted holdings-modal-empty">${t("progress.noHoldingsC", { c: escapeHtml(c) })}</p>`;
}

function closeHoldingsModal() {
  holdingsModalCurrency = null;
  if (!holdingsModal) return;
  holdingsModal.hidden = true;
  document.body.classList.remove("progress-modal-open");
}

async function openHoldingsModal(currency) {
  holdingsModalCurrency = currency;
  if (!holdingsModal) return;
  holdingsModal.hidden = false;
  document.body.classList.add("progress-modal-open");
  holdingsModal.querySelector(".progress-modal-close")?.focus();

  const cached = (progressCache?.by_currency || []).find((g) => g.currency === currency);
  renderHoldingsModalBody(cached, { loading: !progressFullLoaded });

  if (!progressFullLoaded) {
    try {
      await ensureFullProgress();
    } catch (err) {
      showError(err.message || t("progress.failHoldings"));
      if (holdingsModalBody) {
        holdingsModalBody.innerHTML = `<p class="muted holdings-modal-empty">${t("progress.failHoldings")}</p>`;
      }
    }
  }
}

function collectRemainingLots(data) {
  const lots = [];
  for (const group of data.by_currency || []) {
    const currency = group.currency || "USD";
    for (const h of group.holdings || []) {
      for (const lot of h.lots || []) {
        lots.push({
          ...lot,
          company_name: lot.company_name || h.company_name,
          currency: lot.currency || h.currency || currency,
        });
      }
    }
  }
  lots.sort((a, b) => {
    const byDate = String(b.purchased_at || "").localeCompare(String(a.purchased_at || ""));
    if (byDate !== 0) return byDate;
    return (b.id || 0) - (a.id || 0);
  });
  return lots;
}

function pageSlice(items, page, pageSize) {
  const total = items.length;
  if (pageSize === "all") {
    return {
      rows: items,
      page: 1,
      total,
      totalPages: total ? 1 : 0,
      hasNext: false,
      hasPrev: false,
    };
  }
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = total ? Math.ceil(total / size) : 0;
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages || 1));
  const start = (safePage - 1) * size;
  return {
    rows: items.slice(start, start + size),
    page: safePage,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesStockSearch(item, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const symbol = normalizeSearch(item.symbol);
  const name = normalizeSearch(item.company_name);
  return symbol.includes(q) || name.includes(q);
}

function compareValues(a, b, dir) {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    if (a === b) return 0;
    return a < b ? -mul : mul;
  }
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa === sb) return 0;
  return sa < sb ? -mul : mul;
}

function lotAmount(lot) {
  if (lot.cost != null) return Number(lot.cost);
  return Number(lot.shares) * Number(lot.price_per_share);
}

function txnAmount(txn) {
  if (txn.amount != null) return Number(txn.amount);
  return Number(txn.shares) * Number(txn.price_per_share);
}

function sortLots(items, key, dir) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let av;
    let bv;
    switch (key) {
      case "date":
        av = a.purchased_at;
        bv = b.purchased_at;
        break;
      case "type":
        av = "buy";
        bv = "buy";
        break;
      case "stock":
        av = a.symbol;
        bv = b.symbol;
        break;
      case "currency":
        av = a.currency;
        bv = b.currency;
        break;
      case "shares":
        av = Number(a.shares);
        bv = Number(b.shares);
        break;
      case "price":
        av = Number(a.price_per_share);
        bv = Number(b.price_per_share);
        break;
      case "amount":
        av = lotAmount(a);
        bv = lotAmount(b);
        break;
      case "result":
        av = null;
        bv = null;
        break;
      case "notes":
        av = a.notes;
        bv = b.notes;
        break;
      default:
        return 0;
    }
    const cmp = compareValues(av, bv, dir);
    if (cmp !== 0) return cmp;
    return compareValues(a.id, b.id, "desc");
  });
  return sorted;
}

function sortTransactions(items, key, dir) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let av;
    let bv;
    switch (key) {
      case "date":
        av = a.txn_date;
        bv = b.txn_date;
        break;
      case "type":
        av = a.type;
        bv = b.type;
        break;
      case "stock":
        av = a.symbol;
        bv = b.symbol;
        break;
      case "currency":
        av = a.currency;
        bv = b.currency;
        break;
      case "shares":
        av = Number(a.shares);
        bv = Number(b.shares);
        break;
      case "price":
        av = Number(a.price_per_share);
        bv = Number(b.price_per_share);
        break;
      case "amount":
        av = txnAmount(a);
        bv = txnAmount(b);
        break;
      case "result":
        av = a.realized_gain == null ? null : Number(a.realized_gain);
        bv = b.realized_gain == null ? null : Number(b.realized_gain);
        break;
      case "notes":
        av = a.notes;
        bv = b.notes;
        break;
      default:
        return 0;
    }
    const cmp = compareValues(av, bv, dir);
    if (cmp !== 0) return cmp;
    return compareValues(a.id, b.id, "desc");
  });
  return sorted;
}

function toggleSortState(state, key) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = key === "date" ? "desc" : "asc";
  }
}

function updateSortHeaders(tableEl, state) {
  if (!tableEl) return;
  for (const th of tableEl.querySelectorAll("th.sortable-th")) {
    const key = th.getAttribute("data-sort-key");
    const label = th.getAttribute("data-sort-label") || th.textContent.trim();
    const active = key === state.sortKey;
    th.classList.toggle("sorted", active);
    th.setAttribute(
      "aria-sort",
      active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"
    );
    th.textContent = active
      ? `${label} ${state.sortDir === "asc" ? "↑" : "↓"}`
      : label;
  }
}

function bindSortableTable(tableEl, state, onChange) {
  if (!tableEl || tableEl.dataset.sortBound === "1") return;
  tableEl.dataset.sortBound = "1";
  tableEl.querySelector("thead")?.addEventListener("click", (event) => {
    const th = event.target.closest("th.sortable-th");
    if (!th) return;
    const key = th.getAttribute("data-sort-key");
    if (!key) return;
    toggleSortState(state, key);
    updateSortHeaders(tableEl, state);
    onChange();
  });
  updateSortHeaders(tableEl, state);
}

function renderLotsTableRows(lots) {
  if (!lots.length) {
    const message = normalizeSearch(lotsState.search)
      ? t("progress.noLotsMatch")
      : t("progress.noLots");
    lotsBody.innerHTML = `<tr><td colspan="10" class="empty">${message}</td></tr>`;
    return;
  }

  lotsBody.innerHTML = lots
    .map((p) => {
      const c = p.currency || "USD";
      const amount = p.cost != null ? p.cost : Number(p.shares) * Number(p.price_per_share);
      return `
      <tr>
        <td class="left">${p.purchased_at}</td>
        <td><span class="type-pill buy">Buy</span></td>
        <td class="left">
          <span class="stock-name">
            ${stockIconHtml(p.symbol)}
            <span class="stock-name-text">
              <strong>${escapeHtml(p.symbol)}</strong>
              ${p.company_name ? `<div class="sub">${escapeHtml(p.company_name)}</div>` : ""}
            </span>
          </span>
        </td>
        <td><span class="currency-pill">${c}</span></td>
        <td>${num(p.shares, 4)}</td>
        <td>${money(p.price_per_share, c)}</td>
        <td>${money(amount, c)}</td>
        <td>—</td>
        <td class="left notes">${p.notes ? escapeHtml(p.notes) : "—"}</td>
        <td><button type="button" class="link-btn" data-delete="${p.id}">Delete</button></td>
      </tr>`;
    })
    .join("");
}

function updateLotsPaginationUi(filteredTotal = lotsState.total) {
  lotsPagination.hidden = false;
  lotsPrev.disabled = !lotsState.hasPrev;
  lotsNext.disabled = !lotsState.hasNext;

  const searchActive = Boolean(normalizeSearch(lotsState.search));
  const baseTotal = remainingLots.length;

  if (lotsState.pageSize === "all") {
    lotsPageStatus.textContent = filteredTotal
      ? searchActive
        ? `Showing all ${num(filteredTotal, 0)} of ${num(baseTotal, 0)}`
        : `Showing all ${num(filteredTotal, 0)}`
      : searchActive
        ? t("progress.noMatches")
        : t("progress.noItems");
  } else {
    const pages = lotsState.totalPages || 0;
    lotsPageStatus.textContent = pages
      ? searchActive
        ? `Page ${lotsState.page} of ${pages} · ${num(filteredTotal, 0)} of ${num(baseTotal, 0)}`
        : `Page ${lotsState.page} of ${pages} · ${num(filteredTotal, 0)} total`
      : searchActive
        ? t("progress.noMatches")
        : t("progress.noItems");
  }

  lotsHint.textContent = searchActive
    ? `${num(filteredTotal, 0)} match${filteredTotal === 1 ? "" : "es"} · ${num(baseTotal, 0)} total`
    : filteredTotal
      ? `${num(filteredTotal, 0)} remaining lot${filteredTotal === 1 ? "" : "s"}`
      : t("progress.noLotsYet");
}

function resetLotsAccordion() {
  lotsState.loaded = false;
  lotsState.page = 1;
  lotsHint.textContent = t("progress.lotsHint");
  lotsPagination.hidden = true;
  lotsBody.innerHTML =
    `<tr><td colspan="10" class="empty">${t("progress.lotsEmpty")}</td></tr>`;
}

function showLotsPage() {
  const filtered = remainingLots.filter((lot) =>
    matchesStockSearch(lot, lotsState.search)
  );
  const sorted = sortLots(filtered, lotsState.sortKey, lotsState.sortDir);
  const sliced = pageSlice(sorted, lotsState.page, lotsState.pageSize);
  lotsState.loaded = true;
  lotsState.page = sliced.page;
  lotsState.total = sliced.total;
  lotsState.totalPages = sliced.totalPages;
  lotsState.hasNext = sliced.hasNext;
  lotsState.hasPrev = sliced.hasPrev;
  renderLotsTableRows(sliced.rows);
  updateSortHeaders(lotsTable, lotsState);
  updateLotsPaginationUi(sliced.total);
}

function renderCurrencySection(group, { holdingsLoaded = false } = {}) {
  const c = group.currency;
  const holdings = group.holdings || [];
  const openCount = holdingsLoaded
    ? holdings.length
    : num(group.symbol_count, 0);
  const liveValue = holdingsLoaded ? money(group.total_market_value, c) : "—";
  const unrealized = holdingsLoaded
    ? `${money(group.total_unrealized_gain, c)} (${num(group.total_unrealized_gain_pct, 2)}%)`
    : "—";
  const dividends =
    holdingsLoaded && group.total_dividends_earned != null
      ? `${money(group.total_dividends_earned, c)} (${num(group.total_dividends_earned_pct, 2)}%)`
      : "—";
  const hintText = holdingsLoaded
    ? openCount === 1
      ? t("progress.holdingOne", { n: openCount })
      : t("progress.holdingsCount", { n: openCount })
    : t("progress.openDetails");

  return `
    <article class="currency-block" data-currency="${c}">
      <div class="currency-heading">
        <h3>${currencyTitle(c)}</h3>
        <span class="currency-meta">${t("progress.meta", { open: openCount, buys: num(group.purchase_count, 0), sells: num(group.sale_count || 0, 0) })}</span>
      </div>
      <div class="summary currency-summary currency-summary-wide">
        <div class="stat">
          <span class="label">${t("progress.investedC", { c })}</span>
          <span class="value">${money(group.total_invested, c)}</span>
        </div>
        <div class="stat">
          <span class="label">${t("progress.liveC", { c })}</span>
          <span class="value">${liveValue}</span>
        </div>
        <div class="stat">
          <span class="label">${t("progress.unrealC", { c })} ${window.SbpI18n?.helpIcon?.(t("help.unrealized")) || ""}</span>
          <span class="value ${holdingsLoaded ? growthClass(group.total_unrealized_gain) : ""}">${unrealized}</span>
        </div>
        <div class="stat">
          <span class="label">${t("progress.realC", { c })} ${window.SbpI18n?.helpIcon?.(t("help.realized")) || ""}</span>
          <span class="value ${growthClass(group.total_realized_gain)}">${money(group.total_realized_gain, c)}</span>
        </div>
        <div class="stat">
          <span class="label">${t("progress.divC", { c })}</span>
          <span class="value ${holdingsLoaded ? growthClass(group.total_dividends_earned) : ""}">${dividends}</span>
          ${
            holdingsLoaded && c === "USD"
              ? `<span class="sub">${t("progress.usdTax")}</span>`
              : holdingsLoaded && c === "EUR"
                ? `<span class="sub">${t("progress.eurTax")}</span>`
                : ""
          }
        </div>
      </div>
      <button type="button" class="holdings-open-btn" data-open-holdings="${c}">
        <span>
          <span class="accordion-title">${t("progress.openHoldings")}</span>
          <span class="accordion-hint holdings-hint">${hintText}</span>
        </span>
        <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
      </button>
    </article>
  `;
}

function openHoldingsCurrencies() {
  return holdingsModalCurrency ? [holdingsModalCurrency] : [];
}

function renderProgress(data, { restoreOpen = [] } = {}) {
  const groups = data.by_currency || [];
  const holdingsLoaded = !data.summary_only;
  progressCache = data;
  progressFullLoaded = holdingsLoaded;

  if (holdingsLoaded) {
    remainingLots = collectRemainingLots(data);
  } else {
    remainingLots = [];
  }

  if (groups.length === 0) {
    currencySections.innerHTML =
      `<p class="empty-copy">${t("progress.emptyPositions")}</p>`;
  } else {
    currencySections.innerHTML = groups
      .map((g) => renderCurrencySection(g, { holdingsLoaded }))
      .join("");
  }

  if (holdingsLoaded && holdingsModalCurrency) {
    const openGroup = groups.find((g) => g.currency === holdingsModalCurrency);
    if (openGroup) renderHoldingsModalBody(openGroup);
  }

  if (lotsAccordion.open && holdingsLoaded) {
    showLotsPage();
  } else if (!lotsAccordion.open) {
    lotsState.loaded = false;
    lotsHint.textContent = holdingsLoaded
      ? remainingLots.length
        ? remainingLots.length === 1
          ? t("progress.lotOne", { n: num(remainingLots.length, 0) })
          : t("progress.lotsCount", { n: num(remainingLots.length, 0) })
        : t("progress.lotsHint")
      : t("progress.lotsHint");
    lotsPagination.hidden = true;
  }
}

async function ensureFullProgress({ force = false } = {}) {
  if (progressFullLoaded && !force) return progressCache;
  if (progressLoading) {
    while (progressLoading) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return progressCache;
  }

  progressLoading = true;
  if (holdingsModalCurrency) {
    const cached = (progressCache?.by_currency || []).find(
      (g) => g.currency === holdingsModalCurrency
    );
    renderHoldingsModalBody(cached, { loading: true });
  }

  try {
    const data = await window.SbpCache.fetchKey(window.SbpCache.KEYS.progress);
    renderProgress(data, { restoreOpen: holdingsModalCurrency ? [holdingsModalCurrency] : [] });
    await loadPositions();
    return data;
  } finally {
    progressLoading = false;
  }
}

function renderHistoryRows(transactions) {
  if (!transactions || transactions.length === 0) {
    const message = normalizeSearch(historyState.search)
      ? t("progress.noTxMatch")
      : t("progress.noTx");
    purchasesBody.innerHTML = `<tr><td colspan="10" class="empty">${message}</td></tr>`;
    return;
  }

  purchasesBody.innerHTML = transactions
    .map((txn) => {
      const c = txn.currency || "USD";
      const isSell = txn.type === "sell";
      const result = isSell
        ? `<span class="${growthClass(txn.realized_gain)}">${money(txn.realized_gain, c)}</span>`
        : "—";
      const deleteCell = isSell
        ? "—"
        : `<button type="button" class="link-btn" data-delete="${txn.id}">Delete</button>`;
      return `
      <tr>
        <td class="left">${txn.txn_date}</td>
        <td><span class="type-pill ${isSell ? "sell" : "buy"}">${isSell ? t("progress.sell") : t("progress.buy")}</span></td>
        <td class="left">
          <span class="stock-name">
            ${stockIconHtml(txn.symbol)}
            <span class="stock-name-text">
              <strong>${escapeHtml(txn.symbol)}</strong>
              ${txn.company_name ? `<div class="sub">${escapeHtml(txn.company_name)}</div>` : ""}
            </span>
          </span>
        </td>
        <td><span class="currency-pill">${c}</span></td>
        <td>${num(txn.shares, 4)}</td>
        <td>${money(txn.price_per_share, c)}</td>
        <td>${money(txn.amount, c)}</td>
        <td>${result}</td>
        <td class="left notes">${txn.notes ? escapeHtml(txn.notes) : "—"}</td>
        <td>${deleteCell}</td>
      </tr>`;
    })
    .join("");
}

function updateHistoryPaginationUi(filteredTotal = historyState.total) {
  historyPagination.hidden = false;
  historyPrev.disabled = !historyState.hasPrev || historyState.loading;
  historyNext.disabled = !historyState.hasNext || historyState.loading;

  const searchActive = Boolean(normalizeSearch(historyState.search));
  const baseTotal = historyAllTransactions.length;

  if (historyState.pageSize === "all") {
    historyPageStatus.textContent = filteredTotal
      ? searchActive
        ? `Showing all ${num(filteredTotal, 0)} of ${num(baseTotal, 0)}`
        : `Showing all ${num(filteredTotal, 0)}`
      : searchActive
        ? t("progress.noMatches")
        : t("progress.noItems");
  } else {
    const pages = historyState.totalPages || 0;
    historyPageStatus.textContent = pages
      ? searchActive
        ? `Page ${historyState.page} of ${pages} · ${num(filteredTotal, 0)} of ${num(baseTotal, 0)}`
        : `Page ${historyState.page} of ${pages} · ${num(filteredTotal, 0)} total`
      : searchActive
        ? t("progress.noMatches")
        : t("progress.noItems");
  }

  historyHint.textContent = searchActive
    ? `${num(filteredTotal, 0)} match${filteredTotal === 1 ? "" : "es"} · ${num(baseTotal, 0)} total`
    : filteredTotal
      ? `${num(filteredTotal, 0)} transaction${filteredTotal === 1 ? "" : "s"}`
      : t("progress.noTxYet");
}

function showHistoryPage() {
  const filtered = historyAllTransactions.filter((txn) =>
    matchesStockSearch(txn, historyState.search)
  );
  const sorted = sortTransactions(filtered, historyState.sortKey, historyState.sortDir);
  const sliced = pageSlice(sorted, historyState.page, historyState.pageSize);
  historyState.page = sliced.page;
  historyState.total = sliced.total;
  historyState.totalPages = sliced.totalPages;
  historyState.hasNext = sliced.hasNext;
  historyState.hasPrev = sliced.hasPrev;
  renderHistoryRows(sliced.rows);
  updateSortHeaders(historyTable, historyState);
  updateHistoryPaginationUi(sliced.total);
}

function resetHistoryAccordion() {
  historyState.loaded = false;
  historyState.loading = false;
  historyState.page = 1;
  historyAllTransactions = [];
  historyHint.textContent = t("progress.historyHint");
  historyPagination.hidden = true;
  purchasesBody.innerHTML =
    `<tr><td colspan="10" class="empty">${t("progress.historyEmpty")}</td></tr>`;
}

async function loadPositions() {
  const res = await fetch("/api/positions");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || t("progress.failPositions"));
  positions = data.positions || [];
  renderSymbolOptions();
  updateOwnedHint();
}

async function loadPurchaseHistory({ force = false, quiet = false } = {}) {
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false)) {
    historyHint.textContent = t("progress.signinHistory");
    purchasesBody.innerHTML =
      `<tr><td colspan="10" class="empty">Sign in to view transaction history.</td></tr>`;
    return;
  }
  if (historyState.loading) return;
  if (historyState.loaded && !force) {
    showHistoryPage();
    return;
  }

  historyState.loading = true;
  if (!quiet) {
    historyHint.textContent = t("common.loading");
    purchasesBody.innerHTML =
      `<tr><td colspan="10" class="empty">Loading transaction history…</td></tr>`;
  }
  updateHistoryPaginationUi();

  const params = new URLSearchParams({
    page: "1",
    page_size: "all",
  });

  try {
    const res = await fetch(`/api/transactions?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || t("progress.failTx"));

    historyAllTransactions = data.transactions || [];
    historyState.loaded = true;
    historyState.loading = false;
    historyState.page = 1;
    showHistoryPage();
  } catch (err) {
    historyState.loading = false;
    historyState.loaded = false;
    historyHint.textContent = t("common.failedLoad");
    purchasesBody.innerHTML =
      `<tr><td colspan="10" class="empty">${escapeHtml(err.message || t("progress.failTx"))}</td></tr>`;
    historyPagination.hidden = true;
  }
}

function setPageLoading(isLoading, message = t("progress.loading")) {
  if (!pageLoader) return;
  pageLoader.hidden = !isLoading;
  if (pageLoaderText) pageLoaderText.textContent = message;
  document.body.classList.toggle("is-loading", Boolean(isLoading));
}

async function loadProgress({ silent = false, force = false } = {}) {
  if (!silent) {
    setPageLoading(true, t("progress.loadingLive"));
    currencySections.innerHTML = `
      <div class="inline-loading">
        <div class="spinner spinner-sm" aria-hidden="true"></div>
        <span>Loading live prices…</span>
      </div>
    `;
  } else {
    updateProgressRefreshStatus(new Date(), { refreshing: true });
  }
  const openCurrencies = silent ? openHoldingsCurrencies() : [];
  try {
    progressFullLoaded = false;
    progressCache = null;
    const data = await window.SbpCache.fetchKey(window.SbpCache.KEYS.progress, { force });
    renderProgress(data, { restoreOpen: openCurrencies });
    await loadPositions();
    if (historyAccordion.open) {
      await loadPurchaseHistory({ force: true, quiet: silent });
    } else if (!silent) {
      resetHistoryAccordion();
    } else {
      historyState.loaded = false;
      historyHint.textContent = t("progress.historyHint");
    }
    if (!lotsAccordion.open && !silent) {
      resetLotsAccordion();
    }
  } finally {
    if (!silent) setPageLoading(false);
    else updateProgressRefreshStatus(new Date());
  }
}

function updateProgressRefreshStatus(when = new Date(), { refreshing = false } = {}) {
  if (!progressStatus) return;
  if (refreshing) {
    progressStatus.textContent = t("common.refreshing");
    return;
  }
  const time = when.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  progressStatus.textContent = t("progress.refreshed", { time });
}

function bindProgressRefresh() {
  if (progressRefreshBound || !progressRefreshBtn || !window.SbpCache?.bindRefreshButton) return;
  progressRefreshBound = true;
  window.SbpCache.bindRefreshButton(
    progressRefreshBtn,
    window.SbpCache.KEYS.progress,
    {
      onStart: () => updateProgressRefreshStatus(new Date(), { refreshing: true }),
      onDone: (data) => {
        applyProgressSnapshot(data, { restoreOpen: openHoldingsCurrencies() });
        loadPositions().catch(() => {});
        updateProgressRefreshStatus(new Date());
      },
      onError: (err) => {
        if (err.code === "RATE_LIMITED") {
          if (progressStatus) progressStatus.textContent = err.message;
          return;
        }
        showError(err.message || t("common.refreshFailed"));
        updateProgressRefreshStatus(new Date());
      },
    }
  );
}

function applyProgressSnapshot(data, { restoreOpen = [] } = {}) {
  renderProgress(data, { restoreOpen });
}

async function bootProgress() {
  bindProgressRefresh();

  try {
    await loadProgress({ silent: false });
  } catch (err) {
    showError(err.message || t("progress.failProgress"));
    setPageLoading(false);
    if (progressStatus) progressStatus.textContent = t("common.failedLoad");
    currencySections.innerHTML =
      `<p class="empty-copy">${escapeHtml(err.message || t("progress.failProgress"))}</p>`;
  }
}

tabBuy.addEventListener("click", () => setTradeMode("buy"));
tabSell.addEventListener("click", () => setTradeMode("sell"));
symbolInput.addEventListener("input", updateOwnedHint);
symbolInput.addEventListener("change", updateOwnedHint);

fillPriceBtn.addEventListener("click", async () => {
  showError("");
  showOk("");
  fillPriceBtn.disabled = true;
  try {
    const symbol = symbolInput.value.trim();
    const res = await fetch(
      `/api/quote/${encodeURIComponent(symbol)}?include_dividends=true`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || t("progress.quoteFailed"));
    document.getElementById("price_per_share").value = data.price;
    const yieldNote =
      data.dividend && data.dividend.pays_dividend
        ? ` · yield ${num(data.dividend.yield_pct, 2)}%`
        : "";
    if (data.requested_symbol) {
      symbolInput.value = data.symbol;
      showOk(
        `Filled ${data.symbol} (from ${data.requested_symbol}) at ${money(data.price, data.currency)}${yieldNote}`
      );
    } else {
      showOk(`Filled ${data.symbol} at ${money(data.price, data.currency)}${yieldNote}`);
    }
  } catch (err) {
    showError(err.message || t("progress.liveFailed"));
  } finally {
    fillPriceBtn.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false)) {
    window.location.href = window.SbpAuth?.loginUrl?.("/progress") || "/login?next=%2Fprogress";
    return;
  }
  showError("");
  showOk("");
  submitBtn.disabled = true;
  submitBtn.textContent = tradeMode === "sell" ? t("progress.savingSell") : t("progress.savingBuy");

  const priceRaw = document.getElementById("price_per_share").value.trim();
  const symbol = symbolInput.value.trim();
  const shares = Number(document.getElementById("shares").value);
  const notes = notesInput.value.trim() || null;
  const dateValue = tradeDate.value;

  try {
    let res;
    if (tradeMode === "sell") {
      res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          shares,
          sold_at: dateValue,
          notes,
          price_per_share: priceRaw === "" ? null : Number(priceRaw),
        }),
      });
    } else {
      res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          shares,
          purchased_at: dateValue,
          notes,
          price_per_share: priceRaw === "" ? null : Number(priceRaw),
        }),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg || d).join(", ")
        : data.detail;
      throw new Error(detail || t("progress.saveFailed"));
    }

    notesInput.value = "";
    if (tradeMode === "sell") {
      showOk(
        `Sold ${num(data.shares, 4)} ${data.symbol} @ ${money(data.price_per_share, data.currency)} · realized ${money(data.realized_gain, data.currency)}`
      );
    } else {
      showOk(
        `Bought ${num(data.shares, 4)} ${data.symbol} @ ${money(data.price_per_share, data.currency)}`
      );
    }
    historyState.page = 1;
    lotsState.page = 1;
    const lotsWereOpen = lotsAccordion.open;
    try {
      await loadProgress({ silent: true, force: true });
      if (historyAccordion.open) {
        await loadPurchaseHistory({ force: true, quiet: true });
      }
      if (lotsWereOpen) {
        lotsAccordion.open = true;
        showLotsPage();
      }
    } catch (refreshErr) {
      showError(
        refreshErr.message || t("progress.savedNoRefresh")
      );
    }
  } catch (err) {
    showError(err.message || t("common.somethingWrong"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = tradeMode === "sell" ? t("progress.saveSell") : t("progress.saveBuy");
  }
});

purchasesBody.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-delete]");
  if (!btn) return;
  await deletePurchase(btn.getAttribute("data-delete"));
});

lotsBody.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-delete]");
  if (!btn) return;
  await deletePurchase(btn.getAttribute("data-delete"));
});

async function deletePurchase(id) {
  if (!id) return;
  if (!confirm(t("progress.deleteLot"))) return;
  try {
    const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || t("progress.deleteFailed"));
    showOk(t("progress.deleted"));
    const lotsWereOpen = lotsAccordion.open;
    await loadProgress({ silent: true, force: true });
    if (historyAccordion.open) {
      await loadPurchaseHistory({ force: true, quiet: true });
    }
    if (lotsWereOpen) {
      lotsAccordion.open = true;
      showLotsPage();
    }
  } catch (err) {
    showError(err.message || t("progress.deleteFailed"));
  }
}

currencySections.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-open-holdings]");
  if (!btn) return;
  openHoldingsModal(btn.getAttribute("data-open-holdings"));
});

holdingsModal?.addEventListener("click", (event) => {
  if (event.target.closest("[data-holdings-modal-close]")) {
    closeHoldingsModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && holdingsModal && !holdingsModal.hidden) {
    closeHoldingsModal();
  }
});

lotsAccordion.addEventListener("toggle", async () => {
  if (!lotsAccordion.open) return;
  try {
    if (!progressFullLoaded) {
      lotsHint.textContent = t("common.loading");
      await ensureFullProgress();
    }
    showLotsPage();
  } catch (err) {
    showError(err.message || t("progress.failLots"));
    lotsHint.textContent = t("common.failedLoad");
  }
});

lotsPageSize.addEventListener("change", () => {
  lotsState.pageSize = lotsPageSize.value;
  lotsState.page = 1;
  if (lotsAccordion.open) showLotsPage();
});

lotsSearch?.addEventListener("input", () => {
  lotsState.search = lotsSearch.value;
  lotsState.page = 1;
  if (lotsAccordion.open) showLotsPage();
});

lotsPrev.addEventListener("click", () => {
  if (!lotsState.hasPrev) return;
  lotsState.page -= 1;
  showLotsPage();
});

lotsNext.addEventListener("click", () => {
  if (!lotsState.hasNext) return;
  lotsState.page += 1;
  showLotsPage();
});

historyAccordion.addEventListener("toggle", () => {
  if (historyAccordion.open) {
    loadPurchaseHistory();
  }
});

historyPageSize.addEventListener("change", async () => {
  historyState.pageSize = historyPageSize.value;
  historyState.page = 1;
  if (historyAccordion.open) showHistoryPage();
});

historySearch?.addEventListener("input", () => {
  historyState.search = historySearch.value;
  historyState.page = 1;
  if (historyAccordion.open && historyState.loaded) showHistoryPage();
});

historyPrev.addEventListener("click", async () => {
  if (!historyState.hasPrev) return;
  historyState.page -= 1;
  showHistoryPage();
});

historyNext.addEventListener("click", async () => {
  if (!historyState.hasNext) return;
  historyState.page += 1;
  showHistoryPage();
});

function applySymbolPrefill() {
  const ctx = window.SbpListTools?.consumeSymbolContext?.();
  if (!ctx?.symbol || !symbolInput) return;
  symbolInput.value = ctx.symbol;
  if (ctx.shares) document.getElementById("shares").value = ctx.shares;
  if (ctx.price) document.getElementById("price_per_share").value = ctx.price;
  setTradeMode("buy");
}

function focusSymbolHistory(symbol) {
  if (!symbol) return;
  closeHoldingsModal();
  if (historySearch) historySearch.value = symbol;
  historyState.search = symbol;
  historyState.page = 1;
  if (historyAccordion) {
    historyAccordion.open = true;
    historyAccordion.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  loadPurchaseHistory({ force: !historyState.loaded }).then(() => showHistoryPage());
}

function consumeHistorySymbol() {
  let symbol = "";
  try {
    symbol = sessionStorage.getItem("sbp:history-symbol") || "";
    if (symbol) sessionStorage.removeItem("sbp:history-symbol");
  } catch {
    symbol = "";
  }
  if (symbol) focusSymbolHistory(symbol);
}

window.addEventListener("DOMContentLoaded", () => {
  tradeDate.value = todayLocalISO();
  applySymbolPrefill();
  historyPageSize.value = historyState.pageSize;
  lotsPageSize.value = lotsState.pageSize;
  setTradeMode("buy");
  window.SbpListTools?.bindRowActions?.(document.getElementById("holdings-modal"));
  bindSortableTable(lotsTable, lotsState, showLotsPage);
  bindSortableTable(historyTable, historyState, () => {
    if (historyAccordion.open && historyState.loaded) showHistoryPage();
  });

  window.SbpProgress = { focusSymbolHistory };
  const start = () => {
    bootProgress().finally(() => consumeHistorySymbol());
  };
  if (window.SbpAuth?.whenAuthReady) {
    window.SbpAuth.whenAuthReady(start);
  } else {
    start();
  }
});
