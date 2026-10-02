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
  saveBtn.textContent = isSaving ? "Saving…" : "Save preferences";
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
    showError("Could not load notification settings.");
    return;
  }
  const data = await response.json();
  accountEmail = data.account_email || "";
  toggle.checked = Boolean(data.monthly_report_enabled);
  emailInput.value = data.report_email || "";
  emailInput.placeholder = accountEmail || "you@example.com";
  syncToggleState();
  if (data.last_sent_month) {
    showStatus(`Last report sent for ${data.last_sent_month}.`);
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
      showError(data.detail || "Could not save notification settings.");
      return;
    }
    emailInput.value = data.report_email || "";
    showStatus(
      toggle.checked
        ? "Monthly reports enabled. You will receive an email on the 1st of each month."
        : "Monthly reports disabled."
    );
  } catch {
    showError("Could not save notification settings.");
  } finally {
    setSaving(false);
  }
}

toggle.addEventListener("change", syncToggleState);
form.addEventListener("submit", saveSettings);

SbpAuth.whenAuthReady(() => {
  loadSettings();
});
