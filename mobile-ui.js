/* Responsive navigation changes presentation only; all saves use app.js. */
(function () {
  "use strict";
  var narrow = window.matchMedia("(max-width: 760px), (max-width: 980px) and (max-height: 500px)");
  var tabs = document.getElementById("controlTabs");
  var editor = document.getElementById("eventEditor");
  var imports = document.getElementById("importTools");
  var buttons = Array.from(tabs.querySelectorAll("[data-tab]"));

  function editorLabel() {
    document.getElementById("eventEditorLabel").textContent = document.getElementById("eventFormTitle").textContent;
  }
  new MutationObserver(editorLabel).observe(document.getElementById("eventFormTitle"), { childList: true });
  editorLabel();

  function activeTab() {
    var selected = tabs.querySelector(".is-active");
    return selected ? selected.dataset.tab : "events";
  }
  function syncTabs() {
    var current = activeTab();
    document.body.dataset.mobilePanel = current;
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.tab === current));
    });
  }
  function select(name) {
    tabs.querySelector('[data-tab="' + name + '"]').click();
  }
  tabs.addEventListener("click", function (event) {
    if (!event.target.closest("[data-tab]")) return;
    syncTabs();
    if (narrow.matches) window.scrollTo({ top: 0, behavior: "instant" });
    if (activeTab() === "preview") window.dispatchEvent(new Event("resize"));
  });

  function layout() {
    editor.open = imports.open = !narrow.matches;
    if (narrow.matches || activeTab() === "preview") select("events");
    syncTabs();
  }
  narrow.addEventListener("change", layout);

  function showEditor() {
    editor.open = true;
  }
  document.getElementById("mobileAddEventBtn").addEventListener("click", function () {
    var cancel = document.getElementById("eventCancelBtn");
    if (!cancel.hidden) cancel.click();
    showEditor();
    editor.scrollIntoView({ block: "start", behavior: "instant" });
    document.getElementById("eventTitle").focus({ preventScroll: true });
  });
  document.getElementById("mobileImportBtn").addEventListener("click", function () {
    imports.open = true;
    imports.scrollIntoView({ block: "start", behavior: "instant" });
    document.getElementById("importFile").focus({ preventScroll: true });
  });
  document.getElementById("mobileCopyWeekBtn").addEventListener("click", function () {
    document.getElementById("copyLastWeekBtn").click();
  });

  // Open the form before app.js fills and focuses it, including from a collapsed editor.
  document.getElementById("eventListUI").addEventListener("click", function (event) {
    if (narrow.matches && event.target.closest(".js-edit-event")) {
      showEditor();
      requestAnimationFrame(function () { editor.scrollIntoView({ block: "start", behavior: "instant" }); });
    }
  }, true);

  layout();
})();
