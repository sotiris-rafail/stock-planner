/**
 * One in-flight GET /api/config per full page load (shared by ui, prefetch, auth pages).
 */
(function (global) {
  let appConfigPromise = null;

  function fetchAppConfig({ bust = false } = {}) {
    if (bust) appConfigPromise = null;
    if (!appConfigPromise) {
      appConfigPromise = fetch("/api/config", { credentials: "include" })
        .then((response) => {
          if (!response.ok) throw new Error(`config ${response.status}`);
          return response.json().catch(() => ({}));
        })
        .catch((err) => {
          appConfigPromise = null;
          throw err;
        });
    }
    return appConfigPromise;
  }

  global.SbpAppConfig = { fetch: fetchAppConfig };
})(window);
