(function (global) {
  const LOGIN_PATH = "/login";
  const PROTECTED_PAGES = new Set(["/home", "/budget", "/progress", "/track", "/notifications", "/account", "/welcome"]);
  let authenticated = false;
  let currentEmail = "";
  let authReady = false;
  const authReadyWaiters = [];
  let tokenRefreshTimer = null;

  const TOKEN_REFRESH_MS = 60 * 60 * 1000;

  function isLoginPage() {
    return global.location.pathname === LOGIN_PATH;
  }

  function loginUrl(nextPath) {
    const next = encodeURIComponent(
      nextPath || global.location.pathname + global.location.search + global.location.hash
    );
    return `${LOGIN_PATH}?next=${next}`;
  }

  function clearClientCaches() {
    try {
      const keys = [];
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (key && key.startsWith("sbp:cache:")) keys.push(key);
      }
      for (const key of keys) sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function installFetchCredentials() {
    const nativeFetch = global.fetch.bind(global);
    global.fetch = function patchedFetch(input, init = {}) {
      const url = typeof input === "string" ? input : input.url;
      const options = { ...init };
      if (url.startsWith("/api/")) {
        options.credentials = "include";
      }
      return nativeFetch(input, options);
    };
  }

  async function refreshSession() {
    try {
      const response = await global.fetch("/api/auth/me");
      if (!response.ok) {
        authenticated = false;
        currentEmail = "";
        return false;
      }
      const data = await response.json();
      authenticated = Boolean(data.authenticated);
      currentEmail = authenticated ? (data.email || "") : "";
      return authenticated;
    } catch {
      authenticated = false;
      currentEmail = "";
      return false;
    }
  }

  async function refreshSessionToken({ silent = true } = {}) {
    if (!authenticated) return false;
    try {
      const response = await global.fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          authenticated = false;
          currentEmail = "";
          updateNav();
          applySavePanels();
          global.dispatchEvent(
            new CustomEvent("sbp:auth-ready", {
              detail: { authenticated: false, email: "" },
            })
          );
        }
        return false;
      }
      const data = await response.json();
      authenticated = Boolean(data.authenticated);
      return authenticated;
    } catch {
      if (!silent) authenticated = false;
      return false;
    }
  }

  function msUntilNextHour() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return Math.max(0, next.getTime() - now.getTime());
  }

  function scheduleSilentTokenRefresh() {
    if (tokenRefreshTimer) {
      clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
    if (!authenticated) return;

    const tick = async () => {
      await refreshSessionToken({ silent: true });
      if (authenticated) {
        tokenRefreshTimer = global.setTimeout(tick, TOKEN_REFRESH_MS);
      }
    };

    tokenRefreshTimer = global.setTimeout(tick, msUntilNextHour());
  }

  function isAuthenticated() {
    return authenticated;
  }

  async function logout() {
    try {
      await global.fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    authenticated = false;
    currentEmail = "";
    clearClientCaches();
    if (tokenRefreshTimer) {
      clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
    global.location.href = LOGIN_PATH;
  }

  function isProtectedPage() {
    return PROTECTED_PAGES.has(global.location.pathname);
  }

  function updateNav() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    nav.querySelector("[data-auth-login]")?.remove();
    nav.querySelector("[data-auth-logout]")?.remove();

    for (const link of nav.querySelectorAll("[data-auth-required]")) {
      link.hidden = !authenticated;
    }

    if (isLoginPage() || authenticated) {
      return;
    }

    const link = document.createElement("a");
    link.href = LOGIN_PATH;
    link.setAttribute("data-auth-login", "true");
    link.className = "nav-sign-in";
    const signIn = window.SbpI18n?.t("nav.signin") || "Sign in";
    link.innerHTML =
      `<span class="material-symbols-outlined" aria-hidden="true">login</span>${signIn}`;
    nav.insertBefore(link, nav.firstChild);
  }

  function applySavePanels() {
    const savePanels = document.querySelectorAll("[data-auth-save-panel]");
    for (const panel of savePanels) {
      if (authenticated) {
        panel.hidden = false;
        panel.classList.remove("is-guest-hidden");
      } else {
        panel.hidden = true;
        panel.classList.add("is-guest-hidden");
      }
    }

    const guestNotes = document.querySelectorAll("[data-auth-guest-note]");
    for (const note of guestNotes) {
      note.hidden = authenticated;
    }
  }

  function whenAuthReady(fn) {
    if (authReady) {
      Promise.resolve().then(fn);
      return;
    }
    authReadyWaiters.push(fn);
  }

  function flushAuthReadyWaiters() {
    const waiters = authReadyWaiters.splice(0, authReadyWaiters.length);
    for (const fn of waiters) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  async function initAuth() {
    await refreshSession();

    // Protected routes are already gated server-side; avoid client redirect loops.
    updateNav();
    applySavePanels();
    authReady = true;
    global.dispatchEvent(
      new CustomEvent("sbp:auth-ready", {
        detail: { authenticated, email: currentEmail },
      })
    );
    global.SbpI18n?.syncAccountChrome?.({
      detail: { authenticated, email: currentEmail },
    });
    flushAuthReadyWaiters();
    if (authenticated) {
      scheduleSilentTokenRefresh();
    }
  }

  installFetchCredentials();

  global.SbpAuth = {
    refreshSession,
    refreshSessionToken,
    isAuthenticated,
    currentEmail() {
      return currentEmail;
    },
    whenAuthReady,
    logout,
    clearClientCaches,
    isLoginPage,
    loginUrl,
    get authReady() {
      return authReady;
    },
  };

  document.addEventListener("DOMContentLoaded", initAuth);
})(window);
