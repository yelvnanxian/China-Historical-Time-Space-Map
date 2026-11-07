const jsonRequests = new Map<string, Promise<unknown>>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`JSON request failed (${response.status}): ${url}`);
  return response.json();
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

export function loadJson<T>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const signal = options.signal;
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  let request = jsonRequests.get(url);
  if (!request) {
    const pending: Promise<unknown> = fetchJson(url).catch(error => {
      if (jsonRequests.get(url) === pending) jsonRequests.delete(url);
      throw error;
    });
    jsonRequests.set(url, pending);
    request = pending;
  }
  if (!signal) return request as Promise<T>;

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    request.then(value => {
      signal.removeEventListener('abort', onAbort);
      resolve(value as T);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}

export function evictJson(url: string): void {
  jsonRequests.delete(url);
}
