import type { RequestHandler } from 'express';
import Negotiator from 'negotiator';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const compressible = /\.(?:json|geojson|js|css|svg|txt)$/i;

async function fileStat(filename: string) {
  try {
    const details = await stat(filename);
    return details.isFile() ? details : undefined;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return undefined;
    throw error;
  }
}

export function precompressedStatic(directory: string): RequestHandler {
  const root = path.resolve(directory);
  return async (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method)) return next();
    try {
      const pathname = decodeURIComponent(request.path);
      if (!compressible.test(pathname) || pathname.includes('\\') || pathname.includes('\0')
        || pathname.split('/').some(part => part.startsWith('.'))) return next();
      const filename = path.resolve(root, `.${pathname}`);
      if (!filename.startsWith(root + path.sep)) return next();
      const original = await fileStat(filename);
      if (!original) return next();
      const variants = await Promise.all(['br', 'gzip'].map(async encoding => {
        const target = `${filename}.${encoding === 'gzip' ? 'gz' : 'br'}`;
        const details = await fileStat(target);
        return details && details.mtimeMs >= original.mtimeMs ? { encoding, target, details } : undefined;
      }));
      const available = variants.filter(variant => variant !== undefined);
      if (!available.length) return next();
      response.vary('Accept-Encoding');
      const negotiator = new Negotiator(request) as Negotiator & {
        encoding(availableEncodings: string[], options: { preferred: string[] }): string | undefined;
      };
      const encoding = negotiator.encoding(
        [...available.map(variant => variant.encoding), 'identity'],
        { preferred: ['br', 'gzip', 'identity'] },
      );
      if (!encoding) {
        response.status(406).end();
        return;
      }
      if (encoding === 'identity') return next();
      const selected = available.find(variant => variant.encoding === encoding)!;
      response.type(path.extname(filename));
      response.set('Content-Encoding', encoding);
      response.set('ETag', `W/"${selected.details.size.toString(16)}-${selected.details.mtimeMs.toString(16)}-${encoding}"`);
      response.sendFile(selected.target, error => {
        if (!error) return;
        if (!response.headersSent) {
          response.removeHeader('Content-Encoding');
          response.removeHeader('Content-Type');
          response.removeHeader('ETag');
          const status = (error as NodeJS.ErrnoException & { status?: number }).status;
          if (status && status >= 400 && status < 500) {
            response.status(status).end();
            return;
          }
        }
        next(error);
      });
    } catch (error) {
      next(error);
    }
  };
}
