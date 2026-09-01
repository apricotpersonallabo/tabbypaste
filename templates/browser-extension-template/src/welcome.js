const localize = () => {
  document.documentElement.lang = chrome.i18n.getUILanguage().replace('_', '-');
  const extensionName = chrome.i18n.getMessage('extName');

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  }

  document.title = chrome.i18n.getMessage('welcomePageTitle', extensionName);
  const version = chrome.runtime.getManifest().version;
  document.getElementById('version').textContent = chrome.i18n.getMessage('welcomeVersion', version);
};

document.getElementById('openSettings').addEventListener('click', async () => {
  await chrome.runtime.openOptionsPage();
});

document.getElementById('closeWelcome').addEventListener('click', () => {
  window.close();
});

localize();
