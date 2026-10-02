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
      throw new Error(detail || "Could not send reset email");
    }
    okEl.textContent =
      "If that email is registered, a reset link is on its way. Check your inbox, or data/outbox if you are running locally without SMTP.";
    okEl.hidden = false;
  } catch (err) {
    showError(err.message || "Could not send reset email");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset link";
  }
});
