/* =========================================================
   かきこみ週間予定表 — app.js
   ブラウザのみで完結する週間予定表アプリ（フレームワーク不使用）
   ========================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     定数
     --------------------------------------------------------- */

  var SETTINGS_KEY = "wp_settings_v1";
  var WEEK_KEY_PREFIX = "wp_week_v1_";

  var DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

  var CATEGORIES = [
    { id: "school",  name: "学校",         hex: "#6E8FB0", badge: "学" },
    { id: "study",   name: "勉強",         hex: "#7FA07A", badge: "勉" },
    { id: "club",    name: "部活",         hex: "#C39A4A", badge: "部" },
    { id: "work",    name: "仕事",         hex: "#B06F63", badge: "仕" },
    { id: "family",  name: "家族",         hex: "#8E7AA6", badge: "家" },
    { id: "private", name: "プライベート", hex: "#5B9E96", badge: "プ" },
    { id: "other",   name: "その他",       hex: "#8C8C86", badge: "他" }
  ];

  function categoryOf(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
  }

  /* ---------------------------------------------------------
     日付ユーティリティ
     --------------------------------------------------------- */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toISODate(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function fromISODate(iso) {
    var parts = iso.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getMonday(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay(); // 0=日 ... 6=土
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatWeekRangeLabel(monday) {
    var sunday = addDays(monday, 6);
    var y = monday.getFullYear();
    var m1 = monday.getMonth() + 1, d1 = monday.getDate();
    var m2 = sunday.getMonth() + 1, d2 = sunday.getDate();
    if (m1 === m2) {
      return y + "年" + m1 + "月" + d1 + "日 〜 " + d2 + "日";
    }
    return y + "年" + m1 + "月" + d1 + "日 〜 " + m2 + "月" + d2 + "日";
  }

  function timeToMinutes(hhmm) {
    var parts = hhmm.split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------
     状態管理（localStorage）
     --------------------------------------------------------- */

  function defaultSettings() {
    return {
      orientation: "landscape",   // 'landscape' | 'portrait'
      template: "01",             // '01' | '02' | '03'
      handwrite: "standard",      // 'less' | 'standard' | 'more' | 'analog'
      timeStart: "08:00",
      timeEnd: "21:00",
      currentWeekStart: toISODate(getMonday(new Date()))
    };
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign(defaultSettings(), parsed);
      }
    } catch (e) { /* 破損データは無視して既定値を使用 */ }
    return defaultSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { console.warn("設定の保存に失敗しました", e); }
  }

  function weekKey(iso) { return WEEK_KEY_PREFIX + iso; }

  function loadWeekData(iso) {
    try {
      var raw = localStorage.getItem(weekKey(iso));
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          todos: Array.isArray(parsed.todos) ? parsed.todos : []
        };
      }
    } catch (e) { /* 破損データは無視 */ }
    return { events: [], todos: [] };
  }

  function saveWeekData() {
    try {
      localStorage.setItem(weekKey(settings.currentWeekStart), JSON.stringify(weekData));
    } catch (e) { console.warn("予定データの保存に失敗しました", e); }
  }

  var settings = loadSettings();
  var weekData = loadWeekData(settings.currentWeekStart);
  var editingEventId = null;

  /* ---------------------------------------------------------
     DOM 参照
     --------------------------------------------------------- */

  var el = {
    printArea: document.getElementById("printArea"),
    pageSizeStyle: document.getElementById("pageSizeStyle"),
    previewViewport: document.getElementById("previewViewport"),
    previewScaler: document.getElementById("previewScaler"),
    weekRangeLabel: document.getElementById("weekRangeLabel"),
    orientationHint: document.getElementById("orientationHint"),
    prevWeekBtn: document.getElementById("prevWeekBtn"),
    nextWeekBtn: document.getElementById("nextWeekBtn"),
    todayBtn: document.getElementById("todayBtn"),
    copyLastWeekBtn: document.getElementById("copyLastWeekBtn"),
    printBtn: document.getElementById("printBtn"),

    controlTabs: document.getElementById("controlTabs"),
    orientationSwitch: document.getElementById("orientationSwitch"),
    templateList: document.getElementById("templateList"),
    handwriteSwitch: document.getElementById("handwriteSwitch"),
    timeStartSelect: document.getElementById("timeStartSelect"),
    timeEndSelect: document.getElementById("timeEndSelect"),

    eventForm: document.getElementById("eventForm"),
    eventFormTitle: document.getElementById("eventFormTitle"),
    eventTitle: document.getElementById("eventTitle"),
    eventDay: document.getElementById("eventDay"),
    eventStart: document.getElementById("eventStart"),
    eventEnd: document.getElementById("eventEnd"),
    eventCategory: document.getElementById("eventCategory"),
    eventMemo: document.getElementById("eventMemo"),
    eventSubmitBtn: document.getElementById("eventSubmitBtn"),
    eventCancelBtn: document.getElementById("eventCancelBtn"),
    eventListUI: document.getElementById("eventListUI"),

    todoForm: document.getElementById("todoForm"),
    todoText: document.getElementById("todoText"),
    todoListUI: document.getElementById("todoListUI")
  };

  /* ---------------------------------------------------------
     初期化：セレクトボックスなど
     --------------------------------------------------------- */

  function populateHourSelect(selectEl) {
    selectEl.innerHTML = "";
    for (var h = 0; h <= 23; h++) {
      var opt = document.createElement("option");
      opt.value = pad2(h) + ":00";
      opt.textContent = pad2(h) + ":00";
      selectEl.appendChild(opt);
    }
  }

  function populateCategorySelect(selectEl) {
    selectEl.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      selectEl.appendChild(opt);
    });
  }

  populateHourSelect(el.timeStartSelect);
  populateHourSelect(el.timeEndSelect);
  populateCategorySelect(el.eventCategory);

  /* ---------------------------------------------------------
     印刷用紙の生成
     --------------------------------------------------------- */

  function dayMeta(monday, index) {
    var date = addDays(monday, index);
    return {
      index: index,
      date: date,
      dow: DOW_LABELS[index],
      isSat: index === 5,
      isSun: index === 6,
      label: (date.getMonth() + 1) + "/" + date.getDate()
    };
  }

  function eventsForDay(index) {
    return weekData.events
      .filter(function (e) { return e.day === index; })
      .sort(function (a, b) { return timeToMinutes(a.start) - timeToMinutes(b.start); });
  }

  function buildTitlebar(monday) {
    return (
      '<div class="pa-titlebar">' +
        '<span class="pa-titlebar-name">PaperWeek <span class="pa-titlebar-name-sub">週間予定表</span></span>' +
        '<span class="pa-titlebar-range">' + formatWeekRangeLabel(monday) + "</span>" +
      "</div>"
    );
  }

  function buildDayLabel(meta, isMemo) {
    if (isMemo) {
      return '<div class="pa-daylabel is-memo"><span class="pa-daylabel-dow">MEMO</span></div>';
    }
    var cls = "pa-daylabel" + (meta.isSun ? " is-weekend" : "") + (meta.isSat ? " is-sat" : "");
    return (
      '<div class="' + cls + '">' +
        '<div class="pa-daylabel-dow">' + meta.dow + "</div>" +
        '<div class="pa-daylabel-date">' + meta.label + "</div>" +
      "</div>"
    );
  }

  function buildHourColumn(startHour, endHour, isTimeCol) {
    var total = endHour - startHour;
    var html = "";
    for (var h = startHour; h <= endHour; h++) {
      var frac = (h - startHour) / total * 100;
      var vAlign = h === startHour ? "0%" : (h === endHour ? "-100%" : "-50%");
      if (isTimeCol) {
        html +=
          '<div class="pa-timecol-label" style="top:' + frac + "%;transform:translateY(" + vAlign + ')">' +
            pad2(h) + ":00" +
          "</div>";
      } else {
        var lineCls = "pa-hourline" + (h % 1 === 0 ? " is-hour" : "");
        html += '<div class="' + lineCls + '" style="top:' + frac + '%"></div>';
      }
    }
    return html;
  }

  function buildEventBlock(ev, startHour, endHour) {
    var total = (endHour - startHour) * 60;
    var startMin = Math.max(timeToMinutes(ev.start) - startHour * 60, 0);
    var endMin = Math.min(timeToMinutes(ev.end) - startHour * 60, total);
    if (endMin <= startMin) endMin = startMin + Math.max(total * 0.02, 1);
    var top = (startMin / total) * 100;
    var height = Math.max(((endMin - startMin) / total) * 100, 2.6);
    var cat = categoryOf(ev.category);
    return (
      '<div class="pa-event" style="top:' + top + "%;height:" + height + "%;border-left-color:" + cat.hex + '">' +
        '<span class="pa-event-time">' + ev.start + "〜" + ev.end + "</span>" +
        '<span class="pa-event-title">' +
          '<span class="pa-event-badge" style="background:' + cat.hex + '">' + cat.badge + "</span>" +
          escapeHtml(ev.title) +
        "</span>" +
      "</div>"
    );
  }

  function buildTimelineBlock(monday, dayIndices, includeMemoCol, startHour, endHour) {
    var labelsHtml = '<div class="pa-timecol-spacer" style="width:9mm"></div>';
    var colsHtml = "";

    dayIndices.forEach(function (idx) {
      var meta = dayMeta(monday, idx);
      labelsHtml += buildDayLabel(meta, false);

      var eventsHtml = eventsForDay(idx).map(function (ev) {
        return buildEventBlock(ev, startHour, endHour);
      }).join("");

      colsHtml +=
        '<div class="pa-daycol">' +
          buildHourColumn(startHour, endHour, false) +
          eventsHtml +
        "</div>";
    });

    if (includeMemoCol) {
      labelsHtml += buildDayLabel(null, true);
      colsHtml += '<div class="pa-daycol is-memo"></div>';
    }

    return (
      '<div class="pa-timeline-block">' +
        '<div class="pa-daylabels">' + labelsHtml + "</div>" +
        '<div class="pa-hourgrid">' +
          '<div class="pa-timecol" style="width:9mm">' + buildHourColumn(startHour, endHour, true) + "</div>" +
          colsHtml +
        "</div>" +
      "</div>"
    );
  }

  function buildTemplate01(monday, orientation, startHour, endHour) {
    var body = "";
    if (orientation === "landscape") {
      body = buildTimelineBlock(monday, [0, 1, 2, 3, 4, 5, 6], false, startHour, endHour);
    } else {
      body =
        buildTimelineBlock(monday, [0, 1, 2, 3], false, startHour, endHour) +
        buildTimelineBlock(monday, [4, 5, 6], true, startHour, endHour);
    }
    return '<div class="pa-grid-wrap"><div class="pa-timeline">' + body + "</div></div>";
  }

  function buildDayCard(monday, index, isAnalog) {
    var meta = dayMeta(monday, index);
    var evs = eventsForDay(index);
    var headCls = "pa-daycard-head" + (meta.isSun ? " is-sun" : "") + (meta.isSat ? " is-sat" : "");

    var eventsHtml = "";
    if (evs.length) {
      if (isAnalog) {
        var line = evs.map(function (ev) {
          return ev.start + " " + escapeHtml(ev.title);
        }).join(" ／ ");
        eventsHtml = '<div class="pa-daycard-events"><div class="pa-daycard-event">' + line + "</div></div>";
      } else {
        eventsHtml = '<div class="pa-daycard-events">' + evs.map(function (ev) {
          var cat = categoryOf(ev.category);
          return (
            '<div class="pa-daycard-event">' +
              '<span class="t">' + ev.start + "〜" + ev.end + "</span>" +
              '<span class="pa-event-badge" style="background:' + cat.hex + '">' + cat.badge + "</span>" +
              escapeHtml(ev.title) +
            "</div>"
          );
        }).join("") + "</div>";
      }
    }

    return (
      '<div class="pa-daycard">' +
        '<div class="' + headCls + '"><span class="dow">' + meta.dow + '</span><span class="date">' + meta.label + "</span></div>" +
        eventsHtml +
        '<div class="pa-daycard-ruled"></div>' +
      "</div>"
    );
  }

  function buildListTemplate(monday, orientation, isAnalog) {
    var gridCls = "pa-daygrid " + (orientation === "landscape" ? "is-landscape" : "is-portrait");
    var cards = "";
    for (var i = 0; i < 7; i++) cards += buildDayCard(monday, i, isAnalog);
    if (orientation === "portrait") {
      cards += (
        '<div class="pa-daycard is-memocard">' +
          '<div class="pa-daycard-head"><span class="dow">MEMO</span></div>' +
          '<div class="pa-daycard-ruled"></div>' +
        "</div>"
      );
    }
    return '<div class="pa-grid-wrap"><div class="' + gridCls + '">' + cards + "</div></div>";
  }

  function buildBottomPanels() {
    var todoHtml = weekData.todos.map(function (t) {
      return (
        '<div class="pa-todo-item">' +
          '<span class="pa-todo-box">' + (t.checked ? "✓" : "") + "</span>" +
          '<span>' + escapeHtml(t.text) + "</span>" +
        "</div>"
      );
    }).join("");

    todoHtml += [0, 1, 2].map(function () {
      return '<div class="pa-todo-item"><span class="pa-todo-box"></span><span class="pa-todo-blankline" style="flex:1"></span></div>';
    }).join("");

    return (
      '<div class="pa-bottom">' +
        '<div class="pa-panel">' +
          '<div class="pa-panel-head">TODO ／ 今週やること</div>' +
          '<div class="pa-panel-body">' + todoHtml + "</div>" +
        "</div>" +
        '<div class="pa-panel" style="flex:1.3">' +
          '<div class="pa-panel-head">MEMO</div>' +
          '<div class="pa-panel-body"><div class="pa-ruled"></div></div>' +
        "</div>" +
      "</div>"
    );
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function effectiveTemplate() {
    return settings.handwrite === "analog" ? "03" : settings.template;
  }

  function renderPrintArea() {
    var monday = fromISODate(settings.currentWeekStart);
    var tpl = effectiveTemplate();
    var startHour = parseInt(settings.timeStart.split(":")[0], 10);
    var endHour = parseInt(settings.timeEnd.split(":")[0], 10);
    if (endHour <= startHour) endHour = startHour + 1;

    var gridHtml;
    if (tpl === "01") {
      gridHtml = buildTemplate01(monday, settings.orientation, startHour, endHour);
    } else {
      gridHtml = buildListTemplate(monday, settings.orientation, tpl === "03");
    }

    el.printArea.innerHTML = buildTitlebar(monday) + '<div class="pa-body">' + gridHtml + buildBottomPanels() + "</div>";

    el.printArea.className =
      "print-area orientation-" + settings.orientation + " tpl-" + tpl + " hw-" + settings.handwrite;
  }

  function updatePageSizeStyle() {
    el.pageSizeStyle.textContent =
      "@page { size: A4 " + (settings.orientation === "portrait" ? "portrait" : "landscape") + "; margin: 0; }";
  }

  function scalePreview() {
    var naturalW = el.printArea.offsetWidth;
    var naturalH = el.printArea.offsetHeight;
    if (!naturalW || !naturalH) return;
    var availW = el.previewViewport.clientWidth - 36;
    var scale = Math.min(availW / naturalW, 1);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    el.printArea.style.transform = "scale(" + scale + ")";
    el.previewScaler.style.width = Math.round(naturalW * scale) + "px";
    el.previewScaler.style.height = Math.round(naturalH * scale) + "px";
  }

  /* ---------------------------------------------------------
     コントロールパネルの描画
     --------------------------------------------------------- */

  function renderTopbar() {
    var monday = fromISODate(settings.currentWeekStart);
    el.weekRangeLabel.textContent = formatWeekRangeLabel(monday);
    el.orientationHint.textContent =
      settings.orientation === "portrait" ? "この状態でA4縦に印刷されます" : "この状態でA4横に印刷されます";
  }

  function renderEventList() {
    var events = weekData.events.slice().sort(function (a, b) {
      if (a.day !== b.day) return a.day - b.day;
      return timeToMinutes(a.start) - timeToMinutes(b.start);
    });

    if (!events.length) {
      el.eventListUI.innerHTML = '<li class="empty-note">まだ予定がありません。上のフォームから追加してください。</li>';
      return;
    }

    el.eventListUI.innerHTML = events.map(function (ev) {
      var cat = categoryOf(ev.category);
      return (
        '<li class="item-row" data-id="' + ev.id + '">' +
          '<span class="item-badge" style="background:' + cat.hex + '">' + cat.badge + "</span>" +
          '<span class="item-main">' +
            '<span class="item-title">' + escapeHtml(ev.title) + "</span><br>" +
            '<span class="item-sub">' + DOW_LABELS[ev.day] + "曜 " + ev.start + "〜" + ev.end + "</span>" +
          "</span>" +
          '<span class="item-actions">' +
            '<button type="button" class="js-edit-event" title="編集">✎</button>' +
            '<button type="button" class="js-delete-event danger" title="削除">✕</button>' +
          "</span>" +
        "</li>"
      );
    }).join("");
  }

  function renderTodoList() {
    if (!weekData.todos.length) {
      el.todoListUI.innerHTML = '<li class="empty-note">まだTODOがありません。</li>';
      return;
    }
    el.todoListUI.innerHTML = weekData.todos.map(function (t) {
      return (
        '<li class="item-row' + (t.checked ? " is-checked" : "") + '" data-id="' + t.id + '">' +
          '<input type="checkbox" class="js-toggle-todo" ' + (t.checked ? "checked" : "") + ">" +
          '<span class="item-main"><span class="item-title">' + escapeHtml(t.text) + "</span></span>" +
          '<span class="item-actions"><button type="button" class="js-delete-todo danger" title="削除">✕</button></span>' +
        "</li>"
      );
    }).join("");
  }

  function syncControlInputs() {
    Array.prototype.forEach.call(el.orientationSwitch.querySelectorAll(".segmented-btn"), function (btn) {
      btn.classList.toggle("is-active", btn.dataset.orientation === settings.orientation);
    });
    Array.prototype.forEach.call(el.handwriteSwitch.querySelectorAll(".segmented-btn"), function (btn) {
      btn.classList.toggle("is-active", btn.dataset.level === settings.handwrite);
    });
    Array.prototype.forEach.call(el.templateList.querySelectorAll('input[name="template"]'), function (input) {
      input.checked = input.value === settings.template;
    });
    el.timeStartSelect.value = settings.timeStart;
    el.timeEndSelect.value = settings.timeEnd;
  }

  function renderAll() {
    renderTopbar();
    renderEventList();
    renderTodoList();
    syncControlInputs();
    renderPrintArea();
    updatePageSizeStyle();
    requestAnimationFrame(scalePreview);
  }

  /* ---------------------------------------------------------
     イベントハンドラ：週の切り替え
     --------------------------------------------------------- */

  function switchWeek(newMondayISO) {
    settings.currentWeekStart = newMondayISO;
    weekData = loadWeekData(newMondayISO);
    editingEventId = null;
    resetEventForm();
    saveSettings();
    renderAll();
  }

  el.prevWeekBtn.addEventListener("click", function () {
    var monday = fromISODate(settings.currentWeekStart);
    switchWeek(toISODate(addDays(monday, -7)));
  });

  el.nextWeekBtn.addEventListener("click", function () {
    var monday = fromISODate(settings.currentWeekStart);
    switchWeek(toISODate(addDays(monday, 7)));
  });

  el.todayBtn.addEventListener("click", function () {
    switchWeek(toISODate(getMonday(new Date())));
  });

  el.copyLastWeekBtn.addEventListener("click", function () {
    var monday = fromISODate(settings.currentWeekStart);
    var prevISO = toISODate(addDays(monday, -7));
    var prevData = loadWeekData(prevISO);
    if (!prevData.events.length && !prevData.todos.length) {
      alert("先週の予定・TODOが見つかりませんでした。");
      return;
    }
    prevData.events.forEach(function (ev) {
      weekData.events.push(Object.assign({}, ev, { id: uid() }));
    });
    prevData.todos.forEach(function (t) {
      weekData.todos.push({ id: uid(), text: t.text, checked: false });
    });
    saveWeekData();
    renderAll();
  });

  /* ---------------------------------------------------------
     イベントハンドラ：タブ切り替え
     --------------------------------------------------------- */

  el.controlTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    Array.prototype.forEach.call(el.controlTabs.querySelectorAll(".tab-btn"), function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    var target = btn.dataset.tab;
    Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (panel) {
      panel.classList.toggle("is-active", panel.dataset.panel === target);
    });
  });

  /* ---------------------------------------------------------
     イベントハンドラ：用紙の向き／テンプレート／手書き量／時間軸
     --------------------------------------------------------- */

  el.orientationSwitch.addEventListener("click", function (e) {
    var btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    settings.orientation = btn.dataset.orientation;
    saveSettings();
    renderAll();
  });

  el.templateList.addEventListener("change", function (e) {
    if (e.target.name !== "template") return;
    settings.template = e.target.value;
    saveSettings();
    renderAll();
  });

  el.handwriteSwitch.addEventListener("click", function (e) {
    var btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    settings.handwrite = btn.dataset.level;
    saveSettings();
    renderAll();
  });

  el.timeStartSelect.addEventListener("change", function () {
    settings.timeStart = el.timeStartSelect.value;
    if (timeToMinutes(settings.timeEnd) <= timeToMinutes(settings.timeStart)) {
      var h = Math.min(parseInt(settings.timeStart.split(":")[0], 10) + 1, 23);
      settings.timeEnd = pad2(h) + ":00";
    }
    saveSettings();
    renderAll();
  });

  el.timeEndSelect.addEventListener("change", function () {
    settings.timeEnd = el.timeEndSelect.value;
    if (timeToMinutes(settings.timeEnd) <= timeToMinutes(settings.timeStart)) {
      var h = Math.max(parseInt(settings.timeEnd.split(":")[0], 10) - 1, 0);
      settings.timeStart = pad2(h) + ":00";
    }
    saveSettings();
    renderAll();
  });

  /* ---------------------------------------------------------
     イベントハンドラ：予定の追加・編集・削除
     --------------------------------------------------------- */

  function resetEventForm() {
    editingEventId = null;
    el.eventForm.reset();
    el.eventStart.value = "09:00";
    el.eventEnd.value = "10:00";
    el.eventFormTitle.textContent = "予定を追加";
    el.eventSubmitBtn.textContent = "追加する";
    el.eventCancelBtn.hidden = true;
  }

  el.eventForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var title = el.eventTitle.value.trim();
    if (!title) return;
    var start = el.eventStart.value || "09:00";
    var end = el.eventEnd.value || "10:00";
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      alert("終了時刻は開始時刻より後にしてください。");
      return;
    }
    var payload = {
      title: title,
      day: parseInt(el.eventDay.value, 10),
      start: start,
      end: end,
      category: el.eventCategory.value,
      memo: el.eventMemo.value.trim()
    };

    if (editingEventId) {
      var idx = weekData.events.findIndex(function (ev) { return ev.id === editingEventId; });
      if (idx !== -1) weekData.events[idx] = Object.assign({ id: editingEventId }, payload);
    } else {
      payload.id = uid();
      weekData.events.push(payload);
    }

    saveWeekData();
    resetEventForm();
    renderAll();
  });

  el.eventCancelBtn.addEventListener("click", resetEventForm);

  el.eventListUI.addEventListener("click", function (e) {
    var row = e.target.closest(".item-row");
    if (!row) return;
    var id = row.dataset.id;

    if (e.target.closest(".js-delete-event")) {
      weekData.events = weekData.events.filter(function (ev) { return ev.id !== id; });
      saveWeekData();
      if (editingEventId === id) resetEventForm();
      renderAll();
      return;
    }

    if (e.target.closest(".js-edit-event")) {
      var ev = weekData.events.find(function (x) { return x.id === id; });
      if (!ev) return;
      editingEventId = id;
      el.eventTitle.value = ev.title;
      el.eventDay.value = String(ev.day);
      el.eventStart.value = ev.start;
      el.eventEnd.value = ev.end;
      el.eventCategory.value = ev.category;
      el.eventMemo.value = ev.memo || "";
      el.eventFormTitle.textContent = "予定を編集";
      el.eventSubmitBtn.textContent = "更新する";
      el.eventCancelBtn.hidden = false;
      Array.prototype.forEach.call(el.controlTabs.querySelectorAll(".tab-btn"), function (b) {
        b.classList.toggle("is-active", b.dataset.tab === "events");
      });
      Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (panel) {
        panel.classList.toggle("is-active", panel.dataset.panel === "events");
      });
      el.eventTitle.focus();
    }
  });

  /* ---------------------------------------------------------
     イベントハンドラ：TODO
     --------------------------------------------------------- */

  el.todoForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = el.todoText.value.trim();
    if (!text) return;
    weekData.todos.push({ id: uid(), text: text, checked: false });
    saveWeekData();
    el.todoForm.reset();
    renderAll();
  });

  el.todoListUI.addEventListener("click", function (e) {
    var row = e.target.closest(".item-row");
    if (!row) return;
    var id = row.dataset.id;

    if (e.target.classList.contains("js-toggle-todo")) {
      var t = weekData.todos.find(function (x) { return x.id === id; });
      if (t) t.checked = e.target.checked;
      saveWeekData();
      renderAll();
      return;
    }

    if (e.target.closest(".js-delete-todo")) {
      weekData.todos = weekData.todos.filter(function (x) { return x.id !== id; });
      saveWeekData();
      renderAll();
    }
  });

  /* ---------------------------------------------------------
     印刷
     --------------------------------------------------------- */

  el.printBtn.addEventListener("click", function () {
    updatePageSizeStyle();
    window.print();
  });

  window.addEventListener("beforeprint", updatePageSizeStyle);

  /* ---------------------------------------------------------
     リサイズ対応
     --------------------------------------------------------- */

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scalePreview, 120);
  });

  /* ---------------------------------------------------------
     初期描画
     --------------------------------------------------------- */

  renderAll();

})();
