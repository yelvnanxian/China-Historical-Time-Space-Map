import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { configureResourceVersions, fetchResource, resourceUrl } from '../src/lib/resource-url';
import { evictJson, loadJson } from '../src/lib/load-json';

const version = 'a'.repeat(64);
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
before(() => Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://atlas.test/explore') }));
beforeEach(() => configureResourceVersions({}));
after(() => {
  configureResourceVersions({});
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
  else Reflect.deleteProperty(globalThis, 'location');
});

test('仅为已登记同源data完整路径加版本，保留查询及片段并保持幂等', () => {
  configureResourceVersions({ '/data/map.json': version, '/data/terrain/3/6/2.png': version });
  assert.equal(resourceUrl('/data/map.json?name=%E5%94%90%20%E6%9C%9D#entry'), `/data/map.json?name=%E5%94%90%20%E6%9C%9D&v=${version}#entry`);
  assert.equal(resourceUrl('https://atlas.test/data/map.json'), `https://atlas.test/data/map.json?v=${version}`);
  assert.equal(resourceUrl(`https://atlas.test/data/terrain/3/6/2.png`), `https://atlas.test/data/terrain/3/6/2.png?v=${version}`);
  assert.equal(resourceUrl(resourceUrl('/data/map.json')), `/data/map.json?v=${version}`);
  assert.equal(resourceUrl('/data/map.json?v=older#entry'), '/data/map.json?v=older#entry');
  for (const url of ['https://other.test/data/map.json', 'http://atlas.test/data/map.json', '//other.test/data/map.json',
    '/api/catalog', '/data/map.json.backup', '/data/sub/map.json', '/data/missing.json', 'data:application/json,{}', '/data/../index.html']) {
    assert.equal(resourceUrl(url), url);
  }
});

test('开发空表和未登记路径不改URL，配置复制后不受调用者修改影响', () => {
  assert.equal(resourceUrl('/data/map.json'), '/data/map.json');
  const versions = { '/data/map.json': version, '/data/invalid.json': 'short' };
  configureResourceVersions(versions);
  versions['/data/map.json'] = 'b'.repeat(64);
  assert.equal(resourceUrl('/data/map.json'), `/data/map.json?v=${version}`);
  assert.equal(resourceUrl('/data/invalid.json'), '/data/invalid.json');
});

test('共享JSON加载器使用版本URL且仍以原调用URL去重和释放', async context => {
  const url = '/data/map.json';
  context.after(() => evictJson(url));
  configureResourceVersions({ [url]: version });
  const network = context.mock.method(globalThis, 'fetch', async () => new Response('{"year":741}'));
  const first = loadJson(url);
  assert.equal(loadJson(url), first);
  assert.deepEqual(await first, { year: 741 });
  assert.equal(network.mock.calls[0].arguments[0], `${url}?v=${version}`);
  assert.equal(network.mock.callCount(), 1);
  evictJson(url);
  const second = loadJson(url);
  assert.notEqual(second, first);
  await second;
  assert.equal(network.mock.callCount(), 2);
});

test('fetch包装保留signal、headers与原生gzip字节，不做HTTP编码或重复解压', async context => {
  configureResourceVersions({ '/data/river.geojson.gz': version });
  const compressed = gzipSync('{"river":"黄河"}');
  const network = context.mock.method(globalThis, 'fetch', async () => new Response(compressed));
  const controller = new AbortController();
  const options = { signal: controller.signal, headers: { 'X-Test': 'kept' } };
  const response = await fetchResource('/data/river.geojson.gz', options);
  assert.deepEqual(network.mock.calls[0].arguments, [`/data/river.geojson.gz?v=${version}`, options]);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes, compressed);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1f, 0x8b]);
  assert.deepEqual(JSON.parse(gunzipSync(bytes).toString()), { river: '黄河' });
});

test('fetch包装支持URL和Request，并保留Request方法、请求头、取消及init覆盖', async context => {
  configureResourceVersions({ '/data/map.json': version });
  const network = context.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await fetchResource(new URL('https://atlas.test/data/map.json'));
  assert.equal(network.mock.calls[0].arguments[0], `https://atlas.test/data/map.json?v=${version}`);
  const controller = new AbortController();
  const request = new Request('https://atlas.test/data/map.json', { method: 'HEAD', headers: { 'X-Test': 'preserved' }, signal: controller.signal });
  const overrides = { cache: 'reload' as const };
  await fetchResource(request, overrides);
  const forwarded = network.mock.calls[1].arguments[0] as Request;
  assert.equal(forwarded.url, `https://atlas.test/data/map.json?v=${version}`);
  assert.equal(forwarded.method, 'HEAD');
  assert.equal(forwarded.headers.get('X-Test'), 'preserved');
  assert.equal(network.mock.calls[1].arguments[1], overrides);
  controller.abort();
  assert.equal(forwarded.signal.aborted, true);
  const external = new Request('https://other.test/data/map.json');
  await fetchResource(external);
  assert.equal(network.mock.calls[2].arguments[0], external);
});
