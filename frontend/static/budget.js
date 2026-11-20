const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const helpIcon = (text) => (window.SbpI18n?.helpIcon ? window.SbpI18n.helpIcon(text) : "");

const pageLoader = document.getElementById("page-loader");
const pageLoaderText = document.getElementById("page-loader-text");
const planList = document.getElementById("budget-plan-list");
const newPlanBtn = document.getElementById("budget-new-btn");
const form = document.getElementById("budget-form");
const formTitle = document.getElementById("budget-form-title");
const nameInput = document.getElementById("budget-name");
const startInput = document.getElementById("budget-start");
const endInput = document.getElementById("budget-end");
const windowHint = document.getElementById("budget-window-hint");
const amountInput = document.getElementById("budget-amount");
const currencySelect = document.getElementById("budget-currency");
const itemsEl = document.getElementById("budget-items");
const addItemBtn = document.getElementById("budget-add-item");
const allocationEl = document.getElementById("budget-allocation");
const includeUnplanned = document.getElementById("budget-include-unplanned");
const cancelBtn = document.getElementById("budget-cancel-btn");
const saveBtn = document.getElementById("budget-save-btn");
const deleteBtn = document.getElementById("budget-delete-btn");
const formError = document.getElementById("budget-form-error");
const formOk = document.getElementById("budget-form-ok");
const symbolOptions = document.getElementById("budget-symbol-options");
const statusEl = document.getElementById("budget-status");
const refreshBtn = document.getElementById("budget-refresh-btn");
const content = document.getElementById("budget-content");

const SELECTED_KEY = "sbp:budget:selected";
const MAX_MONTHS = 120;
const MAX_ITEMS = 25;
const PACE_TOLERANCE_PCT = 5;

const state = {
  plans: [],
  selectedId: null,
  editingId: null,
  detail: null,
  loadedAt: 0,
  monthInputSupported: true,
};

function locale() {
  return document.documentElement.lang === "el" ? "el-GR" : undefined;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isNum(value) {
  return value != null && !Number.isNaN(Number(value));
}

function money(value, currency = "EUR", { digits = 2 } = {}) {
  if (!isNum(value)) return "—";
  try {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(digits)} ${currency}`;
  }
}

function signedMoney(value, currency) {
  if (!isNum(value)) return "—";
  const n = Number(value);
  const formatted = money(Math.abs(n), currency);
  if (n > 0.004) return `+${formatted}`;
  if (n < -0.004) return `−${formatted}`;
  return formatted;
}

function num(value, digits = 2) {
  if (!isNum(value)) return "—";
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(Number(value));
}

function pct(value, { signed = false } = {}) {
  if (!isNum(value)) return "—";
  const n = Number(value);
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${num(n, n !== 0 && Math.abs(n) < 10 ? 1 : 0)}%`;
}

function growthClass(value) {
  if (!isNum(value)) return "";
  if (Number(value) > 0.004) return "pos";
  if (Number(value) < -0.004) return "neg";
  return "";
}

function clampPct(value) {
  if (!isNum(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function showLoader(text) {
  if (pageLoaderText) pageLoaderText.textContent = text || t("common.loading");
  if (pageLoader) pageLoader.hidden = false;
}

function hideLoader() {
  if (pageLoader) pageLoader.hidden = true;
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text || "";
}

function showFormMessage({ error = "", ok = "" } = {}) {
  formError.textContent = error;
  formError.hidden = !error;
  formOk.textContent = ok;
  formOk.hidden = !ok;
}

function errorDetail(data, fallback) {
  if (Array.isArray(data?.detail)) {
    return data.detail.map((d) => d.msg || d).join(", ");
  }
  const detail = data?.detail;
  if (detail && typeof detail === "object" && detail.message) {
    return detail.code === "pro_required" ? `${detail.message} ${t("budget.upgradeHint")}` : detail.message;
  }
  return detail || fallback;

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(errorDetail(data, t("common.requestFailed")));
    err.status = res.status;
    if (res.status === 429) err.code = "RATE_LIMITED";
    throw err;
  }
  return data;
}

/* ---------- months ---------- */

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})/.exec(String(key || ""));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

function addMonths(key, count) {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  const index = parsed.year * 12 + parsed.month - 1 + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function monthSpan(startKey, endKey) {
  const a = parseMonthKey(startKey);
  const b = parseMonthKey(endKey);
  if (!a || !b) return 0;
  return (b.year - a.year) * 12 + (b.month - a.month) + 1;
}

function monthLabel(key, { long = false } = {}) {
  const parsed = parseMonthKey(key);
  if (!parsed) return key || "—";
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString(locale(), {
    month: long ? "long" : "short",
    year: "numeric",
  });
}

function shortMonth(key) {
  const parsed = parseMonthKey(key);
  if (!parsed) return key || "";
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString(locale(), { month: "short" });
}

function windowLabel(plan) {
  return `${monthLabel(plan.start_month)} – ${monthLabel(plan.end_month)}`;
}

/* ---------- plan list ---------- */

function phaseLabel(phase) {
  return t(`budget.phase.${phase}`);
}

function renderPlanList() {
  if (!state.plans.length) {
    planList.innerHTML = `<p class="muted budget-plan-empty">${t("budget.noPlans")}</p>`;
    return;
  }
  planList.innerHTML = state.plans
    .map((plan) => {
      const selected = String(plan.id) === String(state.selectedId);
      const month = plan.this_month;
      const meter = month
        ? `<span class="budget-mini-meter" aria-hidden="true"><i style="width:${clampPct(month.spent_pct).toFixed(1)}%"></i></span>
           <span class="budget-plan-chip-meta">${t("budget.chipThisMonth", {
             spent: money(month.spent, plan.currency, { digits: 0 }),
             budget: money(month.budget, plan.currency, { digits: 0 }),
           })}</span>`
        : `<span class="budget-plan-chip-meta">${t("budget.chipTotal", {
            spent: money(plan.spent_to_date, plan.currency, { digits: 0 }),
          })}</span>`;
      return `
        <button type="button" class="budget-plan-chip${selected ? " is-selected" : ""}" data-plan-id="${plan.id}" role="listitem" aria-pressed="${selected}">
          <span class="budget-plan-chip-head">
            <span class="budget-plan-chip-name">${escapeHtml(plan.name)}</span>
            <span class="budget-phase budget-phase-${escapeHtml(plan.phase)}">${phaseLabel(plan.phase)}</span>
          </span>
          <span class="budget-plan-chip-meta">${escapeHtml(windowLabel(plan))} · ${money(plan.budget, plan.currency, { digits: 0 })}/${t("budget.perMonthShort")}</span>
          ${meter}
        </button>`;
    })
    .join("");
}

/* ---------- form ---------- */

function defaultWindow() {
  const start = monthKeyOf(new Date());
  const end = `${new Date().getFullYear() + 1}-12`;
  return { start, end };
}

function itemRowHtml({ symbol = "", amount = "" } = {}) {
  const currency = currencySelect.value || "EUR";
  return `
    <div class="budget-item-row" data-item-row>
      <label class="md-field">
        <input data-item-symbol type="text" maxlength="20" list="budget-symbol-options" placeholder=" " value="${escapeHtml(symbol)}" autocomplete="off" />
        <span class="md-field-label">${t("budget.ticker")}</span>
      </label>
      <label class="md-field">
        <input data-item-amount type="number" min="0.01" step="any" placeholder=" " value="${escapeHtml(amount)}" />
        <span class="md-field-label" data-item-amount-label>${t("budget.itemAmount", { c: currency })}</span>
      </label>
      <button type="button" class="budget-item-remove" data-item-remove aria-label="${escapeHtml(t("budget.removeItem"))}">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>`;
}

function addItemRow(values = {}, { focus = false } = {}) {
  if (itemsEl.querySelectorAll("[data-item-row]").length >= MAX_ITEMS) {
    showFormMessage({ error: t("budget.errTooMany", { n: MAX_ITEMS }) });
    return;
  }
  itemsEl.insertAdjacentHTML("beforeend", itemRowHtml(values));
  if (focus) itemsEl.lastElementChild?.querySelector("[data-item-symbol]")?.focus();
  updateAllocation();
}

function setFormMode(plan) {
  state.editingId = plan ? plan.id : "new";
  formTitle.textContent = plan ? t("budget.formEdit") : t("budget.formNew");
  saveBtn.textContent = plan ? t("budget.update") : t("budget.save");
  deleteBtn.hidden = !plan;
}

function fillForm(plan) {
  setFormMode(plan);
  const fallback = defaultWindow();
  nameInput.value = plan?.name || "";
  startInput.value = plan?.start_month || fallback.start;
  endInput.value = plan?.end_month || fallback.end;
  amountInput.value = plan?.monthly_amount ?? "";
  currencySelect.value = plan?.currency || "EUR";
  includeUnplanned.checked = plan ? Boolean(plan.include_unplanned) : true;
  itemsEl.innerHTML = "";
  const items = plan?.items?.length ? plan.items : [{}];
  for (const item of items) {
    addItemRow({
      symbol: item.requested_symbol || item.symbol || "",
      amount: item.monthly_amount ?? "",
    });
  }
  showFormMessage();
  updateWindowHint();
  updateAllocation();
}

function readItems() {
  return [...itemsEl.querySelectorAll("[data-item-row]")].map((row) => ({
    symbol: row.querySelector("[data-item-symbol]").value.trim().toUpperCase(),
    amountRaw: row.querySelector("[data-item-amount]").value.trim(),
  }));
}

function readForm() {
  const items = readItems().filter((item) => item.symbol || item.amountRaw);
  const amountRaw = amountInput.value.trim();
  return {
    name: nameInput.value.trim() || null,
    start_month: startInput.value.trim(),
    end_month: endInput.value.trim(),
    monthly_amount: amountRaw === "" ? null : Number(amountRaw),
    currency: currencySelect.value || "EUR",
    include_unplanned: includeUnplanned.checked,
    items: items.map((item) => ({
      symbol: item.symbol,
      monthly_amount: item.amountRaw === "" ? NaN : Number(item.amountRaw),
    })),
  };
}

function validateForm(body) {
  const start = parseMonthKey(body.start_month);
  const end = parseMonthKey(body.end_month);
  if (!start || !end) return t("budget.errMonths");
  const span = monthSpan(body.start_month, body.end_month);
  if (span < 1) return t("budget.errOrder");
  if (span > MAX_MONTHS) return t("budget.errLong", { n: MAX_MONTHS });
  if (body.monthly_amount != null && (!Number.isFinite(body.monthly_amount) || body.monthly_amount < 0)) {
    return t("budget.errAmount");
  }
  const seen = new Set();
  for (const item of body.items) {
    if (!item.symbol) return t("budget.errTicker");
    if (!Number.isFinite(item.monthly_amount) || item.monthly_amount <= 0) {
      return t("budget.errItemAmount", { symbol: item.symbol });
    }
    if (seen.has(item.symbol)) return t("budget.errDuplicate", { symbol: item.symbol });
    seen.add(item.symbol);
  }
  if (!body.items.length && !body.monthly_amount) return t("budget.errEmpty");
  return "";
}

function updateWindowHint() {
  const span = monthSpan(startInput.value, endInput.value);
  const formatHint = state.monthInputSupported ? "" : ` ${t("budget.monthFormat")}`;
  if (span < 1 || span > MAX_MONTHS) {
    windowHint.textContent = `${t("budget.windowInvalid")}${formatHint}`;
    windowHint.classList.add("is-warning");
    return;
  }
  windowHint.classList.remove("is-warning");
  windowHint.textContent = `${t(span === 1 ? "budget.monthsOne" : "budget.monthsN", { n: span })} · ${monthLabel(
    startInput.value
  )} – ${monthLabel(endInput.value)}${formatHint}`;
}

function updateAllocation() {
  const currency = currencySelect.value || "EUR";
  for (const label of itemsEl.querySelectorAll("[data-item-amount-label]")) {
    label.textContent = t("budget.itemAmount", { c: currency });
  }
  const planned = readItems().reduce((sum, item) => sum + (Number(item.amountRaw) || 0), 0);
  const amountRaw = amountInput.value.trim();
  const budget = amountRaw === "" ? planned : Number(amountRaw) || 0;
  const span = Math.max(0, monthSpan(startInput.value, endInput.value));
  if (!budget && !planned) {
    allocationEl.innerHTML = `<p class="muted">${t("budget.allocEmpty")}</p>`;
    return;
  }
  const ratio = budget ? (planned / budget) * 100 : 100;
  const over = planned - budget > 0.004;
  const free = budget - planned;
  let note;
  if (amountRaw === "") note = t("budget.allocAuto");
  else if (over) note = t("budget.allocOver", { amount: money(planned - budget, currency) });
  else if (free > 0.004) note = t("budget.allocFree", { amount: money(free, currency) });
  else note = t("budget.allocExact");
  allocationEl.innerHTML = `
    <div class="budget-allocation-head">
      <span>${t("budget.allocPlanned", { planned: money(planned, currency), budget: money(budget, currency) })}</span>
      <strong class="${over ? "neg" : ""}">${pct(ratio)}</strong>
    </div>
    <span class="budget-meter${over ? " is-over" : ""}" aria-hidden="true"><i style="width:${clampPct(ratio).toFixed(1)}%"></i></span>
    <p class="budget-allocation-note${over ? " neg" : ""}">${escapeHtml(note)}</p>
    ${
      span > 0 && span <= MAX_MONTHS && budget
        ? `<p class="budget-allocation-note">${t("budget.allocTotal", {
            total: money(budget * span, currency, { digits: 0 }),
            n: span,
          })}</p>`
        : ""
    }`;
}

async function submitForm(event) {
  event.preventDefault();
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false)) {
    window.location.href = window.SbpAuth?.loginUrl?.("/budget") || "/login?next=%2Fbudget";
    return;
  }
  const body = readForm();
  const problem = validateForm(body);
  if (problem) {
    showFormMessage({ error: problem });
    return;
  }
  showFormMessage();
  const editing = state.editingId && state.editingId !== "new" ? state.editingId : null;
  saveBtn.disabled = true;
  saveBtn.textContent = t("budget.saving");
  try {
    const saved = await api(editing ? `/api/budget-plans/${editing}` : "/api/budget-plans", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    showFormMessage({ ok: editing ? t("budget.updated") : t("budget.created") });
    await loadPlans({ select: saved.id });
  } catch (err) {
    showFormMessage({ error: err.message || t("common.somethingWrong") });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = state.editingId && state.editingId !== "new" ? t("budget.update") : t("budget.save");
  }
}

async function deletePlan() {
  const id = state.editingId;
  if (!id || id === "new") return;
  const plan = state.plans.find((row) => String(row.id) === String(id));
  if (!confirm(t("budget.deleteConfirm", { name: plan?.name || "" }))) return;
  try {
    await api(`/api/budget-plans/${id}`, { method: "DELETE" });
    if (String(state.selectedId) === String(id)) state.selectedId = null;
    await loadPlans();
    showFormMessage({ ok: t("budget.deleted") });
  } catch (err) {
    showFormMessage({ error: err.message || t("common.somethingWrong") });
  }
}

/* ---------- detail ---------- */

function stat(label, value, { sub = "", tip = "", className = "" } = {}) {
  return `
    <div class="stat budget-stat">
      <span class="label">${escapeHtml(label)}${tip ? ` ${helpIcon(tip)}` : ""}</span>
      <span class="value ${className}">${value}</span>
      ${sub ? `<span class="budget-stat-sub">${sub}</span>` : ""}
    </div>`;
}

function meter(label, valueText, percent, { tone = "" } = {}) {
  return `
    <div class="budget-progress-row">
      <div class="budget-progress-head"><span>${escapeHtml(label)}</span><span>${valueText}</span></div>
      <span class="budget-meter ${tone}" aria-hidden="true"><i style="width:${clampPct(percent).toFixed(1)}%"></i></span>
    </div>`;
}

function paceBadge(data) {
  const totals = data.totals;
  if (!totals.months_elapsed) return "";
  // Unallocated money is meant to stay as cash, so pace follows the stocks' amounts.
  const planned = Number(data.allocation.planned) || 0;
  const invested =
    data.plan.items.length && planned
      ? ((Number(totals.spent_to_date) || 0) / (planned * totals.months_total)) * 100
      : Number(totals.plan_progress_pct) || 0;
  const time = Number(totals.time_progress_pct) || 0;
  const diff = invested - time;
  let key = "budget.paceOn";
  let tone = "is-on";
  if (diff < -PACE_TOLERANCE_PCT) {
    key = "budget.paceBehind";
    tone = "is-behind";
  } else if (diff > PACE_TOLERANCE_PCT) {
    key = "budget.paceAhead";
    tone = "is-ahead";
  }
  return `<span class="budget-pace ${tone}">${t(key)}</span>`;
}

function renderHeader(data) {
  const plan = data.plan;
  const c = data.currency;
  const alloc = data.allocation;
  let allocNote = "";
  if (alloc.over_allocated > 0) {
    allocNote = `<span class="data-chip is-stale">${t("budget.allocOver", { amount: money(alloc.over_allocated, c) })}</span>`;
  } else if (alloc.unallocated > 0 && plan.items.length) {
    allocNote = `<span class="data-chip">${t("budget.allocFree", { amount: money(alloc.unallocated, c) })}</span>`;
  }
  return `
    <header class="budget-head">
      <div class="budget-head-main">
        <h2 class="panel-title">${escapeHtml(plan.name)}</h2>
        <p class="muted">${escapeHtml(windowLabel(plan))} · ${t("budget.perMonth", {
          amount: money(alloc.budget, c),
        })}</p>
        <div class="data-chip-row">
          <span class="budget-phase budget-phase-${escapeHtml(data.phase)}">${phaseLabel(data.phase)}</span>
          <span class="data-chip">${escapeHtml(c)}</span>
          ${allocNote}
          ${
            plan.include_unplanned || !plan.items.length
              ? `<span class="data-chip">${t("budget.countsAll")}</span>`
              : `<span class="data-chip">${t("budget.countsPlanned")}</span>`
          }
        </div>
      </div>
      <button type="button" class="btn-secondary budget-edit-btn" data-edit-plan="${plan.id}">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        <span>${t("budget.edit")}</span>
      </button>
    </header>`;
}

function renderOverview(data) {
  const totals = data.totals;
  const c = data.currency;
  const marketMissing = data.market && totals.market_value == null;
  const progressBars = `
    <div class="budget-progress">
      <div class="budget-progress-top">
        <h3>${t("budget.overall")}</h3>
        ${paceBadge(data)}
      </div>
      ${meter(
        t("budget.investedOfTotal"),
        `${money(totals.spent_to_date, c)} / ${money(totals.budget_total, c)} · ${pct(totals.plan_progress_pct)}`,
        totals.plan_progress_pct
      )}
      ${meter(
        t("budget.timeElapsed"),
        `${t("budget.monthsOf", { n: totals.months_elapsed, total: totals.months_total })} · ${pct(totals.time_progress_pct)}`,
        totals.time_progress_pct,
        { tone: "is-time" }
      )}
    </div>`;

  const setAsideSub =
    data.phase === "active" && totals.current_month_left > 0
      ? t("budget.setAsideSub", { amount: money(totals.current_month_left, c) })
      : "";
  const dividendSub =
    totals.dividends_tax > 0 ? t("budget.dividendsSub", { amount: money(totals.dividends_tax, c) }) : "";
  const trackSub =
    totals.on_track_streak > 1 ? t("budget.streak", { n: totals.on_track_streak }) : "";

  const stats = [
    stat(t("budget.kpiInvested"), money(totals.spent_to_date, c), {
      sub: t("budget.kpiInvestedSub", {
        pct: pct(totals.spent_pct_to_date),
        budget: money(totals.budget_to_date, c),
      }),
      tip: t("budget.tipInvested"),
    }),
    stat(t("budget.kpiSetAside"), money(totals.unspent_past, c), {
      sub: setAsideSub,
      tip: t("budget.tipSetAside"),
      className: Number(totals.unspent_past) < 0 ? "neg" : "",
    }),
    stat(t("budget.kpiDividends"), money(totals.dividends_net, c), {
      sub: dividendSub,
      tip: t("budget.tipDividends"),
      className: totals.dividends_net > 0 ? "pos" : "",
    }),
    stat(t("budget.kpiValue"), marketMissing ? "—" : money(totals.market_value, c), {
      sub: t("budget.kpiValueSub", { cost: money(totals.open_cost, c) }),
      tip: t("budget.tipValue"),
    }),
    stat(
      t("budget.kpiGrowth"),
      marketMissing ? "—" : signedMoney(totals.unrealized_gain, c),
      {
        sub: marketMissing ? "" : pct(totals.unrealized_gain_pct, { signed: true }),
        tip: t("help.unrealized"),
        className: growthClass(totals.unrealized_gain),
      }
    ),
    stat(t("budget.kpiReturn"), marketMissing ? "—" : signedMoney(totals.total_return, c), {
      sub: marketMissing ? "" : pct(totals.total_return_pct, { signed: true }),
      tip: t("budget.tipReturn"),
      className: growthClass(totals.total_return),
    }),
    stat(t("budget.kpiCash"), money(totals.cash_available, c), {
      tip: t("budget.tipCash"),
    }),
    stat(
      t("budget.kpiOnTrack"),
      totals.months_past ? `${totals.months_on_track} / ${totals.months_past}` : "—",
      { sub: trackSub || (totals.months_past ? t("budget.kpiOnTrackSub") : t("budget.kpiOnTrackNone")), tip: t("budget.tipOnTrack") }
    ),
  ];

  return `${progressBars}<div class="summary budget-summary">${stats.join("")}</div>`;
}

function lineStateBadge(state) {
  return `<span class="budget-state budget-state-${escapeHtml(state)}">${t(`budget.state.${state}`)}</span>`;
}

function renderThisMonth(data) {
  const c = data.currency;
  if (data.phase === "upcoming") {
    return `
      <section class="budget-card budget-month-card">
        <h3>${t("budget.startsTitle", { month: monthLabel(data.plan.start_month, { long: true }) })}</h3>
        <p class="muted">${t(data.starts_in_months === 1 ? "budget.startsInOne" : "budget.startsIn", {
          n: data.starts_in_months,
        })}</p>
      </section>`;
  }
  if (data.phase === "ended") {
    return `
      <section class="budget-card budget-month-card">
        <h3>${t("budget.endedTitle", { month: monthLabel(data.plan.end_month, { long: true }) })}</h3>
        <p class="muted">${t("budget.endedLede", {
          spent: money(data.totals.spent_to_date, c),
          budget: money(data.totals.budget_total, c),
        })}</p>
      </section>`;
  }
  const month = data.this_month;
  if (!month) return "";
  const lines = month.lines
    .map((line) => {
      const estimate =
        line.remaining > 0 && line.est_shares != null
          ? t("budget.estShares", {
              shares: num(line.est_shares, line.est_shares >= 10 ? 1 : 3),
              price: money(line.price_native ?? line.price, line.price_currency || c),
            })
          : "";
      const prefill = line.whole_shares >= 1 ? line.whole_shares : line.est_shares;
      const action =
        line.remaining > 0
          ? `<button type="button" class="row-action" data-log-buy="${escapeHtml(line.symbol)}"${
              prefill ? ` data-shares="${escapeHtml(prefill)}"` : ""
            }>${t("budget.logBuy")}</button>`
          : `<span class="material-symbols-outlined budget-check" aria-label="${escapeHtml(t("budget.state.done"))}">check_circle</span>`;
      return `
        <li class="budget-line">
          <div class="budget-line-name">
            <button type="button" class="sheet-name" data-open-sheet="${escapeHtml(line.symbol)}">${escapeHtml(line.name)}</button>
            <small>${escapeHtml(line.symbol)} · ${lineStateBadge(line.state)}</small>
          </div>
          <div class="budget-line-amounts">
            <strong>${money(line.spent, c)} / ${money(line.target, c)}</strong>
            <small>${
              line.remaining > 0 ? `${t("budget.toGo", { amount: money(line.remaining, c) })}${estimate ? ` · ${estimate}` : ""}` : t("budget.lineDone")
            }</small>
          </div>
          <div class="budget-line-action">${action}</div>
        </li>`;
    })
    .join("");
  const leftText =
    month.left >= 0
      ? t("budget.monthLeft", { amount: money(month.left, c) })
      : t("budget.monthOver", { amount: money(-month.left, c) });
  return `
    <section class="budget-card budget-month-card">
      <div class="budget-card-head">
        <h3>${t("budget.thisMonth", { month: monthLabel(month.month, { long: true }) })}</h3>
        <span class="muted">${t(month.days_left === 1 ? "budget.dayLeft" : "budget.daysLeft", { n: month.days_left })}</span>
      </div>
      ${meter(
        `${money(month.spent, c)} / ${money(month.budget, c)}`,
        `<span class="${month.left < 0 ? "neg" : ""}">${leftText}</span>`,
        month.spent_pct,
        { tone: month.left < 0 ? "is-over" : "" }
      )}
      ${lines ? `<ul class="budget-lines">${lines}</ul>` : ""}
      ${
        month.unplanned_spent > 0
          ? `<p class="muted budget-note">${t("budget.unplannedThisMonth", { amount: money(month.unplanned_spent, c) })}</p>`
          : ""
      }
    </section>`;
}

function renderChart(data) {
  const rows = data.months;
  if (!rows.length) return "";
  const c = data.currency;
  const width = 640;
  const height = 170;
  const padTop = 12;
  const padBottom = 24;
  const chartH = height - padTop - padBottom;
  const budget = Number(data.allocation.budget) || 0;
  const maxValue = Math.max(budget, ...rows.map((row) => Number(row.spent) || 0), 1) * 1.12;
  const slot = width / rows.length;
  const barW = Math.max(3, Math.min(34, slot * 0.62));
  const labelEvery = Math.ceil(rows.length / 12);
  const y = (value) => padTop + chartH - (value / maxValue) * chartH;
  const bars = rows
    .map((row, index) => {
      const x = index * slot + (slot - barW) / 2;
      const spent = Number(row.spent) || 0;
      const top = y(spent);
      let cls = "is-upcoming";
      if (row.status !== "upcoming") {
        if (row.overspent) cls = "is-over";
        else if (row.on_track) cls = "is-on";
        else if (row.status === "current") cls = "is-current";
        else cls = "is-under";
      }
      const title = `${monthLabel(row.month)}: ${money(row.spent, c)} / ${money(row.budget, c)}`;
      const bar =
        row.status === "upcoming"
          ? `<rect class="budget-bar ${cls}" x="${x.toFixed(1)}" y="${y(budget).toFixed(1)}" width="${barW.toFixed(1)}" height="${(padTop + chartH - y(budget)).toFixed(1)}" rx="3"><title>${escapeHtml(monthLabel(row.month))}</title></rect>`
          : `<rect class="budget-bar ${cls}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(spent > 0 ? 2 : 0, padTop + chartH - top).toFixed(1)}" rx="3"><title>${escapeHtml(title)}</title></rect>`;
      const label =
        index % labelEvery === 0
          ? `<text class="budget-axis" x="${(index * slot + slot / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`
          : "";
      return bar + label;
    })
    .join("");
  const budgetLine = budget
    ? `<line class="budget-line-target" x1="0" x2="${width}" y1="${y(budget).toFixed(1)}" y2="${y(budget).toFixed(1)}" />`
    : "";
  return `
    <section class="budget-card">
      <div class="budget-card-head">
        <h3>${t("budget.chartTitle")}</h3>
        <span class="budget-legend">
          <span><i class="is-on"></i>${t("budget.legendOn")}</span>
          <span><i class="is-under"></i>${t("budget.legendUnder")}</span>
          <span><i class="is-over"></i>${t("budget.legendOver")}</span>
          <span><i class="is-target"></i>${t("budget.legendBudget")}</span>
        </span>
      </div>
      <svg class="budget-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("budget.chartTitle"))}">
        ${budgetLine}${bars}
      </svg>
    </section>`;
}

function renderPositions(data) {
  const c = data.currency;
  if (!data.positions.length) return "";
  const rows = data.positions
    .map((p) => {
      const targetCell = p.planned
        ? `${money(p.monthly_target, c)}`
        : `<span class="data-chip">${t("budget.unplanned")}</span>`;
      const investedSub =
        p.planned && p.target_to_date ? `<small>${pct(p.spent_pct)} ${t("budget.ofTarget", { amount: money(p.target_to_date, c) })}</small>` : "";
      const valueCell = p.quote_error && p.shares_held > 0 ? `<span class="neg" title="${escapeHtml(p.quote_error)}">—</span>` : money(p.market_value, c);
      return `
        <tr>
          <td>
            <button type="button" class="sheet-name" data-open-sheet="${escapeHtml(p.symbol)}">${escapeHtml(p.name)}</button>
            <small class="budget-cell-sub">${escapeHtml(p.symbol)}${p.requested_symbol ? ` · ${escapeHtml(p.requested_symbol)}` : ""}</small>
          </td>
          <td>${targetCell}</td>
          <td>${money(p.spent, c)}${investedSub ? `<br />${investedSub}` : ""}</td>
          <td>${num(p.shares_held, 4)}${p.shares_held !== p.shares_bought ? `<br /><small>${t("budget.boughtShares", { n: num(p.shares_bought, 4) })}</small>` : ""}</td>
          <td>${money(p.avg_cost, c)}</td>
          <td>${valueCell}</td>
          <td class="${growthClass(p.unrealized_gain)}">${signedMoney(p.unrealized_gain, c)}${
            isNum(p.unrealized_gain_pct) ? `<br /><small>${pct(p.unrealized_gain_pct, { signed: true })}</small>` : ""
          }</td>
          <td class="${p.dividends > 0 ? "pos" : ""}">${money(p.dividends, c)}</td>
        </tr>`;
    })
    .join("");
  return `
    <section class="budget-card">
      <h3>${t("budget.stocksTitle")}</h3>
      <div class="table-wrap">
        <table class="budget-table">
          <thead>
            <tr>
              <th>${t("progress.stock")}</th>
              <th>${t("budget.colMonthly")}</th>
              <th>${t("budget.colInvested")}</th>
              <th>${t("progress.shares")}</th>
              <th>${t("budget.colAvgCost")}</th>
              <th>${t("budget.colValue")}</th>
              <th>${t("budget.colGrowth")}</th>
              <th>${t("budget.colDividends")}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderMonths(data) {
  const c = data.currency;
  const symbols = data.plan.items.map((item) => item.symbol);
  const rows = data.months
    .map((row) => {
      const dots = row.items
        .map(
          (item) =>
            `<span class="budget-dot budget-state-${escapeHtml(item.state)}" title="${escapeHtml(
              `${item.symbol}: ${money(item.spent, c)} / ${money(item.target, c)} · ${t(`budget.state.${item.state}`)}`
            )}"></span>`
        )
        .join("");
      const upcoming = row.status === "upcoming";
      return `
        <tr class="budget-row-${escapeHtml(row.status)}">
          <td>${escapeHtml(monthLabel(row.month))}${row.status === "current" ? ` <span class="budget-phase budget-phase-active">${t("budget.now")}</span>` : ""}</td>
          <td>${money(row.budget, c)}</td>
          <td>${upcoming ? "—" : money(row.spent, c)}</td>
          <td>${upcoming ? "—" : pct(row.spent_pct)}</td>
          <td class="${row.overspent ? "neg" : ""}">${upcoming ? "—" : signedMoney(row.left, c)}</td>
          <td>${row.set_aside == null ? "—" : money(row.set_aside, c)}</td>
          <td class="${row.dividends > 0 ? "pos" : ""}">${upcoming ? "—" : money(row.dividends, c)}</td>
          ${symbols.length ? `<td><span class="budget-dots">${dots}</span></td>` : ""}
        </tr>`;
    })
    .join("");
  return `
    <section class="budget-card">
      <details class="history-accordion budget-months" ${data.months.length <= 14 ? "open" : ""}>
        <summary>
          <span class="accordion-title">${t("budget.monthsTitle")}</span>
          <span class="accordion-hint">${t("budget.monthsHint")}</span>
        </summary>
        <div class="table-wrap">
          <table class="budget-table">
            <thead>
              <tr>
                <th>${t("budget.colMonth")}</th>
                <th>${t("budget.colBudget")}</th>
                <th>${t("budget.colInvested")}</th>
                <th>%</th>
                <th class="th-help">${t("budget.colLeft")} ${helpIcon(t("budget.tipLeft"))}</th>
                <th class="th-help">${t("budget.colSetAside")} ${helpIcon(t("budget.tipSetAside"))}</th>
                <th>${t("budget.colDividends")}</th>
                ${symbols.length ? `<th>${t("budget.colStocks")}</th>` : ""}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
    </section>`;
}

function renderProjection(data) {
  const projection = data.projection;
  if (!projection) return "";
  const c = data.currency;
  return `
    <section class="budget-card budget-projection">
      <h3>${t("budget.projTitle", { month: monthLabel(projection.end_month, { long: true }) })}</h3>
      <div class="budget-projection-grid">
        <div><span>${t("budget.projInvested")}</span><strong>${money(projection.invested, c)}</strong></div>
        <div><span>${t("budget.projValue")}</span><strong>${money(projection.value, c)}</strong></div>
        <div><span>${t("budget.projGain")}</span><strong class="${growthClass(projection.gain)}">${signedMoney(projection.gain, c)} <small>${pct(projection.gain_pct, { signed: true })}</small></strong></div>
        <div><span>${t("budget.projDividends")}</span><strong>${money(projection.annual_dividends, c)}</strong></div>
        <div><span>${t("budget.projCash")}</span><strong>${money(projection.cash_set_aside, c)}</strong></div>
      </div>
      <p class="disclaimer">${t("budget.projDisclaimer")}</p>
    </section>`;
}

function renderWarnings(data) {
  const warnings = data.warnings || {};
  const notes = [];
  if (warnings.fx_missing?.length) {
    notes.push(t("budget.warnFx", { list: warnings.fx_missing.join(", "), c: data.currency }));
  }
  const quoteErrors = Object.keys(warnings.quote_errors || {});
  if (quoteErrors.length) notes.push(t("budget.warnQuotes", { list: quoteErrors.join(", ") }));
  if (warnings.excluded_buys) {
    notes.push(
      t(warnings.excluded_buys === 1 ? "budget.warnExcludedOne" : "budget.warnExcluded", {
        n: warnings.excluded_buys,
        amount: money(warnings.excluded_total, data.currency),
      })
    );
  }
  if (!notes.length) return "";
  return `<div class="budget-warnings" role="note">${notes
    .map((note) => `<p><span class="material-symbols-outlined" aria-hidden="true">info</span>${escapeHtml(note)}</p>`)
    .join("")}</div>`;
}

function renderNoBuysHint(data) {
  if (data.totals.buy_count || data.phase === "upcoming") return "";
  return `<p class="muted budget-note">${t("budget.noBuysYet")} <a href="/progress">${t("budget.openProgress")}</a></p>`;
}

function renderDetail(data) {
  state.detail = data;
  content.innerHTML = `
    ${renderHeader(data)}
    ${renderWarnings(data)}
    ${renderOverview(data)}
    ${renderNoBuysHint(data)}
    <div class="budget-columns">
      ${renderThisMonth(data)}
      ${renderProjection(data)}
    </div>
    ${renderChart(data)}
    ${renderPositions(data)}
    ${renderMonths(data)}
  `;
  updateStatus(data);
}

function renderIntro() {
  state.detail = null;
  content.innerHTML = `
    <section class="budget-intro">
      <h2 class="panel-title">${t("budget.introTitle")}</h2>
      <ol class="budget-steps">
        <li><span class="material-symbols-outlined" aria-hidden="true">date_range</span><div><strong>${t("budget.step1")}</strong><p class="muted">${t("budget.step1Body")}</p></div></li>
        <li><span class="material-symbols-outlined" aria-hidden="true">playlist_add</span><div><strong>${t("budget.step2")}</strong><p class="muted">${t("budget.step2Body")}</p></div></li>
        <li><span class="material-symbols-outlined" aria-hidden="true">insights</span><div><strong>${t("budget.step3")}</strong><p class="muted">${t("budget.step3Body")}</p></div></li>
      </ol>
    </section>`;
  setStatus(t("track.ready"));
}

function updateStatus(data) {
  const asOf = data?.as_of ? new Date(data.as_of) : null;
  setStatus(
    asOf
      ? t("budget.updatedAt", {
          time: asOf.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
        })
      : ""
  );
}

function renderDetailLoading() {
  content.innerHTML = `
    <div class="inline-loading">
      <div class="spinner spinner-sm" aria-hidden="true"></div>
      <span>${t("budget.loadingLive")}</span>
    </div>`;
}

async function loadDetail(planId, { force = false, quiet = false } = {}) {
  if (!planId) return;
  if (!quiet) renderDetailLoading();
  setStatus(force ? t("common.refreshing") : t("common.fetching"));
  try {
    const data = await api(`/api/budget-plans/${planId}${force ? "?force=1" : ""}`);
    if (String(planId) !== String(state.selectedId)) return;
    state.loadedAt = Date.now();
    renderDetail(data);
  } catch (err) {
    if (err.code === "RATE_LIMITED" && state.detail) {
      setStatus(err.message);
      return;
    }
    content.innerHTML = `<p class="error">${escapeHtml(err.message || t("common.failedLoad"))}</p>`;
    setStatus(t("common.failed"));
  }
}

function selectPlan(planId, { load = true } = {}) {
  const plan = state.plans.find((row) => String(row.id) === String(planId));
  if (!plan) return;
  state.selectedId = plan.id;
  try {
    localStorage.setItem(SELECTED_KEY, String(plan.id));
  } catch {
    /* ignore */
  }
  renderPlanList();
  fillForm(plan);
  if (load) loadDetail(plan.id);
}

function startNewPlan() {
  fillForm(null);
  nameInput.focus();
}

async function loadPlans({ select = null } = {}) {
  const data = await api("/api/budget-plans");
  state.plans = data.plans || [];
  let target = select ?? state.selectedId;
  if (target == null) {
    try {
      target = localStorage.getItem(SELECTED_KEY);
    } catch {
      target = null;
    }
  }
  if (!state.plans.some((plan) => String(plan.id) === String(target))) {
    target = (state.plans.find((plan) => plan.phase === "active") || state.plans[0])?.id ?? null;
  }
  renderPlanList();
  if (target == null) {
    state.selectedId = null;
    fillForm(null);
    renderIntro();
    return;
  }
  selectPlan(target);
}

async function loadSymbolOptions() {
  try {
    const data = await api("/api/positions");
    const symbols = new Set((data.positions || []).map((p) => p.symbol));
    for (const plan of state.plans) for (const item of plan.items || []) symbols.add(item.symbol);
    symbolOptions.innerHTML = [...symbols]
      .sort()
      .map((symbol) => `<option value="${escapeHtml(symbol)}"></option>`)
      .join("");
  } catch {
    /* suggestions are optional */
  }
}

/* ---------- events ---------- */

form.addEventListener("submit", submitForm);
form.addEventListener("input", (event) => {
  if (event.target === startInput || event.target === endInput) updateWindowHint();
  updateAllocation();
});
currencySelect.addEventListener("change", updateAllocation);
addItemBtn.addEventListener("click", () => addItemRow({}, { focus: true }));
itemsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-item-remove]");
  if (!btn) return;
  btn.closest("[data-item-row]")?.remove();
  if (!itemsEl.querySelector("[data-item-row]")) addItemRow();
  updateAllocation();
});
newPlanBtn.addEventListener("click", startNewPlan);
cancelBtn.addEventListener("click", () => {
  const plan = state.plans.find((row) => String(row.id) === String(state.selectedId));
  fillForm(plan || null);
});
deleteBtn.addEventListener("click", deletePlan);

planList.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-plan-id]");
  if (!chip) return;
  showFormMessage();
  selectPlan(chip.getAttribute("data-plan-id"));
});

content.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-plan]");
  if (editBtn) {
    const plan = state.plans.find((row) => String(row.id) === editBtn.getAttribute("data-edit-plan"));
    if (plan) {
      fillForm(plan);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInput.focus({ preventScroll: true });
    }
    return;
  }
  const buyBtn = event.target.closest("[data-log-buy]");
  if (buyBtn) {
    const shares = buyBtn.getAttribute("data-shares");
    window.SbpListTools?.openInProgress?.(buyBtn.getAttribute("data-log-buy"), shares ? { shares } : {});
  }
});

refreshBtn.addEventListener("click", async () => {
  if (refreshBtn.disabled) return;
  if (!state.selectedId) {
    await loadPlans().catch(() => {});
    return;
  }
  refreshBtn.disabled = true;
  refreshBtn.classList.add("is-spinning");
  try {
    await loadDetail(state.selectedId, { force: true, quiet: true });
  } finally {
    refreshBtn.classList.remove("is-spinning");
    refreshBtn.disabled = false;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.selectedId || !state.loadedAt) return;
  const minutes = window.SbpCache?.refreshMinutes || 15;
  if (Date.now() - state.loadedAt > minutes * 60 * 1000) {
    loadDetail(state.selectedId, { quiet: true });
  }
});

async function boot() {
  const probe = document.createElement("input");
  probe.setAttribute("type", "month");
  state.monthInputSupported = probe.type === "month";
  if (!state.monthInputSupported) {
    for (const input of [startInput, endInput]) {
      input.setAttribute("pattern", "\\d{4}-\\d{2}");
      input.setAttribute("inputmode", "numeric");
    }
  }
  if (!(window.SbpAuth?.isAuthenticated?.() ?? false)) {
    window.location.href = window.SbpAuth?.loginUrl?.("/budget") || "/login?next=%2Fbudget";
    return;
  }
  showLoader(t("budget.loading"));
  try {
    await loadPlans();
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message || t("common.failedLoad"))}</p>`;
    setStatus(t("common.failed"));
    fillForm(null);
  } finally {
    hideLoader();
  }
  loadSymbolOptions();
}

window.addEventListener("DOMContentLoaded", () => {
  if (window.SbpAuth?.whenAuthReady) {
    window.SbpAuth.whenAuthReady(boot);
  } else {
    boot();
  }
});
