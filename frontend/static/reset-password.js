const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const form = document.getElementById("reset-form");
const passwordInput = document.getElementById("reset-password");
const confirmInput = document.getElementById("reset-password-confirm");
const submitBtn = document.getElementById("reset-submit-btn");
const errorEl = document.getElementById("reset-error");

const resetHash = new URLSearchParams(window.location.search).get("hash") || "";

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

if (!resetHash) {
  showError(t("reset.missingHash") || "This reset link is missing its hash. Use the link from your email.");
  submitBtn.disabled = true;
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
    const note = document.getElementById("mail-off-note");
    const lede = document.querySelector('[data-i18n="reset.lede"]');
    const message = t("reset.smtpOff");
    if (note) {
      note.hidden = false;
      note.textContent = message;
    }
    if (lede) lede.textContent = message;
  } catch {
    /* ignore */
  }
}

applyEmailAvailability();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");

  const password = passwordInput.value;
  if (password !== confirmInput.value) {
    showError("Passwords do not match");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Updating…";

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        hash: resetHash,
        password,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || item).join(", ")
        : data.detail;
      throw new Error(detail || t("reset.failed"));
    }
    window.location.href = "/login";
  } catch (err) {
    showError(err.message || t("reset.failed"));
  } finally {
    submitBtn.disabled = !resetHash;
    submitBtn.textContent = "Change password";
  }
});
