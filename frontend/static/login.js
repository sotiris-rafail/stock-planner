const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authError = document.getElementById("auth-error");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const forgotWrap = document.getElementById("forgot-wrap");
const registerMailNote = document.getElementById("register-mail-note");
const authHeading = document.getElementById("auth-heading");
const authPasswordRules = document.getElementById("auth-password-rules");

let mode = "login";
let smtpEnabled = true;
const EMAIL_KEY = "sbp:login-email";

function rememberEmail(value) {
  try {
    const email = String(value || "").trim();
    if (email) localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

function restoreEmail() {
  if (!authEmail) return;
  try {
    const saved = localStorage.getItem(EMAIL_KEY) || "";
    if (saved && !authEmail.value) authEmail.value = saved;
  } catch {
    /* ignore */
  }
}

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
  if (authSubmitBtn) authSubmitBtn.textContent = isLogin ? t("nav.signin") : t("login.create");
  if (authHeading) authHeading.textContent = isLogin ? t("login.title") : t("login.create");
  document.title = `${isLogin ? t("login.title") : t("login.create")} · Stock Buy Planner`;
  if (authPasswordRules) authPasswordRules.hidden = isLogin;
  if (forgotWrap) forgotWrap.hidden = !isLogin;
  if (registerMailNote) registerMailNote.hidden = isLogin || smtpEnabled !== false;
  authPassword?.setAttribute(
    "autocomplete",
    isLogin ? "current-password" : "new-password"
  );
  showError("");
}

async function applyEmailAvailability() {
  try {
    const data = window.SbpAppConfig?.fetch
      ? await window.SbpAppConfig.fetch()
      : await fetch("/api/config", { credentials: "include" }).then((r) => r.json());
    smtpEnabled = window.SbpI18n?.parseConfigFlag
      ? window.SbpI18n.parseConfigFlag(data.smtp_enabled, false)
      : data.smtp_enabled !== false;
    if (!smtpEnabled) {
      if (forgotWrap) forgotWrap.textContent = t("login.forgotOff");
      if (registerMailNote) {
        registerMailNote.textContent = t("login.noRecovery");
        registerMailNote.hidden = mode === "login";
      }
    }
  } catch {
    /* keep the forgot-password link */
  }
}

function redirectAfterAuth(wasRegister) {
  if (wasRegister) {
    window.location.href = "/welcome";
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  window.location.href = next && next.startsWith("/") && !next.startsWith("/login")
    ? next
    : "/home";
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
  authSubmitBtn.textContent = mode === "login" ? t("login.signing") : t("login.creating");

  rememberEmail(authEmail.value);
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
      throw new Error(detail || t("login.failed"));
    }
    window.SbpAuth?.clearClientCaches?.();
    redirectAfterAuth(mode === "register");
  } catch (err) {
    showError(err.message || t("login.failed"));
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = mode === "login" ? t("nav.signin") : t("login.create");
  }
});

setMode("login");
restoreEmail();
checkExistingSession();
applyEmailAvailability();
