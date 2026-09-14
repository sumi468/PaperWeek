# PaperWeek — Firebase連携セットアップガイド

このドキュメントは、PaperWeekにログイン機能・クラウド保存機能を追加した際の
セットアップ手順をまとめたものです。

---

## 1. 追加されたファイル

| ファイル | 役割 |
|---|---|
| `firebase-config.js` | Firebaseプロジェクトの設定値（Firebase Console から取得） |
| `firebase-init.js` | Firebase App / Auth / Firestore の初期化（モジュール） |
| `cloud-sync.js` | ログイン処理（メール／Google。Apple用コードは無効化した状態で保持）・Firestore読み書き・同期処理（モジュール） |
| `ui-auth.js` | ログイン画面・アカウント連携・トースト等のUI制御（通常スクリプト） |
| `firestore.rules` | Firestore Security Rules（Firebase Consoleに設定する内容） |
| `scripts/generate-firebase-config.js` | （任意）環境変数からfirebase-config.jsを生成するビルドスクリプト |
| `vercel.json` | （任意）Vercelで上記ビルドスクリプトを使う場合の設定 |

`index.html` / `styles.css` / `app.js` は、既存の予定表機能を維持したまま、
ログイン用UIの追加とクラウド同期用のフック（`window.PaperWeek` API）のみを
追加しています。

現在ユーザーに提供している認証方法は「メールアドレス＋パスワード」と
「Google」の2種類です（Appleは後述の理由により一時的に非表示）。
どちらの方法でログインしても、認証方法にかかわらず

```
Firebase Authentication → uid取得 → users/{uid} → Firestore読み書き → アプリに反映
```

という同じデータフローを通ります。認証方法によって保存先やデータ構造が
分かれることはありません。

### Appleログインについて（現在非表示）

Appleログインは、Apple Developer Programへの登録が完了していないため、
現時点ではログイン画面に表示していません。コード自体は`cloud-sync.js`に
残してあり、削除はしていないため、登録完了後は少ないコード変更で
再度有効化できます。詳細は本ドキュメント後半の
「③ Apple（Sign in with Apple）— 現在アプリ側では無効化中」を参照してください。

### アカウントの統合について

もし同じメールアドレスで複数のログイン方法（例：メールとGoogle）を
使おうとした場合、Firebaseはデフォルトでは「別アカウント」として扱おうとし、
`auth/account-exists-with-different-credential` エラーになることがあります。
これはFirebase Authenticationの仕様であり、ログイン時に自動で安全にマージする
確実な方法はありません（メール到達性の確認なしに自動統合すると、
なりすましのリスクがあるためです）。

そのため本実装では、次の**安全な統合フロー**を採用しています。

1. 別の方法で新規ログインしようとして上記エラーになった場合、
   「このメールアドレスはすでに◯◯で登録されています。まずそちらでログインしてください」
   という案内を表示する（`fetchSignInMethodsForEmail`で判別できた場合のみ具体的な方法名を表示）。
2. 案内に従って**先に登録済みの方法でログイン**してもらう。
3. ログイン後、ヘッダーの「アカウント」→「ログイン方法」から
   「Googleを連携する」ボタンで、同じアカウントに追加のログイン方法を
   安全に連携（`linkWithPopup`）できる。
   （Appleの連携ボタンは、Appleログイン自体を再有効化した際にあわせて復活します。）

この方法であれば、他人になりすまして別アカウントを乗っ取ることができず、
かつ一度連携すればどの方法でログインしても同じ`uid`・同じFirestoreデータに
アクセスできます。

---

## 2. Firebase Console側で行う設定（ユーザー自身の作業）

以下はすべて [Firebase Console](https://console.firebase.google.com/) 上での作業です。

1. **Firebaseプロジェクトを作成**
   「プロジェクトを追加」から新規プロジェクトを作成します。
2. **Webアプリを登録**
   プロジェクト概要 →「</>」（ウェブ）アイコン → アプリ名を入力して登録します。
   このとき表示される `firebaseConfig` の値を後で使います。
3. **Authenticationを有効化**
   左メニュー「Authentication」→「始める」。
4. **認証方法を有効化**
   下記「2-1. 認証設定」を参照し、使いたい方法（メール／Google／Apple）を
   それぞれ有効にします。
5. **Firestore Databaseを作成**
   左メニュー「Firestore Database」→「データベースの作成」。
   本番環境モード（ロックモード）で作成して問題ありません（ルールは次で設定します）。
6. **Security Rulesを設定**
   Firestore →「ルール」タブを開き、本パッケージの `firestore.rules` の内容を
   そのまま貼り付けて「公開」します。
7. **Firebase設定情報を取得**
   プロジェクトの設定 → 全般 → マイアプリ →「SDKの設定と構成」に表示される
   `apiKey` `authDomain` `projectId` `storageBucket` `messagingSenderId` `appId`
   をコピーします。
8. **設定値を反映**
   - シンプルな方法：`firebase-config.js` を直接開いて、上記の値に書き換える。
   - 環境変数を使いたい場合：後述の「Vercelへのデプロイ」を参照。
9. **デプロイ**
   静的ファイルとしてそのままVercel / Netlify / Firebase Hosting などにアップロードします。

> **ここまでの1〜9は、コードを書く必要のない「Firebase Console上の設定」です。**
> それ以外（ログイン画面の実装、Firestoreの読み書き、同期処理など）はすべて
> コード側（`cloud-sync.js` など）ですでに実装済みです。

---

## 2-1. 認証設定（メール／Google／Apple）

Firebase Console →「Authentication」→「Sign-in method」タブで、以下をそれぞれ有効にします。
アプリのコード（`cloud-sync.js`）はすでに3方式に対応済みなので、
**Console側を有効化するだけで動作します。**

### ① メールアドレス＋パスワード
「メール/パスワード」プロバイダを有効にするだけです。追加設定は不要です。

### ② Google
1. 「Google」プロバイダを選択し「有効にする」をオンにします。
2. 「プロジェクトのサポートメール」を選択して保存します。
3. 追加のGoogle Cloud側設定は基本的に不要です（Firebaseが自動的にOAuthクライアントを作成します）。
4. **承認済みドメイン**（Authentication →「Settings」→「承認済みドメイン」）に、
   実際にアプリを公開するドメイン（例：`your-app.vercel.app` や独自ドメイン）が
   含まれていることを確認してください。含まれていない場合は追加します。

これでGoogleログインは動作します。追加のApple Developer側設定などは不要です。

### ③ Apple（Sign in with Apple）— 現在アプリ側では無効化中

> **現在の状態**：Apple Developer Programへの登録が完了していないため、
> このアプリのログイン画面には「Appleでログイン」ボタンを**表示していません**。
> 現時点で利用できるのは「メールアドレス＋パスワード」と「Google」の2種類です。
> コード側（`cloud-sync.js`）にはApple用の処理を削除せず残してあるため、
> 以下の設定が完了した後、ボタンを1つ復活させるだけで再度利用できます
> （具体的な手順は `cloud-sync.js` 冒頭のコメントを参照）。

Appleログインを実装・再開する場合、以下のとおり
**Firebase側・Apple Developer側・Vercel（デプロイ先）側** の
3箇所すべての設定が必要で、Googleより手順が多くなります。

#### (a) Apple Developer側の設定
これらはFirebaseではなく、Appleの [Apple Developer](https://developer.apple.com/account/) サイトで行います。
**Apple Developer Program（有料、年間登録）への加入が必要です。**

1. **App ID の作成／確認**（Certificates, Identifiers & Profiles → Identifiers）
   - 既存のiOSアプリ等がなければ、Webログインのみの場合でも「Services ID」の作成が中心になります。
2. **「Sign in with Apple」機能を持つ App ID を用意**
   - 既存のApp IDがある場合は、そのApp IDの Capabilities で「Sign in with Apple」を有効化します。
3. **Services ID（Web用の識別子）を作成**
   - Identifiers →「+」→「Services IDs」を選択して新規作成します。
   - この Services ID の値（例：`com.example.paperweek.web`）が、
     Firebase側で入力する「サービスID」になります。
   - 作成後、この Services ID を選択し「Sign in with Apple」を有効化して「Configure」を開きます。
4. **Configure画面で以下を設定**
   - **Primary App ID**：手順2のApp IDを選択します。
   - **Domains and Subdomains**：アプリを公開するドメイン
     （例：`your-app.vercel.app`、独自ドメインを使う場合はそちらも）を入力します。
   - **Return URLs（Redirect URLs）**：Firebase Consoleの「Apple」プロバイダ設定画面に
     表示される「Redirect URI（Callback URL）」をそのまま貼り付けます。
     通常は `https://<プロジェクトID>.firebaseapp.com/__/auth/handler` の形式です。
     （このURLは手順(b)でFirebase側を先に開くと確認できます。）
5. **キー（Sign in with Apple用のプライベートキー）を作成**
   - Certificates, Identifiers & Profiles → Keys →「+」で新規キーを作成します。
   - 「Sign in with Apple」にチェックを入れ、対象のApp IDを紐付けて作成します。
   - 作成すると `.p8` 形式の秘密鍵ファイルが**一度だけ**ダウンロードできます。
     必ず安全な場所に保管してください（再ダウンロード不可）。
   - あわせて **Key ID** と、Apple Developerアカウントの **Team ID**
     （メンバーシップページで確認可能）も控えておきます。

#### (b) Firebase側の設定
1. Firebase Console →「Authentication」→「Sign-in method」→「Apple」を選択し「有効にする」。
2. 以下を入力します（すべてApple Developer側で取得した値です）：
   - **Services ID**：手順(a)-3で作成したServices IDの値
   - **Apple Team ID**：Apple Developerアカウントの Team ID
   - **Key ID**：手順(a)-5で作成したキーのKey ID
   - **Private Key**：手順(a)-5でダウンロードした `.p8` ファイルの中身
3. 保存すると、この画面に **Redirect URI（コールバックURL）** が表示されます。
   これを手順(a)-4の「Return URLs」に正しく登録してください
   （順番が前後してもかまいませんが、両方に同じURLが登録されている必要があります）。

#### (c) Vercel（デプロイ先）側の設定
1. 実際に公開するドメイン（例：`your-app.vercel.app` や独自ドメイン）を確定します。
2. そのドメインを、
   - Apple Developer の Services ID Configure 画面の「Domains and Subdomains」
   - Firebase Console →「Authentication」→「Settings」→「承認済みドメイン」
   の両方に登録します。
3. 独自ドメインをVercelに設定している場合、DNS反映後にドメインが有効になってから
   上記の登録を行ってください。
4. Vercel側でFirebase接続に必要な追加の環境変数はありません
   （`firebase-config.js` の値がGoogle/Apple/メールすべてに共通で使われます）。

> Apple Developer側の設定値（Services ID・Team ID・Key ID・秘密鍵の中身など）は、
> 実在するApple Developerアカウントでしか取得できないため、本パッケージのコードには
> 一切埋め込んでいません（推測や仮の値も入れていません）。上記手順に沿って、
> ご自身のアカウントで取得した値をFirebase Consoleの画面に直接入力してください。

---

## 3. Firestoreのデータ構造

```
users/{uid}                      … ユーザードキュメント
  ├─ email                       : string
  ├─ orientation                 : "portrait" | "landscape"
  ├─ template                    : "01" | "02" | "03"
  ├─ handwrite                   : "less" | "standard" | "more" | "analog"
  ├─ timeStart                   : "08:00" など
  ├─ timeEnd                     : "21:00" など
  ├─ updatedAt                   : サーバータイムスタンプ
  └─ weeks/{weekStartDate}       … 週ごとのサブコレクション（例: "2026-09-14"）
        ├─ events : [{ id, title, day, start, end, category, memo }, ...]
        ├─ todos  : [{ id, text, checked }, ...]
        └─ updatedAt : サーバータイムスタンプ
```

`currentWeekStart`（今どの週を見ているか）は端末ごとのUI状態として扱い、
あえてFirestoreには同期していません（複数端末でそれぞれ別の週を見られるようにするため）。

---

## 4. Security Rules（`firestore.rules`）

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;

      match /weeks/{weekId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- 未ログインユーザーはいかなるデータも読み書きできません。
- ログイン済みユーザーは、自分の `uid` と一致するパス（`users/{自分のuid}` 以下）
  のみ読み書きできます。他人の `uid` を指定した読み取り・書き込み・削除は
  すべて拒否されます。

---

## 5. Vercelへデプロイする場合

### 方法A：もっとも簡単（推奨）
`firebase-config.js` を直接編集して実際の値を入れ、そのままデプロイします。
Firebaseのウェブ向け設定値（`apiKey`など）は秘密情報ではなく、公開されることを
前提とした識別子なので、リポジトリにコミットしても問題ありません。
アクセス制御は Security Rules 側で行われます。

### 方法B：環境変数で管理したい場合
1. Vercelの Environment Variables に以下を設定：
   `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` / `FIREBASE_PROJECT_ID` /
   `FIREBASE_STORAGE_BUCKET` / `FIREBASE_MESSAGING_SENDER_ID` / `FIREBASE_APP_ID`
2. Vercelの Build Command を `node scripts/generate-firebase-config.js` に設定
   （同梱の `vercel.json` にすでに設定済みです）。
3. デプロイすると、ビルド時に環境変数から `firebase-config.js` が自動生成されます。

このアプリは現在も静的HTML/CSS/JS構成のままであり、Next.jsなどへの変更は
行っていません。

---

## 6. Firebase未設定のまま使う場合

`firebase-config.js` がプレースホルダのままでも、アプリは正常に起動します。
その場合：

- ヘッダーの「ログイン」ボタンは表示されません。
- 予定・TODO・設定はこれまで通りlocalStorageにのみ保存されます。
- 印刷・テンプレート・A4縦横・手書きスペースなど、既存の全機能がそのまま使えます。
