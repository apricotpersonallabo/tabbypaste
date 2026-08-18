export const CHROME_ITEM_STATES = Object.freeze({
  PENDING_REVIEW: 'PENDING_REVIEW'
});

export const getChromePublishState = (result) => (
  typeof result?.state === 'string' ? result.state : ''
);

export const assertChromePublishSubmitted = (result) => {
  if (getChromePublishState(result) !== CHROME_ITEM_STATES.PENDING_REVIEW) {
    throw new Error(`Chrome publish did not enter review: ${JSON.stringify(result)}`);
  }
};

export const getChromePublishWarnings = (result) => {
  if (!Array.isArray(result?.warningInfo?.warnings)) return [];

  return result.warningInfo.warnings.filter(warning => (
    warning
    && typeof warning === 'object'
    && (typeof warning.reason === 'string' || typeof warning.description === 'string')
  ));
};

const findErrorDetail = (body, typeName) => {
  const details = body?.error?.details;
  if (!Array.isArray(details)) return undefined;
  return details.find(detail => (
    typeof detail?.['@type'] === 'string'
    && detail['@type'].endsWith(`/${typeName}`)
  ));
};

export const formatChromePublishError = (body) => {
  const errorInfo = findErrorDetail(body, 'google.rpc.ErrorInfo');
  if (errorInfo?.reason !== 'INVALID_ITEM_METADATA') return '';

  const localizedMessage = findErrorDetail(body, 'google.rpc.LocalizedMessage')?.message;
  const message = localizedMessage || body?.error?.message || 'Chrome Web Store item metadata is invalid.';
  const help = findErrorDetail(body, 'google.rpc.Help');
  const helpUrl = Array.isArray(help?.links)
    ? help.links.find(link => typeof link?.url === 'string')?.url
    : undefined;

  const guidance = 'Complete and save every required field in the Chrome Web Store Developer Dashboard, including permission justifications in Privacy practices.';
  return [
    `${message} (reason: INVALID_ITEM_METADATA).`,
    guidance,
    helpUrl ? `Edit item: ${helpUrl}` : ''
  ].filter(Boolean).join(' ');
};
