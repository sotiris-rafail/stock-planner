const t = (key) => (window.SbpI18n && window.SbpI18n.t(key)) || key;
const DONE_KEY = "sbp:welcome:seen";

function finish() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* ignore */
  }
  window.location.href = "/home";
}

document.getElementById("welcome-done")?.addEventListener("click", finish);

if (window.SbpAuth?.whenAuthReady) {
  window.SbpAuth.whenAuthReady(() => {
    if (!window.SbpAuth?.isAuthenticated?.()) {
      window.location.href = window.SbpAuth?.loginUrl?.("/welcome") || "/login?next=%2Fwelcome";
    }
  });
}