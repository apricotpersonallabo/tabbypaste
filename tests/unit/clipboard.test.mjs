import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/clipboard.js', import.meta.url), 'utf8');
const loadReader = ({ text = 'Alpha\tLine one\nLine two', denied = false } = {}) => {
  let listener;
  const calls = [];
  const field = {
    value: 'stale clipboard text',
    focus: () => calls.push('focus'),
    blur: () => calls.push('blur')
  };
  vm.runInNewContext(source, {
    chrome: { runtime: {
      id: 'test-extension', onMessage: { addListener: value => { listener = value; } }
    } },
    document: {
      getElementById: () => field,
      execCommand: command => {
        calls.push(command);
        if (denied) return false;
        field.value = text;
        return true;
      }
    },
    console
  });
  return { listener, field, calls };
};

test('offscreen reader returns plain text including tabs, line breaks and empty clipboard', () => {
  for (const text of ['Alpha\tLine one\nLine two', '']) {
    const { listener, field, calls } = loadReader({ text });
    let response;
    listener({ type: 'readClipboardOffscreen' }, { id: 'test-extension' }, value => { response = value; });
    assert.equal(response.ok, true);
    assert.equal(response.text, text);
    assert.equal(field.value, '', 'clipboard text must be cleared after responding');
    assert.deepEqual(calls, ['focus', 'paste', 'blur']);
  }
});

test('offscreen reader reports paste denial and clears stale text', () => {
  const { listener, field, calls } = loadReader({ denied: true });
  let response;
  listener({ type: 'readClipboardOffscreen' }, { id: 'test-extension' }, value => { response = value; });
  assert.equal(response.ok, false);
  assert.equal(field.value, '');
  assert.deepEqual(calls, ['focus', 'paste', 'blur']);
});

test('offscreen reader ignores page requests and unrelated messages', () => {
  const { listener, calls } = loadReader();
  for (const [message, sender] of [
    [{ type: 'readClipboardForPaste' }, { id: 'test-extension' }],
    [{ type: 'readClipboardOffscreen' }, { id: 'other-extension' }],
    [{ type: 'readClipboardOffscreen' }, { id: 'test-extension', tab: { id: 7 } }]
  ]) {
    assert.equal(listener(message, sender, () => assert.fail('unexpected clipboard response')), false);
  }
  assert.deepEqual(calls, []);
});
