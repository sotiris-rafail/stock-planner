(() => {
  const openMenus = new Set();

  function optionLabel(option) {
    return (option.textContent || option.value || "").trim();
  }

  function positionMenu(field, menu) {
    const rect = field.getBoundingClientRect();
    const menuHeight = menu.offsetHeight || 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
    menu.style.width = `${rect.width}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.top = openUp
      ? `${Math.max(8, rect.top - menuHeight - 4)}px`
      : `${rect.bottom + 4}px`;
  }

  function enhance(root) {
    const select = root.querySelector("select");
    if (!select || select.dataset.mdEnhanced) return;
    select.dataset.mdEnhanced = "1";
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    const label =
      select.getAttribute("aria-label") ||
      root.getAttribute("data-label") ||
      "Select";

    const field = document.createElement("button");
    field.type = "button";
    field.className = "md-select-field";
    field.setAttribute("aria-haspopup", "listbox");
    field.setAttribute("aria-expanded", "false");
    field.setAttribute("aria-label", label);

    field.innerHTML = `
      <span class="md-select-label">${label}</span>
      <span class="md-select-value"></span>
      <span class="material-symbols-outlined md-select-caret" aria-hidden="true">expand_more</span>
    `;

    const menu = document.createElement("div");
    menu.className = "md-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    const valueEl = field.querySelector(".md-select-value");

    function selectedOption() {
      return select.options[select.selectedIndex] || select.options[0];
    }

    function renderMenu() {
      menu.innerHTML = [...select.options]
        .map((option, index) => {
          const selected = option.selected || index === select.selectedIndex;
          return `
            <button type="button" class="md-select-option${selected ? " is-selected" : ""}" role="option"
              data-index="${index}" aria-selected="${selected ? "true" : "false"}">
              <span class="material-symbols-outlined md-select-check" aria-hidden="true">check</span>
              <span>${optionLabel(option)}</span>
            </button>`;
        })
        .join("");
    }

    function syncFromNative() {
      const option = selectedOption();
      valueEl.textContent = option ? optionLabel(option) : "";
      root.classList.toggle("has-value", Boolean(valueEl.textContent));
      renderMenu();
    }

    function close() {
      if (menu.hidden) return;
      menu.hidden = true;
      field.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
      openMenus.delete(root);
    }

    function open() {
      renderMenu();
      menu.hidden = false;
      field.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      openMenus.add(root);
      positionMenu(field, menu);
      menu.querySelector(".is-selected")?.focus();
    }

    function choose(index) {
      if (index < 0 || index >= select.options.length) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncFromNative();
      close();
      field.focus();
    }

    const nativeValue = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    );
    if (nativeValue?.get && nativeValue?.set) {
      Object.defineProperty(select, "value", {
        configurable: true,
        get() {
          return nativeValue.get.call(this);
        },
        set(next) {
          nativeValue.set.call(this, next);
          syncFromNative();
        },
      });
    }

    field.addEventListener("click", () => {
      if (menu.hidden) {
        [...openMenus].forEach((other) => {
          if (other !== root) other._mdClose?.();
        });
        open();
      } else {
        close();
      }
    });

    field.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (menu.hidden) open();
      }
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-index]");
      if (!option) return;
      choose(Number(option.dataset.index));
    });

    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll("[data-index]")];
      const current = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        field.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        options[Math.min(options.length - 1, current + 1)]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.max(0, current - 1)]?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (current >= 0) choose(Number(options[current].dataset.index));
      }
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target) && !menu.contains(event.target)) close();
    });
    window.addEventListener("resize", () => {
      if (!menu.hidden) positionMenu(field, menu);
    });
    window.addEventListener("scroll", () => close(), true);

    root.append(field);
    document.body.append(menu);
    root._mdClose = close;
    syncFromNative();
  }

  function init() {
    document.querySelectorAll("[data-md-select]").forEach(enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
