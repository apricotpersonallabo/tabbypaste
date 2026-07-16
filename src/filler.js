(async () => {
  const showNotification = (message, type = 'error') => {
    const hostId = 'tabby-paste-notification-host';
    document.getElementById(hostId)?.remove();

    const host = document.createElement('div');
    host.id = hostId;
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('top', '16px', 'important');
    host.style.setProperty('left', '50%', 'important');
    host.style.setProperty('transform', 'translateX(-50%)', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('width', 'min(560px, calc(100vw - 32px))', 'important');

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { color-scheme: light; }
      .notification {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid #f3b4b4;
        border-left: 4px solid #c62828;
        border-radius: 8px;
        color: #3b1616;
        background: #fff7f7;
        box-shadow: 0 8px 24px rgb(0 0 0 / 22%);
        font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        animation: enter 160ms ease-out;
      }
      .notification.warning {
        border-color: #e8cc8b;
        border-left-color: #a96600;
        color: #3d2b0a;
        background: #fffaf0;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 38px;
        padding: 4px 9px 4px 12px;
        border-bottom: 1px solid rgb(0 0 0 / 10%);
        font-weight: 650;
      }
      .title { min-width: 0; overflow-wrap: anywhere; }
      .message { padding: 11px 14px 13px 12px; overflow-wrap: anywhere; }
      button {
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 5px;
        color: currentColor;
        background: transparent;
        font: 22px/1 system-ui, sans-serif;
        cursor: pointer;
      }
      button:hover { background: rgb(0 0 0 / 7%); }
      button:focus-visible { outline: 2px solid #2f6fed; outline-offset: 1px; }
      @keyframes enter {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .notification { animation: none; }
      }
    `;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');

    const header = document.createElement('div');
    header.className = 'header';

    const titleEl = document.createElement('div');
    titleEl.className = 'title';
    const extensionName = chrome.i18n.getMessage('extName') || 'Tabby Paste';
    titleEl.textContent = chrome.i18n.getMessage('notificationHeader', [extensionName]) ||
      `ブラウザ拡張機能${extensionName}からの通知`;

    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute(
      'aria-label',
      chrome.i18n.getMessage('closeNotification') || 'Close notification'
    );

    let closeTimer;
    const close = () => {
      clearTimeout(closeTimer);
      host.remove();
    };
    closeButton.addEventListener('click', close);

    header.append(titleEl, closeButton);
    notification.append(header, messageEl);
    shadow.append(style, notification);
    document.documentElement.appendChild(host);
    closeTimer = setTimeout(close, 8000);
  };

  /* --- 設定 ------------------------------------------------------ */
  const defaultSettings = {
    delayMs: 0,
    selectWaitOptions: true
  };

  const loadSettings = async () => {
    try {
      return await chrome.storage.sync.get(defaultSettings);
    } catch (e) {
      console.warn('Failed to load settings. Falling back to defaults:', e);
      return defaultSettings;
    }
  };

  const settings = await loadSettings();
  const config = {
    delayMs: Math.max(0, Number(settings.delayMs) || 0),
    select: {
      valueFirst: true,
      allowContainsFallback: true,
      verifyAndRetry: true,
      waitOptions: settings.selectWaitOptions !== false
    }
  };

  /* 1. クリップボード読み取り */
  let raw = '';
  try {
    raw = await navigator.clipboard.readText();
  } catch (e) {
    console.error('Clipboard read failed:', e);
    showNotification(chrome.i18n.getMessage('clipboardReadFailed'));
    return;
  }

  if (!raw) {
    showNotification(chrome.i18n.getMessage('clipboardNoText'), 'warning');
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
    showNotification(chrome.i18n.getMessage('noInputFields'), 'warning');
    return;
  }
  if (allElements.indexOf(document.activeElement) === -1) {
    showNotification(chrome.i18n.getMessage('focusInputField'), 'warning');
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
