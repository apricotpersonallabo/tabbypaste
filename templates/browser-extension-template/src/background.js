const DEFAULT_SETTINGS = Object.freeze({ enabled: true });

const initializeExtension = async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(current);
  await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;
  initializeExtension().catch(console.error);
});
