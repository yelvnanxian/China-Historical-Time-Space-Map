import type { RequestHandler, Response } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadVersions(directory: string): Map<string, string> {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(path.join(directory, 'content-versions.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid content versions manifest');
  const versions = new Map<string, string>();
  for (const [url, version] of Object.entries(document)) {
    if (!url.startsWith('/data/') || new URL(url, 'http://atlas.invalid').pathname !== url
      || typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new Error('Invalid content versions manifest entry');
    versions.set(url, version);
  }
  return versions;
}

export function versionedData(directory: string): RequestHandler {
  const versions = loadVersions(directory);
  return (request, response, next) => {
    response.locals.dataVersionVerified = false;
    const url = new URL(request.originalUrl, 'http://atlas.invalid');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.set('Cache-Control', 'no-store').status(400).json({ error: { code: 'INVALID_URL', message: '请求地址格式不正确。' } });
      return;
    }
    if (!pathname.startsWith('/data/') || !url.searchParams.has('v')) return next();
    const requested = url.searchParams.getAll('v');
    const key = pathname.split('/').map(encodeURIComponent).join('/');
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))
      || requested.length !== 1 || versions.get(key) !== requested[0]) {
      response.set('Cache-Control', 'no-store').status(410).json({ error: { code: 'DATA_VERSION_UNAVAILABLE', message: '该资料版本已更新或不存在，请刷新页面后重试。' } });
      return;
    }
    response.locals.dataVersionVerified = true;
    next();
  };
}

export function verifiedDataCacheControl(response: Pick<Response, 'locals'>): string | undefined {
  return response.locals.dataVersionVerified === true ? 'public, max-age=31536000, immutable' : undefined;
}
