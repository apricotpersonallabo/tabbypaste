import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { By, logging, until } from 'selenium-webdriver';

const projectRoot = resolve(import.meta.dirname, '..', '..', '..');
const resultsRoot = resolve(projectRoot, 'artifacts', 'test-results', 'e2e');
const baseUrl = process.env.E2E_BASE_URL || 'https://tests:4173';
const httpBaseUrl = process.env.E2E_HTTP_BASE_URL || 'http://tests:4174';
const defaultSettings = {
  delayMs: 0,
  enabledUrls: '',
  extensionEnabled: true,
  selectWaitOptions: true
};

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

const waitForExtensionPage = async (driver, extensionOrigin) => {
  await driver.get(`${extensionOrigin}/options.html`);
  await driver.wait(until.elementLocated(By.id('optionsForm')), 15_000);
};

const replaceInput = async (element, value) => {
  await element.clear();
  if (value !== '') await element.sendKeys(value);
};

const readStorage = driver => driver.executeAsyncScript(done => {
  chrome.storage.sync.get(null, values => done(values));
});

const writeStorage = (driver, settings) => driver.executeAsyncScript((values, done) => {
  chrome.storage.sync.set(values, () => done(chrome.runtime.lastError?.message || null));
}, settings);

const resetStorage = async (driver, extensionOrigin) => {
  await waitForExtensionPage(driver, extensionOrigin);
  const error = await driver.executeAsyncScript((settings, done) => {
    chrome.storage.sync.clear(() => {
      if (chrome.runtime.lastError) {
        done(chrome.runtime.lastError.message);
        return;
      }
      chrome.storage.sync.set(settings, () => done(chrome.runtime.lastError?.message || null));
    });
  }, defaultSettings);
  assert.equal(error, null);
};

const copyFromFixture = async (driver, buttonId) => {
  await driver.findElement(By.id(buttonId)).click();
  await driver.wait(async () => (
    await driver.findElement(By.id('clipboardStatus')).getText()
  ) === 'copied', 5_000);
};

const sendExtensionShortcut = async shortcutUrl => {
  const response = await fetch(shortcutUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Shortcut controller returned ${response.status}: ${await response.text()}`);
  }
};

const waitForValue = async (driver, id, expected) => {
  const element = await driver.findElement(By.id(id));
  await driver.wait(async () => (await element.getAttribute('value')) === expected, 10_000);
  return element;
};

const observeFocusBeforeInput = driver => driver.executeScript(() => {
  const field = document.getElementById('textField');
  const state = { fieldBlurs: 0, windowBlurs: 0, firstInput: null };
  window.clipboardFocusState = state;
  field.addEventListener('blur', () => { if (!state.firstInput) state.fieldBlurs++; });
  window.addEventListener('blur', () => { if (!state.firstInput) state.windowBlurs++; });
  field.addEventListener('input', () => {
    const framePath = [];
    let doc = window.top.document;
    while (doc.activeElement?.matches('iframe, frame')) {
      framePath.push(doc.activeElement.id);
      doc = doc.activeElement.contentDocument;
    }
    state.firstInput = {
      activeId: document.activeElement.id,
      hasFocus: document.hasFocus(),
      framePath,
      fieldBlurs: state.fieldBlurs,
      windowBlurs: state.windowBlurs
    };
  }, { once: true });
});

const assertFocusBeforeInput = async (driver, framePath) => {
  assert.deepEqual(await driver.executeScript('return window.clipboardFocusState.firstInput'), {
    activeId: 'textField', hasFocus: true, framePath, fieldBlurs: 0, windowBlurs: 0
  });
};

const assertStableEmpty = async (driver, id) => {
  const element = await driver.findElement(By.id(id));
  await driver.wait(async () => (await element.getAttribute('value')) === '', 1_000);
  const start = Date.now();
  while (Date.now() - start < 500) {
    assert.equal(await element.getAttribute('value'), '');
    await driver.sleep(50);
  }
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

export const registerExtensionContract = ({ browserName, createBrowser }) => {
  test(`${browserName} extension E2E`, { timeout: 180_000 }, async t => {
    const { driver, extensionOrigin, shortcutUrl } = await createBrowser();
    t.after(async () => {
      await driver.quit();
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'fills eligible controls through the real shortcut', async () => {
      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyHappy');
      await driver.findElement(By.id('textField')).click();
      await sendExtensionShortcut(shortcutUrl);

      await waitForValue(driver, 'textField', 'Alpha');
      await waitForValue(driver, 'passwordField', 'S3cret');
      await waitForValue(driver, 'textareaField', 'Long note');
      await waitForValue(driver, 'selectField', 'eng');
      for (const id of ['hiddenField', 'disabledField', 'readonlyField']) {
        assert.equal(await driver.findElement(By.id(id)).getAttribute('value'), '');
      }

      const events = await driver.executeScript('return window.fixtureEvents');
      assert.ok(events.textField.input >= 5);
      assert.equal(events.textField.change, 1);
      assert.ok(events.passwordField.input >= 6);
      assert.equal(events.textareaField.change, 1);
      assert.equal(events.selectField.change, 1);
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'waits for and prefix-matches dynamic select options', async () => {
      await driver.get(`${baseUrl}/dynamic.html`);
      await copyFromFixture(driver, 'copyDynamic');
      await driver.findElement(By.id('dynamicText')).click();
      await sendExtensionShortcut(shortcutUrl);

      await waitForValue(driver, 'dynamicText', 'Dynamic');
      await waitForValue(driver, 'dynamicSelect', 'eng');
    });

    const frameCases = [
      { page: 'frames.html', framePath: ['formFrame'] },
      { page: 'frames.html', framePath: ['nestedFrame', 'innerFrame'], containerField: true },
      { page: 'frames.html', framePath: ['inlineFrame'] },
      { page: 'legacy-frames.html', framePath: ['formFrame'] },
      { page: 'legacy-frames.html', framePath: ['nestedFrame', 'innerFrame'] },
      { page: 'legacy-frames.html', framePath: ['nestedFrame', 'mixedFrame', 'innerFrame'], containerField: true }
    ];
    for (const { page, framePath, containerField } of frameCases) {
      const legacy = page === 'legacy-frames.html';
      await runScenario(t, driver, extensionOrigin, browserName, `fills only the focused frame: ${page}/${framePath.join('/')}`, async () => {
        await driver.get(`${baseUrl}/${page}`);
        if (legacy) await driver.switchTo().frame(await driver.findElement(By.id('siblingFrame')));
        await copyFromFixture(driver, 'copyHappy');
        await driver.switchTo().defaultContent();
        // Leave a stale activeElement in a sibling document before focusing the target.
        await driver.switchTo().frame(await driver.findElement(By.id('siblingFrame')));
        await driver.findElement(By.id('textField')).click();
        await driver.switchTo().defaultContent();
        for (const frameId of framePath) {
          const frame = await driver.findElement(By.id(frameId));
          await driver.executeScript('arguments[0].scrollIntoView({ block: "center" })', frame);
          await driver.switchTo().frame(frame);
        }
        await driver.findElement(By.id('textField')).click();
        assert.equal(await driver.executeScript('return document.activeElement.id'), 'textField');
        await sendExtensionShortcut(shortcutUrl);

        await waitForValue(driver, 'textField', 'Alpha');
        await waitForValue(driver, 'passwordField', 'S3cret');
        await waitForValue(driver, 'textareaField', 'Long note');
        await waitForValue(driver, 'selectField', 'eng');
        assert.equal(await driver.findElements(By.id('tabby-paste-notification-host')).then(elements => elements.length), 0);

        if (containerField) {
          await driver.switchTo().parentFrame();
          assert.equal(await driver.findElement(By.id('containerField')).getAttribute('value'), '');
        }
        await driver.switchTo().defaultContent();
        if (!legacy) assert.equal(await driver.findElement(By.id('topField')).getAttribute('value'), '');
        else assert.equal(await driver.executeScript('return document.body.tagName'), 'FRAMESET');
        assert.equal(await driver.findElements(By.id('tabby-paste-notification-host')).then(elements => elements.length), 0);
        await driver.switchTo().frame(await driver.findElement(By.id('siblingFrame')));
        assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');
        await driver.switchTo().defaultContent();
      });
    }

    for (const { origin, page, framePath } of [
      { origin: httpBaseUrl, page: 'form.html', framePath: [] },
      { origin: httpBaseUrl, page: 'frames.html', framePath: ['nestedFrame', 'innerFrame'] },
      { origin: httpBaseUrl, page: 'legacy-frames.html', framePath: ['nestedFrame', 'mixedFrame', 'innerFrame'] },
      { origin: baseUrl, page: 'form.html?clipboardDenied', framePath: [] }
    ]) {
      await runScenario(t, driver, extensionOrigin, browserName, `preserves focus when the page cannot read clipboard: ${origin}/${page}/${framePath.join('/')}`, async () => {
        // Seed the system clipboard from HTTPS, then visit a real insecure origin.
        await driver.get(`${baseUrl}/form.html`);
        await copyFromFixture(driver, 'copyHappy');
        await driver.get(`${origin}/${page}`);
        for (const frameId of framePath) {
          const frame = await driver.findElement(By.id(frameId));
          await driver.executeScript('arguments[0].scrollIntoView({ block: "center" })', frame);
          await driver.switchTo().frame(frame);
        }
        if (origin === httpBaseUrl) {
          assert.equal(await driver.executeScript('return window.isSecureContext'), false);
          assert.equal(await driver.executeScript('return typeof navigator.clipboard'), 'undefined');
        }
        const handles = await driver.getAllWindowHandles();
        // A second invocation also exercises offscreen document recreation.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await driver.executeScript('document.getElementById("testForm").reset()');
          await driver.findElement(By.id('textField')).click();
          await observeFocusBeforeInput(driver);
          await sendExtensionShortcut(shortcutUrl);
          await waitForValue(driver, 'textField', 'Alpha');
          await waitForValue(driver, 'passwordField', 'S3cret');
          await waitForValue(driver, 'textareaField', 'Long note');
          await waitForValue(driver, 'selectField', 'eng');
          await assertFocusBeforeInput(driver, framePath);
          assert.deepEqual(await driver.getAllWindowHandles(), handles);
          assert.equal(await driver.findElements(By.id('tabby-paste-notification-host')).then(elements => elements.length), 0);
        }
        await driver.switchTo().defaultContent();
        if (framePath.length) {
          await driver.switchTo().frame(await driver.findElement(By.id('siblingFrame')));
          assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');
          await driver.switchTo().defaultContent();
        }
      });
    }

    await runScenario(t, driver, extensionOrigin, browserName, 'empty clipboard on HTTP preserves focus and leaves fields unchanged', async () => {
      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyEmpty');
      await driver.get(`${httpBaseUrl}/form.html`);
      await driver.findElement(By.id('textField')).click();
      await observeFocusBeforeInput(driver);
      await sendExtensionShortcut(shortcutUrl);
      await driver.wait(until.elementLocated(By.id('tabby-paste-notification-host')), 10_000);
      assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');
      assert.deepEqual(await driver.executeScript('return window.clipboardFocusState'), {
        fieldBlurs: 0, windowBlurs: 0, firstInput: null
      });
      assert.equal(await driver.executeScript('return document.activeElement.id'), 'textField');
      assert.equal(await driver.executeScript('return document.hasFocus()'), true);
    });

    for (const { origin, page, frameId, frameSuffix } of [
      { origin: baseUrl, page: 'frames.html', frameId: 'blockedClipboardFrame', frameSuffix: '?clipboardBlocked' },
      { origin: baseUrl, page: 'legacy-frames.html', frameId: 'formFrame', frameSuffix: '?legacyDirect' },
      { origin: httpBaseUrl, page: 'frames.html', frameId: 'blockedClipboardFrame', frameSuffix: '?clipboardBlocked' },
      { origin: httpBaseUrl, page: 'legacy-frames.html', frameId: 'formFrame', frameSuffix: '?legacyDirect' }
    ]) {
      await runScenario(t, driver, extensionOrigin, browserName, `reads clipboard without losing focus when injected directly into ${origin}/${page}/${frameId}`, async () => {
        await driver.get(`${baseUrl}/form.html`);
        await copyFromFixture(driver, 'copyHappy');
        await driver.get(`${origin}/${page}`);
        const legacy = page === 'legacy-frames.html';
        if (legacy) await driver.switchTo().frame(await driver.findElement(By.id(frameId)));
        await driver.executeScript('document.getElementById("copyHappy").focus()');
        // Grant activeTab as a real context-menu invocation would, without filling a field.
        await sendExtensionShortcut(shortcutUrl);
        await driver.wait(until.elementLocated(By.id('tabby-paste-notification-host')), 10_000);
        await driver.executeScript("document.getElementById('tabby-paste-notification-host').remove()");
        await driver.switchTo().defaultContent();
        const pageHandle = await driver.getWindowHandle();

        await driver.switchTo().newWindow('tab');
        try {
          await waitForExtensionPage(driver, extensionOrigin);
          const error = await driver.executeAsyncScript(async (pageUrl, frameSuffix, done) => {
            try {
              const tabs = await chrome.tabs.query({});
              const tab = tabs.find(tab => tab.url === pageUrl);
              const frames = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: () => location.href
              });
              const frame = frames.find(frame => frame.result.endsWith(frameSuffix));
              if (!frame) throw new Error(`Destination frame not found: ${frameSuffix}`);
              // Keep the extension page open while restoring focus to the destination tab.
              const target = { tabId: tab.id, frameIds: [frame.frameId] };
              const deadline = Date.now() + 10_000;
              const injectWhenFocused = async () => {
                const focus = await chrome.scripting.executeScript({
                  target,
                  func: () => document.hasFocus() && document.activeElement?.id === 'textField'
                });
                if (focus.some(frame => frame.result)) {
                  await chrome.scripting.executeScript({ target, files: ['filler.js'] });
                } else if (Date.now() < deadline) {
                  setTimeout(() => injectWhenFocused().catch(console.error), 50);
                }
              };
              injectWhenFocused().catch(console.error);
              done(null);
            } catch (error) {
              done(String(error));
            }
          }, `${origin}/${page}`, frameSuffix);
          assert.equal(error, null);
        } finally {
          // Closing this tab would cancel the scheduled injection.
          await driver.switchTo().window(pageHandle);
        }

        const frame = await driver.findElement(By.id(frameId));
        await driver.executeScript('arguments[0].scrollIntoView({ block: "center" })', frame);
        await driver.switchTo().frame(frame);
        await observeFocusBeforeInput(driver);
        await driver.findElement(By.id('textField')).click();
        await waitForValue(driver, 'textField', 'Alpha');
        await waitForValue(driver, 'passwordField', 'S3cret');
        await waitForValue(driver, 'textareaField', 'Long note');
        await waitForValue(driver, 'selectField', 'eng');
        await assertFocusBeforeInput(driver, [frameId]);
        assert.equal(await driver.findElements(By.id('tabby-paste-notification-host')).then(elements => elements.length), 0);
        await driver.switchTo().defaultContent();
        if (!legacy) assert.equal(await driver.findElement(By.id('topField')).getAttribute('value'), '');
        await driver.switchTo().frame(await driver.findElement(By.id('siblingFrame')));
        assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');
        await driver.switchTo().defaultContent();

        for (const handle of await driver.getAllWindowHandles()) {
          if (handle === pageHandle) continue;
          await driver.switchTo().window(handle);
          await driver.close();
        }
        await driver.switchTo().window(pageHandle);
      });
    }

    await runScenario(t, driver, extensionOrigin, browserName, 'persists options through storage.sync', async () => {
      await waitForExtensionPage(driver, extensionOrigin);
      const enabledUrls = await driver.findElement(By.id('enabledUrls'));
      const delayMs = await driver.findElement(By.id('delayMs'));
      const waitOptions = await driver.findElement(By.id('selectWaitOptions'));
      await replaceInput(enabledUrls, `${baseUrl}/*`);
      await replaceInput(delayMs, '25');
      if (await waitOptions.isSelected()) await waitOptions.click();
      await driver.executeScript("document.getElementById('optionsForm').requestSubmit()");

      await driver.wait(async () => {
        const settings = await readStorage(driver);
        return settings.enabledUrls === `${baseUrl}/*`
          && settings.delayMs === 25
          && settings.selectWaitOptions === false;
      }, 10_000);

      await driver.navigate().refresh();
      await driver.wait(until.elementLocated(By.id('optionsForm')), 10_000);
      assert.equal(await driver.findElement(By.id('enabledUrls')).getAttribute('value'), `${baseUrl}/*`);
      assert.equal(await driver.findElement(By.id('delayMs')).getAttribute('value'), '25');
      assert.equal(await driver.findElement(By.id('selectWaitOptions')).isSelected(), false);

      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyHappy');
      await driver.findElement(By.id('textField')).click();
      const shortcutStartedAt = performance.now();
      await sendExtensionShortcut(shortcutUrl);
      await waitForValue(driver, 'textField', 'Alpha');
      assert.ok(performance.now() - shortcutStartedAt >= 20, 'the configured delay must affect form filling');
      await waitForValue(driver, 'selectField', 'eng');
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'honors URL and global enablement settings', async () => {
      await writeStorage(driver, { enabledUrls: 'https://outside.example/*' });
      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyHappy');
      await driver.findElement(By.id('textField')).click();
      await sendExtensionShortcut(shortcutUrl);
      await assertStableEmpty(driver, 'textField');

      await waitForExtensionPage(driver, extensionOrigin);
      await writeStorage(driver, { enabledUrls: '', extensionEnabled: false });
      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyHappy');
      await driver.findElement(By.id('textField')).click();
      await sendExtensionShortcut(shortcutUrl);
      await assertStableEmpty(driver, 'textField');
    });

    await runScenario(t, driver, extensionOrigin, browserName, 'shows warnings without changing form state', async () => {
      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyEmpty');
      await driver.findElement(By.id('textField')).click();
      await sendExtensionShortcut(shortcutUrl);
      await driver.wait(until.elementLocated(By.id('tabby-paste-notification-host')), 10_000);
      assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');

      await driver.get(`${baseUrl}/form.html`);
      await copyFromFixture(driver, 'copyHappy');
      await sendExtensionShortcut(shortcutUrl);
      await driver.wait(until.elementLocated(By.id('tabby-paste-notification-host')), 10_000);
      assert.equal(await driver.findElement(By.id('textField')).getAttribute('value'), '');

      await driver.get(`${baseUrl}/no-fields.html`);
      await copyFromFixture(driver, 'copyValue');
      await sendExtensionShortcut(shortcutUrl);
      await driver.wait(until.elementLocated(By.id('tabby-paste-notification-host')), 10_000);
    });
  });
};
