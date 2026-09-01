import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Builder, By, logging, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';

import {
  CHROMIUM_EXTENSION_ID,
  FIREFOX_ADDON_ID,
  FIREFOX_EXTENSION_UUID
} from '../../../scripts/e2e-configuration.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..', '..');
const e2eRoot = resolve(projectRoot, 'build', 'e2e');

const loggingPreferences = () => {
  const preferences = new logging.Preferences();
  preferences.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  return preferences;
};

const prepareBrowserWindow = async (driver, extensionOrigin) => {
  await driver.get(`${extensionOrigin}/options.html`);
  await driver.wait(until.elementLocated(By.id('optionsForm')), 10_000);
  const testWindow = await driver.getWindowHandle();
  for (const handle of await driver.getAllWindowHandles()) {
    if (handle === testWindow) continue;
    await driver.switchTo().window(handle);
    await driver.close();
  }
  await driver.switchTo().window(testWindow);
};

export const createChromiumBrowser = async () => {
  const extensionRoot = '/workspace/build/e2e/chromium';
  const options = new chrome.Options()
    .setAcceptInsecureCerts(true)
    .setLoggingPrefs(loggingPreferences())
    .addArguments(
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--disable-search-engine-choice-screen',
      '--no-default-browser-check',
      '--no-first-run'
    );

  const driver = await new Builder()
    .forBrowser('chrome')
    .usingServer(process.env.SELENIUM_CHROMIUM_URL || 'http://chromium:4444/wd/hub')
    .setChromeOptions(options)
    .build();

  const extensionOrigin = `chrome-extension://${CHROMIUM_EXTENSION_ID}`;
  await prepareBrowserWindow(driver, extensionOrigin);

  return {
    driver,
    extensionOrigin
  };
};

export const createFirefoxBrowser = async () => {
  const options = new firefox.Options()
    .setAcceptInsecureCerts(true)
    .setLoggingPrefs(loggingPreferences())
    .setPreference('extensions.webextensions.uuids', JSON.stringify({
      [FIREFOX_ADDON_ID]: FIREFOX_EXTENSION_UUID
    }));

  const driver = await new Builder()
    .forBrowser('firefox')
    .usingServer(process.env.SELENIUM_FIREFOX_URL || 'http://firefox:4444/wd/hub')
    .setFirefoxOptions(options)
    .build();

  const metadata = JSON.parse(await readFile(resolve(e2eRoot, 'metadata.json'), 'utf8'));
  const installedId = await driver.installAddon(metadata.firefox.xpi, true);
  if (installedId !== FIREFOX_ADDON_ID) {
    await driver.quit();
    throw new Error(`Firefox installed unexpected add-on ID: ${installedId}`);
  }

  const extensionOrigin = `moz-extension://${FIREFOX_EXTENSION_UUID}`;
  await prepareBrowserWindow(driver, extensionOrigin);

  return {
    driver,
    extensionOrigin
  };
};
