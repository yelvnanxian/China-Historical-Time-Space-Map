import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
const compressible = /\.(?:json|geojson|js|css|svg|txt)$/i;
const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

async function collect(directoryPath) {
  const files = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) files.push(...await collect(filename));
    else if (entry.isFile() && compressible.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

const files = await collect(directory);
const summary = { files: files.length, sourceBytes: 0, brotliFiles: 0, brotliBytes: 0, gzipFiles: 0, gzipBytes: 0 };
let nextIndex = 0;
async function worker() {
  while (nextIndex < files.length) {
    const filename = files[nextIndex++];
    const source = await readFile(filename);
    summary.sourceBytes += source.length;
    const variants = [
      ['br', await brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }), 'brotli'],
      ['gz', await gzipped(source, { level: 9 }), 'gzip'],
    ];
    for (const [extension, bytes, key] of variants) {
      const target = `${filename}.${extension}`;
      if (bytes.length < source.length) {
        await writeFile(target, bytes);
        summary[`${key}Files`]++;
        summary[`${key}Bytes`] += bytes.length;
      } else {
        await rm(target, { force: true });
      }
    }
  }
}

await Promise.all([worker(), worker()]);
console.log(JSON.stringify(summary));
