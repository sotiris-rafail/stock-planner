/**
 * Shared session cache + background prefetch/refresh for Progress & Dividend ideas.
 * Warms endpoints on first load; revisits reuse session cache until it is stale.
 */
(function (global) {
  const PREFIX = "sbp:cache:";
  const TTL_MS = 60 * 60 * 1000; // keep cached payload for up to 1 hour
  const DEFAULT_REFRESH_MINUTES = 15;
  let refreshMinutes = DEFAULT_REFRESH_MINUTES;
  const MANUAL_REFRESH_LIMIT = 5;

  function getRefreshMs() {
    return refreshMinutes * 60 * 1000;
  }

  function getFreshMs() {
    return getRefreshMs();
  }

  function refreshIntervalLabel() {
    return `${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"}`;
  }

  const KEYS = {
    progress: "progress",
    dividendIdeas: "dividend-ideas",
    suggestions: "suggestions",
    watchlist: "watchlist",
  };

  const URLS = {
    [KEYS.progress]: "/api/progress",
    [KEYS.dividendIdeas]: "/api/dividend-ideas",
    [KEYS.suggestions]: "/api/suggestions",
    [KEYS.watchlist]: "/api/watchlist",
  };

  const inflight = new Map();
  const epochs = {
    [KEYS.progress]: 0,
    [KEYS.dividendIdeas]: 0,
    [KEYS.suggestions]: 0,
    [KEYS.watchlist]: 0,
  };
  const listeners = new Map(); // key -> Set<fn>
  let refreshTimer = null;
  let toastEl = null;
  let toastHideTimer = null;
  let toastDebounce = null;
  let lastRefreshAt = null;
  const refreshButtonSyncs = new Set();
  let refreshQuotaTimer = null;

  function registerRefreshButtonSync(fn) {
    refreshButtonSyncs.add(fn);
    if (refreshQuotaTimer) return;
    refreshQuotaTimer = global.setInterval(() => {
      for (const sync of refreshButtonSyncs) sync();
    }, 30_000);
  }

  function ensureToast() {
    if (toastEl && document.body.contains(toastEl)) return toastEl;
    toastEl = document.createElement("div");
    toastEl.id = "sbp-refresh-toast";
    toastEl.className = "sbp-refresh-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.hidden = true;
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function formatTime(date) {
    try {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return date.toLocaleTimeString();
    }
  }

  function showRefreshToast(when = new Date()) {
    lastRefreshAt = when;
    const el = ensureToast();
    el.textContent = `Refreshed data at ${formatTime(when)}`;
    el.hidden = false;
    el.classList.add("is-visible");
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastHideTimer = global.setTimeout(() => {
      el.classList.remove("is-visible");
      // keep in DOM for screen readers / quick re-show
      global.setTimeout(() => {
        if (!el.classList.contains("is-visible")) el.hidden = true;
      }, 280);
    }, 4500);
  }

  function scheduleRefreshToast() {
    if (toastDebounce) clearTimeout(toastDebounce);
    toastDebounce = global.setTimeout(() => {
      toastDebounce = null;
      showRefreshToast(new Date());
    }, 350);
  }

  function storageKey(key) {
    return PREFIX + key;
  }

  function readEntry(key) {
    try {
      const raw = sessionStorage.getItem(storageKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.data == null || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > TTL_MS) {
        sessionStorage.removeItem(storageKey(key));
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function get(key) {
    const entry = readEntry(key);
    return entry ? entry.data : null;
  }

  function ageMs(key) {
    const entry = readEntry(key);
    return entry ? Date.now() - entry.savedAt : null;
  }

  function isFresh(key, maxAge = getFreshMs()) {
    const age = ageMs(key);
    return age != null && age <= maxAge;
  }

  function notify(key, data, meta) {
    const payload = { key, data, ...(meta || {}) };
    const set = listeners.get(key);
    if (set) {
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch {
          /* ignore subscriber errors */
        }
      }
    }
    try {
      global.dispatchEvent(
        new CustomEvent("sbp:cache-updated", { detail: payload })
      );
    } catch {
      /* ignore */
    }
  }

  function set(key, data, meta) {
    try {
      sessionStorage.setItem(
        storageKey(key),
        JSON.stringify({ savedAt: Date.now(), data })
      );
    } catch {
      /* ignore quota / private mode */
    }
    if (meta && meta.notify === false) return;
    notify(key, data, meta);
  }

  function invalidate(key) {
    try {
      sessionStorage.removeItem(storageKey(key));
    } catch {
      /* ignore */
    }
    epochs[key] = (epochs[key] || 0) + 1;
    inflight.delete(key);
  }

  function invalidatePortfolioCaches() {
    invalidate(KEYS.progress);
    invalidate(KEYS.dividendIdeas);
    invalidate(KEYS.suggestions);
  }

  function manualRefreshStorageKey(key) {
    return PREFIX + "manual:" + key;
  }

  function pruneManualRefreshTimes(times) {
    const cutoff = Date.now() - getRefreshMs();
    return times.filter((t) => typeof t === "number" && t > cutoff);
  }

  function readManualRefreshTimes(key) {
    try {
      const raw = sessionStorage.getItem(manualRefreshStorageKey(key));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return pruneManualRefreshTimes(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  }

  function writeManualRefreshTimes(key, times) {
    try {
      sessionStorage.setItem(
        manualRefreshStorageKey(key),
        JSON.stringify(pruneManualRefreshTimes(times))
      );
    } catch {
      /* ignore */
    }
  }

  function getManualRefreshQuota(key) {
    const used = readManualRefreshTimes(key).length;
    return {
      limit: MANUAL_REFRESH_LIMIT,
      used,
      remaining: Math.max(0, MANUAL_REFRESH_LIMIT - used),
    };
  }

  function canManualRefresh(key) {
    return getManualRefreshQuota(key).remaining > 0;
  }

  function recordManualRefresh(key) {
    const times = readManualRefreshTimes(key);
    times.push(Date.now());
    writeManualRefreshTimes(key, times);
  }

  function unrecordManualRefresh(key) {
    const times = readManualRefreshTimes(key);
    if (!times.length) return;
    times.pop();
    writeManualRefreshTimes(key, times);
  }

  async function manualRefresh(key) {
    if (!URLS[key]) throw new Error(`Unknown cache key: ${key}`);
    if (!canManualRefresh(key)) {
      const quota = getManualRefreshQuota(key);
      const err = new Error(
        `Refresh limit reached (${quota.limit} per ${refreshIntervalLabel()}). Try again later.`
      );
      err.code = "RATE_LIMITED";
      err.quota = quota;
      throw err;
    }

    recordManualRefresh(key);
    try {
      return await fetchAndCache(key, { reason: "manual" });
    } catch (err) {
      unrecordManualRefresh(key);
      throw err;
    }
  }

  function bindRefreshButton(button, key, { onStart, onDone, onError } = {}) {
    if (!button) return () => {};

    function syncButton() {
      const quota = getManualRefreshQuota(key);
      const busy = inflight.has(key);
      button.disabled = busy || quota.remaining === 0;
      button.title =
        quota.remaining > 0
          ? `Refresh now (${quota.remaining} of ${quota.limit} left in ${refreshIntervalLabel()})`
          : `Refresh limit reached — ${quota.limit} per ${refreshIntervalLabel()}`;
      button.setAttribute(
        "aria-label",
        quota.remaining > 0
          ? `Refresh (${quota.remaining} of ${quota.limit} remaining)`
          : `Refresh limit reached for the next ${refreshIntervalLabel()}`
      );
    }

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.classList.add("is-spinning");
      syncButton();
      onStart?.();
      try {
        const data = await manualRefresh(key);
        onDone?.(data);
      } catch (err) {
        onError?.(err);
      } finally {
        button.classList.remove("is-spinning");
        syncButton();
      }
    });

    global.addEventListener("sbp:cache-updated", (event) => {
      if (event.detail?.key === key) syncButton();
    });

    syncButton();
    registerRefreshButtonSync(syncButton);
    return syncButton;
  }

  async function fetchAndCache(key, { reason = "fetch" } = {}) {
    if (!URLS[key]) throw new Error(`Unknown cache key: ${key}`);
    if (inflight.has(key)) return inflight.get(key);

    const epoch = epochs[key] || 0;
    const promise = (async () => {
      const res = await fetch(URLS[key], { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : data.detail
              ? JSON.stringify(data.detail)
              : `Request failed (${res.status})`;
        throw new Error(detail);
      }
      // Drop stale responses superseded by invalidate()
      if ((epochs[key] || 0) === epoch) {
        set(key, data, { reason, silent: true });
        scheduleRefreshToast();
      }
      return data;
    })().finally(() => {
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
    });

    inflight.set(key, promise);
    return promise;
  }

  function prefetchAll(reason = "prefetch") {
    fetchAndCache(KEYS.progress, { reason }).catch(() => {});
    fetchAndCache(KEYS.dividendIdeas, { reason }).catch(() => {});
    fetchAndCache(KEYS.suggestions, { reason }).catch(() => {});
    fetchAndCache(KEYS.watchlist, { reason }).catch(() => {});
  }

  function refreshStaleOrAll(reason = "interval") {
    const keys = [KEYS.dividendIdeas, KEYS.suggestions, KEYS.watchlist];
    if (global.SbpAuth?.isAuthenticated?.()) {
      keys.push(KEYS.progress);
    }
    for (const key of keys) {
      if (!isFresh(key, getRefreshMs())) {
        fetchAndCache(key, { reason }).catch(() => {});
      }
    }
  }

  function startBackgroundRefresh() {
    if (refreshTimer) return;
    refreshTimer = global.setInterval(() => {
      refreshStaleOrAll("interval");
    }, getRefreshMs());

    // Also refresh when the tab becomes visible again and data is stale.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshStaleOrAll("visibility");
      }
    });
  }

  async function loadRefreshConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const data = await res.json();
      const minutes = Number(data.cron_job_silent_stock_refresh);
      if (Number.isFinite(minutes) && minutes > 0) {
        refreshMinutes = Math.round(minutes);
      }
    } catch {
      /* keep default */
    }
  }

  function applyRefreshMinutesToDom() {
    const label = String(refreshMinutes);
    for (const el of document.querySelectorAll("[data-sbp-refresh-minutes]")) {
      el.textContent = label;
    }
  }

  function onUpdate(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  }

  function boot() {
    async function runBoot() {
      await loadRefreshConfig();
      applyRefreshMinutesToDom();
      fetchAndCache(KEYS.dividendIdeas, { reason: "boot" }).catch(() => {});
      fetchAndCache(KEYS.suggestions, { reason: "boot" }).catch(() => {});
      fetchAndCache(KEYS.watchlist, { reason: "boot" }).catch(() => {});
      if (global.SbpAuth?.isAuthenticated?.()) {
        fetchAndCache(KEYS.progress, { reason: "boot" }).catch(() => {});
      }
      startBackgroundRefresh();
    }

    if (global.SbpAuth?.whenAuthReady) {
      global.SbpAuth.whenAuthReady(runBoot);
    } else if (global.SbpAuth) {
      global.addEventListener("sbp:auth-ready", () => {
        runBoot();
      }, { once: true });
    } else {
      runBoot();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.SbpCache = {
    KEYS,
    DEFAULT_REFRESH_MINUTES,
    get refreshMinutes() {
      return refreshMinutes;
    },
    get REFRESH_MS() {
      return getRefreshMs();
    },
    TTL_MS,
    MANUAL_REFRESH_LIMIT,
    getRefreshMs,
    refreshIntervalLabel,
    get,
    set,
    ageMs,
    isFresh,
    invalidate,
    invalidatePortfolioCaches,
    fetchAndCache,
    manualRefresh,
    getManualRefreshQuota,
    canManualRefresh,
    bindRefreshButton,
    prefetchAll,
    refreshStaleOrAll,
    onUpdate,
    showRefreshToast,
    getLastRefreshAt: () => lastRefreshAt,
  };
})(window);
