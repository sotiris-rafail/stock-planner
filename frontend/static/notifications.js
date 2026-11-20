const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const form = document.getElementById("notifications-form");
const toggle = document.getElementById("monthly-report-toggle");
const emailInput = document.getElementById("report-email");
const reportCard = document.getElementById("monthly-report-card");
const saveBtn = document.getElementById("notifications-save-btn");
const statusEl = document.getElementById("notifications-status");
const errorEl = document.getElementById("notifications-error");

let accountEmail = "";

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
}

function setSaving(isSaving) {
  saveBtn.disabled = isSaving;
  saveBtn.textContent = isSaving ? t("notifications.saving") : t("notifications.save");
}

function syncToggleState() {
  const enabled = toggle.checked;
  reportCard.classList.toggle("is-enabled", enabled);
  emailInput.disabled = !enabled;
  emailInput.setAttribute("aria-disabled", enabled ? "false" : "true");
}

async function loadSettings() {
  showError("");
  showStatus("");
  const response = await fetch("/api/notifications/settings");
  if (!response.ok) {
    showError(t("notifications.loadError"));
    return;
  }
  const data = await response.json();
  accountEmail = data.account_email || "";
  toggle.checked = Boolean(data.monthly_report_enabled);
  emailInput.value = data.report_email || "";
  emailInput.placeholder = accountEmail || "you@example.com";
  syncToggleState();
  if (data.smtp_enabled === false) {
    const message = t("notifications.inAppOnly");
    toggle.checked = false;
    toggle.disabled = true;
    emailInput.disabled = true;
    saveBtn.disabled = true;
    reportCard.classList.remove("is-enabled");
    reportCard.classList.add("is-smtp-off");
    const eyebrow = document.querySelector('[data-i18n="notifications.eyebrow"]');
    const lede = document.querySelector('[data-i18n="notifications.lede"]');
    if (eyebrow) eyebrow.textContent = t("notifications.eyebrowOff");
    if (lede) lede.textContent = t("notifications.smtpOff");
    const note = document.getElementById("mail-off-note");
    if (note) {
      note.hidden = false;
      note.textContent = t("notifications.smtpOff");
    }
    const body = document.getElementById("monthly-report-body");
    if (body) body.hidden = true;
    showStatus(message);
    return;
  }
  if (data.last_sent_month) {
    showStatus(t("notifications.lastSent", { month: data.last_sent_month }));
  }
}

async function saveSettings(event) {
  event.preventDefault();
  showError("");
  showStatus("");
  setSaving(true);
  try {
    const response = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthly_report_enabled: toggle.checked,
        report_email: emailInput.value.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const proMsg = window.SbpBilling?.proRequiredMessage?.(data);
      showError(proMsg || window.SbpBilling?.errorMessage?.(data) || t("notifications.saveError"));
      return;
    }
    emailInput.value = data.report_email || "";
    showStatus(
      toggle.checked
        ? t("notifications.enabled")
        : t("notifications.disabled")
    );
  } catch {
    showError(t("notifications.saveError"));
  } finally {
    setSaving(false);
  }
}

toggle.addEventListener("change", syncToggleState);
form.addEventListener("submit", saveSettings);

SbpAuth.whenAuthReady(() => {
  loadSettings();
});
