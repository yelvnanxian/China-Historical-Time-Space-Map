import path from 'node:path';

const hashedAsset = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+(?:\.(?:br|gz))?$/;

export function staticCacheControl(directory: string, filename: string) {
  const relative = path.relative(directory, filename).split(path.sep).join('/');
  if (relative === 'index.html') return 'no-cache';
  if (hashedAsset.test(relative)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=0';
}
