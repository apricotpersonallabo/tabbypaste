const message = (key) => chrome.i18n.getMessage(key) || key;

const localize = () => {
  const locale = chrome.i18n.getUILanguage();
  if (locale) document.documentElement.lang = locale.replace(/_/g, '-');

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const text = chrome.i18n.getMessage(element.dataset.i18n);
    if (text) element.textContent = text;
  });

  document.title = message('welcomePageTitle');
};

const loadCurrentShortcut = async () => {
  const shortcutElement = document.getElementById('currentShortcut');

  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find(item => item.name === 'auto_paste');
    shortcutElement.textContent = command?.shortcut || message('welcomeShortcutNotSet');
  } catch (error) {
    console.error('Failed to load the keyboard shortcut:', error);
    shortcutElement.textContent = message('welcomeShortcutUnavailable');
  }
};

document.getElementById('settingsButton').addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
  } catch (error) {
    console.error('Failed to open the settings page:', error);
  }
});

document.getElementById('closeButton').addEventListener('click', () => {
  window.close();
});

localize();
loadCurrentShortcut();
