(function (global) {
  const t = (key, vars) => (global.SbpI18n && global.SbpI18n.t(key, vars)) || key;
  const PLAN_KEY = "sbp:plan:lastSearch";

  const CTX_KEY = "sbp:symbol-context";
  const COMPARE_PREFIX = "sbp:compare:";

  function setSymbolContext(payload) {
    try {
      localStorage.setItem(CTX_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  function consumeSymbolContext() {
    try {
      const raw = localStorage.getItem(CTX_KEY);
      if (!raw) return null;
      localStorage.removeItem(CTX_KEY);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function showGuestCta(nextPath) {
    const el = document.getElementById("sbp-guest-cta");
    if (!el) {
      const err = new Error(t("guest.trackCtaPlain"));
      err.code = "GUEST";
      throw err;
    }
    el.hidden = false;
    el.querySelectorAll("a[href]").forEach((link) => {
      link.setAttribute("href", global.SbpAuth?.loginUrl?.(nextPath || "/track") || "/login?next=%2Ftrack");
    });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const err = new Error("GUEST");
    err.code = "GUEST";
    throw err;
  }

  function saveCompare(page, payload) {
    try {
      sessionStorage.setItem(COMPARE_PREFIX + page, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function loadCompare(page) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(COMPARE_PREFIX + page) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async function addToTrack(symbol) {
    if (!symbol) return;
    if (!(global.SbpAuth?.isAuthenticated?.() ?? false)) {
      showGuestCta("/track");
    }
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ symbol, price_source: "yahoo" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || item).join(", ")
        : data.detail;
      throw new Error(detail || t("track.addFailed"));
    }
    return data;
  }

  function openInPlan(symbol) {
    try {
      const prev = JSON.parse(localStorage.getItem(PLAN_KEY) || "{}");
      localStorage.setItem(
        PLAN_KEY,
        JSON.stringify({ ...prev, symbol })
      );
    } catch {
      try {
        localStorage.setItem(PLAN_KEY, JSON.stringify({ symbol }));
      } catch {
        /* ignore */
      }
    }
    global.location.href = "/plan";
  }

  function openInProgress(symbol, extra = {}) {
    setSymbolContext({ symbol, intent: "progress", ...extra });
    global.location.href = "/progress";
  }

  function openInIdeas(symbol) {
    setSymbolContext({ symbol, intent: "ideas" });
    global.location.href = "/ideas";
  }

  function openInSuggestions(symbol) {
    setSymbolContext({ symbol, intent: "suggestions" });
    global.location.href = "/suggestions";
  }

  function currentCalendarYear() {
    return String(new Date().getFullYear());
  }

  function dividendSeries(years, byYear) {
    return (years || []).map((year) => ({
      year: String(year),
      value: Number(byYear?.[year]) || 0,
    }));
  }

  function completedDividendPoints(series) {
    const current = currentCalendarYear();
    return (Array.isArray(series) ? series : []).filter((point) => {
      if (typeof point === "number") return false;
      return point.year !== current;
    });
  }

  function dividendsFalling(series) {
    const completed = completedDividendPoints(series).filter((point) => point.value > 0);
    if (completed.length < 2) return false;
    const last = completed[completed.length - 1].value;
    const prev = completed[completed.length - 2].value;
    return last < prev * 0.98;
  }

  function sparkline(series, falling) {
    const current = currentCalendarYear();
    const points = (Array.isArray(series) ? series : []).map((point, index) =>
      typeof point === "number"
        ? { year: String(index), value: point, ytd: false }
        : { year: String(point.year), value: Number(point.value) || 0, ytd: String(point.year) === current }
    );
    if (!points.length) return "";
    const values = points.map((point) => point.value);
    const w = 88;
    const h = 28;
    const max = Math.max(...values, 0.01);
    const step = points.length > 1 ? w / (points.length - 1) : w;
    const lastCompletedIndex = points.reduce((found, point, index) => (point.ytd ? found : index), -1);
    const pts = values
      .map((value, index) => `${index * step},${(h - 2 - (value / max) * (h - 4)).toFixed(1)}`)
      .join(" ");
    const bars = points
      .map((point, index) => {
        const bw = Math.max(4, w / points.length - 3);
        const x = index * (w / points.length) + 1;
        const bh = Math.max(2, (point.value / max) * (h - 4));
        const cls = [
          point.ytd ? "is-ytd" : "",
          falling && index === lastCompletedIndex ? "is-down-year" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(h - 2 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1"/>`;
      })
      .join("");
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}<polyline points="${pts}" fill="none"/></svg>`;
  }

  function scoreBar(score, maxScore) {
    const max = maxScore > 0 ? maxScore : 1;
    const pct = Math.max(0, Math.min(100, (Number(score) / max) * 100));
    const label = score == null || Number.isNaN(Number(score)) ? "—" : Number(score).toFixed(1);
    return `<span class="score-cell"><span class="score-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span><strong>${label}</strong></span>`;
  }

  function bindRowActions(root, { onTracked } = {}) {
    if (!root || root.dataset.rowActionsBound) return;
    root.dataset.rowActionsBound = "true";
    root.addEventListener("click", async (event) => {
      const trackBtn = event.target.closest("[data-add-track]");
      if (trackBtn) {
        event.preventDefault();
        const symbol = trackBtn.getAttribute("data-add-track");
        trackBtn.disabled = true;
        try {
          await addToTrack(symbol);
          trackBtn.textContent = t("list.trackedShort") || t("list.tracked");
          onTracked?.(symbol);
        } catch (err) {
          trackBtn.disabled = false;
          if (err.code !== "GUEST") alert(err.message || t("track.addFailed"));
        }
        return;
      }
      const planBtn = event.target.closest("[data-open-plan]");
      if (planBtn) {
        event.preventDefault();
        openInPlan(planBtn.getAttribute("data-open-plan"));
        return;
      }
      const progressBtn = event.target.closest("[data-open-progress]");
      if (progressBtn) {
        event.preventDefault();
        openInProgress(progressBtn.getAttribute("data-open-progress"));
        return;
      }
      const ideasBtn = event.target.closest("[data-open-ideas]");
      if (ideasBtn) {
        event.preventDefault();
        openInIdeas(ideasBtn.getAttribute("data-open-ideas"));
        return;
      }
      const suggestionsBtn = event.target.closest("[data-open-suggestions]");
      if (suggestionsBtn) {
        event.preventDefault();
        openInSuggestions(suggestionsBtn.getAttribute("data-open-suggestions"));
      }
    });
  }

  global.SbpListTools = {
    addToTrack,
    openInPlan,
    openInProgress,
    openInIdeas,
    openInSuggestions,
    setSymbolContext,
    consumeSymbolContext,
    saveCompare,
    loadCompare,
    dividendSeries,
    dividendsFalling,
    sparkline,
    scoreBar,
    bindRowActions,
  };
})(window);
