import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { By, logging, until } from 'selenium-webdriver';

const projectRoot = resolve(import.meta.dirname, '..', '..', '..');
const resultsRoot = resolve(projectRoot, 'test-results', 'e2e');

const safeName = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const captureFailure = async (driver, browserName, scenarioName) => {
  await mkdir(resultsRoot, { recursive: true });
  const prefix = resolve(resultsRoot, `${safeName(browserName)}-${safeName(scenarioName)}`);
  const diagnostics = {};

  try {
    await writeFile(`${prefix}.png`, await driver.takeScreenshot(), 'base64');
  } catch (error) {
    diagnostics.screenshotError = String(error);
  }
  try {
    await writeFile(`${prefix}.html`, await driver.getPageSource(), 'utf8');
  } catch (error) {
    diagnostics.pageSourceError = String(error);
  }
  try {
    diagnostics.browserLogs = (await driver.manage().logs().get(logging.Type.BROWSER)).map(entry => ({
      level: entry.level.name,
      message: entry.message,
      timestamp: entry.timestamp
    }));
  } catch (error) {
    diagnostics.browserLogError = String(error);
  }
  await writeFile(`${prefix}.json`, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
};

const openExtensionPage = async (driver, extensionOrigin, page, readyElementId) => {
  await driver.get(`${extensionOrigin}/${page}`);
  await driver.wait(until.elementLocated(By.id(readyElementId)), 15_000);
};

const readStorage = driver => driver.executeAsyncScript(done => {
  chrome.storage.sync.get(null, values => done(values));
});

const writeStorage = (driver, values) => driver.executeAsyncScript((settings, done) => {
  chrome.storage.sync.set(settings, () => done(chrome.runtime.lastError?.message || null));
}, values);

const resetStorage = async (driver, extensionOrigin) => {
  await openExtensionPage(driver, extensionOrigin, 'options.html', 'optionsForm');
  const error = await driver.executeAsyncScript(done => {
    chrome.storage.sync.clear(() => {
      if (chrome.runtime.lastError) {
        done(chrome.runtime.lastError.message);
        return;
      }
      chrome.storage.sync.set({ enabled: true }, () => {
        done(chrome.runtime.lastError?.message || null);
      });
    });
  });
  assert.equal(error, null);
};

const runScenario = async (t, driver, extensionOrigin, browserName, name, callback) => {
  await t.test(name, async () => {
    await resetStorage(driver, extensionOrigin);
    try {
      await callback();
    } catch (error) {
      await captureFailure(driver, browserName, name);
      throw error;
    }
  });
};

const switchToOptionsPage = async (driver, extensionOrigin) => {
  await driver.wait(async () => {
    for (const handle of await driver.getAllWindowHandles()) {
      await driver.switchTo().window(handle);
      if (!(await driver.getCurrentUrl()).endsWith('/options.html')) continue;
      if ((await driver.findElements(By.id('optionsForm'))).length > 0) return true;
    }
    return false;
  }, 10_000);
};

export const registerExtensionContract = ({ browserName, createBrowser }) => {
  test(`${browserName} extension E2E`, { timeout: 120_000 }, async t => {
    const { driver, extensionOrigin } = await createBrowser();
    t.after(async () => {
      await driver.quit();
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'persists the enabled option', async () => {
      await openExtensionPage(driver, extensionOrigin, 'options.html', 'optionsForm');
      const enabled = await driver.findElement(By.id('enabled'));
      assert.equal(await enabled.isSelected(), true);
      await enabled.click();
      await driver.executeScript("document.getElementById('optionsForm').requestSubmit()");

      await driver.wait(async () => (await readStorage(driver)).enabled === false, 10_000);
      await driver.navigate().refresh();
      await driver.wait(until.elementLocated(By.id('optionsForm')), 10_000);
      assert.equal(await driver.findElement(By.id('enabled')).isSelected(), false);
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'synchronizes popup state through storage', async () => {
      assert.equal(await writeStorage(driver, { enabled: false }), null);
      await openExtensionPage(driver, extensionOrigin, 'popup.html', 'enabled');
      const enabled = await driver.findElement(By.id('enabled'));
      await driver.wait(async () => (await enabled.isSelected()) === false, 10_000);
      await enabled.click();
      await driver.wait(async () => (await readStorage(driver)).enabled === true, 10_000);
      assert.equal(await enabled.isSelected(), true);
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'renders welcome details and opens settings', async () => {
      await driver.switchTo().newWindow('tab');
      await openExtensionPage(driver, extensionOrigin, 'welcome.html', 'version');
      const manifestVersion = await driver.executeScript('return chrome.runtime.getManifest().version');
      assert.match(await driver.findElement(By.id('version')).getText(), new RegExp(manifestVersion.replaceAll('.', '\\.')));
      assert.ok((await driver.getTitle()).trim());
      assert.ok((await driver.findElement(By.css('h1')).getText()).trim());

      await driver.findElement(By.id('openSettings')).click();
      await switchToOptionsPage(driver, extensionOrigin);
      assert.ok((await driver.getCurrentUrl()).startsWith(extensionOrigin));
      assert.ok((await driver.getCurrentUrl()).endsWith('/options.html'));
    });
  });
};
