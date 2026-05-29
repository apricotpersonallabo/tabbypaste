document.getElementById('manualLink').textContent =
  chrome.i18n.getMessage('userManual') || 'User manual';

document.getElementById('optionsButton').textContent =
  chrome.i18n.getMessage('optionsTitle') || 'Settings';

document.getElementById('optionsButton').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
