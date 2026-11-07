import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const moduleId = 'virtual:content-versions';
const resolvedModuleId = '\0' + moduleId;

async function dataVersions(directory: string): Promise<Record<string, string>> {
  const entries: [string, string][] = [];
  async function walk(relative: string) {
    let children;
    try {
      children = await readdir(path.join(directory, relative), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !relative) return;
      throw error;
    }
    for (const child of children) {
      if (child.name.startsWith('.')) continue;
      const filename = path.join(relative, child.name);
      if (child.isDirectory()) await walk(filename);
      else if (child.isFile()) {
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(path.join(directory, filename))) digest.update(chunk);
        const url = '/data/' + filename.split(path.sep).map(encodeURIComponent).join('/');
        entries.push([url, digest.digest('hex')]);
      }
    }
  }
  await walk('');
  return Object.fromEntries(entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

export function dataVersionsPlugin(): Plugin {
  let publicDirectory: string | false = false;
  let build = false;
  let versions: Record<string, string> = {};
  return {
    name: 'historical-atlas-data-versions',
    configResolved(config) {
      publicDirectory = config.publicDir;
      build = config.command === 'build';
    },
    async buildStart() {
      versions = build && publicDirectory ? await dataVersions(path.join(publicDirectory, 'data')) : {};
    },
    resolveId(id) {
      if (id === moduleId) return resolvedModuleId;
    },
    load(id) {
      if (id === resolvedModuleId) return `export default ${JSON.stringify(versions)};`;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'content-versions.json', source: JSON.stringify(versions) + '\n' });
    },
  };
}
