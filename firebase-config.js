/* =========================================================
   firebase-config.js
   ---------------------------------------------------------
   Firebase Consoleで作成したWebアプリの設定値をここに貼り付けてください。
   （Firebaseコンソール → プロジェクトの設定 → 全般 → マイアプリ → SDK設定と構成）

   ご注意：
   この設定オブジェクト（特にapiKey）は「秘密鍵」ではありません。
   ブラウザから見える形で公開されることを前提とした識別子であり、
   実際のアクセス制御はこのファイルではなく、Firestore Security Rules
   （firestore.rules）によって行われます。そのため、このファイルを
   そのままリポジトリにコミットして問題ありません。

   まだFirebaseプロジェクトを作成していない場合、このファイルは
   プレースホルダのままで構いません。その場合、ログイン・クラウド
   保存機能は無効化された状態でアプリが起動し、
   これまで通りlocalStorageだけで動作します。
   ========================================================= */

export const firebaseConfig = {
  apiKey: "AIzaSyAmJz69XuTDIHV1FPyiHP5MOQt07m2Cid4",
  authDomain: "paper-week.firebaseapp.com",
  projectId: "paper-week",
  storageBucket: "paper-week.firebasestorage.app",
  messagingSenderId: "1075657636782",
  appId: "1:1075657636782:web:99199ed0a081265d84663f"
};

// プレースホルダのままかどうかを判定するための簡易チェック。
// firebase-init.js がこれを見て、Firebase機能を有効化するかどうかを決める。
export function isPlaceholderConfig(config) {
  return !config || !config.apiKey || String(config.apiKey).indexOf("YOUR_") === 0;
}
