# Browser Extension Template

Chrome、Microsoft Edge、Firefox 向けの Manifest V3 拡張機能テンプレートです。単一の `src/` からブラウザー別の成果物を作り、GitHub Actions で検証、ZIP 化、ストア送信、GitHub Release 作成まで行えます。

## 必要環境

- Node.js 22
- pnpm 11.19.0（Corepack の利用を推奨）
- 完全テストには Docker と Docker Compose
- ローカルでのパッケージ作成には `zip` と `unzip`

## 新しい拡張機能として使う

1. このフォルダーを新しいリポジトリへコピーします。
2. 次の項目を必ず変更します。
   - `package.json` の `name`
   - `src/_locales/en/messages.json` と `src/_locales/ja/messages.json` の名前・説明
   - `src/manifest.firefox.json` の `browser_specific_settings.gecko.id`
   - `amo-metadata.json` の説明
   - `src/icons/` の仮アイコン
   - `docs/` 内の `CHANGE_ME`、ストアURL、問い合わせ先、プライバシーポリシー
3. 必要な権限だけを両方の manifest に追加します。
4. `src/` のサンプル UI とロジックを実装内容に置き換えます。
5. 同梱済みの `LICENSE`（Apache-2.0）を確認し、必要に応じて付録の著作権表示へ自身の年・氏名または組織名を追加します。

検索しやすいよう、変更が必要な値には `CHANGE_ME` を付けています。

## セットアップとローカルビルド

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run test:fast
pnpm run build:extensions
```

生成先:

- `build/chromium/`: Chrome / Edge で「パッケージ化されていない拡張機能」として読み込む
- `build/firefox/`: Firefox の `about:debugging` から `manifest.json` を読み込む

ストア提出用ZIPを生成し、manifestや混入ファイルまで検証する場合は次を実行します。

```sh
pnpm run package:extensions
```

`src/manifest.json` と `src/manifest.firefox.json` の `version` は、テンプレート値 `0.0.0.1` のままにしてください。実際のバージョンは `version.json` だけで管理します。

```sh
pnpm run version:increment
pnpm run version:check
```

## フォルダー構成

```text
.
├── .github/workflows/main.yml   # CI、パッケージ、ストア送信、Release
├── tests/e2e/                   # Chromium / Firefox 共通E2E
├── docs/                        # GitHub Pages 公開用サイト
│   ├── assets/                  # CSS、JavaScript、サイト用アイコン
│   ├── index.html               # 製品紹介・使い方・ストアリンク
│   ├── privacy.html             # プライバシーポリシー雛形
│   └── 404.html                 # Not Found ページ
├── scripts/                     # ビルド、パッケージ、テスト、ストア送信
├── src/                         # 拡張機能の共通ソース
│   ├── _locales/                # Chrome i18n 文言
│   ├── icons/                   # 16/32/48/128px アイコン
│   ├── welcome.*                # 初回インストール時の案内画面
│   ├── manifest.json            # Chromium 用テンプレート
│   └── manifest.firefox.json    # Firefox 用テンプレート
├── amo-metadata.json            # Firefox Add-ons の掲載情報
├── compose.test.yml             # Docker完全テスト構成
├── Dockerfile.test              # Node.jsテストランナー
├── Dockerfile.selenium-*        # 固定バージョンのテストブラウザー
├── LICENSE                       # Apache License 2.0
├── package.json
├── pnpm-lock.yaml
└── version.json                 # バージョンの唯一の更新元
```

ビルドに必須なのは `package.json`、`version.json`、`scripts/sync-manifest-version.mjs`、`scripts/versioning.mjs`、`src/` 内の2つの manifest と拡張機能ファイルです。`.github/`、`docs/`、Docker関連ファイル、ストア送信スクリプト、`amo-metadata.json` は、それぞれ自動リリース、GitHub Pages、完全E2E、ストア送信を使わない場合は削除できます。

## 自動テスト

Dockerを使う完全テストは、バージョン・構文・単体テスト、Firefox lint、パッケージ整合性、Chromium / Firefox E2Eをまとめて実行します。

```sh
pnpm test
```

E2Eは、設定画面での保存、ポップアップとの `chrome.storage.sync` 同期、ウェルカム画面のローカライズ・バージョン表示・設定画面への導線を実ブラウザーで確認します。テスト専用の拡張機能IDとChromium公開鍵は `build/e2e/` のコピーにだけ注入され、リリースZIPへの混入をパッケージ処理が拒否します。

Dockerを起動しない高速検証は次のコマンドです。

```sh
pnpm run test:fast
```

ブラウザーテスト失敗時のスクリーンショット、HTML、ブラウザーログ、WebDriverログは `test-results/e2e/` に保存されます。

## GitHub Pages を公開する

`docs/` はビルド不要の静的サイトです。リポジトリの **Settings → Pages** を開き、**Source** を **Deploy from a branch**、ブランチを `main`、フォルダーを `/docs` に設定して保存します。以後、`main` の `docs/` が更新されると公開されます。

公開前に `docs/` 内の `CHANGE_ME` をすべて検索し、拡張機能名、説明、ストアURL、連絡先を置き換えてください。`privacy.html` は一般的な構成の雛形であり、実装で扱うデータとmanifest権限に合わせた確認が必要です。

GitHub公式手順: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## GitHub Actions とストア送信

push / pull request ではDocker完全テストとパッケージ作成を行い、失敗時の診断ファイルを14日間保存します。`main` から手動実行した場合は、同じ検証済み成果物を設定済みのストアへ送信し、成功後に GitHub Release を作成します。未設定のストアはスキップされ、設定が一部だけ存在するストアは安全のため失敗します。

GitHub Environment `browser-stores` を作成し、利用するストアの値をすべて設定してください。

| ストア | Environment secrets | Environment variables |
| --- | --- | --- |
| Chrome Web Store | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID` |
| Microsoft Edge Add-ons | `EDGE_CLIENT_ID`, `EDGE_API_KEY` | `EDGE_PRODUCT_ID` |
| Firefox Add-ons | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | なし |

Chrome と Edge は、最初に各ダッシュボードで製品を作成しておく必要があります。権限を追加した場合は、各ストアのプライバシー情報と権限理由も更新してください。

## テンプレートに含まれるサンプル

ポップアップと設定画面から `chrome.storage.sync` の有効/無効フラグを共有する動作例に加え、初回インストール時だけ開くウェルカム画面を含みます。ウェルカム画面には、日英ローカライズ、現在のバージョン表示、設定画面への導線があります。実製品では `src/background.js`、`src/popup.*`、`src/options.*`、`src/welcome.*` と manifest の権限を用途に合わせて変更してください。
