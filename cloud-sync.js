/* =========================================================
   cloud-sync.js
   ---------------------------------------------------------
   Firebase Authentication と Cloud Firestore を使って、
   app.js（ローカル状態・localStorage）と同期するモジュール。

   設計方針：
   - app.js は一切書き換えず（このファイルから window.PaperWeek の
     公開APIだけを呼び出す）、既存のlocalStorage動作を壊さない。
   - Firebase未設定・オフライン・エラー時は、例外を握りつぶして
     ローカル動作を継続する（アプリ全体を止めない）。
   - 予定・TODOは「週ごとに1つのドキュメント」に丸ごと保存する
     現在のデータ構造を踏襲している。そのため複数端末で同時に
     同じ週を編集した場合は「後から保存した方が勝つ」点に注意
     （詳細は最終報告を参照）。
   ========================================================= */

import { auth, db, isConfigured } from "./firebase-init.js";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  linkWithPopup,
  fetchSignInMethodsForEmail,
  reauthenticateWithCredential,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ui-auth.js が使えない状況でも落ちないよう、フォールバックを用意する
var ui = window.PaperWeekAuthUI || {
  enableCloudUI: function () {},
  showLoggedIn: function () {},
  showLoggedOut: function () {},
  showLoading: function () {},
  showToast: function (m) { console.log(m); },
  showSyncBanner: function (m) { console.warn(m); },
  hideSyncBanner: function () {},
  askMigration: function () { return Promise.resolve("no"); },
  closeAuthModal: function () {}
};

// app.js（既存の週間予定表アプリ本体）が公開しているブリッジAPI
var pw = window.PaperWeek;

var SYNCABLE_SETTINGS_KEYS = ["orientation", "template", "handwrite", "timeStart", "timeEnd"];

function pickSyncableSettings(settingsObj) {
  var picked = {};
  SYNCABLE_SETTINGS_KEYS.forEach(function (key) {
    if (settingsObj && Object.prototype.hasOwnProperty.call(settingsObj, key)) {
      picked[key] = settingsObj[key];
    }
  });
  return picked;
}

function userDocRef(uid) { return doc(db, "users", uid); }
function weekDocRef(uid, iso) { return doc(db, "users", uid, "weeks", iso); }
function weeksCollectionRef(uid) { return collection(db, "users", uid, "weeks"); }

function getProviderIds(user) {
  return (user && user.providerData || []).map(function (p) { return p.providerId; });
}

function providerLabelJa(id) {
  if (id === "password") return "メールアドレス";
  if (id === "google.com") return "Google";
  if (id === "apple.com") return "Apple";
  return id;
}

var currentUser = null;
var unsubSettings = null;
var unsubWeek = null;
var settingsLoadedOnce = false;
var weekLoadedOnce = false;

function maybeHideLoading() {
  if (settingsLoadedOnce && weekLoadedOnce) ui.showLoading(false);
}

/* ---------------------------------------------------------
   Firestoreへの書き込み（debounce付き）
   --------------------------------------------------------- */

var settingsSaveTimer = null;
function debouncedSaveSettings(settingsSnapshot) {
  if (!currentUser) return;
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(function () {
    var uid = currentUser.uid;
    var payload = pickSyncableSettings(settingsSnapshot);
    payload.updatedAt = serverTimestamp();
    payload.email = currentUser.email;
    setDoc(userDocRef(uid), payload, { merge: true }).catch(function (err) {
      console.error("PaperWeek: 設定の保存に失敗", err);
      ui.showToast("保存できませんでした。通信状態を確認してください。");
    });
  }, 600);
}

var weekSaveTimers = {};
function debouncedSaveWeek(iso, weekPayload) {
  if (!currentUser) return;
  clearTimeout(weekSaveTimers[iso]);
  weekSaveTimers[iso] = setTimeout(function () {
    var uid = currentUser.uid;
    setDoc(weekDocRef(uid, iso), {
      events: weekPayload.events,
      todos: weekPayload.todos,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(function (err) {
      console.error("PaperWeek: 予定の保存に失敗", err);
      ui.showToast("保存できませんでした。通信状態を確認してください。");
    });
  }, 600);
}

/* ---------------------------------------------------------
   Firestoreからの購読（リアルタイム同期）
   --------------------------------------------------------- */

function subscribeSettings(uid) {
  if (unsubSettings) unsubSettings();
  settingsLoadedOnce = false;
  var firstCallback = true;

  unsubSettings = onSnapshot(userDocRef(uid), function (snap) {
    if (snap.exists()) {
      pw.applyRemoteSettings(pickSyncableSettings(snap.data()));
    }
    if (firstCallback) {
      firstCallback = false;
      settingsLoadedOnce = true;
      maybeHideLoading();
    }
    ui.hideSyncBanner();
  }, function (err) {
    console.error("PaperWeek: 設定の同期エラー", err);
    ui.showSyncBanner("設定の同期でエラーが発生しました。通信状態を確認してください。");
    settingsLoadedOnce = true;
    maybeHideLoading();
  });
}

function subscribeWeek(uid, iso) {
  if (unsubWeek) unsubWeek();
  weekLoadedOnce = false;
  var firstCallback = true;

  unsubWeek = onSnapshot(weekDocRef(uid, iso), function (snap) {
    if (snap.exists()) {
      pw.applyRemoteWeek(iso, snap.data());
    }
    if (firstCallback) {
      firstCallback = false;
      weekLoadedOnce = true;
      maybeHideLoading();
    }
    ui.hideSyncBanner();
  }, function (err) {
    console.error("PaperWeek: 予定の同期エラー", err);
    ui.showSyncBanner("予定の同期でエラーが発生しました。通信状態を確認してください。");
    weekLoadedOnce = true;
    maybeHideLoading();
  });
}

/* ---------------------------------------------------------
   初回ログイン時のデータ移行
   --------------------------------------------------------- */

function migrationFlagKey(uid) { return "pw_migrated_" + uid; }

function migrateLocalToCloud(uid) {
  var settingsSnapshot = pw.getSettings();
  var weeks = pw.getAllLocalWeeks();
  var writes = [];

  var settingsPayload = pickSyncableSettings(settingsSnapshot);
  settingsPayload.updatedAt = serverTimestamp();
  settingsPayload.email = currentUser.email;
  writes.push(setDoc(userDocRef(uid), settingsPayload, { merge: true }));

  Object.keys(weeks).forEach(function (iso) {
    var w = weeks[iso];
    if (w.events.length || w.todos.length) {
      writes.push(setDoc(weekDocRef(uid, iso), {
        events: w.events,
        todos: w.todos,
        updatedAt: serverTimestamp()
      }, { merge: true }));
    }
  });

  return Promise.all(writes).then(function () {
    ui.showToast("この端末の予定をアカウントに移行しました。");
  }).catch(function (err) {
    console.error("PaperWeek: データ移行に失敗", err);
    ui.showToast("移行中にエラーが発生しました。通信状態を確認してください。");
  });
}

function maybeOfferMigration(uid) {
  if (localStorage.getItem(migrationFlagKey(uid))) return Promise.resolve();

  if (!pw.hasLocalData()) {
    localStorage.setItem(migrationFlagKey(uid), "1");
    return Promise.resolve();
  }

  return ui.askMigration().then(function (choice) {
    if (choice === "yes") {
      localStorage.setItem(migrationFlagKey(uid), "1");
      return migrateLocalToCloud(uid);
    }
    if (choice === "no") {
      localStorage.setItem(migrationFlagKey(uid), "1");
      return;
    }
    // "cancel" の場合はフラグを立てず、次回ログイン時に再度確認する
  });
}

/* ---------------------------------------------------------
   認証状態の監視
   --------------------------------------------------------- */

if (isConfigured) {
  ui.enableCloudUI();

  onAuthStateChanged(auth, function (user) {
    if (user) {
      currentUser = user;
      ui.showLoggedIn(user.email, getProviderIds(user));
      ui.showLoading(true);

      maybeOfferMigration(user.uid).then(function () {
        subscribeSettings(user.uid);
        subscribeWeek(user.uid, pw.getCurrentWeekISO());
      });
    } else {
      currentUser = null;
      ui.showLoggedOut();
      ui.showLoading(false);
      ui.hideSyncBanner();
      if (unsubSettings) { unsubSettings(); unsubSettings = null; }
      if (unsubWeek) { unsubWeek(); unsubWeek = null; }
    }
  });

  // app.js側でのローカル変更（予定・TODO・設定の追加編集削除、週の切り替え）を購読し、
  // ログイン中であればFirestoreへ反映する
  pw.onChange(function (type, payload) {
    if (!currentUser) return;
    if (type === "settings") {
      debouncedSaveSettings(payload);
    } else if (type === "week") {
      debouncedSaveWeek(payload.iso, payload.data);
    } else if (type === "weekSwitched") {
      subscribeWeek(currentUser.uid, payload);
    }
  });
}

/* ---------------------------------------------------------
   アカウント操作
   --------------------------------------------------------- */

function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
function signOutUser() {
  return signOut(auth);
}
function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// GoogleでもAppleでもメールアドレスでも、ログイン後は同じ処理
// （onAuthStateChanged → uid取得 → users/{uid} → Firestore同期）に
// 合流するため、保存先やデータ構造が認証方法によって分かれることはない。

// ---------------------------------------------------------------
// Apple（Sign in with Apple）は、Apple Developer Programへの登録が
// 完了するまでユーザー向けUIから非表示にしている。
// 以下の makeAppleProvider / signInWithApple / linkApple はそのために
// あえて残してあるコードで、削除はしていない。
// 再度有効化する場合の手順:
//   1. index.html の authModalOverlay に「Appleでログイン」ボタンを追加
//      （コメントで残っている箇所を参照）
//   2. ui-auth.js で appleLoginBtn の参照とクリック処理を復活させる
//   3. 下の signInWithApple / linkApple を window.PaperWeekCloud の
//      公開APIに追加する（現在は意図的に外してある）
// Firebase Consoleでの「Apple」プロバイダ有効化やApple Developer側の
// 設定は、これらのコードとは独立して必要になる（README-firebase.md参照）。
// ---------------------------------------------------------------

function makeAppleProvider() {
  var provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return provider;
}

// 別のログイン方法ですでに同じメールアドレスが登録されている場合
// （auth/account-exists-with-different-credential）に、
// 「どの方法で登録済みか」を可能な範囲で調べてエラーに付加する。
// ※ Firestoreの「メール列挙保護」が有効なプロジェクトでは空配列が
//   返ることがあり、その場合は具体的な方法名は案内できない。
function enrichAccountConflictError(error) {
  var email = error && error.customData && error.customData.email;
  if (!email) return Promise.reject(error);
  return fetchSignInMethodsForEmail(auth, email).then(function (methods) {
    if (methods && methods.length) {
      error.friendlyConflict = methods.map(providerLabelJa).join("・");
    }
    return Promise.reject(error);
  }).catch(function () {
    return Promise.reject(error);
  });
}

function wrapOAuthSignIn(promise) {
  return promise.catch(function (error) {
    if (error && error.code === "auth/account-exists-with-different-credential") {
      return enrichAccountConflictError(error);
    }
    return Promise.reject(error);
  });
}

function signInWithGoogle() {
  return wrapOAuthSignIn(signInWithPopup(auth, new GoogleAuthProvider()));
}
// 現在は window.PaperWeekCloud に公開していないため、UIからは呼び出されない。
function signInWithApple() {
  return wrapOAuthSignIn(signInWithPopup(auth, makeAppleProvider()));
}

// すでにログイン中のアカウントに、追加でGoogleを連携する
// （安全なアカウント統合の方法。ログイン時の自動マージは行わない）
function linkGoogle() {
  var user = auth.currentUser;
  if (!user) return Promise.reject({ code: "auth/no-current-user" });
  return linkWithPopup(user, new GoogleAuthProvider()).then(function (result) {
    return getProviderIds(result.user);
  });
}
// 現在は window.PaperWeekCloud に公開していないため、UIからは呼び出されない。
function linkApple() {
  var user = auth.currentUser;
  if (!user) return Promise.reject({ code: "auth/no-current-user" });
  return linkWithPopup(user, makeAppleProvider()).then(function (result) {
    return getProviderIds(result.user);
  });
}

function deleteAllCloudDataFor(uid) {
  return getDocs(weeksCollectionRef(uid)).then(function (snap) {
    var deletions = [];
    snap.forEach(function (docSnap) { deletions.push(deleteDoc(docSnap.ref)); });
    deletions.push(deleteDoc(userDocRef(uid)));
    return Promise.all(deletions);
  });
}

function deleteAccount() {
  var user = auth.currentUser;
  if (!user) return Promise.reject({ code: "auth/no-current-user" });
  var uid = user.uid;
  return deleteAllCloudDataFor(uid).then(function () {
    return deleteUser(user);
  });
}

function reauthenticateAndDeleteAccount(password) {
  var user = auth.currentUser;
  if (!user) return Promise.reject({ code: "auth/no-current-user" });
  var credential = EmailAuthProvider.credential(user.email, password);
  return reauthenticateWithCredential(user, credential).then(function () {
    return deleteAccount();
  });
}

window.PaperWeekCloud = {
  isConfigured: function () { return isConfigured; },
  signUp: signUp,
  signIn: signIn,
  signInWithGoogle: signInWithGoogle,
  // signInWithApple: 現時点では非公開（Apple Developer Program未登録のため）。
  // 再有効化する際はこの行のコメントを外すだけでよい。
  linkGoogle: linkGoogle,
  // linkApple: 同上の理由で非公開。
  signOutUser: signOutUser,
  resetPassword: resetPassword,
  deleteAccount: deleteAccount,
  reauthenticateAndDeleteAccount: reauthenticateAndDeleteAccount
};
