/**
 * Tab-Paster  filler.js  (KeyboardEvent 版)
 *
 * 1. クリップボードから text/plain を取得
 * 2. タブ区切りで配列化
 * 3. 表示中で編集可能な <input type="text">, <select>, <textarea> を列挙
 * 4. フォーカス中の要素を起点に、キー入力を模倣して値を貼り付ける
 *    - input/textarea: 文字入力を模倣
 *    - select: 先頭一致で選択肢を選択
 */

(async () => {
  /* 1. クリップボード読み取り */
  let raw = '';
  try {
    raw = await navigator.clipboard.readText();
  } catch (e) {
    console.error('Clipboard read failed:', e);
    alert('クリップボードの読み取りに失敗しました。');
    return;
  }

  if (!raw) {
    alert('クリップボードにテキストがありません。');
    return;
  }

  /* 2. タブ区切りで分割 */
  const values = raw.split('\t');

  /* 3. 対象となる input[type=text], select, textarea を DOM順序で抽出 */
  const allElements = Array.from(document.querySelectorAll('input[type="text"], select, textarea')).filter(el => {
    // 共通の条件チェック
    if (el.offsetParent === null) return false; // 非表示要素を除外
    if (el.disabled) return false; // disabled要素を除外
    
    // 要素タイプ別の条件チェック
    const tagName = el.tagName.toLowerCase();
    
    if (tagName === 'input') {
      return el instanceof HTMLInputElement 
        && el.type === 'text' 
        && !el.readOnly;
    } else if (tagName === 'select') {
      return el instanceof HTMLSelectElement;
    } else if (tagName === 'textarea') {
      return el instanceof HTMLTextAreaElement
        && !el.readOnly;
    }
    
    return false;
  });

  if (!allElements.length) {
    alert('入力フィールド (<input type="text">, <select>, <textarea>) が見つかりませんでした。');
    return;
  }

  console.log('Found elements in DOM order:', allElements.map(el => `${el.tagName.toLowerCase()}${el.type ? `[type="${el.type}"]` : ''}`));

  /* 4. フォーカス位置を起点に貼り付け */
  const activeEl = document.activeElement;
  const startIdx = allElements.indexOf(activeEl);

  if (startIdx === -1) {
    alert('入力フィールドにフォーカスしてください。');
    return;                              // 中断
  }

  /* --- 便利関数群 ------------------------------------------------ */

  // KeyboardEvent を生成して dispatch
  const fireKeyEvent = (el, type, key, code, extra = {}) => {
    // {key,code,which,keyCode} を揃える
    const evt = new KeyboardEvent(type, {
      key,
      code,
      which: key.length === 1 ? key.charCodeAt(0) : 0,
      keyCode: key.length === 1 ? key.charCodeAt(0) : 0,
      bubbles: true,
      cancelable: true,
      ...extra
    });
    el.dispatchEvent(evt);
  };

  // 1 文字を入力: keydown -> keypress -> (value 追加して input) -> keyup
  const insertChar = (el, ch) => {
    fireKeyEvent(el, 'keydown', ch, `Key${ch.toUpperCase()}`);
    fireKeyEvent(el, 'keypress', ch, `Key${ch.toUpperCase()}`);
    const oldVal = el.value;
    el.value = oldVal + ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fireKeyEvent(el, 'keyup', ch, `Key${ch.toUpperCase()}`);
  };

  // select で先頭一致する選択肢を選択
  const selectByPrefix = (selectEl, prefix) => {
    if (!prefix) return;
    
    const options = Array.from(selectEl.options);
    const matchedOption = options.find(option => 
      option.text.toLowerCase().startsWith(prefix.toLowerCase()) ||
      option.value.toLowerCase().startsWith(prefix.toLowerCase())
    );
    
    if (matchedOption) {
      selectEl.value = matchedOption.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  // TAB キーで次フィールドへ
  const pressTab = (el) => {
    fireKeyEvent(el, 'keydown', 'Tab', 'Tab', { keyCode: 9, which: 9 });
    fireKeyEvent(el, 'keyup',   'Tab', 'Tab', { keyCode: 9, which: 9 });
  };

  /* --- 実際の貼り付けループ ------------------------------------- */
  values.forEach((val, idx) => {
    const el = allElements[startIdx + idx];
    if (!el) return; // フィールド不足

    console.log(`Processing ${idx}: ${el.tagName.toLowerCase()} with value "${val}"`);

    el.focus();

    const tagName = el.tagName.toLowerCase();
    
    if (tagName === 'input' || tagName === 'textarea') {
      // input[type="text"] または textarea の場合: 既存の値をクリアしてから文字を 1 つずつ「タイプ」していく
      el.value = ''; // 既存値をクリア
      for (const ch of val) insertChar(el, ch);
      
      // 値確定 (change イベント)
      el.dispatchEvent(new Event('change', { bubbles: true }));
      
    } else if (tagName === 'select') {
      // select の場合: 先頭一致で選択
      selectByPrefix(el, val);
    }

    // 最後の値でなければ TAB で次フィールドへ
    if (idx < values.length - 1) pressTab(el);
  });
})();
