import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { build, createServer } from 'vite';
import { dataVersionsPlugin } from '../scripts/data-versions';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

test('构建版本表与虚拟模块使用完整内容哈希，原生gzip和图片保持字节，重复构建稳定', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'atlas-versions-build-')));
  try {
    await mkdir(path.join(directory, 'public/data/nested'), { recursive: true });
    const files = new Map<string, Buffer>([
      ['map.json', Buffer.from('{"year":741}')],
      ['nested/river.geojson.gz', gzipSync('{"type":"FeatureCollection","features":[]}')],
      ['nested/shade.png', Buffer.from([137, 80, 78, 71, 0, 255])],
      ['中文 空格.json', Buffer.from('{"name":"长安"}')],
    ]);
    for (const [filename, bytes] of files) await writeFile(path.join(directory, 'public/data', filename), bytes);
    await writeFile(path.join(directory, 'public/data/.private.json'), '{}');
    await writeFile(path.join(directory, 'index.html'), '<script type="module" src="/main.js"></script>');
    await writeFile(path.join(directory, 'main.js'), 'import versions from "virtual:content-versions";window.resourceVersions=versions;');
    const compile = () => build({ root: directory, configFile: false, plugins: [dataVersionsPlugin()], logLevel: 'silent' });
    await compile();
    const manifestPath = path.join(directory, 'dist/content-versions.json');
    const first = await readFile(manifestPath);
    const expected = Object.fromEntries([...files].map(([filename, bytes]) => ['/data/' + filename.split('/').map(encodeURIComponent).join('/'), digest(bytes)]));
    assert.deepEqual(JSON.parse(first.toString()), expected);
    const originalAssets = await readdir(path.join(directory, 'dist/assets'));
    const script = originalAssets.find(filename => filename.endsWith('.js'))!;
    const source = await readFile(path.join(directory, 'dist/assets', script), 'utf8');
    for (const version of Object.values(expected)) assert.ok(source.includes(version));
    for (const [filename, bytes] of files) {
      assert.deepEqual(await readFile(path.join(directory, 'public/data', filename)), bytes);
      assert.deepEqual(await readFile(path.join(directory, 'dist/data', filename)), bytes);
    }
    await compile();
    assert.deepEqual(await readFile(manifestPath), first);
    assert.deepEqual(await readdir(path.join(directory, 'dist/assets')), originalAssets);
    await writeFile(path.join(directory, 'public/data/map.json'), '{"year":755}');
    await compile();
    const changed = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(changed['/data/map.json'], digest('{"year":755}'));
    assert.notEqual(changed['/data/map.json'], expected['/data/map.json']);
    for (const [url, version] of Object.entries(expected)) if (url !== '/data/map.json') assert.equal(changed[url], version);
    assert.notDeepEqual(await readdir(path.join(directory, 'dist/assets')), originalAssets);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('开发服务器虚拟版本表为空，不需要构建或修改public文件', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'atlas-versions-dev-')));
  const server = await createServer({ root: directory, configFile: false, plugins: [dataVersionsPlugin()],
    logLevel: 'silent', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
  try {
    const module = await server.ssrLoadModule('virtual:content-versions');
    assert.deepEqual(module.default, {});
    await assert.rejects(readFile(path.join(directory, 'dist/content-versions.json')));
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
