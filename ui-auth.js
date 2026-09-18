/* =========================================================
   ui-auth.js
   ---------------------------------------------------------
   ログイン関連のモーダル・ヘッダー表示の見た目とDOM操作のみを担当する。
   実際のFirebase処理は行わず、window.PaperWeekCloud（cloud-sync.jsが
   用意する）が存在する場合にのみそれを呼び出す。
   cloud-sync.js が読み込まれない／初期化されない環境でも、
   このファイルはエラーを出さずに何もしない。
   ========================================================= */

(function () {
  "use strict";

  var el = {
    body: document.body,

    topbarAuth: document.getElementById("topbarAuth"),
    authStateOut: document.getElementById("authStateOut"),
    authStateIn: document.getElementById("authStateIn"),
    authEmailLabel: document.getElementById("authEmailLabel"),
    openLoginBtn: document.getElementById("openLoginBtn"),
    openAccountBtn: document.getElementById("openAccountBtn"),
    logoutBtn: document.getElementById("logoutBtn"),

    authModalOverlay: document.getElementById("authModalOverlay"),
    authModalClose: document.getElementById("authModalClose"),
    authModalTabs: document.getElementById("authModalTabs"),
    authError: document.getElementById("authError"),
    authSuccess: document.getElementById("authSuccess"),
    authUnavailableNote: document.getElementById("authUnavailableNote"),
    googleLoginBtn: document.getElementById("googleLoginBtn"),

    migrationModalOverlay: document.getElementById("migrationModalOverlay"),
    migrateYesBtn: document.getElementById("migrateYesBtn"),
    migrateNoBtn: document.getElementById("migrateNoBtn"),
    migrateCancelBtn: document.getElementById("migrateCancelBtn"),

    accountModalOverlay: document.getElementById("accountModalOverlay"),
    accountModalClose: document.getElementById("accountModalClose"),
    accountEmailLabel: document.getElementById("accountEmailLabel"),
    linkedProvidersList: document.getElementById("linkedProvidersList"),
    linkProviderActions: document.getElementById("linkProviderActions"),
    accountLogoutBtn: document.getElementById("accountLogoutBtn"),
    accountLogoutStatus: document.getElementById("accountLogoutStatus"),
    deleteAccountBtn: document.getElementById("deleteAccountBtn"),

    loadingOverlay: document.getElementById("loadingOverlay"),
    toast: document.getElementById("toast"),
    syncBanner: document.getElementById("syncBanner"),
    saveStatus: document.getElementById("saveStatus")
  };

  if (!el.topbarAuth) return; // 必要な要素が無ければ何もしない（安全側に倒す）

  /* ---------------------------------------------------------
     モーダルの開閉（アニメーション対応）
     --------------------------------------------------------- */

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  var MODAL_CLOSE_ANIM_MS = 150;

  function openModal(overlay) {
    overlay.hidden = false;
  }

  // 「閉じる」演出の間だけ is-closing クラスでフェードアウトさせ、
  // 演出の有無にかかわらず必ず最終的にhidden=trueになるようにする
  // （アニメーションが再生されない環境でも操作不能にならないための保険）。
  function closeModal(overlay) {
    if (overlay.hidden) return;
    if (prefersReducedMotion()) {
      overlay.hidden = true;
      return;
    }
    overlay.classList.add("is-closing");
    setTimeout(function () {
      overlay.hidden = true;
      overlay.classList.remove("is-closing");
    }, MODAL_CLOSE_ANIM_MS);
  }

  /* ---------------------------------------------------------
     モーダルの開閉・タブ切り替え
     --------------------------------------------------------- */

  function clearAuthMessages() {
    el.authError.hidden = true;
    el.authError.textContent = "";
    el.authSuccess.hidden = true;
    el.authSuccess.textContent = "";
  }

  function openAuthModal(defaultTab) {
    clearAuthMessages();
    openModal(el.authModalOverlay);
    if (defaultTab) setAuthTab(defaultTab);

    var cloudReady = !!(window.PaperWeekCloud && window.PaperWeekCloud.isConfigured());
    el.authUnavailableNote.hidden = cloudReady;
    Array.prototype.forEach.call(el.authModalOverlay.querySelectorAll(".modal-submit"), function (btn) {
      btn.disabled = !cloudReady;
    });
  }

  function closeAuthModal() {
    closeModal(el.authModalOverlay);
  }

  function setAuthTab(tab) {
    Array.prototype.forEach.call(el.authModalTabs.querySelectorAll(".modal-tab-btn"), function (btn) {
      btn.classList.toggle("is-active", btn.dataset.authtab === tab);
    });
    Array.prototype.forEach.call(el.authModalOverlay.querySelectorAll(".modal-form"), function (form) {
      form.classList.toggle("is-active", form.dataset.authform === tab);
    });
    clearAuthMessages();
  }

  el.openLoginBtn.addEventListener("click", function () { openAuthModal("login"); });
  el.authModalClose.addEventListener("click", closeAuthModal);
  el.authModalOverlay.addEventListener("click", function (e) {
    if (e.target === el.authModalOverlay) closeAuthModal();
  });
  el.authModalTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".modal-tab-btn");
    if (btn) setAuthTab(btn.dataset.authtab);
  });

  function showAuthError(message) {
    el.authSuccess.hidden = true;
    el.authError.textContent = message;
    el.authError.hidden = false;
  }

  function showAuthSuccess(message) {
    el.authError.hidden = true;
    el.authSuccess.textContent = message;
    el.authSuccess.hidden = false;
  }

  function translateAuthErrorCode(code) {
    var map = {
      "auth/invalid-email": "メールアドレスの形式が正しくありません。",
      "auth/user-disabled": "このアカウントは無効化されています。",
      "auth/user-not-found": "アカウントが見つかりません。メールアドレスをご確認ください。",
      "auth/wrong-password": "パスワードが正しくありません。",
      "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません。",
      "auth/email-already-in-use": "このメールアドレスはすでに登録されています。",
      "auth/weak-password": "パスワードは6文字以上で設定してください。",
      "auth/too-many-requests": "試行回数が多すぎます。しばらくしてから再度お試しください。",
      "auth/network-request-failed": "通信エラーが発生しました。ネットワーク接続をご確認ください。",
      "auth/requires-recent-login": "セキュリティのため、再度ログインしてからお試しください。",
      "auth/popup-closed-by-user": "ログインがキャンセルされました。",
      "auth/cancelled-popup-request": "ログイン処理がすでに進行中です。もう一度お試しください。",
      "auth/popup-blocked": "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。",
      "auth/operation-not-allowed": "この認証方法はまだ有効になっていません。しばらくしてから再度お試しください。",
      "auth/unauthorized-domain": "このサイトのドメインではログインが許可されていません。管理者にお問い合わせください。",
      "auth/credential-already-in-use": "この認証情報はすでに別のアカウントで使用されています。",
      "auth/provider-already-linked": "この方法はすでにこのアカウントに連携されています。",
      "auth/account-exists-with-different-credential": "このメールアドレスは別の方法ですでに登録されています。そちらの方法でログインしてください。",
      "auth/configuration-not-found": "Firebase側の認証設定が未完了です。管理者にお問い合わせください。"
    };
    return map[code] || "エラーが発生しました。しばらくしてから再度お試しください。";
  }

  // エラーオブジェクトからユーザー向けメッセージを組み立てる。
  // account-exists-with-different-credential の場合、cloud-sync.js が
  // err.friendlyConflict に既存のログイン方法名を詰めていれば、それを使って
  // より具体的な案内を表示する。
  function buildAuthErrorMessage(err) {
    if (!err) return translateAuthErrorCode(null);
    if (err.code === "auth/account-exists-with-different-credential" && err.friendlyConflict) {
      return "このメールアドレスはすでに" + err.friendlyConflict + "で登録されています。まずそちらでログインしたうえで、アカウント画面から連携してください。";
    }
    return translateAuthErrorCode(err.code);
  }

  /* ---------------------------------------------------------
     ログイン／新規登録／リセット フォーム送信
     --------------------------------------------------------- */

  function requireCloud() {
    if (window.PaperWeekCloud && window.PaperWeekCloud.isConfigured()) return true;
    showAuthError("この環境ではまだログイン機能が設定されていません。");
    return false;
  }

  Array.prototype.forEach.call(el.authModalOverlay.querySelectorAll(".modal-form"), function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!requireCloud()) return;
      clearAuthMessages();

      var kind = form.dataset.authform;
      var email = form.querySelector('[name="email"]').value.trim();
      var passwordInput = form.querySelector('[name="password"]');
      var password = passwordInput ? passwordInput.value : "";
      var submitBtn = form.querySelector(".modal-submit");
      submitBtn.disabled = true;

      var done = function () { submitBtn.disabled = false; };

      if (kind === "login") {
        window.PaperWeekCloud.signIn(email, password).then(function () {
          closeAuthModal();
          form.reset();
        }).catch(function (err) {
          showAuthError(buildAuthErrorMessage(err));
        }).finally(done);
      } else if (kind === "signup") {
        window.PaperWeekCloud.signUp(email, password).then(function () {
          closeAuthModal();
          form.reset();
        }).catch(function (err) {
          showAuthError(buildAuthErrorMessage(err));
        }).finally(done);
      } else if (kind === "reset") {
        window.PaperWeekCloud.resetPassword(email).then(function () {
          showAuthSuccess("パスワード再設定用のメールを送信しました。メールボックスをご確認ください。");
        }).catch(function (err) {
          showAuthError(buildAuthErrorMessage(err));
        }).finally(done);
      }
    });
  });

  /* ---------------------------------------------------------
     Google ログイン
     ---------------------------------------------------------
     Appleログインは、Apple Developer Program登録が完了するまで
     ユーザーには提供しない。DOMに appleLoginBtn が存在しないため
     以下は現状Googleのみを配線するが、cloud-sync.js側の
     signInWithApple / linkApple 自体は削除していないので、
     将来Appleボタンを復活させれば同じ仕組みで再度使える。
     --------------------------------------------------------- */

  function handleOAuthClick(btn, signInFn) {
    if (!requireCloud()) return;
    clearAuthMessages();
    btn.disabled = true;
    signInFn().then(function () {
      closeAuthModal();
    }).catch(function (err) {
      // ユーザーによるキャンセルは静かに扱い、エラー扱いしない
      if (err && (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request")) {
        return;
      }
      showAuthError(buildAuthErrorMessage(err));
    }).finally(function () {
      btn.disabled = false;
    });
  }

  if (el.googleLoginBtn) {
    el.googleLoginBtn.addEventListener("click", function () {
      handleOAuthClick(el.googleLoginBtn, function () { return window.PaperWeekCloud.signInWithGoogle(); });
    });
  }

  /* ---------------------------------------------------------
     ヘッダーの表示切り替え
     --------------------------------------------------------- */

  function showLoggedOut() {
    el.authStateOut.hidden = false;
    el.authStateIn.hidden = true;
    el.authEmailLabel.textContent = "";
  }

  function providerLabel(id) {
    if (id === "password") return "メールアドレス";
    if (id === "google.com") return "Google";
    if (id === "apple.com") return "Apple";
    return id;
  }

  function renderLinkedProviders(providerIds) {
    providerIds = providerIds || [];
    el.linkedProvidersList.innerHTML = providerIds.map(function (id) {
      return '<span class="provider-tag is-linked">' + providerLabel(id) + "</span>";
    }).join("") || '<span class="provider-tag">情報を取得できませんでした</span>';

    // Appleの連携ボタンは現時点では表示しない（Apple Developer Program未登録のため）。
    // 将来再開する場合は、providerIds.indexOf("apple.com") === -1 の場合に
    // 「Appleを連携する」ボタンをここへ追加してください。
    var actionsHtml = "";
    if (providerIds.indexOf("google.com") === -1) {
      actionsHtml += '<button type="button" class="ghost-btn js-link-provider" data-provider="google">Googleを連携する</button>';
    }
    el.linkProviderActions.innerHTML = actionsHtml;
  }

  function showLoggedIn(email, providerIds) {
    el.authStateOut.hidden = true;
    el.authStateIn.hidden = false;
    el.authEmailLabel.textContent = email || "";
    el.accountEmailLabel.textContent = email || "";
    renderLinkedProviders(providerIds);
  }

  el.linkProviderActions.addEventListener("click", function (e) {
    var btn = e.target.closest(".js-link-provider");
    if (!btn || !window.PaperWeekCloud) return;
    var kind = btn.dataset.provider;
    if (kind !== "google") return; // 現時点ではGoogleの連携のみ提供
    btn.disabled = true;
    window.PaperWeekCloud.linkGoogle().then(function (providerIds) {
      renderLinkedProviders(providerIds);
      showToast("Googleを連携しました。");
    }).catch(function (err) {
      showToast(buildAuthErrorMessage(err));
    }).finally(function () {
      btn.disabled = false;
    });
  });

  var isLoggingOut = false;

  function performLogout() {
    if (!window.PaperWeekCloud || isLoggingOut) return;
    isLoggingOut = true;
    el.logoutBtn.disabled = true;
    if (el.accountLogoutBtn) el.accountLogoutBtn.disabled = true;
    if (el.accountLogoutStatus) el.accountLogoutStatus.hidden = false;

    window.PaperWeekCloud.signOutUser().then(function () {
      closeModal(el.accountModalOverlay);
    }).catch(function () {
      showToast("ログアウトに失敗しました。通信状態を確認してください。");
    }).finally(function () {
      isLoggingOut = false;
      el.logoutBtn.disabled = false;
      if (el.accountLogoutBtn) el.accountLogoutBtn.disabled = false;
      if (el.accountLogoutStatus) el.accountLogoutStatus.hidden = true;
    });
  }

  el.logoutBtn.addEventListener("click", performLogout);
  if (el.accountLogoutBtn) el.accountLogoutBtn.addEventListener("click", performLogout);

  /* ---------------------------------------------------------
     アカウントモーダル
     --------------------------------------------------------- */

  el.openAccountBtn.addEventListener("click", function () {
    openModal(el.accountModalOverlay);
  });
  el.accountModalClose.addEventListener("click", function () {
    closeModal(el.accountModalOverlay);
  });
  el.accountModalOverlay.addEventListener("click", function (e) {
    if (e.target === el.accountModalOverlay) closeModal(el.accountModalOverlay);
  });

  el.deleteAccountBtn.addEventListener("click", function () {
    if (!window.PaperWeekCloud) return;
    var ok1 = window.confirm("アカウントとクラウド上のすべてのデータを削除します。本当によろしいですか？");
    if (!ok1) return;
    var ok2 = window.confirm("この操作は取り消せません。最終確認：本当にアカウントを削除しますか？");
    if (!ok2) return;

    el.deleteAccountBtn.disabled = true;
    window.PaperWeekCloud.deleteAccount().then(function () {
      closeModal(el.accountModalOverlay);
      showToast("アカウントを削除しました。");
    }).catch(function (err) {
      if (err && err.code === "auth/requires-recent-login") {
        var pw = window.prompt("セキュリティのため、確認用にパスワードを再入力してください。");
        if (pw) {
          window.PaperWeekCloud.reauthenticateAndDeleteAccount(pw).then(function () {
            closeModal(el.accountModalOverlay);
            showToast("アカウントを削除しました。");
          }).catch(function (err2) {
            showToast(translateAuthErrorCode(err2 && err2.code));
          });
        }
      } else {
        showToast("アカウントの削除に失敗しました。通信状態を確認してください。");
      }
    }).finally(function () {
      el.deleteAccountBtn.disabled = false;
    });
  });

  /* ---------------------------------------------------------
     移行確認モーダル（Promiseで結果を返す）
     --------------------------------------------------------- */

  function askMigration() {
    return new Promise(function (resolve) {
      openModal(el.migrationModalOverlay);

      function cleanup(result) {
        closeModal(el.migrationModalOverlay);
        el.migrateYesBtn.removeEventListener("click", onYes);
        el.migrateNoBtn.removeEventListener("click", onNo);
        el.migrateCancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      }
      function onYes() { cleanup("yes"); }
      function onNo() { cleanup("no"); }
      function onCancel() { cleanup("cancel"); }

      el.migrateYesBtn.addEventListener("click", onYes);
      el.migrateNoBtn.addEventListener("click", onNo);
      el.migrateCancelBtn.addEventListener("click", onCancel);
    });
  }

  /* ---------------------------------------------------------
     ローディング・トースト・同期エラー表示
     --------------------------------------------------------- */

  function showLoading(isLoading) {
    el.loadingOverlay.hidden = !isLoading;
  }

  var toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 4000);
  }

  function showSyncBanner(message) {
    el.syncBanner.textContent = message;
    el.syncBanner.hidden = false;
  }
  function hideSyncBanner() {
    el.syncBanner.hidden = true;
  }

  function enableCloudUI() {
    el.body.classList.add("pw-cloud-enabled");
  }

  var saveStatusTimer = null;
  function showSaveStatus(state) {
    if (!el.saveStatus) return;
    clearTimeout(saveStatusTimer);
    if (state === "saving") {
      el.saveStatus.textContent = "保存中…";
      el.saveStatus.className = "save-status no-print is-saving";
      el.saveStatus.hidden = false;
    } else if (state === "saved") {
      el.saveStatus.textContent = "保存済み";
      el.saveStatus.className = "save-status no-print is-saved";
      el.saveStatus.hidden = false;
      saveStatusTimer = setTimeout(function () { el.saveStatus.hidden = true; }, 2000);
    } else if (state === "error") {
      el.saveStatus.textContent = "保存失敗";
      el.saveStatus.className = "save-status no-print is-error";
      el.saveStatus.hidden = false;
      saveStatusTimer = setTimeout(function () { el.saveStatus.hidden = true; }, 4000);
    } else {
      el.saveStatus.hidden = true;
    }
  }

  /* ---------------------------------------------------------
     cloud-sync.js から呼び出される公開API
     --------------------------------------------------------- */

  window.PaperWeekAuthUI = {
    enableCloudUI: enableCloudUI,
    showLoggedIn: showLoggedIn,
    showLoggedOut: showLoggedOut,
    showLoading: showLoading,
    showToast: showToast,
    showSyncBanner: showSyncBanner,
    hideSyncBanner: hideSyncBanner,
    showSaveStatus: showSaveStatus,
    askMigration: askMigration,
    closeAuthModal: closeAuthModal
  };

})();
