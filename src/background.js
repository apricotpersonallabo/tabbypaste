const DEFAULT_SETTINGS = {
  enabledUrls: '',
  extensionEnabled: true
};

const ICON_PATHS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

let grayscaleIconsPromise;

const createGrayscaleIcons = async () => {
  const icons = {};

  for (const [sizeText, path] of Object.entries(ICON_PATHS)) {
    const size = Number(sizeText);
    const response = await fetch(chrome.runtime.getURL(path));
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();

    const imageData = context.getImageData(0, 0, size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const gray = Math.round(
        imageData.data[i] * 0.299 +
        imageData.data[i + 1] * 0.587 +
        imageData.data[i + 2] * 0.114
      );
      imageData.data[i] = gray;
      imageData.data[i + 1] = gray;
      imageData.data[i + 2] = gray;
    }
    icons[size] = imageData;
  }

  return icons;
};

const setActionIcon = async (tabId, enabled) => {
  if (enabled) {
    await chrome.action.setIcon({ tabId, path: ICON_PATHS });
    return;
  }

  grayscaleIconsPromise ||= createGrayscaleIcons();
  try {
    await chrome.action.setIcon({ tabId, imageData: await grayscaleIconsPromise });
  } catch (error) {
    grayscaleIconsPromise = undefined;
    console.warn('Failed to create grayscale action icon:', error);
  }
};

const patternToRegExp = (pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
};

const getAvailability = async (url) => {
  if (!url || !/^https?:\/\//i.test(url)) return false;

  const { enabledUrls, extensionEnabled } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const patterns = String(enabledUrls || '')
    .split(/\r?\n/)
    .map(pattern => pattern.trim())
    .filter(Boolean);

  const urlMatches = !patterns.length || patterns.some(pattern => {
    try {
      return patternToRegExp(pattern).test(url);
    } catch (_) {
      return false;
    }
  });

  return { urlMatches, extensionEnabled };
};

const isEnabledUrl = async (url) => {
  const availability = await getAvailability(url);
  return Boolean(availability && availability.urlMatches && availability.extensionEnabled);
};

const updateTabState = async (tabId, url) => {
  if (!tabId) return;
  const availability = await getAvailability(url);
  const urlMatches = Boolean(availability && availability.urlMatches);
  const extensionEnabled = Boolean(availability && availability.extensionEnabled);
  const enabled = urlMatches && extensionEnabled;

  // Keep the action enabled so the popup can always be opened to change settings.
  await chrome.action.enable(tabId);
  await setActionIcon(tabId, enabled);
  await chrome.action.setBadgeText({
    tabId,
    text: !extensionEnabled ? 'OFF' : (urlMatches ? '' : '×')
  });
  if (!enabled) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });
  }
};

const refreshAllTabs = async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => updateTabState(tab.id, tab.url).catch(() => {})));
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tabbypaste',
    title: chrome.i18n.getMessage('contextMenuTitle'),
    contexts: ['all']
  });
  refreshAllTabs();
});

chrome.runtime.onStartup.addListener(refreshAllTabs);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await updateTabState(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    updateTabState(tabId, changeInfo.url || tab.url).catch(() => {});
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.enabledUrls || changes.extensionEnabled)) refreshAllTabs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'getActiveTabAvailability') return false;

  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const availability = await getAvailability(tab?.url);
    sendResponse({
      urlMatches: Boolean(availability && availability.urlMatches),
      extensionEnabled: Boolean(availability && availability.extensionEnabled)
    });
  })().catch(error => {
    console.error('Failed to get active tab availability:', error);
    sendResponse({ urlMatches: false, extensionEnabled: false });
  });

  return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'tabbypaste' || !tab?.id) return;
  if (!(await isEnabledUrl(tab.url))) return;

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
  if (!(await isEnabledUrl(tab.url))) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['filler.js']
    });
  } catch (e) {
    console.error('executeScript (shortcut) failed:', e);
  }
});
