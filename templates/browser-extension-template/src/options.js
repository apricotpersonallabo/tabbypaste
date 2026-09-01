const localize = () => {
  document.documentElement.lang = chrome.i18n.getUILanguage().replace('_', '-');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  }
  document.title = chrome.i18n.getMessage('optionsTitle');
};

const initialize = async () => {
  localize();

  const enabled = document.getElementById('enabled');
  const status = document.getElementById('status');
  const { enabled: savedEnabled } = await chrome.storage.sync.get({ enabled: true });
  enabled.checked = savedEnabled;

  document.getElementById('optionsForm').addEventListener('submit', async event => {
    event.preventDefault();
    await chrome.storage.sync.set({ enabled: enabled.checked });
    status.textContent = chrome.i18n.getMessage('saved');
  });
};

initialize().catch(console.error);
