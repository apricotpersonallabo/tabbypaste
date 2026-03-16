# Tabby Paste — タブ区切りデータをフォームへ一括貼り付けするChrome拡張

## はじめに

スプレッドシートや業務システムからコピーしたデータを、Webフォームに手入力し直した経験はありませんか？  
**Tabby Paste** は、クリップボードにあるタブ区切りテキストを、Webページの入力フィールドへ自動で順番に貼り付けてくれる Chrome 拡張機能です。

- Chrome Web Store: <https://chromewebstore.google.com/detail/tabby-paste/pnfhlnlilceabibdeamkinhjjgmmnhme>
- Microsoft Edge アドオン: <https://microsoftedge.microsoft.com/addons/detail/tabby-paste/gjkopcpoddbifofepjnopohpcoeehlbg>

---

## Tabby Paste が解決する課題

ExcelやGoogleスプレッドシートの1行分のデータをコピーすると、各セルの値が **タブ文字（`\t`）** で区切られた文字列としてクリップボードに格納されます。  
しかし、このデータをWebフォームに転記しようとすると、フィールドを一つひとつクリックして貼り付ける手間がかかります。

Tabby Paste はこの作業を自動化します。  
コピー済みのタブ区切りデータを持った状態で拡張機能を起動するだけで、フォーカスしているフィールドから順番に値が埋め込まれていきます。

---

## 主な機能

### 1. クリップボードの自動読み取りと分割

起動時にクリップボードのテキストを取得し、タブ文字で分割します。  
クリップボードが空のときや読み取りに失敗した場合はアラートで通知するため、操作ミスを防げます。

```js
// クリップボード読み取り → タブ区切り分割
const raw = await navigator.clipboard.readText();
const values = raw.split('\t');
```

### 2. 対応フィールドの自動検出

ページ上の入力フィールドを自動で検出します。対象となるのは以下の要素です。

| 要素 | 条件 |
|------|------|
| `<input type="text">` | 表示中・有効・読み取り専用でない |
| `<input type="password">` | 表示中・有効・読み取り専用でない |
| `<select>` | 表示中・有効 |
| `<textarea>` | 表示中・有効・読み取り専用でない |

非表示（`offsetParent === null`）、`disabled`、`readonly` な要素は自動的にスキップされます。

### 3. スマートな `<select>` 選択

`<select>` 要素の選択肢は、以下の優先順位で柔軟にマッチングします。

1. **完全一致** — `value` または表示テキストが入力値と一致
2. **前方一致** — 先頭が一致する選択肢を選ぶ
3. **部分一致（フォールバック）** — 含まれる選択肢が1件ならそれを選ぶ；複数あれば最短のものを優先

また、文字列は **NFKC 正規化**（全角／半角の統一）と小文字変換を経てから比較されるため、全角数字や全角アルファベットを含むオプション値にも正確にマッチします。

```
const normalize = (s) => {
  let t = String(s).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.normalize('NFKC');
  return t.toLowerCase();
};
```

### 4. 動的UIへの対応（遅延描画・options更新待ち）

Reactや Vueなどのフレームワークで構築されたページでは、`<select>` の選択肢が非同期で挿入されることがあります。  
Tabby Paste は `MutationObserver` でオプションの変化を監視し、描画が安定してから値を設定するため、動的なフォームにも対応できます。

さらに、設定後に値が上書きされるケース（UIバリデーションによる再レンダリング等）にも **verify-and-retry**（確認・再適用）で対処します。

### 5. 自然なフォーカス移動（Tabキーシミュレーション）

フィールド間の移動は `Tab` キーのキーイベント（`keydown` / `keyup`）を発火させることで実現しています。  
多くのWebアプリケーションが `Tab` キーに依存したバリデーションや状態更新ロジックを持つため、この方式によって既存の動作を崩さずにフォーカスを移動できます。

`Tab` を押しても移動しなかった場合は、次の要素に対して直接 `focus()` を呼び出すフォールバック処理も備えています。

### 6. キーイベントの完全シミュレーション

文字の入力は1文字ずつ `keydown` → `keypress` → 値更新 → `input` イベント → `keyup` の順で発火します。  
これにより、`input` イベントをトリガーに動作するJavaScript製フォームとの互換性を高めています。

### 7. 設定可能な遅延

`filler.js` の設定オブジェクトで任意の遅延（ミリ秒）を指定できます。  
処理が速すぎてUIのアニメーションや検証が追いつかない場合に役立ちます。

```js
const config = {
  delayMs: 0,          // 0なら遅延なし。例: 50, 100, 200 等
  select: {
    valueFirst: true,            // value → text の順で検索
    allowContainsFallback: true, // 前方一致でだめなら部分一致へ
    verifyAndRetry: true,        // 設定直後の値が上書きされたら再適用
    waitOptions: true            // 遅延描画が疑われるUIなら true に
  }
};
```

---

## 使い方

### インストール

1. [Chrome Web Store](https://chromewebstore.google.com/detail/tabby-paste/pnfhlnlilceabibdeamkinhjjgmmnhme) または [Microsoft Edge アドオン](https://microsoftedge.microsoft.com/addons/detail/tabby-paste/gjkopcpoddbifofepjnopohpcoeehlbg) からインストールします。

### 実行手順

1. ExcelやGoogleスプレッドシートなどで、貼り付けたい行を**コピー**します（タブ区切りでクリップボードに格納されます）。
2. 貼り付けたいWebページを開き、**最初の入力フィールドにフォーカス**します。
3. 以下のいずれかの方法で Tabby Paste を実行します。

| 方法 | 操作 |
|------|------|
| キーボードショートカット | `Ctrl+Shift+V`（Windows / Linux）|
| 右クリックメニュー | ページ上で右クリック → **「Tabby Paste」** を選択 |

4. フォームの各フィールドにクリップボードの値が順番に入力されます。

### 動作の流れ

```text
クリップボード読み取り
  ↓
タブ区切りで分割
  ↓
フォーカス中のフィールドを起点に
  ↓
[input/textarea] → 文字を1字ずつ入力してchangeイベント
[select]         → スマートマッチングで選択肢を設定
  ↓
Tabキー発火 → 次のフィールドへ移動
  ↓
次の値がなければ終了 / 次の要素がなければ終了
```

---

## 技術的なポイント（開発者向け）

- **Manifest V3** 準拠。スクリプトは `chrome.scripting.executeScript` でコンテンツスクリプトとして注入されます。
- 必要な権限は `activeTab`・`scripting`・`contextMenus`・`clipboardRead` のみで、最小権限の原則を守っています。
- `filler.js` は単一の即時実行関数（IIFE）として記述されており、グローバルスコープを汚染しません。
- 非表示・disabled・readonly の要素は処理対象から除外されるため、隠しフィールドへの誤入力を防ぎます。
- 動的DOMに対応するため、各ループ内でフィールド一覧を毎回再取得しています。

---

## 対応ブラウザ・言語

**対応ブラウザ**

- Google Chrome
- Microsoft Edge（Chromiumベース）

**対応言語**

- 日本語
- English
- Deutsch（ドイツ語）
- Español（スペイン語）
- 한국어（韓国語）
- 简体中文（簡体字中国語）
- 繁体中文（繁体字中国語）

---

## まとめ

Tabby Paste は、スプレッドシートとWebフォーム間のデータ転記という日常的な作業を大幅に効率化します。  
スマートな `<select>` マッチング、動的UIへの対応、自然なキーイベントシミュレーションなど、実際の業務フォームで直面しがちな問題を丁寧に解消している点が特徴です。

「Excelのデータをフォームに何度も手で入力するのが面倒」と感じたことがある方は、ぜひ一度試してみてください。

- **ソースコード**: <https://github.com/apricotpersonallabo/tabbypaste>
- **ユーザーマニュアル**: <https://apricotpersonallabo.github.io/tabbypaste/>
