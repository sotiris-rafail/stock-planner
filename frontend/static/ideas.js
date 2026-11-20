const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const ideasSections = document.getElementById("ideas-sections");
const ideasStatus = document.getElementById("ideas-status");
const ideasDisclaimer = document.getElementById("ideas-disclaimer");
const ideasRefreshBtn = document.getElementById("ideas-refresh-btn");
const ideasCompareRoot = document.getElementById("ideas-compare");
const ideasSearch = document.getElementById("ideas-search");
const ideasSort = document.getElementById("ideas-sort");
const tabButtons = [...document.querySelectorAll("[data-ideas-tab]")];
const tools = () => window.SbpListTools || {};

const TAB_KEY = "sbp:ideas-tab";
const helpIcon = (text) => (window.SbpI18n?.helpIcon ? window.SbpI18n.helpIcon(text) : "");

function readSavedTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === "owned" || saved === "us" || saved === "eu") return saved;
  } catch {
    /* ignore */
  }
  return "owned";
}

let lastRenderedFingerprint = null;
let ideasRefreshBound = false;
let latestData = null;
let years = [];
let ideasTab = readSavedTab();
let searchQuery = "";
let sortKey = "name";
let trackedSymbols = new Set();
let controlsBound = false;
let tabAutoPicked = false;
let compareItems = [];
let compareHint = "";
let compareBound = false;
const COMPARE_MAX = 4;

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

function sharesFmt(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n);
}

function growthClass(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  if (Number(value) > 0) return "good";
  if (Number(value) < 0) return "bad";
  return "";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function payloadFingerprint(data) {
  const rows = [...(data.owned || []), ...(data.items || [])];
  return rows
    .map((row) => {
      const divs = Object.entries(row.dividends_by_year || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([y, v]) => `${y}:${v}`)
        .join(",");
      return [
        row.symbol,
        row.owned ? "1" : "0",
        row.owned_shares,
        row.price,
        row.change_6m_pct,
        row.dividend_yield_pct,
        divs,
        row.error || "",
      ].join("|");
    })
    .sort()
    .join(";");
}

function ownedBadge(item) {
  if (!item.owned) return "";
  const shares =
    item.owned_shares != null ? ` · ${sharesFmt(item.owned_shares)} sh` : "";
  const sym =
    item.owned_symbol && item.owned_symbol !== item.symbol
      ? ` (${escapeHtml(item.owned_symbol)})`
      : "";
  return `<span class="owned-badge" title="${t("ideas.ownedTitle")}">${t("ideas.owned")}${sym}${shares}</span>`;
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

function persistIdeasCompare() {
  tools().saveCompare?.("ideas", {
    tab: ideasTab,
    symbols: compareItems.map((item) => item.symbol),
  });
}

function actionButtons(item) {
  const symbol = item.symbol || "";
  const tracked = trackedSymbols.has(symbol.toUpperCase());
  const trackLabel = tracked ? t("list.trackedShort") : t("list.trackShort");
  return `
    <div class="row-actions">
      <button type="button" class="row-action" data-add-track="${escapeHtml(symbol)}" ${tracked ? "disabled" : ""}>${escapeHtml(trackLabel)}</button>
      <button type="button" class="row-action row-action-plan" data-open-plan="${escapeHtml(symbol)}">${t("list.plan")}</button>
      <button type="button" class="row-action" data-open-suggestions="${escapeHtml(symbol)}">${t("ideas.inSuggestions")}</button>
    </div>
  `;
}

function areaKey(item) {
  return item.region || ideasTab || "";
}

function addCompare(item) {
  const symbol = String(item.symbol || "").toUpperCase();
  if (!symbol || isCompared(symbol)) return true;
  if (compareItems.length >= COMPARE_MAX) {
    compareHint = t("compare.max", { n: COMPARE_MAX });
    renderCompare();
    return false;
  }
  if (compareItems.length && areaKey(compareItems[0]) !== areaKey(item)) {
    compareHint = t("compare.sameArea", {
      region: compareItems[0].region || ideasTab,
      theme: ideasTab,
    });
    renderCompare();
    return false;
  }
  compareItems = [...compareItems, item];
  compareHint = "";
  persistIdeasCompare();
  renderCompare();
  return true;
}

function removeCompare(symbol) {
  const key = String(symbol || "").toUpperCase();
  compareItems = compareItems.filter((item) => String(item.symbol || "").toUpperCase() !== key);
  compareHint = "";
  persistIdeasCompare();
  renderCompare();
  document.querySelectorAll("[data-compare-symbol]").forEach((input) => {
    input.checked = isCompared(input.getAttribute("data-compare-symbol"));
  });
}

function renderCompare() {
  if (!ideasCompareRoot) return;
  if (!compareItems.length) {
    ideasCompareRoot.hidden = !compareHint;
    ideasCompareRoot.innerHTML = compareHint ? `<p class="compare-hint is-warn">${escapeHtml(compareHint)}</p>` : "";
    return;
  }
  const mixedFx = new Set(compareItems.map((item) => item.currency).filter(Boolean)).size > 1;
  const heads = compareItems
    .map(
      (item) => `<th><div class="compare-col-head"><strong>${escapeHtml(item.name)}</strong>
        <button type="button" data-compare-remove="${escapeHtml(item.symbol)}">${t("compare.remove", { symbol: item.symbol })}</button></div>
        <div class="sub">${escapeHtml(item.symbol)}</div></th>`
    )
    .join("");
  const cells = (fn) => compareItems.map((item, i) => `<td>${fn(item, i)}</td>`).join("");
  ideasCompareRoot.hidden = false;
  ideasCompareRoot.innerHTML = `
    <div class="compare-strip-head">
      <h2>${t("compare.title")}</h2>
      <button type="button" class="row-action" data-compare-clear>${t("compare.clear")}</button>
    </div>
    ${
      compareItems.length < 2
        ? `<p class="compare-hint">${t("compare.needTwo")}</p>`
        : `<div class="table-wrap"><table class="compare-table">
            <thead><tr><th></th>${heads}</tr></thead>
            <tbody>
              <tr><th>${t("ideas.colPrice")}</th>${cells((item) => money(item.price, item.currency))}</tr>
              <tr><th>${t("ideas.col6m")}</th>${cells((item) => `<span class="${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</span>`)}</tr>
              <tr><th>${t("ideas.colYield")}</th>${cells((item) => (item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)))}</tr>
            </tbody>
          </table></div>
          <div class="row-actions">${compareItems
            .map(
              (item) =>
                `<button type="button" class="row-action" data-open-plan="${escapeHtml(item.symbol)}">${t("list.plan")} ${escapeHtml(item.symbol)}</button>
                 <button type="button" class="row-action" data-add-track="${escapeHtml(item.symbol)}">${t("list.trackShort")} ${escapeHtml(item.symbol)}</button>`
            )
            .join("")}</div>`
    }
    ${mixedFx ? `<p class="compare-hint is-warn">${t("compare.fx")}</p>` : ""}
    <p class="compare-hint">${t("compare.note")}</p>
  `;
  tools().bindRowActions?.(ideasCompareRoot);
}

function bindIdeasCompare() {
  if (compareBound) return;
  compareBound = true;
  ideasSections?.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-compare-symbol]");
    if (!input) return;
    const symbol = input.getAttribute("data-compare-symbol");
    const item = itemsForTab().find((row) => String(row.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!item) {
      input.checked = false;
      return;
    }
    if (input.checked) {
      if (!addCompare(item)) input.checked = false;
    } else {
      removeCompare(symbol);
    }
  });
  ideasCompareRoot?.addEventListener("click", (event) => {
    if (event.target.closest("[data-compare-clear]")) {
      compareItems = [];
      persistIdeasCompare();
      renderCompare();
      document.querySelectorAll("[data-compare-symbol]").forEach((input) => {
        input.checked = false;
      });
      return;
    }
    const remove = event.target.closest("[data-compare-remove]");
    if (remove) removeCompare(remove.getAttribute("data-compare-remove"));
  });
}

function itemsForTab() {
  if (!latestData) return [];
  const owned = latestData.owned || [];
  const items = latestData.items || [];
  if (ideasTab === "owned") return owned;
  if (ideasTab === "us") return items.filter((i) => i.region === "US");
  if (ideasTab === "eu") return items.filter((i) => i.region === "EU");
  return items;
}

function filteredItems() {
  const q = searchQuery.trim().toLowerCase();
  let rows = itemsForTab();
  if (q) {
    rows = rows.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const symbol = String(item.symbol || "").toLowerCase();
      return name.includes(q) || symbol.includes(q);
    });
  }
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortKey === "yield") return (Number(b.dividend_yield_pct) || 0) - (Number(a.dividend_yield_pct) || 0);
    if (sortKey === "6m") return (Number(b.change_6m_pct) || 0) - (Number(a.change_6m_pct) || 0);
    return String(a.name || a.symbol || "").localeCompare(String(b.name || b.symbol || ""), undefined, {
      sensitivity: "base",
    });
  });
  return copy;
}

function sparkFor(item) {
  const series = tools().dividendSeries?.(years, item.dividends_by_year) || [];
  const falling = tools().dividendsFalling?.(series);
  const svg = tools().sparkline?.(series, falling) || "";
  const amounts = years
    .map((y) => `${y}: ${money(item.dividends_by_year?.[y], item.currency)}`)
    .join(" · ");
  const tip = falling ? `${t("ideas.falling")} ${amounts}` : amounts;
  return `<span class="spark-wrap" title="${escapeHtml(tip)}">${svg}${falling ? `<span class="falling-flag">${t("ideas.fallingShort")}</span>` : ""}</span>`;
}

function renderRow(item, { showShares = false } = {}) {
  const err = item.error ? `<div class="sub bad">${escapeHtml(item.error)}</div>` : "";
  const sharesCell = showShares ? `<td class="col-shares">${sharesFmt(item.owned_shares)}</td>` : "";
  const rowClass = [item.owned ? "ideas-row-owned" : "", item.error ? "is-muted-row" : ""].filter(Boolean).join(" ");
  return `
    <tr class="${rowClass}">
      <td class="compare-cell">${compareCheckbox(item)}</td>
      <td class="col-name">
        <div class="stock-name">
          <span class="stock-name-text">
            <span class="ideas-name-line">
              ${item.owned ? '<span class="owned-dot" aria-hidden="true"></span>' : ""}
              <button type="button" class="sheet-name" data-open-sheet="${escapeHtml(item.symbol)}">${escapeHtml(item.name)}</button>
              ${ownedBadge(item)}
            </span>
            <span class="sub">${escapeHtml(item.symbol)}${item.region ? ` · ${escapeHtml(item.region)}` : ""}</span>
            ${err}
          </span>
        </div>
      </td>
      ${sharesCell}
      <td class="col-num">${money(item.price, item.currency)}</td>
      <td class="col-num ${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</td>
      <td class="col-num">${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</td>
      <td class="col-trend">${sparkFor(item)}</td>
      <td class="col-actions">${actionButtons(item)}</td>
    </tr>
  `;
}

function renderCard(item) {
  return `
    <article class="suggestion-card">
      <h3><button type="button" class="sheet-name" data-open-sheet="${escapeHtml(item.symbol)}">${escapeHtml(item.name)}</button> ${ownedBadge(item)}</h3>
      <p class="sub">${escapeHtml(item.symbol)} · ${escapeHtml(item.region || "")}</p>
      <dl>
        <div><dt>${t("ideas.colPrice")}</dt><dd>${money(item.price, item.currency)}</dd></div>
        <div><dt>${t("ideas.col6m")}</dt><dd class="${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</dd></div>
        <div><dt>${t("ideas.colYield")}</dt><dd>${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</dd></div>
      </dl>
      ${sparkFor(item)}
      ${actionButtons(item)}
    </article>
  `;
}

function tabTitle() {
  if (ideasTab === "owned") return t("ideas.owned");
  if (ideasTab === "us") return t("ideas.previewUs");
  return t("ideas.previewEu");
}

function renderBoard() {
  if (!ideasSections || !latestData) return;
  const items = filteredItems();
  const showShares = ideasTab === "owned";
  const sharesHeader = showShares ? `<th class="col-shares">${t("ideas.ownedShares")}</th>` : "";
  if (!items.length) {
    ideasSections.innerHTML = `
      <article class="currency-card ideas-card">
        <div class="currency-head">
          <h2 class="panel-title">${escapeHtml(tabTitle())}</h2>
          <span class="currency-pill">${t("ideas.stocksN", { n: 0 })}</span>
        </div>
        <p class="lede ideas-empty">${t("ideas.noMatch")}</p>
      </article>
    `;
    return;
  }
  ideasSections.innerHTML = `
    <article class="currency-card ideas-card">
      <div class="currency-head">
        <h2 class="panel-title">${escapeHtml(tabTitle())}</h2>
        <span class="currency-pill">${t("ideas.stocksN", { n: items.length })}</span>
      </div>
      <div class="table-wrap suggestions-scroll-wrap">
        <table class="ideas-table">
          <colgroup>
            <col class="col-check" />
            <col class="col-name" />
            ${showShares ? `<col class="col-shares" />` : ""}
            <col class="col-num" />
            <col class="col-num" />
            <col class="col-num" />
            <col class="col-trend" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="compare-cell" title="${escapeHtml(t("compare.col"))}">
                <span class="material-symbols-outlined compare-col-icon" aria-hidden="true">compare_arrows</span>
                <span class="compare-pick-label">${t("compare.col")}</span>
              </th>
              <th class="col-name">${t("ideas.colStock")}</th>
              ${sharesHeader}
              <th class="col-num">${t("ideas.colPrice")}</th>
              <th class="col-num th-help">${t("ideas.col6m")} ${helpIcon(t("suggestions.tip6m"))}</th>
              <th class="col-num th-help">${t("ideas.colYield")} ${helpIcon(t("suggestions.tipYield"))}</th>
              <th class="col-trend">${t("ideas.trend")}</th>
              <th class="col-actions">${t("list.actions")}</th>
            </tr>
          </thead>
          <tbody>${items.map((item) => renderRow(item, { showShares })).join("")}</tbody>
        </table>
      </div>
      <div class="suggestions-cards ideas-cards">${items.map((item) => renderCard(item)).join("")}</div>
    </article>
  `;
  tools().bindRowActions?.(ideasSections, {
    onTracked: (symbol) => {
      trackedSymbols.add(String(symbol || "").toUpperCase());
      renderBoard();
    },
  });
}

function syncTabs() {
  for (const btn of tabButtons) {
    const isActive = btn.dataset.ideasTab === ideasTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

function setIdeasTab(tab) {
  ideasTab = tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignore */
  }
  syncTabs();
  renderBoard();
}

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;
  syncTabs();
  for (const btn of tabButtons) {
    btn.addEventListener("click", () => setIdeasTab(btn.dataset.ideasTab));
  }
  ideasSearch?.addEventListener("input", () => {
    searchQuery = ideasSearch.value || "";
    renderBoard();
  });
  ideasSort?.addEventListener("change", () => {
    sortKey = ideasSort.value || "name";
    renderBoard();
  });
}

function updateIdeasStatus(data) {
  if (!ideasStatus) return;
  const asOf = data.as_of ? new Date(data.as_of) : null;
  const owned = data.owned || [];
  const checked = data.last_checked_at ? formatWhen(data.last_checked_at) : null;
  const boardAt = data.board_updated_at ? formatWhen(data.board_updated_at) : null;
  const ownedLabel = t("ideas.ownedN", { n: owned.length });
  if (data.data_changed === false && checked) {
    ideasStatus.textContent = t("ideas.noChanges", { time: checked, owned: ownedLabel });
    return;
  }
  ideasStatus.textContent = asOf
    ? t("ideas.updated", {
        time: asOf.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        owned: ownedLabel + (boardAt ? ` · ${t("ideas.board", { time: boardAt })}` : ""),
      })
    : t("ideas.ready");
}

function tabHasRows(data, tab) {
  const items = data.items || [];
  if (tab === "owned") return (data.owned || []).length > 0;
  if (tab === "us") return items.some((item) => item.region === "US");
  if (tab === "eu") return items.some((item) => item.region === "EU");
  return false;
}

function preferTabWithRows(data) {
  if (tabAutoPicked) return;
  tabAutoPicked = true;
  if (tabHasRows(data, ideasTab)) return;
  const fallback = ["owned", "us", "eu"].find((tab) => tabHasRows(data, tab));
  if (!fallback) return;
  ideasTab = fallback;
  syncTabs();
}

function renderIdeasPayload(data, { force = false } = {}) {
  latestData = data;
  years = data.years || [];
  preferTabWithRows(data);
  ideasDisclaimer.textContent = t("ideas.disclaimer", {
    minutes: data.quote_refresh_minutes || 15,
    hours: data.board_refresh_hours || 4,
  });
  const fingerprint = payloadFingerprint(data);
  const unchanged = !force && fingerprint === lastRenderedFingerprint;
  if (!unchanged) {
    lastRenderedFingerprint = fingerprint;
    const saved = tools().loadCompare?.("ideas");
    if (saved?.symbols?.length) {
      const pool = [...(data.owned || []), ...(data.items || [])];
      compareItems = saved.symbols
        .map((symbol) => pool.find((row) => String(row.symbol).toUpperCase() === String(symbol).toUpperCase()))
        .filter(Boolean);
    }
    renderBoard();
    renderCompare();
  }
  updateIdeasStatus(data);
}

function bindIdeasRefresh() {
  if (ideasRefreshBound || !ideasRefreshBtn || !window.SbpCache?.bindRefreshButton) return;
  ideasRefreshBound = true;
  window.SbpCache.bindRefreshButton(
    ideasRefreshBtn,
    window.SbpCache.KEYS.dividendIdeas,
    {
      onStart: () => {
        if (ideasStatus) ideasStatus.textContent = t("common.refreshing");
      },
      onDone: (data) => renderIdeasPayload(data, { force: true }),
      onError: (err) => {
        if (!ideasStatus) return;
        ideasStatus.textContent =
          err.code === "RATE_LIMITED" ? err.message : err.message || t("common.refreshFailed");
      },
    }
  );
}

async function loadTracked() {
  trackedSymbols = new Set();
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false) || !window.SbpCache) return;
  try {
    const data = await window.SbpCache.fetchKey(window.SbpCache.KEYS.watchlist);
    for (const item of data.items || []) {
      if (item.symbol) trackedSymbols.add(String(item.symbol).toUpperCase());
    }
  } catch {
    /* ignore */
  }
}

async function loadIdeas() {
  bindControls();
  bindIdeasCompare();
  bindIdeasRefresh();
  const ctx = tools().consumeSymbolContext?.();
  if (ctx?.symbol && ideasSearch) {
    ideasSearch.value = ctx.symbol;
    searchQuery = ctx.symbol;
  }
  showLoader(t("ideas.loading"));
  ideasStatus.textContent = t("common.fetching");
  try {
    await loadTracked();
    const data = await window.SbpCache.fetchKey(window.SbpCache.KEYS.dividendIdeas);
    renderIdeasPayload(data, { force: true });
  } catch (err) {
    ideasSections.innerHTML = `<p class="error">${escapeHtml(err.message || t("common.failedLoad"))}</p>`;
    ideasStatus.textContent = t("ideas.failed");
  } finally {
    hideLoader();
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", loadIdeas);
} else {
  loadIdeas();
}
