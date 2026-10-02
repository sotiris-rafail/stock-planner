const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authError = document.getElementById("auth-error");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const forgotWrap = document.getElementById("forgot-wrap");

let mode = "login";

function showError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.hidden = !message;
}

function setMode(nextMode) {
  mode = nextMode;
  const isLogin = mode === "login";
  tabLogin?.classList.toggle("active", isLogin);
  tabRegister?.classList.toggle("active", !isLogin);
  if (authSubmitBtn) authSubmitBtn.textContent = isLogin ? "Sign in" : "Create account";
  if (forgotWrap) forgotWrap.hidden = !isLogin;
  authPassword?.setAttribute(
    "autocomplete",
    isLogin ? "current-password" : "new-password"
  );
  showError("");
}

function redirectAfterAuth() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  window.location.href = next && next.startsWith("/") && !next.startsWith("/login")
    ? next
    : "/plan";
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.authenticated) redirectAfterAuth();
  } catch {
    /* stay on login */
  }
}

tabLogin?.addEventListener("click", () => setMode("login"));
tabRegister?.addEventListener("click", () => setMode("register"));

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = mode === "login" ? "Signing in…" : "Creating account…";

  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: authEmail.value.trim(),
        password: authPassword.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || item).join(", ")
        : data.detail;
      throw new Error(detail || "Authentication failed");
    }
    window.SbpAuth?.clearClientCaches?.();
    redirectAfterAuth();
  } catch (err) {
    showError(err.message || "Authentication failed");
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = mode === "login" ? "Sign in" : "Create account";
  }
});

setMode("login");
checkExistingSession();
