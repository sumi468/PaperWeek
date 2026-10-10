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
  var VIEW_KEY = "wp_view_v1";
  var dates = window.PaperWeekDates;

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
    notifyCloud("settings", Object.assign({}, settings));
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

  function saveWeekData(iso, data) {
    iso = iso || settings.currentWeekStart;
    data = data || weekData;
    try {
      localStorage.setItem(weekKey(iso), JSON.stringify(data));
    } catch (e) { console.warn("予定データの保存に失敗しました", e); }
    notifyCloud("week", { iso: iso, data: JSON.parse(JSON.stringify(data)) });
  }

  // ---- クラウド同期（Firebase）との連携用フック -------------------
  // cloud-sync.js が読み込まれている場合のみ実際に使われる。
  // 未設定・オフライン時はこれらは何もしないため、既存のlocalStorage動作に影響しない。
  var cloudChangeListeners = [];
  var suppressCloudNotify = false;

  function notifyCloud(type, payload) {
    if (suppressCloudNotify) return;
    cloudChangeListeners.forEach(function (fn) {
      try { fn(type, payload); } catch (e) { console.error(e); }
    });
  }

  var settings = loadSettings();
  var weekData = loadWeekData(settings.currentWeekStart);
  var editingEventId = null;
  var editingEventWeek = null;
  var storedView;
  try { storedView = JSON.parse(localStorage.getItem(VIEW_KEY)); } catch (e) {}
  var view = dates.normalize(storedView, settings.currentWeekStart);
  function visibleDates() { return dates.visible(view); }
  function visibleWeeks() { return Array.from(new Set(visibleDates().map(dates.week))); }
  function dataForWeek(iso) { return iso === settings.currentWeekStart ? weekData : loadWeekData(iso); }
  function selectedEvents() {
    return visibleDates().flatMap(function (iso) {
      var week = dates.week(iso);
      return dataForWeek(week).events.filter(function (ev) { return ev.day === dates.day(iso); })
        .map(function (ev) { return Object.assign({}, ev, { date: iso, week: week }); });
    });
  }
  function dateLabel(iso) {
    var d = dates.parse(iso);
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + "（" + DOW_LABELS[dates.day(iso)] + "）";
  }
  function selectionLabel() {
    var selected = visibleDates();
    if (view.mode === "custom") return selected.map(dateLabel).join("・");
    return dateLabel(selected[0]) + (selected.length > 1 ? " 〜 " + dateLabel(selected[selected.length - 1]) : "");
  }
  function changeView() {
    view = dates.normalize(view, settings.currentWeekStart);
    var weeks = visibleWeeks();
    if (weeks.indexOf(settings.currentWeekStart) < 0) {
      settings.currentWeekStart = weeks[0];
      weekData = loadWeekData(weeks[0]);
      saveSettings();
    }
    resetEventForm();
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {}
    renderAll();
    notifyCloud("visibleWeeksChanged", weeks);
  }

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
  ["dateModeSwitch", "viewStart", "viewCount", "rangeControls", "customControls", "customDate", "addDateBtn", "selectedDates", "dateStatus", "todoWeek"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

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
    var iso = visibleDates()[index];
    var date = dates.parse(iso);
    var weekday = dates.day(iso);
    return {
      index: index,
      date: date,
      dow: DOW_LABELS[weekday],
      isSat: weekday === 5,
      isSun: weekday === 6,
      label: (date.getMonth() + 1) + "/" + date.getDate()
    };
  }

  function eventsForDay(index) {
    var iso = visibleDates()[index];
    return dataForWeek(dates.week(iso)).events
      .filter(function (e) { return e.day === dates.day(iso); })
      .sort(function (a, b) { return timeToMinutes(a.start) - timeToMinutes(b.start); });
  }

  function buildTitlebar(monday) {
    return (
      '<div class="pa-titlebar">' +
        '<span class="pa-titlebar-name">PaperWeek <span class="pa-titlebar-name-sub">週間予定表</span></span>' +
        '<span class="pa-titlebar-range">' + selectionLabel() + "</span>" +
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
    if (endMin <= startMin) return "";
    var top = (startMin / total) * 100;
    var height = ((endMin - startMin) / total) * 100;
    var cat = categoryOf(ev.category);
    return (
      '<div class="pa-event" style="top:' + top + "%;height:" + height + "%;left:calc(" + (ev.lane / ev.lanes * 100) + "% + 0.6mm);width:calc(" + (100 / ev.lanes) + "% - 1.2mm);border-left-color:" + cat.hex + '">' +
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

      var dayEvents = eventsForDay(idx);
      var laneEnds = [];
      var positioned = dayEvents.map(function (ev) {
        var lane = laneEnds.findIndex(function (end) { return end <= timeToMinutes(ev.start); });
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = timeToMinutes(ev.end);
        return Object.assign({}, ev, { lane: lane });
      });
      var eventsHtml = positioned.map(function (ev) {
        ev.lanes = laneEnds.length;
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
    var indices = visibleDates().map(function (_, i) { return i; });
    if (orientation === "landscape" || indices.length <= 4) {
      body = buildTimelineBlock(monday, indices, false, startHour, endHour);
    } else {
      var split = Math.ceil(indices.length / 2);
      body =
        buildTimelineBlock(monday, indices.slice(0, split), false, startHour, endHour) +
        buildTimelineBlock(monday, indices.slice(split), false, startHour, endHour);
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
    var count = visibleDates().length;
    for (var i = 0; i < count; i++) cards += buildDayCard(monday, i, isAnalog);
    if (orientation === "portrait" && count === 7) {
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
    var weeks = visibleWeeks();
    var todoHtml = weeks.map(function (iso) {
      return dataForWeek(iso).todos.map(function (t) {
        return (
          '<div class="pa-todo-item">' +
            '<span class="pa-todo-box">' + (t.checked ? "✓" : "") + "</span>" +
            '<span>' + (weeks.length > 1 ? '<small>' + iso + 'の週： </small>' : '') + escapeHtml(t.text) + "</span>" +
          "</div>"
        );
      }).join("");
    }).join("");

    todoHtml += [0, 1, 2].map(function () {
      return '<div class="pa-todo-item"><span class="pa-todo-box"></span><span class="pa-todo-blankline" style="flex:1"></span></div>';
    }).join("");

    return (
      '<div class="pa-bottom">' +
        '<div class="pa-panel">' +
          '<div class="pa-panel-head">TODO ／ 選択日を含む週</div>' +
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

    el.printArea.innerHTML = '<section class="pa-sheet">' + buildTitlebar(monday) + '<div class="pa-body">' + gridHtml + buildBottomPanels() + "</div></section>";

    el.printArea.className =
      "print-area orientation-" + settings.orientation + " tpl-" + tpl + " hw-" + settings.handwrite;
    el.printArea.dataset.days = visibleDates().length;
    el.printArea.style.setProperty("--day-count", visibleDates().length);
    el.printArea.style.setProperty("--card-columns", settings.orientation === "landscape" ? visibleDates().length : Math.min(2, visibleDates().length));
    appendOverflowDetails(startHour, endHour, tpl);
  }

  // Keep handwriting space on the planner. Content that cannot be read there is
  // repeated in full on measured A4 continuation sheets, in preview and print.
  function appendOverflowDetails(startHour, endHour, tpl) {
    var main = el.printArea.firstElementChild;
    var events = selectedEvents();
    var eventOverflow = Array.from(main.querySelectorAll(".pa-event, .pa-daycard")).some(function (node) {
      return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
    });
    if (tpl === "01") eventOverflow = eventOverflow || events.some(function (ev) {
      return timeToMinutes(ev.start) < startHour * 60 || timeToMinutes(ev.end) > endHour * 60;
    });
    var todoPanel = main.querySelector(".pa-panel-body");
    var todoOverflow = Array.from(todoPanel.querySelectorAll(".pa-todo-item")).some(function (row) {
      return row.textContent.trim() && (row.offsetTop + row.offsetHeight > todoPanel.offsetTop + todoPanel.clientHeight || row.scrollWidth > row.clientWidth + 1);
    });
    if (!eventOverflow && !todoOverflow) return;
    var note = document.createElement("div");
    note.className = "pa-overflow-note";
    note.textContent = "枠内に収まらない内容は、続きのページに全文を掲載しています。";
    main.appendChild(note);
    var body;
    function newSheet() {
      var sheet = document.createElement("section");
      sheet.className = "pa-sheet pa-details";
      sheet.innerHTML = buildTitlebar() + '<h2 class="pa-details-title">予定・TODOの詳細（続き）</h2><div class="pa-details-body"></div>';
      el.printArea.appendChild(sheet);
      body = sheet.querySelector(".pa-details-body");
    }
    function appendText(text) {
      var remaining = Array.from(text);
      while (remaining.length) {
        var row = document.createElement("p");
        row.textContent = remaining.join("");
        body.appendChild(row);
        if (body.scrollHeight <= body.clientHeight + 1) return;
        row.remove();
        if (body.childElementCount) newSheet();
        body.appendChild(row);
        var low = 0, high = remaining.length;
        while (low < high) {
          var middle = Math.ceil((low + high) / 2);
          row.textContent = remaining.slice(0, middle).join("");
          if (body.scrollHeight <= body.clientHeight + 1) low = middle;
          else high = middle - 1;
        }
        // A full A4 body always fits at least one character at this fixed font size.
        var count = Math.max(low, 1);
        row.textContent = remaining.slice(0, count).join("");
        remaining = remaining.slice(count);
        if (remaining.length) newSheet();
      }
    }
    newSheet();
    if (eventOverflow) events.forEach(function (ev) {
      appendText(dateLabel(ev.date) + " " + ev.start + "〜" + ev.end + "　" + ev.title + (ev.memo ? "\nメモ：" + ev.memo : ""));
    });
    if (todoOverflow) visibleWeeks().forEach(function (iso) {
      dataForWeek(iso).todos.forEach(function (todo) {
        appendText("TODO（" + iso + "の週） " + (todo.checked ? "✓ " : "□ ") + todo.text);
      });
    });
  }

  function updatePageSizeStyle() {
    el.pageSizeStyle.textContent =
      "@page { size: A4 " + (settings.orientation === "portrait" ? "portrait" : "landscape") + "; margin: 0; }";
  }

  function scalePreview() {
    if (window.matchMedia("print").matches) return;
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
    el.weekRangeLabel.textContent = selectionLabel();
    el.prevWeekBtn.title = el.prevWeekBtn.ariaLabel = view.mode === "range" ? "前の期間" : "選択日を1週間前へ";
    el.nextWeekBtn.title = el.nextWeekBtn.ariaLabel = view.mode === "range" ? "次の期間" : "選択日を1週間後へ";
    el.copyLastWeekBtn.title = settings.currentWeekStart + "の週へ先週の予定・TODOをコピー";
    el.orientationHint.textContent =
      settings.orientation === "portrait" ? "この状態でA4縦に印刷されます" : "この状態でA4横に印刷されます";
  }

  function renderEventList() {
    var events = selectedEvents().sort(function (a, b) {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return timeToMinutes(a.start) - timeToMinutes(b.start);
    });

    if (!events.length) {
      el.eventListUI.innerHTML = '<li class="empty-note">まだ予定がありません。上のフォームから追加してください。</li>';
      return;
    }

    el.eventListUI.innerHTML = events.map(function (ev) {
      var cat = categoryOf(ev.category);
      return (
        '<li class="item-row" data-week="' + ev.week + '" data-date="' + ev.date + '" data-id="' + escapeHtml(ev.id) + '">' +
          '<span class="item-badge" style="background:' + cat.hex + '">' + cat.badge + "</span>" +
          '<span class="item-main">' +
            '<span class="item-title">' + escapeHtml(ev.title) + "</span><br>" +
            '<span class="item-sub">' + dateLabel(ev.date) + " " + ev.start + "〜" + ev.end + "</span>" +
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
    var selected = visibleDates();
    el.viewStart.value = view.start;
    el.viewCount.value = view.count;
    el.rangeControls.hidden = view.mode !== "range";
    el.customControls.hidden = view.mode !== "custom";
    if (!el.customDate.value) el.customDate.value = selected[0];
    el.dateModeSwitch.querySelectorAll("button").forEach(function (btn) {
      var active = btn.dataset.mode === view.mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active);
    });
    el.selectedDates.innerHTML = selected.map(function (iso) {
      return view.mode === "custom" ? '<button type="button" class="date-chip ghost-btn" data-date="' + iso + '" aria-label="' + dateLabel(iso) + 'を選択から外す" ' + (selected.length === 1 ? 'disabled' : '') + '>' + dateLabel(iso) + ' ×</button>' : '<span class="date-chip">' + dateLabel(iso) + '</span>';
    }).join("");
    el.dateStatus.textContent = selected.length + "日分を表示・印刷します。";
    var eventDate = el.eventDay.value;
    el.eventDay.innerHTML = selected.map(function (iso) { return '<option value="' + iso + '">' + dateLabel(iso) + '</option>'; }).join("");
    if (selected.indexOf(eventDate) >= 0) el.eventDay.value = eventDate;
    el.todoWeek.innerHTML = visibleWeeks().map(function (iso) { return '<option value="' + iso + '">' + formatWeekRangeLabel(fromISODate(iso)) + '</option>'; }).join("");
    el.todoWeek.value = settings.currentWeekStart;
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
    notifyCloud("visibleWeeksChanged", visibleWeeks());
    renderAll();
  }

  el.prevWeekBtn.addEventListener("click", function () {
    moveView(-1);
  });

  el.nextWeekBtn.addEventListener("click", function () {
    moveView(1);
  });

  el.todayBtn.addEventListener("click", function () {
    view.mode = "range";
    view.start = toISODate(getMonday(new Date()));
    view.count = 7;
    changeView();
  });

  function moveView(direction) {
    var amount = direction * (view.mode === "range" ? view.count : 7);
    var moved = visibleDates().map(function (iso) { return dates.add(iso, amount); });
    if (!moved.every(dates.parse)) return;
    if (view.mode === "range") view.start = moved[0];
    else view.dates = moved;
    changeView();
  }
  el.dateModeSwitch.addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (!button || button.dataset.mode === view.mode) return;
    if (button.dataset.mode === "custom") view.dates = visibleDates();
    else { view.start = view.dates[0]; view.count = view.dates.length; }
    view.mode = button.dataset.mode;
    changeView();
  });
  el.viewStart.addEventListener("change", function () {
    if (!el.viewStart.validity.valid || !dates.parse(el.viewStart.value)) { el.viewStart.value = view.start; return; }
    view.start = el.viewStart.value;
    changeView();
  });
  el.viewCount.addEventListener("change", function () { view.count = Number(el.viewCount.value); changeView(); });
  el.addDateBtn.addEventListener("click", function () {
    var iso = el.customDate.value;
    if (!dates.parse(iso)) { el.dateStatus.textContent = "有効な日付を選んでください。"; return; }
    if (view.dates.indexOf(iso) >= 0) { el.dateStatus.textContent = "この日付は選択済みです。"; return; }
    if (view.dates.length >= 7) { el.dateStatus.textContent = "最大7日です。選択中の日付を外してから追加してください。"; return; }
    view.dates.push(iso);
    changeView();
  });
  el.selectedDates.addEventListener("click", function (event) {
    var button = event.target.closest("[data-date]");
    if (!button || view.dates.length <= 1) return;
    view.dates = view.dates.filter(function (iso) { return iso !== button.dataset.date; });
    changeView();
  });
  el.todoWeek.addEventListener("change", function () { switchWeek(el.todoWeek.value); });

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
    editingEventWeek = null;
    el.eventDay.disabled = false;
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
      day: dates.day(el.eventDay.value),
      start: start,
      end: end,
      category: el.eventCategory.value,
      memo: el.eventMemo.value.trim()
    };

    var targetWeek = dates.week(el.eventDay.value);
    var targetData = dataForWeek(targetWeek);
    if (editingEventId) {
      var sourceData = dataForWeek(editingEventWeek);
      var idx = sourceData.events.findIndex(function (ev) { return ev.id === editingEventId; });
      if (idx !== -1) {
        var updated = Object.assign({}, sourceData.events[idx], payload);
        if (targetWeek === editingEventWeek) targetData.events[idx] = updated;
        else {
          sourceData.events.splice(idx, 1);
          saveWeekData(editingEventWeek, sourceData);
          if (targetData.events.some(function (ev) { return ev.id === updated.id; })) updated.id = uid();
          targetData.events.push(updated);
        }
      }
    } else {
      payload.id = uid();
      targetData.events.push(payload);
    }

    saveWeekData(targetWeek, targetData);
    resetEventForm();
    renderAll();
  });

  el.eventCancelBtn.addEventListener("click", resetEventForm);

  el.eventListUI.addEventListener("click", function (e) {
    var row = e.target.closest(".item-row");
    if (!row) return;
    var id = row.dataset.id;
    var targetWeek = row.dataset.week;
    var targetData = dataForWeek(targetWeek);

    if (e.target.closest(".js-delete-event")) {
      targetData.events = targetData.events.filter(function (ev) { return ev.id !== id; });
      saveWeekData(targetWeek, targetData);
      if (editingEventId === id && editingEventWeek === targetWeek) resetEventForm();
      renderAll();
      return;
    }

    if (e.target.closest(".js-edit-event")) {
      var ev = targetData.events.find(function (x) { return x.id === id; });
      if (!ev) return;
      editingEventId = id;
      editingEventWeek = targetWeek;
      el.eventTitle.value = ev.title;
      el.eventDay.value = row.dataset.date;
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
  window.addEventListener("afterprint", function () { requestAnimationFrame(scalePreview); });

  /* ---------------------------------------------------------
     リサイズ対応
     --------------------------------------------------------- */

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(scalePreview);
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(scalePreview).observe(el.previewViewport);

  /* ---------------------------------------------------------
     外部連携用ブリッジ（cloud-sync.js から利用）
     Firebase未導入・オフライン時は誰からも呼ばれないため、
     既存のローカル動作には一切影響しない。
     --------------------------------------------------------- */

  window.PaperWeek = {
    onChange: function (fn) {
      if (typeof fn === "function") cloudChangeListeners.push(fn);
    },

    getSettings: function () { return Object.assign({}, settings); },

    getCurrentWeekISO: function () { return settings.currentWeekStart; },
    getVisibleWeekISOs: visibleWeeks,
    getVisibleDates: visibleDates,

    getWeekData: function (iso) {
      if (iso === settings.currentWeekStart) return JSON.parse(JSON.stringify(weekData));
      return loadWeekData(iso);
    },

    getAllLocalWeeks: function () {
      var result = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(WEEK_KEY_PREFIX) === 0) {
          var iso = key.slice(WEEK_KEY_PREFIX.length);
          result[iso] = loadWeekData(iso);
        }
      }
      return result;
    },

    hasLocalData: function () {
      var weeks = this.getAllLocalWeeks();
      for (var iso in weeks) {
        if (weeks[iso].events.length || weeks[iso].todos.length) return true;
      }
      var d = defaultSettings();
      return Object.keys(d).some(function (k) {
        return k !== "currentWeekStart" && settings[k] !== d[k];
      });
    },

    // Firestoreから届いた設定を画面に反映する（ローカルへの書き戻しはするが、
    // 再度クラウドへ書き込む無限ループは起こさない）
    applyRemoteSettings: function (remote) {
      if (!remote || typeof remote !== "object") return;
      suppressCloudNotify = true;
      settings = Object.assign({}, settings, remote);
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
      suppressCloudNotify = false;
      renderAll();
    },

    // Firestoreから届いた週データを画面（表示中の週の場合）とローカルキャッシュに反映する
    applyRemoteWeek: function (iso, remote) {
      if (!remote) return;
      var normalized = {
        events: Array.isArray(remote.events) ? remote.events : [],
        todos: Array.isArray(remote.todos) ? remote.todos : []
      };
      try { localStorage.setItem(weekKey(iso), JSON.stringify(normalized)); } catch (e) {}
      if (iso === settings.currentWeekStart) weekData = normalized;
      if (visibleWeeks().indexOf(iso) >= 0) {
        renderEventList();
        renderTodoList();
        renderPrintArea();
        requestAnimationFrame(scalePreview);
      }
    }
  };

  /* ---------------------------------------------------------
     初期描画
     --------------------------------------------------------- */

  renderAll();

})();
