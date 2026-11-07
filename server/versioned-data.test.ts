import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import express, { type Response } from 'express';
import { verifiedDataCacheControl, versionedData } from './versioned-data';

const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function get(server: Server, url: string, headers: Record<string, string> = {}, method = 'GET') {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = httpRequest(`http://127.0.0.1:${address.port}${url}`, { headers, method }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

async function serve(directory: string) {
  const app = express();
  app.use(versionedData(directory));
  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  app.use(express.static(directory, { setHeaders(response) {
    const cacheControl = verifiedDataCacheControl(response as Response);
    if (cacheControl) response.setHeader('Cache-Control', cacheControl);
  } }));
  app.use((_request, response) => response.status(404).json({ missing: true }));
  return new Promise<Server>(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('只有匹配当前完整内容hash的数据才长期缓存，错误版本不回退最新文件', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-versioned-data-'));
  let server: Server | undefined;
  try {
    await mkdir(path.join(directory, 'data'));
    const source = '{"year":741}';
    const compressed = gzipSync(source);
    const versions = { '/data/map.json': digest(source), '/data/river.geojson.gz': digest(compressed), '/data/missing.json': digest('missing') };
    await writeFile(path.join(directory, 'data/map.json'), source);
    await writeFile(path.join(directory, 'data/river.geojson.gz'), compressed);
    await writeFile(path.join(directory, 'content-versions.json'), JSON.stringify(versions));
    server = await serve(directory);
    for (const [url, bytes] of [['/data/map.json', Buffer.from(source)], ['/data/river.geojson.gz', compressed]] as const) {
      const response = await get(server, `${url}?v=${versions[url]}&other=kept`);
      assert.equal(response.status, 200);
      assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
      assert.equal(response.headers['content-encoding'], undefined);
      assert.deepEqual(response.body, bytes);
      const cached = await get(server, `${url}?v=${versions[url]}`, { 'If-None-Match': response.headers.etag! });
      assert.equal(cached.status, 304);
      assert.equal(cached.headers['cache-control'], 'public, max-age=31536000, immutable');
      const head = await get(server, `${url}?v=${versions[url]}`, {}, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
      assert.equal(head.headers['cache-control'], 'public, max-age=31536000, immutable');
      const plain = await get(server, url);
      assert.equal(plain.headers['cache-control'], 'public, max-age=0');
    }
    for (const url of ['/data/map.json?v=arbitrary', `/data/map.json?v=${'f'.repeat(64)}`, '/data/map.json?v=',
      `/data/map.json?v=${versions['/data/map.json']}&v=${versions['/data/map.json']}`,
      `/data/unknown.json?v=${versions['/data/map.json']}`, `/data/map.json?v=${versions['/data/river.geojson.gz']}`]) {
      const response = await get(server, url);
      assert.equal(response.status, 410, url);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-encoding'], undefined);
      assert.ok(!response.body.toString().includes(source));
    }
    const missing = await get(server, `/data/missing.json?v=${versions['/data/missing.json']}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers['cache-control'], undefined);
    const api = await get(server, '/api/health?v=unrelated');
    assert.equal(api.status, 200);
    assert.equal(api.headers['cache-control'], undefined);
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
    const changed = '{"year":755}';
    await writeFile(path.join(directory, 'data/map.json'), changed);
    await writeFile(path.join(directory, 'content-versions.json'), JSON.stringify({ ...versions, '/data/map.json': digest(changed) }));
    server = await serve(directory);
    const old = await get(server, `/data/map.json?v=${versions['/data/map.json']}`);
    assert.equal(old.status, 410);
    assert.equal(old.headers['cache-control'], 'no-store');
    assert.equal((await get(server, `/data/map.json?v=${digest(changed)}`)).body.toString(), changed);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('缺失版本表兼容旧构建但拒绝版本请求，损坏版本表在启动时失败', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-versioned-missing-'));
  let server: Server | undefined;
  try {
    await mkdir(path.join(directory, 'data'));
    await writeFile(path.join(directory, 'data/map.json'), '{}');
    server = await serve(directory);
    assert.equal((await get(server, '/data/map.json')).status, 200);
    assert.equal((await get(server, `/data/map.json?v=${digest('{}')}`)).status, 410);
    for (const invalid of ['[]', '{"/data/map.json":"short"}', '{"https://other.test/data/map.json":"' + digest('{}') + '"}']) {
      await writeFile(path.join(directory, 'content-versions.json'), invalid);
      assert.throws(() => versionedData(directory), /Invalid content versions manifest/);
    }
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
