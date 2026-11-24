/* Presentation only. Run in <head> so a saved dark theme never flashes light. */
(function () {
  "use strict";
  var root = document.documentElement;
  var key = "wp_theme_v1";
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var preference = "system";
  var started = performance.now();
  var initialized = false;
  var toggle;
  var choices = [];
  var animations = [];
  var splashTimer;

  function valid(value) { return ["system", "light", "dark"].indexOf(value) >= 0; }
  try {
    var saved = localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch (e) { /* Private browsing/storage restrictions still allow switching. */ }

  function applyTheme() {
    var dark = preference === "dark" || (preference === "system" && systemTheme.matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.themePreference = preference;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#171D23" : "#F6F5F1";
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.title = dark ? "ライトモードに切り替える" : "ダークモードに切り替える";
      toggle.setAttribute("aria-label", toggle.title);
    }
    choices.forEach(function (button) {
      var active = button.dataset.themeChoice === preference;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function selectTheme(value) {
    if (!valid(value)) return;
    preference = value;
    try { localStorage.setItem(key, preference); } catch (e) {}
    applyTheme();
  }
  systemTheme.addEventListener("change", function () { if (preference === "system") applyTheme(); });
  window.addEventListener("storage", function (event) {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : "system";
    applyTheme();
  });
  applyTheme();

  function finishBoot(immediate) {
    clearTimeout(splashTimer);
    root.dataset.boot = "ready";
    var splash = document.getElementById("appSplash");
    if (!splash) return;
    if (immediate || reducedMotion.matches) { splash.remove(); return; }
    splash.classList.add("is-leaving");
    setTimeout(function () { splash.remove(); }, 260);
  }

  root.dataset.boot = "loading";
  // An unavailable Firebase/CDN must never leave the app behind a loading screen.
  splashTimer = setTimeout(function () { finishBoot(true); }, 4000);

  function cancelMotion() {
    animations.forEach(function (animation) { animation.cancel(); });
    animations = [];
  }
  reducedMotion.addEventListener("change", function () {
    if (reducedMotion.matches) { cancelMotion(); finishBoot(true); }
  });
  window.addEventListener("beforeprint", function () { cancelMotion(); finishBoot(true); });
  window.addEventListener("pagehide", cancelMotion);

  function initialize() {
    if (initialized || document.readyState === "loading") return;
    initialized = true;
    toggle = document.getElementById("themeToggle");
    choices = Array.from(document.querySelectorAll("[data-theme-choice]"));
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", function () { selectTheme(root.dataset.theme === "dark" ? "light" : "dark"); });
    }
    var settings = document.getElementById("appearanceSettings");
    if (settings) settings.hidden = false;
    choices.forEach(function (button) {
      button.addEventListener("click", function () { selectTheme(button.dataset.themeChoice); });
    });
    applyTheme();

    var range = document.getElementById("weekRangeLabel");
    if (range) {
      var previousRange = range.textContent;
      new MutationObserver(function () {
        if (range.textContent === previousRange) return;
        previousRange = range.textContent;
        cancelMotion();
        if (reducedMotion.matches || typeof Element.prototype.animate !== "function") return;
        // The editable agenda animates; the measured print sheet never moves.
        Array.from(document.querySelectorAll("#eventListUI .item-row, #eventListUI .event-day-heading, #eventListUI .empty-note")).slice(0, 12).forEach(function (row, index) {
          if (!row.getClientRects().length) return;
          animations.push(row.animate([
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "translateY(0)" }
          ], { duration: 230, delay: Math.min(index, 6) * 22, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" }));
        });
      }).observe(range, { childList: true });
    }

    clearTimeout(splashTimer);
    splashTimer = setTimeout(function () { finishBoot(false); }, reducedMotion.matches ? 0 : Math.max(0, 700 - (performance.now() - started)));
  }
  // "interactive" fires before external module imports complete. Do not wait on Firebase.
  document.addEventListener("readystatechange", initialize);
  initialize();
})();
