import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import { access, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import { createApp } from './app';
import { exampleCatalog } from './fixtures';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: Array.from({ length: 500 }, (_, index) => ({ id: index, name: '测试河流', coordinates: [112.125, 35.123] })) }));
const originalGzip = gzipSync(source);
let directory: string;
let base: string;
let server: Server;

function get(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = httpRequest(base + url, { headers, method }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'atlas-compression-'));
  await mkdir(path.join(directory, 'data/tang-detail'), { recursive: true });
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>History Atlas</title>');
  await writeFile(path.join(directory, 'data/map.geojson'), source);
  await writeFile(path.join(directory, 'data/tang-detail/map.geojson.gz'), originalGzip);
  await writeFile(path.join(directory, 'data/image.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(path.join(directory, 'assets/index-ABC12345.js'), 'const label="地图";'.repeat(300));
  execFileSync(process.execPath, [path.join(root, 'scripts/precompress-static.mjs'), directory]);
  await writeFile(path.join(directory, 'data/stale.json'), '{"fresh":true}');
  await writeFile(path.join(directory, 'data/stale.json.br'), Buffer.from('outdated'));
  await utimes(path.join(directory, 'data/stale.json.br'), new Date(0), new Date(0));
  await writeFile(path.join(directory, '.private.json'), '{"private":true}');
  base = await new Promise<string>(resolve => {
    server = createApp(exampleCatalog(), { distDir: directory }).listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('静态预压缩按编码协商，原始GeoJSON与解码后的br/gzip逐字节相同', async () => {
  for (const [accept, expected] of [
    ['br,gzip', 'br'],
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip;q=0.7,br;q=0.7', 'br'],
    ['gzip', 'gzip'],
    ['br;q=0.2,gzip;q=1', 'gzip'],
    ['gzip;q=0.2,br;q=1', 'br'],
    ['br;q=0,*;q=1', 'gzip'],
    ['br;q=0.5,gzip;q=0.8,identity;q=1', 'identity'],
    ['br;q=0.5,gzip;q=0.8,identity;q=0', 'gzip'],
    ['gzip;q=0,br;q=0', 'identity'],
    ['', 'identity'],
  ]) {
    const response = await get('/data/map.geojson', accept ? { 'Accept-Encoding': accept } : {});
    assert.equal(response.status, 200);
    assert.match(String(response.headers.vary), /Accept-Encoding/);
    assert.match(String(response.headers['content-type']), /application\/geo\+json/);
    assert.equal(response.headers['content-encoding'], expected === 'identity' ? undefined : expected);
    const decoded = expected === 'br' ? brotliDecompressSync(response.body) : expected === 'gzip' ? gunzipSync(response.body) : response.body;
    assert.deepEqual(decoded, source);
    if (expected !== 'identity') assert.ok(response.body.length < source.length / 2);
    assert.equal(response.headers['cache-control'], 'public, max-age=0');
  }
  assert.equal((await get('/data/map.geojson', { 'Accept-Encoding': '*;q=0' })).status, 406);
  assert.equal((await get('/data/map.geojson', { 'Accept-Encoding': 'gzip;q=0,br;q=0,identity;q=0' })).status, 406);
});

test('HEAD、编码独立ETag和304保留正确的协商语义', async () => {
  const brotli = await get('/data/map.geojson', { 'Accept-Encoding': 'br' });
  const head = await get('/data/map.geojson', { 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-encoding'], 'br');
  assert.equal(head.headers.etag, brotli.headers.etag);
  assert.equal(Number(head.headers['content-length']), brotli.body.length);
  const cached = await get('/data/map.geojson', { 'Accept-Encoding': 'br', 'If-None-Match': brotli.headers.etag! });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  assert.match(String(cached.headers.vary), /Accept-Encoding/);
  const other = await get('/data/map.geojson', { 'Accept-Encoding': 'gzip', 'If-None-Match': brotli.headers.etag! });
  assert.equal(other.status, 200);
  assert.notEqual(other.headers.etag, brotli.headers.etag);
  assert.deepEqual(gunzipSync(other.body), source);
});

test('Range针对所选表示，范围不满足时返回416而非HTML或500', async () => {
  const full = await get('/data/map.geojson', { 'Accept-Encoding': 'br' });
  const partial = await get('/data/map.geojson', { 'Accept-Encoding': 'br', Range: 'bytes=0-9' });
  assert.equal(partial.status, 206);
  assert.deepEqual(partial.body, full.body.subarray(0, 10));
  assert.equal(partial.headers['content-encoding'], 'br');
  assert.equal(partial.headers['content-range'], `bytes 0-9/${full.body.length}`);
  const invalid = await get('/data/map.geojson', { 'Accept-Encoding': 'br', Range: 'bytes=999999-' });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers['content-encoding'], undefined);
  assert.equal(invalid.body.length, 0);
  const original = await get('/data/map.geojson', { Range: 'bytes=0-9' });
  assert.equal(original.status, 206);
  assert.deepEqual(original.body, source.subarray(0, 10));
});

test('现有唐细节gzip不双重压缩，不加Content-Encoding，浏览器解码路径仍得到完整GeoJSON', async () => {
  const response = await get('/data/tang-detail/map.geojson.gz', { 'Accept-Encoding': 'br,gzip' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], undefined);
  assert.deepEqual(response.body, originalGzip);
  assert.deepEqual([...response.body.subarray(0, 2)], [0x1f, 0x8b]);
  assert.deepEqual(JSON.parse(gunzipSync(response.body).toString()), JSON.parse(source.toString()));
  for (const suffix of ['.br', '.gz']) {
    await assert.rejects(access(path.join(directory, `data/tang-detail/map.geojson.gz${suffix}`)));
    await assert.rejects(access(path.join(directory, `data/image.png${suffix}`)));
  }
});

test('缺失、过期及不安全路径不返回错误压缩表示或SPA内容', async () => {
  const stale = await get('/data/stale.json', { 'Accept-Encoding': 'br,gzip' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['content-encoding'], undefined);
  assert.equal(stale.body.toString(), '{"fresh":true}');
  for (const url of ['/data/missing.geojson', '/.private.json', '/%2eprivate.json', '/data/%2e%2e/.private.json', '/data/%2e%2e%5c.private.json']) {
    const response = await get(url, { 'Accept-Encoding': 'br,gzip' });
    assert.equal(response.status, 404, url);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.ok(!response.body.toString().includes('History Atlas'));
    assert.ok(!response.body.toString().includes('"private":true'));
  }
  const script = await get('/assets/index-ABC12345.js', { 'Accept-Encoding': 'br,gzip' });
  assert.equal(script.status, 200);
  assert.match(String(script.headers['content-type']), /javascript/);
});

test('预压缩生成器可重复且不改变源文件，无收益的旧副本会清理', async () => {
  const isolated = await mkdtemp(path.join(tmpdir(), 'atlas-precompress-'));
  try {
    await writeFile(path.join(isolated, 'map.json'), source);
    await writeFile(path.join(isolated, 'tiny.json'), '{}');
    await writeFile(path.join(isolated, 'tiny.json.br'), 'old');
    await writeFile(path.join(isolated, 'tiny.json.gz'), 'old');
    const build = () => JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/precompress-static.mjs'), isolated], { encoding: 'utf8' }));
    const first = build();
    const digest = async () => Promise.all(['map.json', 'map.json.br', 'map.json.gz'].map(async filename => createHash('sha256').update(await readFile(path.join(isolated, filename))).digest('hex')));
    const hashes = await digest();
    assert.deepEqual(build(), first);
    assert.deepEqual(await digest(), hashes);
    assert.deepEqual(await readFile(path.join(isolated, 'map.json')), source);
    await assert.rejects(access(path.join(isolated, 'tiny.json.br')));
    await assert.rejects(access(path.join(isolated, 'tiny.json.gz')));
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});
