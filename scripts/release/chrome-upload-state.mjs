export const CHROME_UPLOAD_STATES = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCEEDED: 'SUCCEEDED'
});

export const getChromeUploadState = (result) => {
  if (typeof result?.uploadState === 'string') return result.uploadState;
  if (typeof result?.lastAsyncUploadState === 'string') return result.lastAsyncUploadState;
  return '';
};

export const assertChromeUploadSucceeded = (result) => {
  if (getChromeUploadState(result) !== CHROME_UPLOAD_STATES.SUCCEEDED) {
    throw new Error(`Chrome upload did not succeed: ${JSON.stringify(result)}`);
  }
};
