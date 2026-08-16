export const validateVersion = (version) => {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
    throw new Error(`Invalid browser extension version: ${version}`);
  }

  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535)) {
    throw new Error(`Version components must not exceed 65535: ${version}`);
  }

  return parts;
};

export const incrementVersion = (version) => {
  const parts = validateVersion(version);
  while (parts.length < 3) parts.push(0);

  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index] < 65535) {
      parts[index]++;
      return parts.join('.');
    }
    parts[index] = 0;
  }

  throw new Error(`Version cannot be incremented further: ${version}`);
};

export const assertVersionsSynchronized = (expectedVersion, manifests) => {
  validateVersion(expectedVersion);

  for (const { label, version } of manifests) {
    validateVersion(version);
    if (version !== expectedVersion) {
      throw new Error(`${label} version ${version} does not match version.json ${expectedVersion}.`);
    }
  }
};
