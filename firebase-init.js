/* =========================================================
   firebase-init.js
   ---------------------------------------------------------
   Firebase App / Authentication / Firestore の初期化のみを行う。
   ここでの初期化に失敗しても（未設定・オフラインなど）、
   例外を外に投げず isConfigured=false として扱うことで、
   アプリ本体（app.js）の動作には一切影響を与えない。
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { firebaseConfig, isPlaceholderConfig } from "./firebase-config.js";

export var isConfigured = false;
export var app = null;
export var auth = null;
export var db = null;

if (!isPlaceholderConfig(firebaseConfig)) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    // 端末がオフラインでも直前までのデータが見えるよう、IndexedDBキャッシュを使う。
    // すでに初期化済み等で失敗した場合はメモリキャッシュにフォールバックする。
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
      });
    } catch (cacheErr) {
      console.warn("PaperWeek: オフラインキャッシュを有効化できなかったため、標準設定でFirestoreを初期化します。", cacheErr);
      db = initializeFirestore(app, {});
    }

    isConfigured = true;
  } catch (e) {
    console.warn("PaperWeek: Firebaseの初期化に失敗しました。ログイン機能は無効のまま、ローカル保存のみで動作します。", e);
    isConfigured = false;
    app = null; auth = null; db = null;
  }
} else {
  console.info("PaperWeek: firebase-config.js が未設定のため、ログイン機能は無効です（localStorageのみで動作します）。");
}
