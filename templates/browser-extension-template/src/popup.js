const localize = () => {
  document.documentElement.lang = chrome.i18n.getUILanguage().replace('_', '-');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  }
  document.title = chrome.i18n.getMessage('extName');
};

const initialize = async () => {
  localize();

  const enabled = document.getElementById('enabled');
  const { enabled: savedEnabled } = await chrome.storage.sync.get({ enabled: true });
  enabled.checked = savedEnabled;

  enabled.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: enabled.checked });
  });

  document.getElementById('openOptions').addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage();
  });
};

initialize().catch(console.error);
