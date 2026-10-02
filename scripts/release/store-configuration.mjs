export const STORE_CONFIGURATION_STATES = Object.freeze({
  DISABLED: 'disabled',
  ENABLED: 'enabled'
});

export const classifyStoreConfiguration = (values) => {
  const configured = values.filter(value => typeof value === 'string' && value.trim()).length;

  if (configured === 0) return STORE_CONFIGURATION_STATES.DISABLED;
  if (configured === values.length) return STORE_CONFIGURATION_STATES.ENABLED;
  throw new Error(`Store configuration is incomplete (${configured}/${values.length} values set).`);
};
