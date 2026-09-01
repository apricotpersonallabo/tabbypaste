import { createChromiumBrowser } from './support/browsers.mjs';
import { registerExtensionContract } from './support/contract.mjs';

registerExtensionContract({
  browserName: 'Chromium',
  createBrowser: createChromiumBrowser
});
