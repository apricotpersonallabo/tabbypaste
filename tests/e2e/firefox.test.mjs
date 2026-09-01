import { createFirefoxBrowser } from './support/browsers.mjs';
import { registerExtensionContract } from './support/contract.mjs';

registerExtensionContract({
  browserName: 'Firefox',
  createBrowser: createFirefoxBrowser
});
