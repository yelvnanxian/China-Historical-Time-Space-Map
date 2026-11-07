let resourceVersions: Readonly<Record<string, string>> = {};

export function configureResourceVersions(versions: Readonly<Record<string, string>>): void {
  resourceVersions = Object.freeze({ ...versions });
}

export function resourceUrl(url: string): string {
  if (!globalThis.location?.href) return url;
  let resolved: URL;
  try {
    resolved = new URL(url, globalThis.location.href);
  } catch {
    return url;
  }
  if (resolved.origin !== globalThis.location.origin || !resolved.pathname.startsWith('/data/')
    || resolved.searchParams.has('v')) return url;
  const version = resourceVersions[resolved.pathname];
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) return url;
  resolved.search += `${resolved.search ? '&' : '?'}v=${version}`;
  return url.startsWith('/') && !url.startsWith('//') ? resolved.pathname + resolved.search + resolved.hash : resolved.href;
}

export function fetchResource(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let target: RequestInfo;
  if (typeof input === 'string') target = resourceUrl(input);
  else if (input instanceof URL) target = resourceUrl(input.href);
  else {
    const url = resourceUrl(input.url);
    target = url === input.url ? input : new Request(url, input);
  }
  return init === undefined ? fetch(target) : fetch(target, init);
}
