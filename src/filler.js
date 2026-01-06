(async () => {
  /* --- 設定 ------------------------------------------------------ */
  const config = {
    // 任意の遅延ミリ秒。0なら遅延なし。例: 50, 100, 200 等
    delayMs: 0,

    // selectの検索挙動
    select: {
      valueFirst: true,            // true: value→text の順で検索
      allowContainsFallback: true, // 前方一致でだめなら部分一致へ
      verifyAndRetry: true,        // 設定直後の値が上書きされたら再適用
      waitOptions: true           // 遅延描画が疑われるUIなら true に
    }
  };

  /* 1. クリップボード読み取り */
  let raw = '';
  try {
    raw = await navigator.clipboard.readText();
  } catch (e) {
    console.error('Clipboard read failed:', e);
    alert(chrome.i18n.getMessage('clipboardReadFailed'));
    return;
  }

  if (!raw) {
    alert(chrome.i18n.getMessage('clipboardNoText'));
    return;
  }

  /* 2. タブ区切りで分割 */
  const values = raw.split('\t');

  /* 対象要素の再取得関数（毎ループで使用） */
  const getAllElements = () => {
    return Array.from(document.querySelectorAll('input[type="text"], input[type="password"], select, textarea')).filter(el => {
      if (el.offsetParent === null) return false; // 非表示を除外
      if (el.disabled) return false; // disabled を除外
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        return el instanceof HTMLInputElement &&
          (el.type === 'text' || el.type === 'password') &&
          !el.readOnly;
      } else if (tag === 'select') {
        return el instanceof HTMLSelectElement;
      } else if (tag === 'textarea') {
        return el instanceof HTMLTextAreaElement && !el.readOnly;
      }
      return false;
    });
  };

  /* 初回チェック */
  let allElements = getAllElements();
  if (!allElements.length) {
    alert(chrome.i18n.getMessage('noInputFields'));
    return;
  }
  if (allElements.indexOf(document.activeElement) === -1) {
    alert(chrome.i18n.getMessage('focusInputField'));
    return;
  }

  /* --- 待機ユーティリティ -------------------------------------- */
  const sleep = async (ms) => {
    if (!ms || ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  };

  const waitForRender = async () => {
    await Promise.resolve(); // microtask
    await new Promise(requestAnimationFrame); // 次フレーム
    await new Promise(r => setTimeout(r, 0)); // ペイント猶予
    // 任意遅延
    await sleep(config.delayMs);
  };

  /* --- キーイベント/入力ヘルパー ------------------------------- */
  const fireKeyEvent = (el, type, key, code, extra = {}) => {
    const charCode = key && key.length === 1 ? key.charCodeAt(0) : 0;
    const evt = new KeyboardEvent(type, {
      key, code,
      which: extra.which ?? charCode,
      keyCode: extra.keyCode ?? charCode,
      bubbles: true, cancelable: true
    });
    el.dispatchEvent(evt);
  };

  const insertChar = (el, ch) => {
    const code = /^[a-z]$/i.test(ch) ? `Key${ch.toUpperCase()}` : '';
    fireKeyEvent(el, 'keydown', ch, code);
    fireKeyEvent(el, 'keypress', ch, code);
    const oldVal = el.value;
    el.value = oldVal + ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fireKeyEvent(el, 'keyup', ch, code);
  };

  const pressTab = (el) => {
    fireKeyEvent(el, 'keydown', 'Tab', 'Tab', { keyCode: 9, which: 9 });
    fireKeyEvent(el, 'keyup', 'Tab', 'Tab', { keyCode: 9, which: 9 });
  };

  /* --- 文字列正規化ユーティリティ ------------------------------- */
  const normalize = (s) => {
    if (s == null) return '';
    let t = String(s)
      .replace(/\u00A0/g, ' ')      // NBSP→半角スペース
      .replace(/\s+/g, ' ')         // 連続空白を1つに
      .trim();
    try {
      t = t.normalize('NFKC');      // 全角半角を正規化
    } catch (_) {/* normalize未対応でも可 */ }
    return t.toLowerCase();
  };

  /* --- select: 遅延描画・options更新待ち（必要時） -------------- */
  const waitForOptionsStable = async (selectEl, timeoutMs = 500) => {
    const start = performance.now();
    const initialLen = selectEl.options.length;

    await Promise.resolve();
    await new Promise(requestAnimationFrame);

    return await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; observer?.disconnect(); resolve(); } };

      const observer = new MutationObserver(() => {
        const stamp = performance.now();
        if (stamp - start > timeoutMs) finish();
        Promise.resolve()
          .then(() => new Promise(requestAnimationFrame))
          .then(finish);
      });

      observer.observe(selectEl, { childList: true, subtree: true });

      setTimeout(finish, timeoutMs);

      if (selectEl.options.length === initialLen) {
        setTimeout(finish, 30);
      }
    });
  };

  /* --- select: 高精度選択（任意遅延に対応） --------------------- */
  const selectByPrefix = async (selectEl, rawInput, opts = {}) => {
    const {
      valueFirst = true,
      allowContainsFallback = true,
      verifyAndRetry = true,
      waitOptions = false,
      delayMs = config.delayMs      // 個別オーバーライド可能
    } = opts;

    if (!rawInput) return;

    if (waitOptions) {
      await waitForOptionsStable(selectEl).catch(() => { });
    }

    // 選択前に任意遅延（UI側のフィルタや検証待ちに有用）
    await sleep(delayMs);

    const input = normalize(rawInput);

    const items = Array.from(selectEl.options).map(o => ({
      option: o,
      nText: normalize(o.text),
      nValue: normalize(o.value)
    }));

    const pick = (keys) => {
      // 厳密一致
      for (const k of keys) {
        const hit = items.find(it => it[k] === input);
        if (hit) return hit.option;
      }
      // 前方一致
      for (const k of keys) {
        const hit = items.find(it => it[k].startsWith(input));
        if (hit) return hit.option;
      }
      // 部分一致
      if (allowContainsFallback) {
        for (const k of keys) {
          const candidates = items.filter(it => it[k].includes(input));
          if (candidates.length === 1) return candidates[0].option;
          if (candidates.length > 1) {
            candidates.sort((a, b) => a.nText.length - b.nText.length);
            return candidates[0].option;
          }
        }
      }
      return null;
    };

    const keysOrder = valueFirst ? ['nValue', 'nText'] : ['nText', 'nValue'];
    const matched = pick(keysOrder);
    if (!matched) {
      console.warn('No option matched for input:', rawInput);
      return;
    }

    const applyValue = (opt) => {
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    };

    applyValue(matched);

    // 設定後に任意遅延＋検証（UI側が上書きするケース対策）
    await sleep(delayMs);

    if (verifyAndRetry) {
      // 次tickでも確認
      await new Promise(r => setTimeout(r, 0));
      if (selectEl.value !== matched.value) {
        applyValue(matched);
        await new Promise(r => setTimeout(r, 0));
        await sleep(delayMs);
      }
    }
  };

  /* --- ターゲット解決: 現在/次要素 ------------------------------- */
  const resolveCurrentElement = () => {
    allElements = getAllElements();
    const active = document.activeElement;
    const idx = allElements.indexOf(active);
    if (idx === -1) return allElements[0] ?? null;
    return allElements[idx];
  };

  const resolveNextElement = () => {
    allElements = getAllElements(); // 最新に更新
    const active = document.activeElement;
    const idx = allElements.indexOf(active);
    if (idx === -1) {
      return allElements[0] ?? null;
    }
    return allElements[idx + 1] ?? null;
  };

  /* --- メインループ ---------------------------------------------- */

  for (let i = 0; i < values.length; i++) {
    // 現在要素を解決
    let el = resolveCurrentElement();
    if (!el) break;

    const val = values[i];
    console.log(`Processing ${i}: ${el.tagName.toLowerCase()} with value "${val}"`);

    // フォーカスを確実に当てる
    el.focus();
    await waitForRender();

    const tag = el.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea') {
      el.value = '';
      for (const ch of val) insertChar(el, ch);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await waitForRender();
    } else if (tag === 'select') {
      await selectByPrefix(el, val, {
        ...config.select,
        delayMs: config.delayMs
      });
      await waitForRender();
    }

    // ===== ここが追加ポイント：次要素が無いなら終了 =====
    // DOMが動的に変わる可能性があるため、入力後に最新DOM基準で判定する
    const nextEl = resolveNextElement(); // null なら「最後に到達」
    if (!nextEl) {
      console.log('Reached last destination element. Stop processing even if clipboard values remain.');
      break;
    }

    // 最後の値でなければ次へ進む
    if (i < values.length - 1) {
      // 1) まずは Tab を試す
      pressTab(el);
      await waitForRender();

      // 2) 任意遅延（フォーカス移動・検証表示などの安定化）
      await sleep(config.delayMs);

      // 3) フォーカスが移っていなければ、明示的に次要素へフォーカス
      const before = el;
      const after = document.activeElement;
      if (after === before) {
        nextEl.focus();
        await waitForRender();
        await sleep(config.delayMs);
      }

      // 次ループで resolveCurrentElement() が最新フォーカスを基準に再評価
    }
  }

})();
