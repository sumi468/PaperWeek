/**
 * scripts/generate-firebase-config.js
 * ---------------------------------------------------------
 * 「firebase-config.js を直接書き換える」代わりに、Vercelなどの
 * 環境変数からfirebase-config.jsを自動生成したい場合に使う、
 * 任意（オプション）のビルドスクリプトです。
 *
 * 使い方（Vercelの場合）:
 *   1. Vercelプロジェクトの Settings > Environment Variables に、
 *      以下を設定する:
 *        FIREBASE_API_KEY
 *        FIREBASE_AUTH_DOMAIN
 *        FIREBASE_PROJECT_ID
 *        FIREBASE_STORAGE_BUCKET
 *        FIREBASE_MESSAGING_SENDER_ID
 *        FIREBASE_APP_ID
 *   2. Vercelの Build Command を次のように設定する:
 *        node scripts/generate-firebase-config.js
 *   3. Output Directory はプロジェクトのルート（静的ファイルの場所）のままでOK。
 *
 * このスクリプトを使わない場合は、firebase-config.js を直接編集するだけで
 * 問題ありません（Firebaseの設定値は秘密情報ではないため）。
 */

const fs = require("fs");
const path = require("path");

const config = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
};

const fileContent =
  "// このファイルはビルド時に scripts/generate-firebase-config.js によって自動生成されました。\n" +
  "// 手動編集した内容は次のビルドで上書きされます。\n\n" +
  "export const firebaseConfig = " + JSON.stringify(config, null, 2) + ";\n\n" +
  "export function isPlaceholderConfig(config) {\n" +
  "  return !config || !config.apiKey || String(config.apiKey).indexOf(\"YOUR_\") === 0;\n" +
  "}\n";

fs.writeFileSync(path.join(__dirname, "..", "firebase-config.js"), fileContent, "utf8");
console.log("firebase-config.js を環境変数から生成しました。");
