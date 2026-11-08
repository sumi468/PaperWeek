(function () {
  "use strict";
  var importer = window.PaperWeekImport;
  var pw = window.PaperWeek;
  function el(id) { return document.getElementById(id); }
  var file = el("importFile"), dialog = el("importDialog"), confirm = el("importConfirmBtn"), close = el("importCloseBtn");
  var destination = el("importDestination");
  var parsed = null, busy = false, previewAccount = null, loadedText = "";
  function account() {
    return window.PaperWeekCloud ? window.PaperWeekCloud.getImportAccount() : null;
  }
  function accountNote() {
    el("importAccount").textContent = destination.value === "device" ? "このブラウザに保存します。クラウドには同期しません。" :
      (previewAccount ? previewAccount.email + " に保存し、同じアカウントの端末にも同期します。" : "ログインと予定の読み込みが必要です。キャンセルしてログインしてから、ファイルを選び直してください。");
  }
  destination.addEventListener("change", accountNote);

  function download(text, name) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function preview(text) {
    parsed = importer.parse(text);
    loadedText = text;
    previewAccount = account();
    destination.value = "account";
    destination.querySelector('[value="device"]').disabled = !!previewAccount;
    accountNote();
    var events = parsed.events;
    el("importSummary").textContent = events.length + "件 ／ " + events[0].date + " 〜 " + events[events.length - 1].date + " ／ タイムゾーン：" + parsed.timeZone;
    el("importPreview").replaceChildren();
    events.forEach(function (event) {
      var item = document.createElement("li");
      item.textContent = event.date + " " + event.start + "〜" + event.end + "　" + event.title + (event.memo ? " ／ " + event.memo : "");
      el("importPreview").appendChild(item);
    });
    confirm.hidden = false;
    destination.disabled = false;
    el("importDialogStatus").textContent = "ダウンロードだけでも利用できます。反映する場合は「追加して保存」を押してください。";
    close.textContent = "キャンセル";
    el("importStatus").textContent = "内容を確認してください。まだ保存していません。";
    document.querySelector('[data-tab="events"]').click();
    if (!dialog.open) dialog.showModal();
  }

  el("importDownloadBtn").addEventListener("click", function () {
    if (!loadedText || busy) return;
    var data = importer.parse(loadedText);
    download(loadedText, "paperweek-" + data.events[0].date + ".json");
  });

  file.addEventListener("change", async function () {
    var selected = file.files[0];
    if (!selected) return;
    el("importStatus").textContent = "読み込んでいます…";
    try {
      if (selected.size > importer.MAX_BYTES) throw new Error("ファイルは1MB以下にしてください。");
      preview(await selected.text());
    } catch (err) {
      parsed = null;
      el("importStatus").textContent = err.message;
    } finally { file.value = ""; }
  });

  dialog.addEventListener("cancel", function (event) { if (busy) event.preventDefault(); });
  close.addEventListener("click", function () { if (!busy) dialog.close(); });
  confirm.addEventListener("click", async function () {
    if (busy || !parsed) return;
    busy = true;
    confirm.disabled = close.disabled = destination.disabled = true;
    el("importDialogStatus").textContent = "保存しています…この画面を閉じずにお待ちください。";
    try {
      var current = account(), result;
      if ((previewAccount && (!current || current.uid !== previewAccount.uid)) || (!previewAccount && current)) {
        previewAccount = current;
        destination.querySelector('[value="device"]').disabled = !!current;
        if (current) destination.value = "account";
        accountNote();
        throw new Error("ログイン状態が変わりました。表示された保存先を確認して、もう一度「追加して保存」を押してください。");
      }
      if (destination.value === "account") {
        if (!current || !window.PaperWeekCloud) throw new Error("ログインと予定の読み込みが完了してからお試しください。");
        result = await window.PaperWeekCloud.importEvents(parsed.events);
      } else {
        if (current) throw new Error("端末のみに取り込む場合はログアウトしてください。");
        result = pw.importLocalEvents(parsed.events);
      }
      var message = result.added + "件を" + (destination.value === "account" ? "アカウント" : "この端末") + "に保存しました。重複" + result.skipped + "件をスキップしました。";
      el("importDialogStatus").textContent = el("importStatus").textContent = message;
      confirm.hidden = true;
      close.textContent = "閉じる";
      pw.showImportedWeek(window.PaperWeekDates.week(parsed.events[0].date));
      parsed = null;
    } catch (err) {
      el("importDialogStatus").textContent = "取り込みを完了できませんでした。" + (err.code ? "通信状態とログイン状態を確認して、もう一度お試しください。" : err.message);
    } finally {
      busy = false;
      confirm.disabled = close.disabled = destination.disabled = false;
      close.focus();
    }
  });

  el("importExampleBtn").addEventListener("click", function () {
    var example = { format: "paperweek-events", version: 1, timeZone: "Asia/Tokyo", events: [
      { date: window.PaperWeek.getVisibleDates()[0], title: "サンプルの予定", start: "09:00", end: "10:00", category: "other", memo: "この内容を編集して取り込めます。" }
    ] };
    download(JSON.stringify(example, null, 2), "paperweek-example.json");
  });

  async function openLink() {
    if (!location.hash.startsWith("#paperweek=")) return;
    // Do not replace an active preview or an in-progress save with another link.
    if (busy || dialog.open) return;
    var value = location.hash.slice("#paperweek=".length);
    history.replaceState(null, "", location.pathname + location.search);
    try { preview(await importer.decodeLink(value)); }
    catch (err) {
      document.querySelector('[data-tab="events"]').click();
      el("importStatus").textContent = err.message;
    }
  }
  window.addEventListener("hashchange", openLink);
  openLink();
})();
