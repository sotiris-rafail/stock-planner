const t = (key, vars) => (window.SbpI18n && window.SbpI18n.t(key, vars)) || key;

function renderLoginCta(container) {
  container.innerHTML = `<a class="pricing-cta" href="/login?next=%2Fpricing">${t("pricing.signInUpgrade")}</a>`;
}

function renderProBadge(container) {
  container.innerHTML = `<button type="button" class="pricing-cta" disabled>${t("pricing.alreadyPro")}</button>`;
}

function providerLabel(p) {
  return p.name || (p.id ? p.id.charAt(0).toUpperCase() + p.id.slice(1) : "Checkout");
}

async function boot() {
  const container = document.getElementById("pricing-checkout");
  const legacyBtn = document.getElementById("pricing-upgrade-btn");
  const note = document.getElementById("pricing-billing-note");
  const mount = container || legacyBtn?.parentElement;
  if (!mount) return;
  if (legacyBtn) legacyBtn.hidden = true;

  let authed = false;
  let tier = "free";
  try {
    const me = await fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json());
    authed = Boolean(me.authenticated);
    tier = me.subscription_tier || "free";
  } catch {
    /* guest */
  }

  if (!authed) {
    if (container) renderLoginCta(container);
    else if (legacyBtn) {
      legacyBtn.hidden = false;
      legacyBtn.outerHTML = `<a class="pricing-cta" href="/login?next=%2Fpricing" id="pricing-upgrade-btn">${t("pricing.signInUpgrade")}</a>`;
    }
    return;
  }

  if (tier === "pro") {
    if (container) renderProBadge(container);
    return;
  }

  let providers = [];
  try {
    const listed = await fetch("/api/billing/providers", { credentials: "include" }).then((r) =>
      r.json()
    );
    providers = (listed.providers || []).filter((p) => p.configured);
  } catch {
    /* empty */
  }

  const wrap = document.createElement("div");
  wrap.className = "pricing-checkout";
  if (!providers.length) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pricing-cta";
    btn.textContent = t("pricing.upgrade");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const result = await window.SbpBilling?.startCheckout?.({ interval: "month" }) || {
        ok: false,
        code: "billing_not_configured",
      };
      if (!result.ok && result.code === "billing_not_configured" && note) {
        note.hidden = false;
        note.textContent = t("pricing.billingSoon");
      } else if (!result.ok && note) {
        note.hidden = false;
        note.textContent = result.message || t("pricing.checkoutFailed");
      }
      btn.disabled = false;
    });
    wrap.appendChild(btn);
  } else {
    for (const p of providers) {
      const monthBtn = document.createElement("button");
      monthBtn.type = "button";
      monthBtn.className = "pricing-cta";
      monthBtn.textContent = t("pricing.checkoutMonthly", { provider: providerLabel(p) });
      monthBtn.addEventListener("click", async () => {
        monthBtn.disabled = true;
        const result = await window.SbpBilling.startCheckout({ provider: p.id, interval: "month" });
        if (!result.ok && note) {
          note.hidden = false;
          note.textContent = result.message;
        }
        monthBtn.disabled = false;
      });
      wrap.appendChild(monthBtn);
    }
    if (providers.length) {
      const yearBtn = document.createElement("button");
      yearBtn.type = "button";
      yearBtn.className = "btn-secondary pricing-cta-secondary";
      const pid = providers[0].id;
      yearBtn.textContent = t("pricing.checkoutYearly", { provider: providerLabel(providers[0]) });
      yearBtn.addEventListener("click", async () => {
        yearBtn.disabled = true;
        const result = await window.SbpBilling.startCheckout({ provider: pid, interval: "year" });
        if (!result.ok && note) {
          note.hidden = false;
          note.textContent = result.message;
        }
        yearBtn.disabled = false;
      });
      wrap.appendChild(yearBtn);
    }
  }

  if (container) {
    container.replaceChildren(wrap);
  } else {
    mount.insertBefore(wrap, legacyBtn || null);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}