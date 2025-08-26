chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'Tabby Paste',
    title: 'Tabby Paste',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'Tabby Paste' || !tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['filler.js']
    });
  } catch (e) {
    console.error('executeScript failed:', e);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'auto_paste' || !tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['filler.js']
    });
  } catch (e) {
    console.error('executeScript (shortcut) failed:', e);
  }
});