import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoundaryDataset } from '../shared/boundaries';
import { boundaryIndexUrl } from '../shared/boundary-index';
import { loadBoundaryIndex, loadBoundaryLayer, retainBoundaryDataset } from '../src/lib/boundary-data';

function fixture(id: string): BoundaryDataset {
  return { id, title: id, periodId: 'tang', year: 741, sourceName: 'test', sourceUrl: 'test', accuracy: 'approximate-model', note: '', coverage: '',
    layers: [{ id: `${id}-county`, url: `/boundary-data-tests/${id}-county.geojson`, level: 'county', label: '县', featureCount: 1 }] };
}
const feature = { type: 'Feature', properties: { id: 'county', name: '蓝田县', year: 741, level: 'county', sourceId: 'test' },
  geometry: { type: 'Polygon', coordinates: [[[108, 34], [109, 34], [109, 35], [108, 34]]] } };

test('两张地图共享几何，关闭一张不驱逐，最后消费者退出后释放缓存', async context => {
  const dataset = fixture('shared');
  const releaseFirst = retainBoundaryDataset(dataset);
  const releaseSecond = retainBoundaryDataset(dataset);
  context.after(() => { releaseFirst(); releaseSecond(); });
  const network = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [feature] })));
  const [first, second] = await Promise.all([loadBoundaryLayer(dataset.layers[0]), loadBoundaryLayer(dataset.layers[0])]);
  assert.equal(first, second);
  assert.equal(network.mock.callCount(), 1);
  releaseFirst();
  releaseFirst();
  assert.equal(await loadBoundaryLayer(dataset.layers[0]), first);
  assert.equal(network.mock.callCount(), 1);
  releaseSecond();
  const releaseNew = retainBoundaryDataset(dataset);
  context.after(releaseNew);
  assert.notEqual(await loadBoundaryLayer(dataset.layers[0]), first);
  assert.equal(network.mock.callCount(), 2);
});

test('失败或结构错误的边界可重新加载，不缓存错误层与缺失记录', async context => {
  const dataset = fixture('retry');
  context.after(retainBoundaryDataset(dataset));
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: calls === 1 ? [] : [feature] }));
  });
  await assert.rejects(loadBoundaryLayer(dataset.layers[0]), /边界文件格式错误/);
  assert.deepEqual((await loadBoundaryLayer(dataset.layers[0])).features, [feature]);
  assert.equal(calls, 2);
});

test('索引校验数据集、记录数和bbox，失败清缓存；数据集释放同时清索引', async context => {
  const dataset = fixture('index');
  const release = retainBoundaryDataset(dataset);
  context.after(release);
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0]) => {
    assert.equal(url, boundaryIndexUrl(dataset.id));
    calls++;
    return new Response(JSON.stringify({ datasetId: calls === 1 ? 'wrong' : dataset.id,
      entries: [{ ...feature.properties, bbox: [108, 34, 109, 35] }] }));
  });
  await assert.rejects(loadBoundaryIndex(dataset), /边界文件格式错误/);
  const result = await loadBoundaryIndex(dataset);
  assert.equal(result.entries[0].name, '蓝田县');
  assert.equal(await loadBoundaryIndex(dataset), result);
  release();
  const releaseNew = retainBoundaryDataset(dataset);
  context.after(releaseNew);
  assert.notEqual(await loadBoundaryIndex(dataset), result);
  assert.equal(calls, 3);
});

test('切换数据集时取消旧订阅，不影响同层其他地图的等待', async context => {
  const dataset = fixture('cancel');
  context.after(retainBoundaryDataset(dataset));
  let resolve!: (response: Response) => void;
  context.mock.method(globalThis, 'fetch', () => new Promise<Response>(complete => { resolve = complete; }));
  const controller = new AbortController();
  const first = loadBoundaryLayer(dataset.layers[0], { signal: controller.signal });
  const second = loadBoundaryLayer(dataset.layers[0]);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  controller.abort();
  await rejected;
  resolve(new Response(JSON.stringify({ type: 'FeatureCollection', features: [feature] })));
  assert.equal((await second).features[0].properties.name, '蓝田县');
});

test('null记录、缺失身份与无效坐标会释放缓存，修复后可重试', async context => {
  const dataset = fixture('malformed');
  context.after(retainBoundaryDataset(dataset));
  const entry = { ...feature.properties, bbox: [108, 34, 109, 35] };
  const invalidEntries = [null, { ...entry, sourceId: undefined }, { ...entry, bbox: [109, 34, 108, 35] }, { ...entry, labelCoordinates: 'invalid' }];
  let invalid = true;
  let currentEntry: unknown = null;
  context.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0]) => new Response(JSON.stringify(url === boundaryIndexUrl(dataset.id)
    ? { datasetId: dataset.id, entries: [invalid ? currentEntry : entry] }
    : { type: 'FeatureCollection', features: [invalid ? null : feature] })));
  for (currentEntry of invalidEntries) await assert.rejects(loadBoundaryIndex(dataset), /边界文件格式错误/);
  await assert.rejects(loadBoundaryLayer(dataset.layers[0]), /边界文件格式错误/);
  invalid = false;
  assert.equal((await loadBoundaryIndex(dataset)).entries[0].name, '蓝田县');
  assert.equal((await loadBoundaryLayer(dataset.layers[0])).features.length, 1);
});

test('已释放数据集的迟到结构错误不驱逐新一轮请求', async context => {
  const dataset = fixture('late-validation');
  const responses: ((response: Response) => void)[] = [];
  const network = context.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => responses.push(resolve)));
  const releaseOld = retainBoundaryDataset(dataset);
  const old = loadBoundaryLayer(dataset.layers[0]);
  const oldRejected = assert.rejects(old, /边界文件格式错误/);
  releaseOld();
  context.after(retainBoundaryDataset(dataset));
  const current = loadBoundaryLayer(dataset.layers[0]);
  responses[0](new Response('{"type":"FeatureCollection","features":[null]}'));
  await oldRejected;
  responses[1](new Response(JSON.stringify({ type: 'FeatureCollection', features: [feature] })));
  const data = await current;
  assert.equal(await loadBoundaryLayer(dataset.layers[0]), data);
  assert.equal(network.mock.callCount(), 2);
});
