/* Calendar dates stay local; persisted events remain in their original Monday buckets. */
(function (root) {
  "use strict";
  function iso(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function parse(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var p = value.split("-").map(Number);
    var date = new Date(0);
    date.setFullYear(p[0], p[1] - 1, p[2]);
    date.setHours(12, 0, 0, 0);
    return p[0] >= 1000 && p[0] <= 9998 && iso(date) === value ? date : null;
  }
  function add(value, count) {
    var date = parse(value);
    date.setDate(date.getDate() + count);
    return iso(date);
  }
  function day(value) { return (parse(value).getDay() + 6) % 7; }
  function week(value) { return add(value, -day(value)); }
  function normalize(view, fallback) {
    view = view || {};
    var start = parse(view.start) ? view.start : (parse(fallback) ? fallback : iso(new Date()));
    if (start > "9998-12-25") start = "9998-12-25";
    var dates = Array.isArray(view.dates) ? Array.from(new Set(view.dates.filter(parse))).sort().slice(0, 7) : [];
    return {
      mode: view.mode === "custom" ? "custom" : "range",
      start: start,
      count: Number.isInteger(view.count) && view.count >= 1 && view.count <= 7 ? view.count : 7,
      dates: dates.length ? dates : [start]
    };
  }
  function visible(view) {
    return view.mode === "custom" ? view.dates.slice() : Array.from({ length: view.count }, function (_, i) { return add(view.start, i); });
  }
  var api = { iso: iso, parse: parse, add: add, day: day, week: week, normalize: normalize, visible: visible };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PaperWeekDates = api;
})(typeof window !== "undefined" ? window : globalThis);
