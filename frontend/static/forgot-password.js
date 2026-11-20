const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const form = document.getElementById("forgot-form");
const emailInput = document.getElementById("forgot-email");
const submitBtn = document.getElementById("forgot-submit-btn");
const errorEl = document.getElementById("forgot-error");
const okEl = document.getElementById("forgot-ok");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (message) okEl.hidden = true;
}

async function applyEmailAvailability() {
  try {
    const data = window.SbpAppConfig?.fetch
      ? await window.SbpAppConfig.fetch()
      : await fetch("/api/config", { credentials: "include" }).then((r) => r.json());
    const smtpOn = window.SbpI18n?.parseConfigFlag
      ? window.SbpI18n.parseConfigFlag(data.smtp_enabled, false)
      : data.smtp_enabled !== false;
    if (smtpOn) return;
    const message = t("forgot.smtpOff");
    if (emailInput) emailInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    const note = document.getElementById("mail-off-note");
    const lede = document.querySelector('[data-i18n="forgot.lede"]');
    if (note) {
      note.hidden = false;
      note.textContent = message;
    }
    if (lede) lede.textContent = message;
    showError(message);
  } catch {
    /* keep the form usable if config cannot be loaded */
  }
}

applyEmailAvailability();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  okEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || item).join(", ")
        : data.detail;
      throw new Error(detail || t("forgot.failed"));
    }
    okEl.textContent =
      "If that email is registered, a reset link is on its way. Check your inbox, or data/outbox if you are running locally without SMTP.";
    okEl.hidden = false;
  } catch (err) {
    showError(err.message || t("forgot.failed"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t("forgot.send");
  }
});
