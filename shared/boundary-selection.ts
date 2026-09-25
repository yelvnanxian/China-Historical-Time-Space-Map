export interface BoundarySelectionRequest {
  id: string;
  requestId: number;
  focus?: boolean;
  quiet?: boolean;
}

export interface BoundaryRequestState {
  key: string;
  resetKey: string | undefined;
  datasetId: string | undefined;
  completed: boolean;
}

/** Cancel a pending old target when another selection resets the map. A new
 * request in the same update belongs to that new selection and must survive. */
export function resolveBoundarySelectionRequest(previous: BoundaryRequestState | undefined, input: {
  request: BoundarySelectionRequest | undefined;
  resetKey: string | undefined;
  datasetId: string | undefined;
  dataReady: boolean;
  interactive: boolean;
  targetExists: boolean;
}): { state: BoundaryRequestState | undefined; apply?: BoundarySelectionRequest; clearSelection?: boolean } {
  if (!input.request) return { state: undefined };
  const key = `${input.request.id}:${input.request.requestId}`;
  const same = previous?.key === key;
  if (same && previous.completed) return { state: previous };
  const state: BoundaryRequestState = { key, resetKey: input.resetKey, datasetId: input.datasetId, completed: false };
  if (same && (previous.resetKey !== input.resetKey || previous.datasetId !== undefined && previous.datasetId !== input.datasetId)) {
    return { state: { ...state, completed: true } };
  }
  if (!input.dataReady || !input.interactive) return { state };
  if (!input.targetExists) return { state: { ...state, completed: true }, clearSelection: true };
  return { state: { ...state, completed: true }, apply: input.request };
}
