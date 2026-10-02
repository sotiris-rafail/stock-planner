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
  showError("This reset link is missing its hash. Use the link from your email.");
  submitBtn.disabled = true;
}

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
      throw new Error(detail || "Could not reset password");
    }
    window.location.href = "/login";
  } catch (err) {
    showError(err.message || "Could not reset password");
  } finally {
    submitBtn.disabled = !resetHash;
    submitBtn.textContent = "Change password";
  }
});
