const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const trackContent = document.getElementById("track-content");
const trackStatus = document.getElementById("track-status");
const trackDisclaimer = document.getElementById("track-disclaimer");
const trackRefreshBtn = document.getElementById("track-refresh-btn");
const trackForm = document.getElementById("track-form");
const trackSymbol = document.getElementById("track-symbol");
const trackType = document.getElementById("track-type");
const trackSubmitBtn = document.getElementById("track-submit-btn");
const trackFormError = document.getElementById("track-form-error");
const trackFormOk = document.getElementById("track-form-ok");
const trackModal = document.getElementById("track-modal");
const trackModalBody = document.getElementById("track-modal-body");

let trackRefreshBound = false;
let trackItems = [];
let trackIsGuest = true;

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

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function stockLogoUrl(symbol) {
  if (!symbol) return "";
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`;
}

function stockIconHtml(symbol, { size = "md" } = {}) {
  const initial =
    (symbol || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";
  const url = stockLogoUrl(symbol);
  const sizeClass = size === "lg" ? " stock-icon-wrap-lg" : "";
  return `
    <span class="stock-icon-wrap${sizeClass}" aria-hidden="true">
      <img class="stock-icon" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="const w=this.parentElement; this.remove(); const f=w&&w.querySelector('.stock-icon-fallback'); if(f) f.hidden=false;" />
      <span class="stock-icon-fallback" hidden>${initial}</span>
    </span>`;
}

const SUFFIX_MARKETS = {
  DE: "Germany",
  F: "Germany",
  PA: "France",
  AS: "Netherlands",
  L: "United Kingdom",
  SW: "Switzerland",
  MI: "Italy",
  MC: "Spain",
  BR: "Belgium",
  LS: "Portugal",
  HE: "Finland",
  OL: "Norway",
  CO: "Denmark",
  ST: "Sweden",
  AT: "Greece",
  IR: "Ireland",
  TO: "Canada",
  V: "Canada",
  HK: "Hong Kong",
  T: "Japan",
  AX: "Australia",
  NS: "India",
  BO: "India",
  SA: "Brazil",
  MX: "Mexico",
  SS: "China",
  SZ: "China",
};

function inferMarketFromSymbol(symbol) {
  const raw = (symbol || "").toUpperCase().trim();
  if (!raw) return { market: "Other", market_label: "Other" };
  if (raw.includes(".")) {
    const suffix = raw.split(".").pop();
    const market = SUFFIX_MARKETS[suffix] || suffix;
    return { market, market_label: market };
  }
  return { market: "United States", market_label: "United States" };
}

function withMarket(item) {
  const inferred = inferMarketFromSymbol(item?.requested_symbol || item?.symbol);
  return { ...item, ...inferred };
}

function displayName(item) {
  return item.company_name || item.symbol;
}

function marketLabel(item) {
  return withMarket(item).market_label;
}

function marketKey(item) {
  return withMarket(item).market;
}

function sortKey(item) {
  return `${displayName(item)}\u0000${item.symbol || ""}`.toLocaleLowerCase();
}

function compareItems(a, b) {
  return sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: "base" });
}

function groupedTrackItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = marketKey(item);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: marketLabel(item),
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
  for (const group of ordered) {
    group.items.sort(compareItems);
  }
  return ordered;
}

function showFormError(message) {
  if (!trackFormError) return;
  trackFormError.textContent = message;
  trackFormError.hidden = !message;
}

function showFormOk(message) {
  if (!trackFormOk) return;
  trackFormOk.textContent = message;
  trackFormOk.hidden = !message;
}

function updateTrackStatus(data) {
  if (!trackStatus) return;
  const asOf = data?.as_of ? new Date(data.as_of) : null;
  const count = data?.count ?? 0;
  trackStatus.textContent = asOf
    ? `Updated ${asOf.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })} · ${count} symbol${count === 1 ? "" : "s"}`
    : "Ready";
}

function renderTrackCard(item) {
  const name = displayName(item);
  const subtitle = item.company_name && item.company_name !== item.symbol ? item.symbol : "";
  return `
    <button type="button" class="track-card" data-track-id="${item.id}" aria-label="View details for ${escapeHtml(name)}">
      <span class="track-card-icon">${stockIconHtml(item.symbol)}</span>
      <span class="track-card-body">
        <span class="track-card-name">${escapeHtml(name)}</span>
        ${subtitle ? `<span class="track-card-symbol">${escapeHtml(subtitle)}</span>` : ""}
        <span class="track-card-meta">Added ${formatDate(item.added_at)}</span>
        <span class="track-card-price">${money(item.live_price, item.currency)}</span>
      </span>
    </button>
  `;
}

function renderModalStat(label, value, { className = "" } = {}) {
  return `
    <div class="track-modal-stat">
      <span class="track-modal-stat-label">${escapeHtml(label)}</span>
      <span class="track-modal-stat-value ${className}">${value}</span>
    </div>
  `;
}

function openTrackModal(itemId) {
  const item = trackItems.find((row) => String(row.id) === String(itemId));
  if (!item || !trackModal || !trackModalBody) return;

  const name = displayName(item);
  const requestedLine =
    item.requested_symbol && item.requested_symbol !== item.symbol
      ? `<p class="sub">Requested as ${escapeHtml(item.requested_symbol)} · trades as ${escapeHtml(item.symbol)}</p>`
      : "";
  const errorLine = item.error
    ? `<p class="error track-modal-error">${escapeHtml(item.error)}</p>`
    : "";

  trackModalBody.innerHTML = `
    <header class="track-modal-header">
      ${stockIconHtml(item.symbol, { size: "lg" })}
      <div class="track-modal-heading">
        <h2 class="track-modal-title" id="track-modal-title">${escapeHtml(name)}</h2>
        <p class="track-modal-symbol">${escapeHtml(item.symbol)}</p>
        ${requestedLine}
        <span class="type-pill">${escapeHtml(item.asset_type_label || "—")}</span>
        <p class="sub">${escapeHtml(marketLabel(item))}</p>
      </div>
    </header>
    ${errorLine}
    <div class="track-modal-grid">
      ${renderModalStat("Date added", formatDate(item.added_at))}
      ${renderModalStat("Live price", money(item.live_price, item.currency))}
      ${renderModalStat("Price at add", money(item.price_at_add, item.currency))}
      ${renderModalStat(
        "Since added",
        pct(item.change_since_added_pct),
        { className: growthClass(item.change_since_added_pct) }
      )}
      ${renderModalStat(
        "1 month",
        pct(item.change_1m_pct),
        { className: growthClass(item.change_1m_pct) }
      )}
      ${renderModalStat(
        "6 months",
        pct(item.change_6m_pct),
        { className: growthClass(item.change_6m_pct) }
      )}
      ${renderModalStat(
        "1 year",
        pct(item.change_1y_pct),
        { className: growthClass(item.change_1y_pct) }
      )}
      ${renderModalStat("Currency", escapeHtml(item.currency || "—"))}
    </div>
    ${
      trackIsGuest
        ? ""
        : `<div class="track-modal-actions">
            <button type="button" class="link-btn" data-remove="${item.id}">Remove from watchlist</button>
          </div>`
    }
  `;

  trackModal.hidden = false;
  document.body.classList.add("track-modal-open");
  trackModal.querySelector(".track-modal-close")?.focus();
}

function closeTrackModal() {
  if (!trackModal) return;
  trackModal.hidden = true;
  document.body.classList.remove("track-modal-open");
}

function renderTrackPayload(data) {
  if (trackDisclaimer) {
    trackDisclaimer.textContent = data.disclaimer || "";
  }
  updateTrackStatus(data);

  trackItems = (data.items || []).map(withMarket);
  trackIsGuest = Boolean(data.guest) || !(window.SbpAuth?.isAuthenticated?.() ?? false);

  if (!trackItems.length) {
    trackContent.innerHTML = trackIsGuest
      ? '<p class="empty-copy">No symbols on your watchlist yet. Sign in to start tracking, or browse other pages freely.</p>'
      : '<p class="empty-copy">No symbols yet. Add a stock, ETF, or mutual fund above.</p>';
    return;
  }

  const groups = groupedTrackItems(trackItems);
  trackContent.innerHTML = groups
    .map(
      (group) => `
        <section class="track-market" data-track-market="${escapeHtml(group.key)}">
          <div class="track-market-heading">
            <h3>${escapeHtml(group.label)}</h3>
            <p class="track-market-meta">${group.items.length} symbol${group.items.length === 1 ? "" : "s"}</p>
          </div>
          <div class="track-card-grid">
            ${group.items.map((item) => renderTrackCard(item)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function upsertLocalWatchlistItem(item) {
  const next = trackItems.filter((row) => String(row.id) !== String(item.id));
  next.push(withMarket(item));
  trackItems = next;
  const cached = window.SbpCache?.get?.(window.SbpCache.KEYS.watchlist) || {};
  const payload = {
    ...cached,
    count: trackItems.length,
    items: sortLocalItems(trackItems),
    as_of: new Date().toISOString(),
    guest: false,
    disclaimer: cached.disclaimer || trackDisclaimer?.textContent || "",
  };
  window.SbpCache?.set?.(window.SbpCache.KEYS.watchlist, payload, { notify: false });
  updateTrackStatus(payload);
  if (trackDisclaimer && payload.disclaimer) {
    trackDisclaimer.textContent = payload.disclaimer;
  }
  insertTrackCard(item);
}

function insertTrackCard(item) {
  if (!trackContent) return;
  if (!trackContent.querySelector(".track-market")) {
    renderTrackPayload({
      items: trackItems,
      count: trackItems.length,
      guest: false,
      disclaimer: trackDisclaimer?.textContent || "",
      as_of: new Date().toISOString(),
    });
    return;
  }

  const key = marketKey(item);
  const label = marketLabel(item);
  let section = [...trackContent.querySelectorAll(".track-market")].find(
    (node) => node.getAttribute("data-track-market") === key
  );
  if (!section) {
    section = document.createElement("section");
    section.className = "track-market";
    section.setAttribute("data-track-market", key);
    section.innerHTML = `
      <div class="track-market-heading">
        <h3>${escapeHtml(label)}</h3>
        <p class="track-market-meta">0 symbols</p>
      </div>
      <div class="track-card-grid"></div>
    `;
    const sections = [...trackContent.querySelectorAll(".track-market")];
    const after = sections.find(
      (node) =>
        (node.querySelector("h3")?.textContent || "").localeCompare(label, undefined, {
          sensitivity: "base",
        }) > 0
    );
    if (after) trackContent.insertBefore(section, after);
    else trackContent.appendChild(section);
  }

  const grid = section.querySelector(".track-card-grid");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderTrackCard(item).trim();
  const card = wrapper.firstElementChild;
  const existing = grid.querySelector(`[data-track-id="${item.id}"]`);
  existing?.remove();

  const siblings = [...grid.querySelectorAll(".track-card")];
  const name = sortKey(item);
  const before = siblings.find((node) => {
    const other = trackItems.find((row) => String(row.id) === node.getAttribute("data-track-id"));
    return other ? sortKey(other).localeCompare(name, undefined, { sensitivity: "base" }) > 0 : false;
  });
  if (before) grid.insertBefore(card, before);
  else grid.appendChild(card);

  const count = grid.querySelectorAll(".track-card").length;
  const meta = section.querySelector(".track-market-meta");
  if (meta) meta.textContent = `${count} symbol${count === 1 ? "" : "s"}`;
}

function sortLocalItems(items) {
  return [...items].sort((a, b) => {
    const market = marketLabel(a).localeCompare(marketLabel(b), undefined, {
      sensitivity: "base",
    });
    if (market !== 0) return market;
    return compareItems(a, b);
  });
}

function removeLocalWatchlistItem(id) {
  trackItems = trackItems.filter((row) => String(row.id) !== String(id));
  const cached = window.SbpCache?.get?.(window.SbpCache.KEYS.watchlist) || {};
  window.SbpCache?.set?.(window.SbpCache.KEYS.watchlist, {
    ...cached,
    count: trackItems.length,
    items: trackItems,
    as_of: new Date().toISOString(),
    guest: false,
  }, { notify: false });
  renderTrackPayload({
    ...cached,
    count: trackItems.length,
    items: trackItems,
    guest: false,
    disclaimer: cached.disclaimer || trackDisclaimer?.textContent || "",
    as_of: new Date().toISOString(),
  });
}

async function reloadWatchlist({ reason = "page" } = {}) {
  const data = await window.SbpCache.fetchAndCache(window.SbpCache.KEYS.watchlist, {
    reason,
  });
  renderTrackPayload(data);
  return data;
}

function bindTrackRefresh() {
  if (trackRefreshBound || !trackRefreshBtn || !window.SbpCache?.bindRefreshButton) return;
  trackRefreshBound = true;
  window.SbpCache.bindRefreshButton(trackRefreshBtn, window.SbpCache.KEYS.watchlist, {
    onStart: () => {
      if (trackStatus) trackStatus.textContent = "Refreshing…";
    },
    onDone: (data) => renderTrackPayload(data),
    onError: (err) => {
      if (!trackStatus) return;
      trackStatus.textContent =
        err.code === "RATE_LIMITED" ? err.message : err.message || "Refresh failed";
    },
  });
}

async function loadTrack() {
  bindTrackRefresh();

  window.SbpCache.onUpdate(window.SbpCache.KEYS.watchlist, ({ data }) => {
    if (!data) return;
    renderTrackPayload(data);
  });

  const cached = window.SbpCache.get(window.SbpCache.KEYS.watchlist);
  if (cached) {
    hideLoader();
    renderTrackPayload(cached);
    return;
  }

  showLoader("Loading watchlist…");
  if (trackStatus) trackStatus.textContent = "Fetching live data…";
  try {
    await reloadWatchlist();
  } catch (err) {
    trackContent.innerHTML = `<p class="error">${escapeHtml(err.message || "Failed to load")}</p>`;
    if (trackStatus) trackStatus.textContent = "Failed";
  } finally {
    hideLoader();
  }
}

async function removeWatchlistItem(id) {
  if (!id || !confirm("Remove this symbol from your watchlist?")) return;

  try {
    const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Remove failed");
    closeTrackModal();
    removeLocalWatchlistItem(id);
  } catch (err) {
    showFormError(err.message || "Remove failed");
  }
}

trackForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false)) {
    window.location.href = window.SbpAuth?.loginUrl?.("/track") || "/login?next=%2Ftrack";
    return;
  }
  showFormError("");
  showFormOk("");
  trackSubmitBtn.disabled = true;
  trackSubmitBtn.textContent = "Adding…";

  const symbol = trackSymbol.value.trim();
  const assetType = trackType.value.trim();

  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        asset_type: assetType || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg || d).join(", ")
        : data.detail;
      throw new Error(detail || "Could not add symbol");
    }

    trackSymbol.value = "";
    trackType.value = "";
    showFormOk(`Added ${data.symbol} at ${money(data.live_price ?? data.price_at_add, data.currency)}.`);
    upsertLocalWatchlistItem(data);
  } catch (err) {
    showFormError(err.message || "Could not add symbol");
  } finally {
    trackSubmitBtn.disabled = false;
    trackSubmitBtn.textContent = "Add symbol";
  }
});

trackContent?.addEventListener("click", (event) => {
  const card = event.target.closest(".track-card[data-track-id]");
  if (!card) return;
  openTrackModal(card.getAttribute("data-track-id"));
});

trackModal?.addEventListener("click", async (event) => {
  if (event.target.closest("[data-track-modal-close]")) {
    closeTrackModal();
    return;
  }

  const removeBtn = event.target.closest("[data-remove]");
  if (removeBtn) {
    await removeWatchlistItem(removeBtn.getAttribute("data-remove"));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && trackModal && !trackModal.hidden) {
    closeTrackModal();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const start = () => loadTrack();
  if (window.SbpAuth?.whenAuthReady) {
    window.SbpAuth.whenAuthReady(start);
  } else {
    start();
  }
});
