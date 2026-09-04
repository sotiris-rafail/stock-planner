const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const ideasSections = document.getElementById("ideas-sections");
const ideasStatus = document.getElementById("ideas-status");
const ideasDisclaimer = document.getElementById("ideas-disclaimer");
const ideasRefreshBtn = document.getElementById("ideas-refresh-btn");

let lastRenderedFingerprint = null;
let ideasRefreshBound = false;

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
    item.owned_shares != null
      ? ` · ${sharesFmt(item.owned_shares)} sh`
      : "";
  const sym =
    item.owned_symbol && item.owned_symbol !== item.symbol
      ? ` (${escapeHtml(item.owned_symbol)})`
      : "";
  return `<span class="owned-badge" title="Already in your portfolio">Owned${sym}${shares}</span>`;
}

function renderTable(title, items, years, { showShares = false } = {}) {
  if (!items.length) {
    return `
      <article class="currency-card ideas-card">
        <div class="currency-head">
          <h2 class="panel-title">${escapeHtml(title)}</h2>
          <span class="currency-pill">0 stocks</span>
        </div>
        <p class="lede ideas-empty">No matching stocks here yet.</p>
      </article>
    `;
  }

  const yearHeaders = years.map((y) => `<th>Div ${escapeHtml(y)}</th>`).join("");
  const sharesHeader = showShares ? "<th>Owned shares</th>" : "";
  const rows = items
    .map((item) => {
      const divCells = years
        .map((y) => {
          const amount = item.dividends_by_year?.[y];
          return `<td>${money(amount, item.currency)}</td>`;
        })
        .join("");
      const err = item.error
        ? `<div class="sub bad">${escapeHtml(item.error)}</div>`
        : "";
      const sharesCell = showShares
        ? `<td>${sharesFmt(item.owned_shares)}</td>`
        : "";
      const rowClass = item.owned ? "ideas-row-owned" : "";
      return `
        <tr class="${rowClass}">
          <td>
            <div class="stock-name">
              <span class="stock-name-text">
                <span class="ideas-name-line">
                  ${item.owned ? '<span class="owned-dot" aria-hidden="true"></span>' : ""}
                  <strong>${escapeHtml(item.name)}</strong>
                  ${ownedBadge(item)}
                </span>
                <span class="sub">${escapeHtml(item.symbol)}${
                  item.region ? ` · ${escapeHtml(item.region)}` : ""
                }</span>
                ${err}
              </span>
            </div>
          </td>
          ${sharesCell}
          <td>${money(item.price, item.currency)}</td>
          <td class="${growthClass(item.change_6m_pct)}">${pct(item.change_6m_pct)}</td>
          <td>${item.dividend_yield_pct == null ? "—" : pct(item.dividend_yield_pct)}</td>
          ${divCells}
        </tr>
      `;
    })
    .join("");

  return `
    <article class="currency-card ideas-card">
      <div class="currency-head">
        <h2 class="panel-title">${escapeHtml(title)}</h2>
        <span class="currency-pill">${items.length} stocks</span>
      </div>
      <div class="table-wrap">
        <table class="ideas-table">
          <thead>
            <tr>
              <th>Stock</th>
              ${sharesHeader}
              <th>Price</th>
              <th>6m change</th>
              <th>Yield</th>
              ${yearHeaders}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>
  `;
}

function updateIdeasStatus(data) {
  if (!ideasStatus) return;
  const asOf = data.as_of ? new Date(data.as_of) : null;
  const owned = data.owned || [];
  const checked = data.last_checked_at ? formatWhen(data.last_checked_at) : null;
  const boardAt = data.board_updated_at ? formatWhen(data.board_updated_at) : null;

  if (data.data_changed === false && checked) {
    ideasStatus.textContent = `No changes · checked ${checked} · ${owned.length} owned`;
    return;
  }

  ideasStatus.textContent = asOf
    ? `Updated ${asOf.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })} · ${owned.length} owned${boardAt ? ` · board ${boardAt}` : ""}`
    : "Ready";
}

function renderIdeasPayload(data, { force = false } = {}) {
  ideasDisclaimer.textContent = data.disclaimer || "";

  const fingerprint = payloadFingerprint(data);
  const unchanged = !force && fingerprint === lastRenderedFingerprint;

  if (!unchanged) {
    const years = data.years || [];
    const owned = data.owned || [];
    const items = data.items || [];
    const us = items.filter((i) => i.region === "US");
    const eu = items.filter((i) => i.region === "EU");

    ideasSections.innerHTML = [
      renderTable("Owned", owned, years, { showShares: true }),
      renderTable("Preview · US", us, years),
      renderTable("Preview · EU", eu, years),
    ].join("");

    lastRenderedFingerprint = fingerprint;
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
        if (ideasStatus) ideasStatus.textContent = "Refreshing…";
      },
      onDone: (data) => renderIdeasPayload(data, { force: true }),
      onError: (err) => {
        if (!ideasStatus) return;
        ideasStatus.textContent =
          err.code === "RATE_LIMITED"
            ? err.message
            : err.message || "Refresh failed";
      },
    }
  );
}

async function loadIdeas() {
  bindIdeasRefresh();
  window.SbpCache.onUpdate(window.SbpCache.KEYS.dividendIdeas, ({ data }) => {
    if (!data) return;
    renderIdeasPayload(data);
  });

  const cached = window.SbpCache.get(window.SbpCache.KEYS.dividendIdeas);
  if (cached) {
    hideLoader();
    renderIdeasPayload(cached, { force: true });
    return;
  }

  showLoader("Loading dividend ideas…");
  ideasStatus.textContent = "Fetching live data…";
  try {
    const data = await window.SbpCache.fetchAndCache(
      window.SbpCache.KEYS.dividendIdeas,
      { reason: "page" }
    );
    renderIdeasPayload(data, { force: true });
  } catch (err) {
    ideasSections.innerHTML = `<p class="error">${escapeHtml(err.message || "Failed to load")}</p>`;
    ideasStatus.textContent = "Failed";
  } finally {
    hideLoader();
  }
}

window.addEventListener("DOMContentLoaded", loadIdeas);
