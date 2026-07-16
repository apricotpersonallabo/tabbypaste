const DEFAULT_SETTINGS = {
  delayMs: 0,
  enabledUrls: '',
  extensionEnabled: true,
  selectWaitOptions: true
};

const form = document.getElementById('optionsForm');
const statusEl = document.getElementById('status');

const message = (key) => chrome.i18n.getMessage(key) || key;

const setStatus = (text) => {
  statusEl.textContent = text;
};

const localize = () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const text = chrome.i18n.getMessage(el.dataset.i18n);
    if (text) el.textContent = text;
  });
  const extensionName = chrome.i18n.getMessage('extName') || 'Tabby Paste';
  const pageHeading =
    chrome.i18n.getMessage('optionsPageHeading', [extensionName]) ||
    `${extensionName}拡張機能設定`;
  document.getElementById('optionsHeading').textContent = pageHeading;
  document.title = pageHeading;
};

const setupBrowserSettingsLinks = () => {
  const isFirefox = navigator.userAgent.includes('Firefox/');
  const extensionSettingsUrl = isFirefox
    ? 'about:addons'
    : `chrome://extensions/?id=${chrome.runtime.id}`;
  const shortcutSettingsUrl = isFirefox
    ? 'about:addons'
    : 'chrome://extensions/shortcuts';

  const bindLink = (id, url) => {
    const link = document.getElementById(id);
    link.href = url;
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await chrome.tabs.create({ url });
    });
  };

  bindLink('extensionSettingsLink', extensionSettingsUrl);
  bindLink('shortcutSettingsLink', shortcutSettingsUrl);
};

const loadCurrentShortcut = async () => {
  const shortcutEl = document.getElementById('currentShortcut');

  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find(item => item.name === 'auto_paste');
    shortcutEl.textContent = command?.shortcut || message('optionsShortcutNotSet');
  } catch (error) {
    console.error('Failed to load keyboard shortcut:', error);
    shortcutEl.textContent = message('optionsShortcutUnavailable');
  }
};

const settingsToToml = (settings) => {
  const enabledUrls = String(settings.enabledUrls || '')
    .split(/\r?\n/)
    .map(url => url.trim())
    .filter(Boolean);

  return [
    '# Tabby Paste settings',
    `enabled_urls = ${JSON.stringify(enabledUrls)}`,
    `delay_ms = ${Math.max(0, Number(settings.delayMs) || 0)}`,
    '',
    '[select]',
    `wait_options = ${settings.selectWaitOptions !== false}`,
    ''
  ].join('\n');
};

const parseTomlBoolean = (value, key) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false`);
};

const parseSettingsToml = (source) => {
  const imported = {};
  let section = '';
  let importedSettings = 0;

  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!pair) throw new Error(`Invalid TOML line: ${sourceLine}`);

    const key = section ? `${section}.${pair[1]}` : pair[1];
    const value = pair[2].trim();

    switch (key) {
      case 'enabled_urls': {
        const urls = JSON.parse(value);
        if (!Array.isArray(urls) || urls.some(url => typeof url !== 'string' || /[\r\n]/.test(url))) {
          throw new Error('enabled_urls must be an array of strings');
        }
        imported.enabledUrls = urls.join('\n');
        importedSettings++;
        break;
      }
      case 'delay_ms': {
        const delay = Number(value);
        if (!Number.isInteger(delay) || delay < 0 || delay > 5000) {
          throw new Error('delay_ms must be an integer between 0 and 5000');
        }
        imported.delayMs = delay;
        importedSettings++;
        break;
      }
      case 'select.wait_options':
        imported.selectWaitOptions = parseTomlBoolean(value, key);
        importedSettings++;
        break;
      default:
        break;
    }
  }

  if (!importedSettings) throw new Error('No Tabby Paste settings found');
  return imported;
};

const readForm = () => ({
  delayMs: Math.max(0, Number(document.getElementById('delayMs').value) || 0),
  enabledUrls: document.getElementById('enabledUrls').value.trim(),
  selectWaitOptions: document.getElementById('selectWaitOptions').checked
});

const writeForm = (settings) => {
  document.getElementById('delayMs').value = settings.delayMs;
  document.getElementById('enabledUrls').value = settings.enabledUrls || '';
  document.getElementById('selectWaitOptions').checked = settings.selectWaitOptions;
};

const loadSettings = async () => {
  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    writeForm(settings);
    setStatus(message('optionsLoaded'));
  } catch (error) {
    console.error('Failed to load settings:', error);
    writeForm(DEFAULT_SETTINGS);
    setStatus(message('optionsLoadFailed'));
  }
};

let autoSaveTimer;

const saveSettings = async () => {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = undefined;
  await chrome.storage.sync.set(readForm());
  setStatus(message('optionsSaved'));
};

const scheduleSave = () => {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveSettings, 400);
};

const enabledUrlsInput = document.getElementById('enabledUrls');
const delayInput = document.getElementById('delayMs');
const waitOptionsInput = document.getElementById('selectWaitOptions');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveSettings();
});

enabledUrlsInput.addEventListener('input', scheduleSave);
delayInput.addEventListener('input', scheduleSave);
enabledUrlsInput.addEventListener('change', saveSettings);
delayInput.addEventListener('change', saveSettings);
waitOptionsInput.addEventListener('change', saveSettings);

window.addEventListener('pagehide', () => {
  if (!autoSaveTimer) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = undefined;
  chrome.storage.sync.set(readForm());
});

document.getElementById('exportButton').addEventListener('click', async () => {
  const toml = settingsToToml(readForm());
  const url = URL.createObjectURL(new Blob([toml], { type: 'application/toml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tabby-paste-settings.toml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(message('optionsExported'));
});

const importFile = document.getElementById('importFile');

document.getElementById('importButton').addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;

  try {
    const imported = parseSettingsToml(await file.text());
    const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const settings = { ...current, ...imported };
    await chrome.storage.sync.set(settings);
    writeForm(settings);
    setStatus(message('optionsImported'));
  } catch (error) {
    console.error('TOML import failed:', error);
    setStatus(message('optionsImportFailed'));
  } finally {
    importFile.value = '';
  }
});

window.addEventListener('focus', loadCurrentShortcut);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadCurrentShortcut();
});

localize();
setupBrowserSettingsLinks();
loadSettings();
loadCurrentShortcut();
