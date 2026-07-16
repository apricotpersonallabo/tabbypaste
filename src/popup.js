const enabledToggle = document.getElementById('extensionEnabled');
const toggleStatus = document.getElementById('toggleStatus');
const toggleRow = document.querySelector('.toggle-row');

document.getElementById('toggleLabel').textContent =
  chrome.i18n.getMessage('popupEnableExtension') || 'Enable extension';

const renderAvailability = ({ urlMatches, extensionEnabled }) => {
  enabledToggle.disabled = !urlMatches;
  enabledToggle.checked = urlMatches && extensionEnabled;
  toggleRow.classList.toggle('disabled', !urlMatches);

  if (!urlMatches) {
    toggleStatus.textContent =
      chrome.i18n.getMessage('popupUrlNotEnabled') || 'Disabled for this URL';
    return;
  }

  toggleStatus.textContent = extensionEnabled
    ? (chrome.i18n.getMessage('popupExtensionOn') || 'Enabled')
    : (chrome.i18n.getMessage('popupExtensionOff') || 'Disabled');
};

const refreshAvailability = async () => {
  const availability = await chrome.runtime.sendMessage({
    type: 'getActiveTabAvailability'
  });
  renderAvailability(availability);
};

enabledToggle.addEventListener('change', async () => {
  const extensionEnabled = enabledToggle.checked;
  await chrome.storage.sync.set({ extensionEnabled });
  await refreshAvailability();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.enabledUrls || changes.extensionEnabled)) {
    refreshAvailability().catch(console.error);
  }
});

document.getElementById('optionsButton').textContent =
  chrome.i18n.getMessage('optionsTitle') || 'Settings';

document.getElementById('optionsButton').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  window.close();
});

refreshAvailability().catch(console.error);
