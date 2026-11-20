const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const suggestionsContent = document.getElementById("suggestions-content");
const suggestionsStatus = document.getElementById("suggestions-status");
const suggestionsDisclaimer = document.getElementById("suggestions-disclaimer");
const suggestionsSources = document.getElementById("suggestions-sources");
const suggestionsRefreshBtn = document.getElementById("suggestions-refresh-btn");
const tabButtons = [...document.querySelectorAll(".trade-tab[data-tab]")];
const searchInput = document.getElementById("suggestions-search");
const sortSelect = document.getElementById("suggestions-sort");
const regionSelect = document.getElementById("suggestions-region");
const themeSelect = document.getElementById("suggestions-theme");
const hideHeldInput = document.getElementById("suggestions-hide-held");
const compareRoot = document.getElementById("suggestions-compare");
const tools = () => window.SbpListTools || {};
const COMPARE_MAX = 4;

const SCROLL_BATCH = 25;
const TAB_KEY = "sbp:suggestions-tab";
const SCROLL_KEY = "sbp:suggestions-scroll";
const FILTER_KEY = "sbp:suggestions-filters";
const helpIcon = (text) =>
  window.SbpI18n?.helpIcon ? window.SbpI18n.helpIcon(text) : "";
const translateTheme = (name) =>
  window.SbpI18n?.translateTheme ? window.SbpI18n.translateTheme(name) : name || "";

function readSavedTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === "stocks" || saved === "etfs" || saved === "mutual_funds") return saved;
  } catch {
    /* ignore */
  }
  return "stocks";
}

function readSavedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}");
    return {
      sort: saved.sort === "name" || saved.sort === "yield" || saved.sort === "6m" ? saved.sort : "score",
      hideHeld: Boolean(saved.hideHeld),
      search: typeof saved.search === "string" ? saved.search : "",
    };
  } catch {
    return { sort: "score", hideHeld: false, search: "" };
  }
}

let activeTab = readSavedTab();
let latestPayload = null;
let tabItems = [];
let visibleCount = SCROLL_BATCH;
let scrollObserver = null;
let suggestionsRefreshBound = false;
let didRestoreScroll = false;
let trackedSymbols = new Set();
let ownedSymbols = new Set();
const savedFilters = readSavedFilters();
let searchQuery = savedFilters.search;
let sortKey = savedFilters.sort;
let regionFilter = "";
let themeFilter = "";
let hideHeld = savedFilters.hideHeld;
let compareItems = [];
let compareHint = "";
let compareBound = false;

function showLoader(text) {
  if (pageLoaderText) pageLoaderText.textContent = text || t("common.loading");
  if (pageLoader) pageLoader.hidden = false;
}

function hideLoader() {
  if (pageLoader) pageLoader.hidden = true;
}

function money(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const cur = currency || "";
  const n = Number(value);
  const digits = Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 10 ? 2 : 3;
  try {
    if (cur.length === 3) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: digits,
      }).format(n);
    }
  } catch {
    /* fall through */
  }
  return `${n.toFixed(digits)}${cur ? ` ${cur}` : ""}`;
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function growthClass(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  if (Number(value) > 0) return "pos";
  if (Number(value) < 0) return "neg";
  return "";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPriceSource(source) {
  if (!source) return "—";
  const map = {
    yahoo: "Yahoo Finance",
    stooq: "Stooq",
    "yahoo+stooq": "Yahoo + Stooq",
  };
  return map[source] || source;
}

function tableHeaders(category) {
  const showExpense = category === "etfs" || category === "mutual_funds";
  const yieldHeader = category === "stocks" ? t("suggestions.yield") : t("suggestions.yieldDist");
  const expenseHeader = showExpense ? `<th class="col-num">${t("suggestions.expense")}</th>` : "";
  return { showExpense, yieldHeader, expenseHeader };
}

function shortWhy(category) {
  if (category === "etfs") return t("suggestions.whyShortEtf");
  if (category === "mutual_funds") return t("suggestions.whyShortFund");
  return t("suggestions.whyShort");
}

function isCompared(symbol) {
  const key = String(symbol || "").toUpperCase();
  return compareItems.some((item) => String(item.symbol || "").toUpperCase() === key);
}

function compareCheckbox(item) {
  const symbol = item.symbol || "";
  const checked = isCompared(symbol) ? " checked" : "";
  return `<label class="compare-pick"><input type="checkbox" data-compare-symbol="${escapeHtml(symbol)}"${checked} /><span class="compare-pick-label">${t("compare.add")}</span></label>`;
}

function actionButtons(item) {
  const symbol = item.symbol || "";
  const tracked = trackedSymbols.has(symbol.toUpperCase());
  const trackLabel = tracked ? t("list.trackedShort") : t("list.trackShort");
  return `
    <div class="row-actions">
      <button type="button" class="row-action" data-add-track="${escapeHtml(symbol)}" ${tracked ? "disabled" : ""}>${escapeHtml(trackLabel)}</button>
      <button type="button" class="row-action row-action-plan" data-open-plan="${escapeHtml(symbol)}">${t("list.plan")}</button>
    </div>
  `;
}

function areaKey(item) {
  return `${item.region || ""}||${item.theme || ""}`;
}

function findTabItem(symbol) {
  const key = String(symbol || "").toUpperCase();
  const items = latestPayload?.tabs?.[activeTab]?.items || [];
  return items.find((item) => String(item.symbol || "").toUpperCase() === key) || null;
}

function bestFlags(items, key, { lower = false } = {}) {
  const nums = items.map((item) => Number(item[key]));
  const valid = nums.filter((n) => !Number.isNaN(n));
  if (!valid.length) return items.map(() => false);
  const target = lower ? Math.min(...valid) : Math.max(...valid);
  return nums.map((n) => n === target);
}

function addCompare(item) {
  const symbol = String(item.symbol || "").toUpperCase();
  if (!symbol) return false;
  if (isCompared(symbol)) return true;
  if (compareItems.length >= COMPARE_MAX) {
    compareHint = t("compare.max", { n: COMPARE_MAX });
    renderCompare();
    return false;
  }
  if (compareItems.length) {
    const first = compareItems[0];
    if (areaKey(first) !== areaKey(item)) {
      compareHint = t("compare.sameArea", {
        region: first.region || "—",
        theme: translateTheme(first.theme) || "—",
      });
      renderCompare();
      return false;
    }
  } else {
    regionFilter = item.region || "";
    themeFilter = item.theme || "";
    if (regionSelect) regionSelect.value = regionFilter;
    if (themeSelect) themeSelect.value = themeFilter;
    compareItems = [item];
    compareHint = "";
    persistSuggestionsCompare();
    renderActiveTab();
    renderCompare();
    return true;
  }
  compareItems = [...compareItems, item];
  compareHint = "";
  persistSuggestionsCompare();
  renderCompare();
  return true;
}

function removeCompare(symbol) {
  const key = String(symbol || "").toUpperCase();
  compareItems = compareItems.filter((item) => String(item.symbol || "").toUpperCase() !== key);
  compareHint = "";
  persistSuggestionsCompare();
  renderCompare();
  syncCompareChecks();
}

function persistSuggestionsCompare() {
  const all = tools().loadCompare?.("suggestions") || {};
  all[activeTab] = {
    symbols: compareItems.map((item) => item.symbol),
    region: compareItems[0]?.region || "",
    theme: compareItems[0]?.theme || "",
  };
  tools().saveCompare?.("suggestions", all);
}

function restoreSuggestionsCompare(rawItems) {
  const all = tools().loadCompare?.("suggestions") || {};
  const saved = all[activeTab];
  compareItems = (saved?.symbols || [])
    .map((symbol) =>
      (rawItems || []).find((row) => String(row.symbol).toUpperCase() === String(symbol).toUpperCase())
    )
    .filter(Boolean);
}

function clearCompare() {
  compareItems = [];
  compareHint = "";
  persistSuggestionsCompare();
  renderCompare();
  syncCompareChecks();
}

function syncCompareChecks() {
  document.querySelectorAll("[data-compare-symbol]").forEach((input) => {
    input.checked = isCompared(input.getAttribute("data-compare-symbol"));
  });
}

function renderCompare() {
  if (!compareRoot) return;
  if (!compareItems.length) {
    compareRoot.hidden = true;
    compareRoot.innerHTML = compareHint
      ? `<p class="compare-hint is-warn">${escapeHtml(compareHint)}</p>`
      : "";
    if (compareHint) compareRoot.hidden = false;
    return;
  }
  const first = compareItems[0];
  const area = `${first.region || "—"} · ${translateTheme(first.theme) || "—"}`;
  const mixedFx = new Set(compareItems.map((item) => item.currency).filter(Boolean)).size > 1;
  const showExpense = activeTab === "etfs" || activeTab === "mutual_funds";
  const scoreMax = maxScore(compareItems);
  const scoreBest = bestFlags(compareItems, "selection_score");
  const momBest = bestFlags(compareItems, "change_6m_pct");
  const yieldBest = bestFlags(compareItems, "dividend_yield_pct");
  const expBest = showExpense ? bestFlags(compareItems, "expense_ratio_pct", { lower: true }) : [];
  const heads = compareItems
    .map(
      (item) => `
        <th>
          <div class="compare-col-head">
            <strong>${escapeHtml(item.name)}</strong>
            <button type="button" data-compare-remove="${escapeHtml(item.symbol)}">${t("compare.remove", { symbol: item.symbol })}</button>
          </div>
          <div class="sub">${escapeHtml(item.symbol)}</div>
        </th>`
    )
    .join("");
  const cells = (renderCell) => compareItems.map((item, index) => `<td>${renderCell(item, index)}</td>`).join("");
  compareRoot.hidden = false;
  compareRoot.innerHTML = `
    <div class="compare-strip-head">
      <h2>${t("compare.title")} · ${escapeHtml(area)}</h2>
      <button type="button" class="row-action" data-compare-clear>${t("compare.clear")}</button>
    </div>
    ${
      compareItems.length < 2
        ? `<p class="compare-hint">${t("compare.needTwo")}</p>`
        : `<div class="table-wrap"><table class="compare-table">
            <thead><tr><th></th>${heads}</tr></thead>
            <tbody>
              <tr><th>${t("suggestions.colScore")}</th>${cells((item, i) => `<span class="${scoreBest[i] ? "is-best" : ""}">${tools().scoreBar?.(item.selection_score, scoreMax) || "—"}</span>`)}</tr>
              <tr><th>${t("suggestions.colPrice")}</th>${cells((item) => money(item.price, item.currency))}</tr>
              <tr><th>${t("suggestions.col6m")}</th>${cells((item, i) => `<span class="${growthClass(item.change_6m_pct)} ${momBest[i] ? "is-best" : ""}">${pct(item.change_6m_pct)}</span>`)}</tr>
              <tr><th>${activeTab === "stocks" ? t("suggestions.yield") : t("suggestions.yieldDist")}</th>${cells((item, i) => `<span class="${yieldBest[i] ? "is-best" : ""}">${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</span>`)}</tr>
              ${
                showExpense
                  ? `<tr><th>${t("suggestions.expense")}</th>${cells((item, i) => `<span class="${expBest[i] ? "is-best" : ""}">${item.expense_ratio_pct == null ? "—" : pct(item.expense_ratio_pct)}</span>`)}</tr>`
                  : ""
              }
              <tr><th>${t("suggestions.colSource")}</th>${cells((item) => escapeHtml(item.list_source || "—"))}</tr>
            </tbody>
          </table></div>`
    }
    ${
      compareItems.length >= 2
        ? `<div class="row-actions">${compareItems
            .map(
              (item) =>
                `<button type="button" class="row-action" data-open-plan="${escapeHtml(item.symbol)}">${t("list.plan")} ${escapeHtml(item.symbol)}</button>
                 <button type="button" class="row-action" data-add-track="${escapeHtml(item.symbol)}">${t("list.trackShort")} ${escapeHtml(item.symbol)}</button>`
            )
            .join("")}</div>`
        : ""
    }
    ${mixedFx ? `<p class="compare-hint is-warn">${t("compare.fx")}</p>` : ""}
    ${compareHint ? `<p class="compare-hint is-warn">${escapeHtml(compareHint)}</p>` : `<p class="compare-hint">${t("compare.note")}</p>`}
  `;
  tools().bindRowActions?.(compareRoot);
}

function bindCompare() {
  if (compareBound) return;
  compareBound = true;
  suggestionsContent?.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-compare-symbol]");
    if (!input) return;
    const item = findTabItem(input.getAttribute("data-compare-symbol"));
    if (!item) {
      input.checked = false;
      return;
    }
    if (input.checked) {
      if (!addCompare(item)) input.checked = false;
    } else {
      removeCompare(item.symbol);
    }
  });
  compareRoot?.addEventListener("click", (event) => {
    if (event.target.closest("[data-compare-clear]")) {
      event.preventDefault();
      clearCompare();
      return;
    }
    const remove = event.target.closest("[data-compare-remove]");
    if (remove) {
      event.preventDefault();
      removeCompare(remove.getAttribute("data-compare-remove"));
    }
  });
}

function maxScore(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.selection_score) || 0), 0);
}

function renderRow(item, category, scoreMax) {
  const { showExpense } = tableHeaders(category);
  const err = item.error
    ? `<div class="sub bad">${escapeHtml(item.error)}</div>`
    : "";
  const expenseCell = showExpense
    ? `<td class="col-num">${item.expense_ratio_pct == null ? "—" : pct(item.expense_ratio_pct)}</td>`
    : "";
  const scoreHtml = tools().scoreBar?.(item.selection_score, scoreMax) || "—";
  return `
    <tr class="${item.error ? "is-muted-row" : ""}">
      <td class="compare-cell">${compareCheckbox(item)}</td>
      <td class="col-name">
        <div class="stock-name">
          <span class="stock-name-text">
            <button type="button" class="sheet-name" data-open-sheet="${escapeHtml(item.symbol)}">${escapeHtml(item.name)}</button>
            <span class="sub">${escapeHtml(item.symbol)} · ${escapeHtml(item.region)}</span>
            ${err}
          </span>
        </div>
      </td>
      <td class="col-score">${scoreHtml}</td>
      <td class="col-source"><button type="button" class="source-pill source-pill-btn" data-filter-source="${escapeHtml(item.list_source)}">${escapeHtml(item.list_source)}</button></td>
      <td class="col-theme">${escapeHtml(translateTheme(item.theme))}</td>
      <td class="col-num">${money(item.price, item.currency)}</td>
      <td class="col-num ${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</td>
      <td class="col-num">${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</td>
      ${expenseCell}
      <td class="col-data"><span class="source-pill source-pill-data">${escapeHtml(formatPriceSource(item.price_source))}</span></td>
      <td class="col-actions">${actionButtons(item)}</td>
    </tr>
  `;
}

function loc() {
  return document.documentElement.lang === "el" ? "el-GR" : undefined;
}

function whyTipKey(category) {
  if (category === "etfs") return "suggestions.whyTipEtfs";
  if (category === "mutual_funds") return "suggestions.whyTipFunds";
  return "suggestions.whyTip";
}

function translateReason(reason, category) {
  if (!reason) return "—";
  const scoreMatch = reason.match(/score\s+([\d.]+)/i);
  const expenseMatch = reason.match(/\(([\d.]+)% exp/);
  if (/size \+ 6m momentum/i.test(reason) && scoreMatch) {
    return t("suggestions.reasonMomentum", { score: scoreMatch[1] });
  }
  if (/live index constituents/i.test(reason)) {
    return t("suggestions.reasonIndex");
  }
  if (category === "etfs" && expenseMatch) {
    return t("suggestions.reasonEtfFees", { expense: expenseMatch[1] });
  }
  if (category === "etfs" || /AUM and liquidity/i.test(reason)) {
    if (/AUM and liquidity/i.test(reason) && !expenseMatch) {
      return t("suggestions.reasonEtf");
    }
  }
  if (expenseMatch && /returns, fees/i.test(reason)) {
    return t("suggestions.reasonFundFees", { expense: expenseMatch[1] });
  }
  if (/provider fund universe/i.test(reason)) {
    return t("suggestions.reasonFund");
  }
  return reason;
}

function updateCountPill(shown, total) {
  const pill = document.getElementById("suggestions-count-pill");
  if (!pill) return;
  pill.textContent =
    shown >= total
      ? t("suggestions.itemsN", { total })
      : t("suggestions.showing", { shown, total });
}

function renderMobileCard(item, category, scoreMax) {
  return `
    <article class="suggestion-card">
      <div class="suggestion-card-head">
        ${compareCheckbox(item)}
        <div>
          <h3><button type="button" class="sheet-name" data-open-sheet="${escapeHtml(item.symbol)}">${escapeHtml(item.name)}</button></h3>
          <p class="sub">${escapeHtml(item.symbol)} · ${escapeHtml(item.region || "")} · ${escapeHtml(translateTheme(item.theme))}</p>
        </div>
      </div>
      ${tools().scoreBar?.(item.selection_score, scoreMax) || ""}
      <dl>
        <div><dt>${t("suggestions.colPrice")}</dt><dd>${money(item.price, item.currency)}</dd></div>
        <div><dt>${t("suggestions.col6m")}</dt><dd class="${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</dd></div>
        <div><dt>${category === "stocks" ? t("suggestions.yield") : t("suggestions.yieldDist")}</dt><dd>${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</dd></div>
      </dl>
      <button type="button" class="source-pill source-pill-btn" data-filter-source="${escapeHtml(item.list_source)}">${escapeHtml(item.list_source)}</button>
      ${actionButtons(item)}
    </article>
  `;
}

function appendRows(start, end) {
  const tbody = document.getElementById("suggestions-tbody");
  const cards = document.getElementById("suggestions-cards");
  const slice = tabItems.slice(start, end);
  if (!slice.length) return;
  const scoreMax = maxScore(tabItems);
  if (tbody) {
    tbody.insertAdjacentHTML(
      "beforeend",
      slice.map((item) => renderRow(item, activeTab, scoreMax)).join("")
    );
  }
  if (cards) {
    cards.insertAdjacentHTML(
      "beforeend",
      slice.map((item) => renderMobileCard(item, activeTab, scoreMax)).join("")
    );
  }
  updateCountPill(end, tabItems.length);
}

function loadMoreRows() {
  if (visibleCount >= tabItems.length) return;
  const prev = visibleCount;
  visibleCount = Math.min(visibleCount + SCROLL_BATCH, tabItems.length);
  appendRows(prev, visibleCount);

  const hint = document.getElementById("suggestions-scroll-hint");
  if (hint) {
    hint.hidden = visibleCount >= tabItems.length;
  }

  if (visibleCount >= tabItems.length) {
    teardownInfiniteScroll();
    return;
  }

  // Keep loading while the sentinel is still on screen (e.g. short viewports).
  requestAnimationFrame(maybeLoadMoreIfNeeded);
}

function maybeLoadMoreIfNeeded() {
  const sentinel = document.getElementById("suggestions-sentinel");
  if (!sentinel || visibleCount >= tabItems.length) return;
  const rect = sentinel.getBoundingClientRect();
  if (rect.top <= window.innerHeight + 160) {
    loadMoreRows();
  }
}

function teardownInfiniteScroll() {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

function setupInfiniteScroll() {
  teardownInfiniteScroll();
  const sentinel = document.getElementById("suggestions-sentinel");
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        loadMoreRows();
      }
    },
    { root: null, rootMargin: "160px", threshold: 0 }
  );
  scrollObserver.observe(sentinel);
  requestAnimationFrame(maybeLoadMoreIfNeeded);
}

function renderTableShell(category, total) {
  const { expenseHeader, yieldHeader, showExpense } = tableHeaders(category);
  const initial = Math.min(SCROLL_BATCH, total);
  return `
    <article class="currency-card ideas-card">
      <div class="currency-head">
        <h2 class="panel-title">${t("suggestions.heading")}</h2>
        <span class="currency-pill" id="suggestions-count-pill">${t("suggestions.showing", { shown: initial, total })}</span>
      </div>
      <div class="table-wrap suggestions-scroll-wrap" id="suggestions-scroll">
        <table class="ideas-table suggestions-table">
          <colgroup>
            <col class="col-check" />
            <col class="col-name" />
            <col class="col-score" />
            <col class="col-source" />
            <col class="col-theme" />
            <col class="col-num" />
            <col class="col-num" />
            <col class="col-num" />
            ${showExpense ? `<col class="col-num" />` : ""}
            <col class="col-data" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="compare-cell th-help" title="${escapeHtml(t("compare.col"))}">
                <span class="material-symbols-outlined compare-col-icon" aria-hidden="true">compare_arrows</span>
                <span class="compare-pick-label">${t("compare.col")}</span>
                ${helpIcon(t("compare.needTwo"))}
              </th>
              <th class="col-name">${t("suggestions.colName")}</th>
              <th class="col-score th-help">${t("suggestions.colScore")} ${helpIcon(t(whyTipKey(category)))}</th>
              <th class="col-source th-help">${t("suggestions.colSource")} ${helpIcon(t("suggestions.tipSource"))}</th>
              <th class="col-theme">${t("suggestions.colTheme")}</th>
              <th class="col-num">${t("suggestions.colPrice")}</th>
              <th class="col-num th-help">${t("suggestions.col6m")} ${helpIcon(t("suggestions.tip6m"))}</th>
              <th class="col-num th-help">${yieldHeader} ${helpIcon(t("suggestions.tipYield"))}</th>
              ${expenseHeader}
              <th class="col-data">${t("suggestions.colData")}</th>
              <th class="col-actions">${t("list.actions")}</th>
            </tr>
          </thead>
          <tbody id="suggestions-tbody"></tbody>
        </table>
      </div>
      <div class="suggestions-cards" id="suggestions-cards"></div>
      <div id="suggestions-sentinel" class="suggestions-sentinel" aria-hidden="true"></div>
      <p class="sub suggestions-scroll-hint" id="suggestions-scroll-hint" hidden>${t("suggestions.scrollMore")}</p>
    </article>
  `;
}

function setActiveTab(tab) {
  activeTab = tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignore */
  }
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  persistSuggestionsCompare();
  compareItems = [];
  compareHint = "";
  renderActiveTab();
}

function restoreScroll() {
  if (didRestoreScroll) return;
  didRestoreScroll = true;
  try {
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || "0");
    if (y > 0) window.scrollTo(0, y);
  } catch {
    /* ignore */
  }
}

function persistFilters() {
  try {
    localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({ sort: sortKey, hideHeld, search: searchQuery })
    );
  } catch {
    /* ignore */
  }
}

function applyFilters(items) {
  const q = searchQuery.trim().toLowerCase();
  let rows = items || [];
  if (q) {
    rows = rows.filter((item) => {
      const hay = `${item.name || ""} ${item.symbol || ""} ${item.list_source || ""} ${item.theme || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (regionFilter) {
    rows = rows.filter((item) => String(item.region || "") === regionFilter);
  }
  if (themeFilter) {
    rows = rows.filter((item) => String(item.theme || "") === themeFilter);
  }
  if (hideHeld) {
    rows = rows.filter((item) => {
      const symbol = String(item.symbol || "").toUpperCase();
      return !trackedSymbols.has(symbol) && !ownedSymbols.has(symbol);
    });
  }
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortKey === "name") {
      return String(a.name || a.symbol || "").localeCompare(String(b.name || b.symbol || ""), undefined, {
        sensitivity: "base",
      });
    }
    if (sortKey === "yield") return (Number(b.dividend_yield_pct) || 0) - (Number(a.dividend_yield_pct) || 0);
    if (sortKey === "6m") return (Number(b.change_6m_pct) || 0) - (Number(a.change_6m_pct) || 0);
    return (Number(b.selection_score) || 0) - (Number(a.selection_score) || 0);
  });
  return copy;
}

function fillFilterOptions(items) {
  const regions = [...new Set(items.map((item) => item.region).filter(Boolean))].sort();
  const themes = [...new Set(items.map((item) => item.theme).filter(Boolean))].sort();
  if (regionSelect) {
    const current = regionFilter;
    regionSelect.innerHTML = `<option value="">${t("suggestions.allRegions")}</option>${regions
      .map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`)
      .join("")}`;
  }
  if (themeSelect) {
    const current = themeFilter;
    themeSelect.innerHTML = `<option value="">${t("suggestions.allThemes")}</option>${themes
      .map((value) => {
        const label = translateTheme(value);
        return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("")}`;
  }
}

function bindListActions() {
  if (!suggestionsContent || suggestionsContent.dataset.rowActionsBound) return;
  tools().bindRowActions?.(suggestionsContent, {
    onTracked: (symbol) => {
      trackedSymbols.add(String(symbol || "").toUpperCase());
      renderActiveTab();
    },
  });
  suggestionsContent.addEventListener("click", (event) => {
    const source = event.target.closest("[data-filter-source]");
    if (!source) return;
    searchQuery = source.getAttribute("data-filter-source") || "";
    if (searchInput) searchInput.value = searchQuery;
    persistFilters();
    renderActiveTab();
  });
}

function renderActiveTab() {
  if (!latestPayload || !suggestionsContent) return;
  const tabData = latestPayload.tabs?.[activeTab];
  if (!tabData) {
    suggestionsContent.innerHTML = `<p class="error">${t("suggestions.noTab")}</p>`;
    return;
  }

  const raw = tabData.items || [];
  restoreSuggestionsCompare(raw);
  fillFilterOptions(raw);
  tabItems = applyFilters(raw);
  visibleCount = Math.min(SCROLL_BATCH, tabItems.length);
  teardownInfiniteScroll();

  if (!tabItems.length) {
    suggestionsContent.innerHTML = `<p class="lede ideas-empty">${t("suggestions.emptyTab")}</p>`;
    return;
  }

  suggestionsContent.innerHTML = renderTableShell(activeTab, tabItems.length);
  appendRows(0, visibleCount);
  setupInfiniteScroll();
  restoreScroll();
  bindListActions();
  syncCompareChecks();
  renderCompare();

  const hint = document.getElementById("suggestions-scroll-hint");
  if (hint) {
    hint.hidden = tabItems.length <= SCROLL_BATCH;
  }
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(loc(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderSuggestionsPayload(data) {
  latestPayload = data;
  if (suggestionsDisclaimer) {
    suggestionsDisclaimer.textContent = t("suggestions.disclaimer", {
      hours: data.symbol_refresh_hours || 4,
      minutes: data.quote_refresh_minutes || 15,
    });
  }
  if (suggestionsSources) {
    const listSources = data.list_sources || [];
    const dataSources = data.data_sources || [];
    if (listSources.length || dataSources.length) {
      suggestionsSources.hidden = false;
      suggestionsSources.innerHTML = `
        <p class="section-subtitle">${t("suggestions.feeds")}</p>
        <div class="suggestions-source-list">
          ${listSources
            .map((s) => `<span class="source-pill">${escapeHtml(s)}</span>`)
            .join("")}
          ${dataSources
            .map((s) => `<span class="source-pill source-pill-data">${escapeHtml(s)}</span>`)
            .join("")}
        </div>
        ${
          data.symbols_updated_at
            ? `<p class="sub suggestions-meta">${t("suggestions.ranked", {
                time: formatWhen(data.symbols_updated_at),
              })}${
                data.next_symbols_refresh_at
                  ? ` · ${t("suggestions.nextRank", {
                      time: formatWhen(data.next_symbols_refresh_at),
                    })}`
                  : ""
              }</p>`
            : ""
        }
      `;
    }
  }
  renderActiveTab();
  const asOf = data.as_of ? new Date(data.as_of) : null;
  const tabData = data.tabs?.[activeTab];
  const count = tabData?.count ?? 0;
  if (suggestionsStatus) {
    const symAt = data.symbols_updated_at ? formatWhen(data.symbols_updated_at) : null;
    suggestionsStatus.textContent = asOf
      ? `${t("suggestions.quotes", {
          time: asOf.toLocaleTimeString(loc(), {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          count,
        })}${symAt ? ` · ${t("suggestions.rankedAt", { time: symAt })}` : ""}`
      : t("ideas.ready");
  }
}

function bindSuggestionsRefresh() {
  if (suggestionsRefreshBound || !suggestionsRefreshBtn || !window.SbpCache?.bindRefreshButton) {
    return;
  }
  suggestionsRefreshBound = true;
  window.SbpCache.bindRefreshButton(
    suggestionsRefreshBtn,
    window.SbpCache.KEYS.suggestions,
    {
      onStart: () => {
        if (suggestionsStatus) suggestionsStatus.textContent = t("common.refreshing");
      },
      onDone: (data) => renderSuggestionsPayload(data),
      onError: (err) => {
        if (!suggestionsStatus) return;
        suggestionsStatus.textContent =
          err.code === "RATE_LIMITED"
            ? err.message
            : err.message || t("common.refreshFailed");
      },
    }
  );
}

async function loadHeldSets() {
  trackedSymbols = new Set();
  ownedSymbols = new Set();
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false) || !window.SbpCache) return;
  try {
    const watch = await window.SbpCache.fetchKey(window.SbpCache.KEYS.watchlist);
    for (const item of watch.items || []) {
      if (item.symbol) trackedSymbols.add(String(item.symbol).toUpperCase());
    }
  } catch {
    /* ignore */
  }
  try {
    const progress = await window.SbpCache.fetchKey(window.SbpCache.KEYS.progress);
    for (const group of progress.by_currency || []) {
      for (const holding of group.holdings || []) {
        if (holding.symbol) ownedSymbols.add(String(holding.symbol).toUpperCase());
      }
    }
  } catch {
    /* ignore */
  }
}

function bindFilterControls() {
  if (searchInput) searchInput.value = searchQuery;
  if (sortSelect) sortSelect.value = sortKey;
  if (hideHeldInput) hideHeldInput.checked = hideHeld;
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    persistFilters();
    renderActiveTab();
  });
  sortSelect?.addEventListener("change", () => {
    sortKey = sortSelect.value || "score";
    persistFilters();
    renderActiveTab();
  });
  regionSelect?.addEventListener("change", () => {
    regionFilter = regionSelect.value || "";
    renderActiveTab();
  });
  themeSelect?.addEventListener("change", () => {
    themeFilter = themeSelect.value || "";
    renderActiveTab();
  });
  hideHeldInput?.addEventListener("change", () => {
    hideHeld = Boolean(hideHeldInput.checked);
    persistFilters();
    renderActiveTab();
  });
}

async function loadSuggestions() {
  bindCompare();
  bindFilterControls();
  const ctx = tools().consumeSymbolContext?.();
  if (ctx?.symbol && searchInput) {
    searchQuery = ctx.symbol;
    searchInput.value = ctx.symbol;
  }
  bindSuggestionsRefresh();
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === activeTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  }
  window.addEventListener(
    "scroll",
    () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      } catch {
        /* ignore */
      }
    },
    { passive: true }
  );

  showLoader(t("suggestions.loading"));
  if (suggestionsStatus) suggestionsStatus.textContent = t("common.fetching");
  try {
    await loadHeldSets();
    const data = await window.SbpCache.fetchKey(window.SbpCache.KEYS.suggestions);
    renderSuggestionsPayload(data);
  } catch (err) {
    if (suggestionsContent) {
      suggestionsContent.innerHTML = `<p class="error">${escapeHtml(err.message || t("common.failedLoad"))}</p>`;
    }
    if (suggestionsStatus) suggestionsStatus.textContent = t("common.failed");
  } finally {
    hideLoader();
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", loadSuggestions);
} else {
  loadSuggestions();
}
