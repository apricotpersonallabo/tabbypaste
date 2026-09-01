import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import {
  assertChromeUploadSucceeded,
  CHROME_UPLOAD_STATES,
  getChromeUploadState
} from './chrome-upload-state.mjs';
import {
  assertChromePublishSubmitted,
  formatChromePublishError,
  getChromePublishWarnings
} from './chrome-publish-state.mjs';
import { EDGE_OPERATION_STATES, getEdgeOperationState } from './edge-operation-state.mjs';

const API_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120;

const [store, packageArgument] = process.argv.slice(2);

if (!['chrome', 'edge'].includes(store) || !packageArgument) {
  throw new Error('Usage: node scripts/submit-store.mjs <chrome|edge> <package.zip>');
}

const packagePath = resolve(packageArgument);
const packageBytes = await readFile(packagePath);

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${name}`);
  return value;
};

const sleep = (milliseconds) => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

const request = async (url, options = {}, errorFormatter) => {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(API_TIMEOUT_MS)
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const formattedError = errorFormatter?.(body);
    const detail = formattedError || (typeof body === 'string' ? body : JSON.stringify(body));
    throw new Error(`${options.method ?? 'GET'} ${url} failed (${response.status}): ${detail}`);
  }

  return { response, body };
};

const submitChrome = async () => {
  const clientId = requiredEnvironment('CHROME_CLIENT_ID');
  const clientSecret = requiredEnvironment('CHROME_CLIENT_SECRET');
  const refreshToken = requiredEnvironment('CHROME_REFRESH_TOKEN');
  const publisherId = requiredEnvironment('CHROME_PUBLISHER_ID');
  const extensionId = requiredEnvironment('CHROME_EXTENSION_ID');

  console.log(`Uploading ${basename(packagePath)} to Chrome Web Store...`);

  const tokenParameters = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const { body: tokenResult } = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParameters
  });
  const accessToken = tokenResult?.access_token;
  if (!accessToken) throw new Error('Chrome OAuth response did not contain an access token.');

  const itemPath = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/${itemPath}:upload`;
  const statusUrl = `https://chromewebstore.googleapis.com/v2/${itemPath}:fetchStatus`;
  const publishUrl = `https://chromewebstore.googleapis.com/v2/${itemPath}:publish`;
  const authorization = { Authorization: `Bearer ${accessToken}` };

  let { body: uploadResult } = await request(uploadUrl, {
    method: 'POST',
    headers: {
      ...authorization,
      'Content-Type': 'application/zip'
    },
    body: packageBytes
  });

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const uploadState = getChromeUploadState(uploadResult);
    if (uploadState !== CHROME_UPLOAD_STATES.IN_PROGRESS) break;
    console.log(`Chrome upload is still processing (${attempt}/${MAX_POLL_ATTEMPTS}).`);
    await sleep(POLL_INTERVAL_MS);
    ({ body: uploadResult } = await request(statusUrl, { headers: authorization }));
  }

  assertChromeUploadSucceeded(uploadResult);

  const { body: publishResult } = await request(publishUrl, {
    method: 'POST',
    headers: authorization
  }, formatChromePublishError);

  assertChromePublishSubmitted(publishResult);
  for (const warning of getChromePublishWarnings(publishResult)) {
    const reason = typeof warning.reason === 'string' ? `${warning.reason}: ` : '';
    console.warn(`Chrome publish warning: ${reason}${warning.description ?? ''}`);
  }

  const version = typeof uploadResult?.crxVersion === 'string'
    ? ` version ${uploadResult.crxVersion}`
    : '';
  console.log(`Chrome Web Store${version} entered the review queue (state=${publishResult.state}).`);
};

const submitEdge = async () => {
  const clientId = requiredEnvironment('EDGE_CLIENT_ID');
  const apiKey = requiredEnvironment('EDGE_API_KEY');
  const productId = requiredEnvironment('EDGE_PRODUCT_ID');
  const publishNotes = process.env.EDGE_PUBLISH_NOTES?.trim()
    || `Automated submission of ${basename(packagePath)} from GitHub Actions.`;
  const apiRoot = 'https://api.addons.microsoftedge.microsoft.com/v1';
  const productPath = `${apiRoot}/products/${encodeURIComponent(productId)}/submissions`;
  const authorization = {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId
  };

  const pollOperation = async (url, label) => {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      const { body } = await request(url, { headers: authorization });
      const status = getEdgeOperationState(body);

      if (status === EDGE_OPERATION_STATES.SUCCEEDED) {
        console.log(`${label} succeeded.`);
        return;
      }
      if (status === EDGE_OPERATION_STATES.FAILED) {
        throw new Error(`${label} failed: ${JSON.stringify(body)}`);
      }
      if (status !== EDGE_OPERATION_STATES.IN_PROGRESS) {
        throw new Error(`${label} returned an unknown status: ${JSON.stringify(body)}`);
      }

      console.log(`${label} is still processing (${attempt}/${MAX_POLL_ATTEMPTS}).`);
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`${label} did not finish within the polling limit.`);
  };

  console.log(`Uploading ${basename(packagePath)} to Microsoft Edge Add-ons...`);
  const { response: uploadResponse } = await request(`${productPath}/draft/package`, {
    method: 'POST',
    headers: {
      ...authorization,
      'Content-Type': 'application/zip'
    },
    body: packageBytes
  });
  if (uploadResponse.status !== 202) {
    throw new Error(`Edge upload returned ${uploadResponse.status}; expected 202.`);
  }
  const uploadOperationId = uploadResponse.headers.get('location');
  if (!uploadOperationId) throw new Error('Edge upload response did not contain an operation ID.');
  await pollOperation(
    `${productPath}/draft/package/operations/${encodeURIComponent(uploadOperationId)}`,
    'Edge package upload'
  );

  const { response: publishResponse } = await request(productPath, {
    method: 'POST',
    headers: {
      ...authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ notes: publishNotes })
  });
  if (publishResponse.status !== 202) {
    throw new Error(`Edge publish returned ${publishResponse.status}; expected 202.`);
  }
  const publishOperationId = publishResponse.headers.get('location');
  if (!publishOperationId) throw new Error('Edge publish response did not contain an operation ID.');
  await pollOperation(
    `${productPath}/operations/${encodeURIComponent(publishOperationId)}`,
    'Edge review submission'
  );
  console.log('Microsoft Edge Add-ons update was submitted for review.');
};

if (store === 'chrome') {
  await submitChrome();
} else {
  await submitEdge();
}
