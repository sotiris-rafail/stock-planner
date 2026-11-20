/**
 * Shared Pro / billing helpers for checkout, portal, and 402 paywall responses.
 */
(function () {
  const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;

  function normalizeDetail(data) {
    if (!data) return null;
    let detail = data.detail;
    if (detail == null) return null;
    if (typeof detail === "string") return { message: detail };
    if (Array.isArray(detail)) {
      return { message: detail.map((d) => d.msg || d).join(", ") };
    }
    return detail;
  }

  function proRequiredMessage(data) {
    const detail = normalizeDetail(data);
    if (detail?.code === "pro_required") {
      const base = detail.message || t("billing.proRequired");
      return `${base} ${t("billing.upgradeHint")}`.trim();
    }
    return null;
  }

  function errorMessage(data, fallback) {
    const pro = proRequiredMessage(data);
    if (pro) return pro;
    const detail = normalizeDetail(data);
    if (detail?.message) return detail.message;
    if (typeof data?.detail === "string") return data.detail;
    return fallback || t("billing.genericError");
  }

  async function startCheckout({ provider, interval = "month" } = {}) {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval, provider: provider || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return { ok: true };
    }
    const code = (data.detail && data.detail.code) || data.code || "";
    return { ok: false, code, message: errorMessage(data, t("pricing.checkoutFailed")) };
  }

  async function openPortal() {
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return { ok: true };
    }
    return { ok: false, message: errorMessage(data, t("billing.portalFailed")) };
  }

  window.SbpBilling = {
    normalizeDetail,
    proRequiredMessage,
    errorMessage,
    startCheckout,
    openPortal,
  };
})();