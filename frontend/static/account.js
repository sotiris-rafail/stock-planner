const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;

function show(el, message, isError) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  if (isError) el.classList.add("error");
  else el.classList.remove("error");
}

async function importFile(file) {
  const ok = document.getElementById("account-import-ok");
  const err = document.getElementById("account-import-error");
  show(ok, "");
  show(err, "");
  try {
    const content = await file.text();
    const response = await fetch("/api/account/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || t("account.importFailed"));
    }
    const imported = data.imported || {};
    const skipped = data.skipped || {};
    let message = t("account.importOk", {
      buys: imported.buys || 0,
      sells: imported.sells || 0,
      watch: imported.watchlist || 0,
    });
    if (skipped.buys || skipped.sells || skipped.watchlist) {
      message += ` ${t("account.importSkipped", {
        buys: skipped.buys || 0,
        sells: skipped.sells || 0,
        watch: skipped.watchlist || 0,
      })}`;
    }
    if (data.errors?.length) {
      message += ` ${data.errors.slice(0, 3).join(" ")}`;
    }
    show(ok, message);
  } catch (exc) {
    show(err, exc.message || t("account.importFailed"), true);
  }
}

function parseFlag(value, defaultOn) {
  if (window.SbpI18n?.parseConfigFlag) {
    return window.SbpI18n.parseConfigFlag(value, defaultOn);
  }
  if (value === true) return true;
  if (value === false) return false;
  return defaultOn;
}

async function loadSubscription() {
  const tierEl = document.getElementById("account-subscription-tier");
  const upgrade = document.querySelector("#account-plan-panel a[href='/pricing']");
  const portalBtn = document.getElementById("account-billing-portal");
  if (!tierEl) return;
  try {
    const me = await fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json());
    const tier = me.subscription_tier === "pro" ? "pro" : "free";
    tierEl.textContent =
      tier === "pro" ? t("account.tierPro") : t("account.tierFree");
    if (upgrade) upgrade.hidden = tier === "pro";
    if (portalBtn) {
      portalBtn.hidden = !me.billing_portal_available;
      if (!portalBtn.dataset.bound) {
        portalBtn.dataset.bound = "1";
        portalBtn.addEventListener("click", async () => {
          portalBtn.disabled = true;
          const result = await window.SbpBilling?.openPortal?.();
          if (result && !result.ok) {
            window.alert(result.message || t("billing.portalFailed"));
          }
          portalBtn.disabled = false;
        });
      }
    }
  } catch {
    tierEl.textContent = t("account.tierUnknown");
  }
}

function boot() {
  const emailEl = document.getElementById("account-page-email");
  if (emailEl) emailEl.textContent = window.SbpAuth?.currentEmail?.() || "";
  loadSubscription();
  window.SbpI18n?.loadAccountFlags?.();
  const flags = document.getElementById("account-flags");
  const smtpNote = document.getElementById("account-smtp-note");
  const configLoader = window.SbpAppConfig?.fetch
    ? window.SbpAppConfig.fetch()
    : window.SbpI18n?.fetchAppConfig
      ? window.SbpI18n.fetchAppConfig()
      : fetch("/api/config", { credentials: "include" }).then((res) => res.json());
  configLoader
    .then((data) => {
      if (smtpNote) smtpNote.hidden = parseFlag(data.smtp_enabled, false);
      if (!flags) return;
      const rows = [
        ["account.flagSmtp", parseFlag(data.smtp_enabled, false), {}],
        ["account.flagExport", parseFlag(data.export_enabled, false), {}],
        ["account.flagDelete", parseFlag(data.delete_enabled, true), {}],
        [
          "account.flagBackup",
          data.backup_enabled === true,
          { hours: data.backup_interval_hours || 24 },
        ],
      ];
      flags.innerHTML = rows
        .map(([key, on, vars]) => {
          const state = on ? t("account.flagOn") : t("account.flagOff");
          return `<li><span>${t(key, vars)}</span><strong class="${on ? "pos" : "neg"}">${state}</strong></li>`;
        })
        .join("");
    })
    .catch(() => {
      if (flags) flags.innerHTML = "";
    });
  const input = document.getElementById("account-import-file");
  input?.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!window.confirm(t("account.importConfirm"))) {
      input.value = "";
      return;
    }
    importFile(file);
    input.value = "";
  });
}

if (window.SbpAuth?.whenAuthReady) {
  window.SbpAuth.whenAuthReady(boot);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
