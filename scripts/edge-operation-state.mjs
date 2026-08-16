export const EDGE_OPERATION_STATES = Object.freeze({
  FAILED: 'Failed',
  IN_PROGRESS: 'InProgress',
  SUCCEEDED: 'Succeeded'
});

export const getEdgeOperationState = (result) => (
  typeof result?.status === 'string' ? result.status : ''
);
