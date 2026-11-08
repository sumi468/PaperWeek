/* PaperWeek JSON interchange: dates and times are wall times in timeZone. */
(function (root) {
  "use strict";
  var dates = typeof module !== "undefined" && module.exports ? require("./dates.js") : root.PaperWeekDates;
  var categories = ["school", "study", "club", "work", "family", "private", "other"];
  var MAX_BYTES = 1024 * 1024;

  function parse(text) {
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("ファイルは1MB以下にしてください。");
    var data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); }
    catch (e) { throw new Error("JSONファイルを読み込めません。形式を確認してください。"); }
    if (!data || data.format !== "paperweek-events" || data.version !== 1 ||
        !Array.isArray(data.events) || !data.events.length || data.events.length > 500) {
      throw new Error("PaperWeek予定ファイル（version: 1、予定1〜500件）を選んでください。");
    }
    try {
      if (typeof data.timeZone !== "string") throw new Error();
      new Intl.DateTimeFormat("ja-JP", { timeZone: data.timeZone }).format();
    } catch (e) { throw new Error("有効なtimeZone（例：Asia/Tokyo）を指定してください。"); }
    var events = data.events.map(function (event, index) {
      function invalid(message) { throw new Error((index + 1) + "件目：" + message); }
      if (!event || typeof event !== "object") invalid("予定の形式が正しくありません。");
      if (!dates.parse(event.date) || event.date < "1000-01-07" || event.date > "9998-12-25") invalid("日付が正しくありません。");
      if (typeof event.title !== "string" || !event.title.trim() || event.title.length > 300) invalid("予定名は1〜300文字にしてください。");
      if (typeof event.start !== "string" || typeof event.end !== "string" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.end) || event.end <= event.start) {
        invalid("時刻はHH:mm形式で、終了を開始より後にしてください（日をまたぐ予定は日別に分けてください）。");
      }
      if (event.memo != null && (typeof event.memo !== "string" || event.memo.length > 5000)) invalid("メモは5000文字以下にしてください。");
      if (event.sourceId != null && (typeof event.sourceId !== "string" || !event.sourceId.trim() || event.sourceId.length > 500)) invalid("sourceIdが正しくありません。");
      if (event.category != null && categories.indexOf(event.category) < 0) invalid("カテゴリが正しくありません。");
      return {
        date: event.date, title: event.title.trim(), start: event.start, end: event.end,
        memo: event.memo || "", category: event.category || "other", sourceId: event.sourceId || ""
      };
    }).sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
    if (weekISOs(events).length > 52) throw new Error("1回に取り込める予定は52週分までです。");
    return { timeZone: data.timeZone, events: events };
  }

  function weekISOs(events) {
    return Array.from(new Set(events.map(function (event) { return dates.week(event.date); }))).sort();
  }

  // Add only. Preserve existing events, unknown fields, and TODOs, including on re-import.
  function merge(events, existing, newId) {
    var result = { weeks: {}, added: 0, skipped: 0 };
    events.forEach(function (event) {
      var iso = dates.week(event.date);
      var week = result.weeks[iso] || existing[iso] || { events: [], todos: [] };
      var day = dates.day(event.date);
      var duplicate = week.events.some(function (old) {
        return (event.sourceId && old.importedSourceId === event.sourceId) ||
          (old.day === day && String(old.title).trim() === event.title && old.start === event.start && old.end === event.end);
      });
      if (duplicate) { result.skipped++; return; }
      if (!result.weeks[iso]) week = result.weeks[iso] = Object.assign({}, week, { events: week.events.slice() });
      var id;
      do { id = newId(); } while (week.events.some(function (old) { return old.id === id; }));
      var added = { id: id, day: day, title: event.title, start: event.start, end: event.end, category: event.category, memo: event.memo };
      if (event.sourceId) added.importedSourceId = event.sourceId;
      week.events.push(added);
      result.added++;
    });
    return result;
  }

  var api = { parse: parse, merge: merge, weekISOs: weekISOs, MAX_BYTES: MAX_BYTES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PaperWeekImport = api;
})(typeof window !== "undefined" ? window : globalThis);
