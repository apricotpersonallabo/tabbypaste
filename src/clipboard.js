chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'readClipboardOffscreen' ||
      sender.id !== chrome.runtime.id || sender.tab) return false;

  const field = document.getElementById('clipboardText');
  try {
    field.value = '';
    // Only the offscreen document's local focus changes. Chromium's async
    // Clipboard API cannot read here because this document cannot be focused.
    field.focus();
    if (!document.execCommand('paste')) throw new Error('Clipboard paste was denied');
    sendResponse({ ok: true, text: field.value });
  } catch (error) {
    console.error('Offscreen clipboard read failed:', error);
    sendResponse({ ok: false });
  } finally {
    field.value = '';
    field.blur();
  }
  return false;
});
