/**
 * Thin API helper: the backend owns caching and silent refresh.
 * The UI only fetches; it does not store payloads in sessionStorage.
 */
(function (global) {
  const DEFAULT_REFRESH_MINUTES = 15;
  let refreshMinutes = DEFAULT_REFRESH_MINUTES;

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

  function refreshIntervalLabel() {
    return `${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"}`;
  }

  async function parseResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        typeof data.detail === "string"
          ? data.detail
          : data.detail
            ? JSON.stringify(data.detail)
            : `Request failed (${res.status})`
      );
      err.status = res.status;
      if (res.status === 429) err.code = "RATE_LIMITED";
      throw err;
    }
    return data;
  }

  async function fetchApi(url, { force = false } = {}) {
    const target = new URL(url, global.location.origin);
    if (force) target.searchParams.set("force", "1");
    const res = await fetch(target.toString(), { credentials: "include" });
    return parseResponse(res);
  }

  async function fetchKey(key, { force = false } = {}) {
    const url = URLS[key];
    if (!url) throw new Error(`Unknown cache key: ${key}`);
    return fetchApi(url, { force });
  }

  function bindRefreshButton(button, key, { onStart, onDone, onError } = {}) {
    if (!button) return () => {};

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-spinning");
      onStart?.();
      try {
        const data = await fetchKey(key, { force: true });
        onDone?.(data);
      } catch (err) {
        onError?.(err);
      } finally {
        button.classList.remove("is-spinning");
        button.disabled = false;
      }
    });
  }

  async function loadRefreshConfig() {
    try {
      const data = global.SbpAppConfig?.fetch
        ? await global.SbpAppConfig.fetch()
        : global.SbpI18n?.fetchAppConfig
          ? await global.SbpI18n.fetchAppConfig()
          : await fetchApi("/api/config");
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

  function boot() {
    async function runBoot() {
      await loadRefreshConfig();
      applyRefreshMinutesToDom();
    }
    if (global.SbpAuth?.whenAuthReady) {
      global.SbpAuth.whenAuthReady(runBoot);
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
    URLS,
    get refreshMinutes() {
      return refreshMinutes;
    },
    refreshIntervalLabel,
    fetchApi,
    fetchKey,
    bindRefreshButton,
  };
})(window);
