const DEFAULT_SETTINGS = {
  delayMs: 0,
  selectValueFirst: true,
  selectAllowContainsFallback: true,
  selectVerifyAndRetry: true,
  selectWaitOptions: true
};

const form = document.getElementById('optionsForm');
const statusEl = document.getElementById('status');

const message = (key) => chrome.i18n.getMessage(key) || key;

const setStatus = (text) => {
  statusEl.textContent = text;
  if (!text) return;
  setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = '';
  }, 1800);
};

const localize = () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const text = message(el.dataset.i18n);
    if (text) el.textContent = text;
  });
  document.title = message('optionsTitle');
};

const readForm = () => ({
  delayMs: Math.max(0, Number(document.getElementById('delayMs').value) || 0),
  selectValueFirst: document.getElementById('selectValueFirst').checked,
  selectAllowContainsFallback: document.getElementById('selectAllowContainsFallback').checked,
  selectVerifyAndRetry: document.getElementById('selectVerifyAndRetry').checked,
  selectWaitOptions: document.getElementById('selectWaitOptions').checked
});

const writeForm = (settings) => {
  document.getElementById('delayMs').value = settings.delayMs;
  document.getElementById('selectValueFirst').checked = settings.selectValueFirst;
  document.getElementById('selectAllowContainsFallback').checked = settings.selectAllowContainsFallback;
  document.getElementById('selectVerifyAndRetry').checked = settings.selectVerifyAndRetry;
  document.getElementById('selectWaitOptions').checked = settings.selectWaitOptions;
};

const loadSettings = async () => {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  writeForm(settings);
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set(readForm());
  setStatus(message('optionsSaved'));
});

document.getElementById('resetButton').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  writeForm(DEFAULT_SETTINGS);
  setStatus(message('optionsResetDone'));
});

localize();
loadSettings();
