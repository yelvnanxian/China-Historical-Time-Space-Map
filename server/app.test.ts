import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadCatalog } from './catalog';
import { exampleCatalog } from './fixtures';

const catalog = await loadCatalog(fileURLToPath(new URL('../data/catalog.json', import.meta.url)));
let server: Server;
let base: string;

before(async () => {
  await new Promise<void>(resolve => {
    server = createApp(catalog).listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('HTTP 数据与详情接口可访问', async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const dataResponse = await fetch(`${base}/api/catalog`);
  assert.equal(dataResponse.status, 200);
  assert.equal((await dataResponse.json()).periods.length, catalog.periods.length);
  const place = await fetch(`${base}/api/places/${catalog.places[0].id}`);
  assert.equal(place.status, 200);
  assert.equal((await place.json()).place.id, catalog.places[0].id);
  const event = await fetch(`${base}/api/events/${catalog.events[0].id}`);
  assert.equal(event.status, 200);
  assert.equal((await event.json()).event.id, catalog.events[0].id);
});

test('搜索处理 UTF-8、空查询、过长查询及重复参数', async () => {
  const place = catalog.places[0];
  const response = await fetch(`${base}/api/search?q=${encodeURIComponent(place.name)}`);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).some((item: { id: string }) => item.id === place.id));
  assert.deepEqual(await (await fetch(`${base}/api/search`)).json(), []);
  assert.deepEqual(await (await fetch(`${base}/api/search?q=%20%20`)).json(), []);
  for (const query of [`q=${'a'.repeat(81)}`, 'q=唐&q=宋']) {
    const invalid = await fetch(`${base}/api/search?${query}`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_QUERY');
  }
});

test('缺失对象、未知 API 和错误编码返回 JSON 错误', async () => {
  for (const endpoint of ['/api/places/missing', '/api/events/missing', '/api/topics/missing', '/api/missing', '/missing']) {
    const response = await fetch(`${base}${endpoint}`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.ok((await response.json()).error.code);
  }
  const malformed = await fetch(`${base}/api/places/%E0%A4%A`);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_URL');
});

test('专题 HTTP 接口保持事件顺序并携带原始时间和证据', async (context) => {
  const fixture = exampleCatalog();
  fixture.events[0].evidence = [{ id: 'test-quote', sourceId: 'book', locator: '测试位置', supports: '测试事项',
    status: 'checked', quote: '合成引文。', checkedAt: '2026-09-24' }];
  fixture.events[0].time = { year: 756, precision: 'year', calendar: 'common-era-year', original: '公元756年', certainty: 'recorded' };
  let topicServer: Server;
  const topicBase = await new Promise<string>(resolve => {
    topicServer = createApp(fixture).listen(0, '127.0.0.1', () => {
      const address = topicServer.address();
      assert.ok(address && typeof address === 'object');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
  context.after(() => new Promise<void>((resolve, reject) => topicServer.close(error => error ? reject(error) : resolve())));
  const response = await fetch(`${topicBase}/api/topics/anshi`);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.topic.id, 'anshi');
  assert.deepEqual(detail.events.map((event: { id: string }) => event.id), ['first', 'second']);
  assert.equal(detail.events[1].evidence[0].quote, '合成引文。');
  assert.equal(detail.events[1].time.original, '公元756年');
  assert.equal(detail.sources.length, 1);
});

test('生产模式支持页面刷新，未知 API 和丢失资源仍返回错误', async () => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'history-atlas-test-'));
  let productionServer: Server | undefined;
  try {
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>History Atlas</title>');
    await writeFile(path.join(distDir, 'app.js'), 'window.ready=true;');
    const productionBase = await new Promise<string>(resolve => {
      productionServer = createApp(catalog, { distDir }).listen(0, '127.0.0.1', () => {
        const address = productionServer!.address();
        assert.ok(address && typeof address === 'object');
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
    for (const endpoint of ['/', '/explore/tang']) {
      const response = await fetch(`${productionBase}${endpoint}`, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /History Atlas/);
    }
    assert.equal((await fetch(`${productionBase}/app.js`)).status, 200);
    for (const endpoint of ['/missing.js', '/api/unknown']) {
      const response = await fetch(`${productionBase}${endpoint}`, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    }
  } finally {
    if (productionServer) {
      await new Promise<void>((resolve, reject) => productionServer!.close(error => error ? reject(error) : resolve()));
    }
    await rm(distDir, { recursive: true, force: true });
  }
});
