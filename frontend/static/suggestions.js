const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const suggestionsContent = document.getElementById("suggestions-content");
const suggestionsStatus = document.getElementById("suggestions-status");
const suggestionsDisclaimer = document.getElementById("suggestions-disclaimer");
const suggestionsSources = document.getElementById("suggestions-sources");
const suggestionsRefreshBtn = document.getElementById("suggestions-refresh-btn");
const tabButtons = [...document.querySelectorAll(".trade-tab[data-tab]")];

const SCROLL_BATCH = 25;

let activeTab = "stocks";
let latestPayload = null;
let tabItems = [];
let visibleCount = SCROLL_BATCH;
let scrollObserver = null;
let suggestionsRefreshBound = false;

function showLoader(text) {
  if (pageLoaderText) pageLoaderText.textContent = text || "Loading…";
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
  const yieldHeader = category === "stocks" ? "Yield" : "Yield / dist.";
  const expenseHeader = showExpense ? "<th>Expense</th>" : "";
  return { showExpense, yieldHeader, expenseHeader };
}

function renderRow(item, category) {
  const { showExpense, yieldHeader } = tableHeaders(category);
  const err = item.error
    ? `<div class="sub bad">${escapeHtml(item.error)}</div>`
    : "";
  const expenseCell = showExpense
    ? `<td>${item.expense_ratio_pct == null ? "—" : pct(item.expense_ratio_pct)}</td>`
    : "";
  return `
    <tr>
      <td>
        <div class="stock-name">
          <span class="stock-name-text">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="sub">${escapeHtml(item.symbol)} · ${escapeHtml(item.region)}</span>
            ${err}
          </span>
        </div>
      </td>
      <td><span class="source-pill">${escapeHtml(item.list_source)}</span></td>
      <td class="notes">${escapeHtml(item.selection_reason || "—")}</td>
      <td>${escapeHtml(item.theme)}</td>
      <td>${money(item.price, item.currency)}</td>
      <td class="${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</td>
      <td>${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</td>
      ${expenseCell}
      <td><span class="source-pill source-pill-data">${escapeHtml(formatPriceSource(item.price_source))}</span></td>
    </tr>
  `;
}

function updateCountPill(shown, total) {
  const pill = document.getElementById("suggestions-count-pill");
  if (!pill) return;
  pill.textContent =
    shown >= total ? `${total} items` : `Showing ${shown} of ${total}`;
}

function appendRows(start, end) {
  const tbody = document.getElementById("suggestions-tbody");
  if (!tbody) return;
  const slice = tabItems.slice(start, end);
  if (!slice.length) return;
  tbody.insertAdjacentHTML(
    "beforeend",
    slice.map((item) => renderRow(item, activeTab)).join("")
  );
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
  const { expenseHeader, yieldHeader } = tableHeaders(category);
  const initial = Math.min(SCROLL_BATCH, total);
  return `
    <article class="currency-card ideas-card">
      <div class="currency-head">
        <h2 class="panel-title">Suggestions</h2>
        <span class="currency-pill" id="suggestions-count-pill">Showing ${initial} of ${total}</span>
      </div>
      <div class="table-wrap suggestions-scroll-wrap" id="suggestions-scroll">
        <table class="ideas-table suggestions-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>List source</th>
              <th>Why picked</th>
              <th>Theme</th>
              <th>Price</th>
              <th>6m change</th>
              <th>${yieldHeader}</th>
              ${expenseHeader}
              <th>Price data</th>
            </tr>
          </thead>
          <tbody id="suggestions-tbody"></tbody>
        </table>
      </div>
      <div id="suggestions-sentinel" class="suggestions-sentinel" aria-hidden="true"></div>
      <p class="sub suggestions-scroll-hint" id="suggestions-scroll-hint" hidden>Scroll for more…</p>
    </article>
  `;
}

function setActiveTab(tab) {
  activeTab = tab;
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  renderActiveTab();
}

function renderActiveTab() {
  if (!latestPayload || !suggestionsContent) return;
  const tabData = latestPayload.tabs?.[activeTab];
  if (!tabData) {
    suggestionsContent.innerHTML = `<p class="error">No data for this tab.</p>`;
    return;
  }

  tabItems = tabData.items || [];
  visibleCount = Math.min(SCROLL_BATCH, tabItems.length);
  teardownInfiniteScroll();

  if (!tabItems.length) {
    suggestionsContent.innerHTML = `<p class="lede ideas-empty">No suggestions in this tab yet.</p>`;
    return;
  }

  suggestionsContent.innerHTML = renderTableShell(activeTab, tabItems.length);
  appendRows(0, visibleCount);
  setupInfiniteScroll();

  const hint = document.getElementById("suggestions-scroll-hint");
  if (hint) {
    hint.hidden = tabItems.length <= SCROLL_BATCH;
  }
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

function renderSuggestionsPayload(data) {
  latestPayload = data;
  if (suggestionsDisclaimer) {
    suggestionsDisclaimer.textContent = data.disclaimer || "";
  }
  if (suggestionsSources) {
    const listSources = data.list_sources || [];
    const dataSources = data.data_sources || [];
    if (listSources.length || dataSources.length) {
      suggestionsSources.hidden = false;
      suggestionsSources.innerHTML = `
        <p class="section-subtitle">Selection &amp; data feeds</p>
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
            ? `<p class="sub suggestions-meta">Symbols last ranked ${formatWhen(
                data.symbols_updated_at
              )}${
                data.next_symbols_refresh_at
                  ? ` · next rank ${formatWhen(data.next_symbols_refresh_at)}`
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
      ? `Quotes ${asOf.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })} · ${count} symbols${symAt ? ` · ranked ${symAt}` : ""}`
      : "Ready";
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
        if (suggestionsStatus) suggestionsStatus.textContent = "Refreshing…";
      },
      onDone: (data) => renderSuggestionsPayload(data),
      onError: (err) => {
        if (!suggestionsStatus) return;
        suggestionsStatus.textContent =
          err.code === "RATE_LIMITED"
            ? err.message
            : err.message || "Refresh failed";
      },
    }
  );
}

async function loadSuggestions() {
  bindSuggestionsRefresh();
  for (const btn of tabButtons) {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  }

  window.SbpCache.onUpdate(window.SbpCache.KEYS.suggestions, ({ data }) => {
    if (!data) return;
    renderSuggestionsPayload(data);
  });

  const cached = window.SbpCache.get(window.SbpCache.KEYS.suggestions);
  if (cached) {
    hideLoader();
    renderSuggestionsPayload(cached);
    return;
  }

  showLoader("Loading suggestions…");
  if (suggestionsStatus) suggestionsStatus.textContent = "Fetching live data…";
  try {
    const data = await window.SbpCache.fetchAndCache(
      window.SbpCache.KEYS.suggestions,
      { reason: "page" }
    );
    renderSuggestionsPayload(data);
  } catch (err) {
    if (suggestionsContent) {
      suggestionsContent.innerHTML = `<p class="error">${escapeHtml(err.message || "Failed to load")}</p>`;
    }
    if (suggestionsStatus) suggestionsStatus.textContent = "Failed";
  } finally {
    hideLoader();
  }
}

window.addEventListener("DOMContentLoaded", loadSuggestions);
