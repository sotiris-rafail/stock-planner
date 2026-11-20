(function (global) {
  const t = (key, vars) => (global.SbpI18n && global.SbpI18n.t(key, vars)) || key;
  const PLAN_KEY = "sbp:plan:lastSearch";
  const HISTORY_KEY = "sbp:history-symbol";
  let root = null;
  let currentSymbol = "";

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function money(value, currency) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const cur = currency || "";
    try {
      if (cur.length === 3) {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: cur,
          maximumFractionDigits: 2,
        }).format(Number(value));
      }
    } catch {
      /* fall through */
    }
    return `${Number(value).toFixed(2)}${cur ? ` ${cur}` : ""}`;
  }

  function num(value, digits = 2) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(value));
  }

  function signedPct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    return `${n > 0 ? "+" : ""}${num(n, 2)}%`;
  }

  function signedMoney(value, currency) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    const formatted = money(Math.abs(n), currency);
    if (n > 0) return `+${formatted}`;
    if (n < 0) return `−${formatted}`;
    return formatted;
  }

  function pnlClass(value) {
    const n = Number(value);
    if (value == null || Number.isNaN(n) || n === 0) return "";
    return n > 0 ? "pos" : "neg";
  }

  function stat(label, value, cls = "") {
    return `<div><dt>${escapeHtml(label)}</dt><dd class="${cls}">${value}</dd></div>`;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "symbol-sheet";
    root.className = "symbol-sheet";
    root.hidden = true;
    root.innerHTML = `
      <div class="symbol-sheet-backdrop" data-sheet-close></div>
      <div class="symbol-sheet-dialog" role="dialog" aria-modal="true" aria-labelledby="symbol-sheet-title">
        <button type="button" class="progress-modal-close" data-sheet-close aria-label="${escapeHtml(t("common.close"))}">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
        <div id="symbol-sheet-body" class="symbol-sheet-body app-scroll"></div>
      </div>
    `;
    document.body.appendChild(root);
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-sheet-close]")) {
        closeSheet();
        return;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !root.hidden) closeSheet();
    });
    return root;
  }

  function closeSheet() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("progress-modal-open");
  }

  function readPlan() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PLAN_KEY) || "null");
      return parsed && parsed.symbol ? parsed : null;
    } catch {
      return null;
    }
  }

  function monthShares(lots) {
    const now = new Date();
    return (lots || []).reduce((sum, lot) => {
      const date = lot.purchased_at ? new Date(lot.purchased_at) : null;
      if (!date || Number.isNaN(date.getTime())) return sum;
      if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
      return sum + (Number(lot.shares) || 0);
    }, 0);
  }

  function findHolding(progress, symbol) {
    const key = String(symbol || "").toUpperCase();
    for (const group of progress?.by_currency || []) {
      for (const holding of group.holdings || []) {
        if (String(holding.symbol || "").toUpperCase() === key) return holding;
      }
    }
    return (progress?.holdings || []).find(
      (holding) => String(holding.symbol || "").toUpperCase() === key
    ) || null;
  }

  function asOfChip(asOf, source, stale) {
    let when = "—";
    if (asOf) {
      try {
        when = new Date(asOf).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        when = String(asOf);
      }
    }
    const staleHtml = stale ? `<span class="data-chip is-stale">${t("sheet.stale")}</span>` : "";
    return `<span class="data-chip">${t("sheet.asOf", { time: when, source: source || t("common.yahoo") })}</span>${staleHtml}`;
  }

  function symbolTransactions(progress, symbol, extra = []) {
    const key = String(symbol || "").toUpperCase();
    const rows = [];
    const pushRow = (item) => {
      if (String(item.symbol || "").toUpperCase() !== key) return;
      const type = item.type === "sell" ? "sell" : "buy";
      rows.push({
        type,
        date: item.txn_date || item.purchased_at || item.sold_at,
        shares: item.shares,
        price: item.price_per_share,
        amount: item.amount ?? item.cost ?? item.proceeds,
        result: type === "sell" ? item.realized_gain : null,
      });
    };
    for (const buy of progress?.purchases || []) pushRow({ ...buy, type: "buy" });
    for (const sale of progress?.sales || []) pushRow({ ...sale, type: "sell" });
    for (const item of extra) pushRow(item);
    const seen = new Set();
    return rows
      .filter((row) => {
        const id = `${row.type}|${row.date}|${row.shares}|${row.price}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function openHistory(symbol) {
    closeSheet();
    if (global.SbpProgress?.focusSymbolHistory) {
      global.SbpProgress.focusSymbolHistory(symbol);
      return;
    }
    try {
      sessionStorage.setItem(HISTORY_KEY, symbol);
    } catch {
      /* ignore */
    }
    global.location.href = "/progress";
  }

  function sheetRow(date, main, extra, extraClass = "") {
    return `<li>
      <span class="symbol-sheet-row-date">${escapeHtml(date || "—")}</span>
      <span class="symbol-sheet-row-main">${main}</span>
      ${extra ? `<span class="symbol-sheet-row-extra ${extraClass}">${extra}</span>` : ""}
    </li>`;
  }

  function render(symbol, { quote, progress, error, seed, transactions = [] }) {
    const watch = seed?.watchlist || {};
    const body = document.getElementById("symbol-sheet-body");
    if (!body) return;
    const holding = findHolding(progress, quote?.symbol || symbol);
    const plan = readPlan();
    const matchPlan =
      plan && String(plan.symbol).toUpperCase() === String(quote?.symbol || symbol).toUpperCase();
    const currency = holding?.currency || quote?.currency || "USD";
    const guest = !(global.SbpAuth?.isAuthenticated?.() ?? false);
    const price = holding?.current_price ?? quote?.price;
    const prevClose = holding?.previous_close ?? quote?.previous_close;
    const dayPct = holding?.change_pct ?? quote?.change_pct;
    const monthPct = holding?.change_1m_pct ?? quote?.change_1m_pct;
    const yieldText =
      quote?.dividend?.yield_pct == null && holding?.dividend?.yield_pct == null
        ? "—"
        : `${num(quote?.dividend?.yield_pct ?? holding?.dividend?.yield_pct, 2)}%`;
    const annualRate = quote?.dividend?.annual_rate ?? holding?.dividend?.annual_rate;
    const avgCost = holding?.avg_cost_per_share;
    const yieldOnCost =
      annualRate != null && avgCost ? (Number(annualRate) / Number(avgCost)) * 100 : null;
    const stale =
      quote?.as_of && Date.now() - new Date(quote.as_of).getTime() > 24 * 60 * 60 * 1000;
    const source = quote?.price_source_label || quote?.price_source || t("common.yahoo");
    let planBlock = `<p class="muted">${t("sheet.noPlan")}</p>`;
    if (matchPlan && plan.yearly) {
      planBlock = `<p class="muted">${t("sheet.yearlyPlan")}</p>`;
    } else if (matchPlan) {
      const target = Number(plan.total_shares) / Math.max(1, Number(plan.periods) || 1);
      const bought = monthShares(holding?.lots);
      planBlock = `<p>${t("progress.thisMonth", { bought: num(bought, 4), target: num(target, 4) })}</p>
        <p class="sub">${t("sheet.planShares", { n: num(plan.total_shares, 4), periods: plan.periods })}</p>`;
    }

    const lots = [...(holding?.lots || [])].sort((a, b) =>
      String(b.purchased_at || "").localeCompare(String(a.purchased_at || ""))
    );
    const lotsHtml = lots.length
      ? `<ul class="symbol-sheet-rows">${lots
          .map((lot) => {
            const shares = Number(lot.shares) || 0;
            const lotPrice = Number(lot.price_per_share) || 0;
            const cost = lot.cost != null ? Number(lot.cost) : shares * lotPrice;
            const lotUnreal =
              price == null ? null : (Number(price) - lotPrice) * shares;
            return sheetRow(
              lot.purchased_at,
              `${num(shares, 4)} @ ${money(lotPrice, currency)} · ${money(cost, currency)}`,
              signedMoney(lotUnreal, currency),
              pnlClass(lotUnreal)
            );
          })
          .join("")}</ul>`
      : `<p class="muted">${t("sheet.noLots")}</p>`;

    const events = (holding?.dividend_events || []).slice(0, 8);
    const recentPays = quote?.dividend?.recent_payments || holding?.dividend?.recent_payments || [];
    const eventHtml = events.length
      ? `<ul class="symbol-sheet-rows">${events
          .map((ev) =>
            sheetRow(
              ev.date,
              `${num(ev.shares_held, 4)} × ${money(ev.dividend_per_share, currency)}`,
              money(ev.income, currency),
              pnlClass(ev.income)
            )
          )
          .join("")}</ul>`
      : recentPays.length
        ? `<ul class="symbol-sheet-rows">${recentPays
            .map((pay) => sheetRow(pay.date, t("sheet.perShare"), money(pay.amount, currency)))
            .join("")}</ul>`
        : `<p class="muted">${t("sheet.noDivEvents")}</p>`;

    const txns = symbolTransactions(progress, quote?.symbol || symbol, transactions).slice(0, 8);
    const historyHtml = txns.length
      ? `<ul class="symbol-sheet-rows">${txns
          .map((row) =>
            sheetRow(
              row.date,
              `${row.type === "sell" ? t("progress.sell") : t("progress.buy")} · ${num(row.shares, 4)} @ ${money(row.price, currency)}`,
              row.type === "sell" ? signedMoney(row.result, currency) : money(row.amount, currency),
              row.type === "sell" ? pnlClass(row.result) : ""
            )
          )
          .join("")}</ul>
        <button type="button" class="link-btn" data-open-history="${escapeHtml(quote?.symbol || symbol)}">${t("sheet.openHistory")}</button>`
      : `<p class="muted">${t("sheet.noHistory")}</p>`;

    const lookback = quote?.lookback_months;
    const avgMonthly = quote?.avg_monthly_growth_pct;

    body.innerHTML = `
      <header class="symbol-sheet-head">
        <p class="eyebrow">${escapeHtml(quote?.symbol || symbol)}</p>
        <h2 id="symbol-sheet-title">${escapeHtml(quote?.name || holding?.company_name || quote?.symbol || symbol)}</h2>
        <p class="symbol-sheet-price">${money(price, currency)} <span class="${pnlClass(dayPct)}">${signedPct(dayPct)}</span></p>
        <div class="data-chip-row">${asOfChip(quote?.as_of, source, stale)}</div>
      </header>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <section>
        <h3>${t("sheet.market")}</h3>
        <dl class="symbol-sheet-stats">
          ${stat(t("progress.livePrice"), money(price, currency))}
          ${stat(t("sheet.prevClose"), money(prevClose, currency))}
          ${stat(t("progress.pctToday"), `<span class="${pnlClass(dayPct)}">${signedPct(dayPct)}</span>`)}
          ${stat(t("sheet.dayPnl"), `<span class="${pnlClass(holding?.daily_change)}">${signedMoney(holding?.daily_change, currency)}</span>`)}
          ${stat(t("sheet.monthChange"), `<span class="${pnlClass(monthPct)}">${signedPct(monthPct)}</span>`)}
          ${stat(t("sheet.monthPnl"), `<span class="${pnlClass(holding?.monthly_change)}">${signedMoney(holding?.monthly_change, currency)}</span>`)}
          ${stat(t("ideas.colYield"), yieldText)}
          ${stat(t("sheet.yieldOnCost"), yieldOnCost == null ? "—" : `${num(yieldOnCost, 2)}%`)}
          ${stat(
            t("sheet.avgMonthly"),
            avgMonthly == null
              ? "—"
              : `${signedPct(avgMonthly)}${lookback ? ` · ${t("sheet.lookbackN", { n: lookback })}` : ""}`
          )}
        </dl>
      </section>
      <section>
        <h3>${t("sheet.position")}</h3>
        ${
          holding
            ? `<dl class="symbol-sheet-stats">
                ${stat(t("progress.shares"), num(holding.shares, 4))}
                ${stat(t("progress.avgCost"), money(avgCost, currency))}
                ${stat(t("sheet.invested"), money(holding.total_invested, currency))}
                ${stat(t("progress.value"), money(holding.market_value, currency))}
                ${stat(t("progress.unrealized"), `<span class="${pnlClass(holding.unrealized_gain)}">${signedMoney(holding.unrealized_gain, currency)} (${signedPct(holding.unrealized_gain_pct)})</span>`)}
                ${stat(t("progress.lotsLabel"), num((holding.lots || []).length, 0))}
              </dl>`
            : `<p class="muted">${t("sheet.notHeld")}</p>`
        }
      </section>
      <section>
        <h3>${t("sheet.income")}</h3>
        <dl class="symbol-sheet-stats">
          ${stat(t("progress.divNet"), money(holding?.dividends_earned, currency))}
          ${stat(t("sheet.divGross"), money(holding?.dividends_earned_gross, currency))}
          ${stat(
            t("sheet.divTax"),
            `${money(holding?.dividends_tax, currency)}${
              holding?.dividends_withholding_pct == null
                ? ""
                : ` (${num(holding.dividends_withholding_pct, 1)}%)`
            }`
          )}
          ${stat(t("progress.divPct"), holding?.dividends_earned_pct == null ? "—" : `${num(holding.dividends_earned_pct, 2)}%`)}
        </dl>
        <h4 class="symbol-sheet-sub">${t("sheet.recentDiv")}</h4>
        ${eventHtml}
      </section>
      ${
        holding && (Number(holding.shares_sold) || Number(holding.sale_count) || Number(holding.realized_gain))
          ? `<section>
              <h3>${t("sheet.sold")}</h3>
              <dl class="symbol-sheet-stats">
                ${stat(t("progress.realized"), `<span class="${pnlClass(holding.realized_gain)}">${signedMoney(holding.realized_gain, currency)} (${signedPct(holding.realized_gain_pct)})</span>`)}
                ${stat(t("sheet.soldShares"), num(holding.shares_sold, 4))}
                ${stat(t("sheet.saleCount"), num(holding.sale_count, 0))}
              </dl>
            </section>`
          : ""
      }
      ${
        guest || matchPlan
          ? `<section>
              <h3>${t("sheet.plan")}</h3>
              ${guest ? `<p class="muted">${t("guest.trackCtaPlain")}</p>` : planBlock}
            </section>`
          : ""
      }
      <section>
        <h3>${t("progress.lotsLabel")}</h3>
        ${lotsHtml}
      </section>
      <section>
        <h3>${t("sheet.history")}</h3>
        ${guest ? `<p class="muted">${t("progress.signinHistory")}</p>` : historyHtml}
      </section>
      ${
        watch.symbol
          ? `<section>
              <h3>${t("nav.track")}</h3>
              <dl class="symbol-sheet-stats">
                <div><dt>${t("track.sinceAdded")}</dt><dd class="${pnlClass(watch.change_since_added_pct)}">${watch.change_since_added_pct == null ? "—" : signedPct(watch.change_since_added_pct)}</dd></div>
                <div><dt>${t("track.6m")}</dt><dd class="${pnlClass(watch.change_6m_pct)}">${watch.change_6m_pct == null ? "—" : signedPct(watch.change_6m_pct)}</dd></div>
                <div><dt>${t("track.1y")}</dt><dd class="${pnlClass(watch.change_1y_pct)}">${watch.change_1y_pct == null ? "—" : signedPct(watch.change_1y_pct)}</dd></div>
              </dl>
              ${watch.id && !guest ? `<button type="button" class="link-btn" data-remove-watch="${escapeHtml(watch.id)}">${t("track.remove")}</button>` : ""}
            </section>`
          : ""
      }
      <div class="row-actions">
        <button type="button" class="row-action" data-open-plan="${escapeHtml(quote?.symbol || symbol)}">${t("list.plan")}</button>
        <button type="button" class="row-action" data-open-progress="${escapeHtml(quote?.symbol || symbol)}">${t("plan.logBuy")}</button>
        <button type="button" class="row-action" data-add-track="${escapeHtml(quote?.symbol || symbol)}">${t("list.trackShort")}</button>
        <button type="button" class="row-action" data-open-ideas="${escapeHtml(quote?.symbol || symbol)}">${t("plan.openIdeas")}</button>
        <button type="button" class="row-action" data-open-suggestions="${escapeHtml(quote?.symbol || symbol)}">${t("plan.openSuggestions")}</button>
      </div>
    `;
    global.SbpListTools?.bindRowActions?.(body);
    body.querySelector("[data-open-history]")?.addEventListener("click", (event) => {
      openHistory(event.currentTarget.getAttribute("data-open-history"));
    });
    body.querySelector("[data-remove-watch]")?.addEventListener("click", async (event) => {
      const id = event.currentTarget.getAttribute("data-remove-watch");
      if (!id || !confirm(t("track.removeConfirm"))) return;
      try {
        const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(t("track.removeFailed") || t("common.failed"));
        closeSheet();
        global.location.reload();
      } catch (err) {
        alert(err.message || t("common.failed"));
      }
    });
  }

  async function openSheet(symbol, seed = {}) {
    if (!symbol) return;
    currentSymbol = symbol;
    ensureRoot();
    root.hidden = false;
    document.body.classList.add("progress-modal-open");
    const body = document.getElementById("symbol-sheet-body");
    if (body) body.innerHTML = `<p class="muted">${t("common.loading")}</p>`;
    let quote = null;
    let progress = null;
    let transactions = [];
    let error = "";
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}?include_dividends=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || t("common.failedLoad"));
      quote = data;
    } catch (err) {
      error = err.message || t("row.errorMuted");
    }
    if (global.SbpAuth?.isAuthenticated?.() ?? false) {
      if (global.SbpCache) {
        try {
          progress = await global.SbpCache.fetchKey(global.SbpCache.KEYS.progress);
        } catch {
          /* ignore */
        }
      }
      try {
        const res = await fetch("/api/transactions?page_size=all");
        const data = await res.json().catch(() => ({}));
        if (res.ok) transactions = data.transactions || [];
      } catch {
        /* ignore */
      }
    }
    if (currentSymbol !== symbol) return;
    render(symbol, { quote, progress, error, seed, transactions });
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-open-sheet]");
    if (!trigger) return;
    event.preventDefault();
    openSheet(trigger.getAttribute("data-open-sheet"));
  });

  global.SbpSymbolSheet = { open: openSheet, close: closeSheet, HISTORY_KEY };
})(window);
