import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { evictJson, loadJson } from '../src/lib/load-json';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('并发和完成后的同URL调用共享同一Promise、下载及JSON解析', async context => {
  const url = '/loader-tests/shared.json';
  context.after(() => evictJson(url));
  const network = deferred<Response>();
  const fetchMock = context.mock.method(globalThis, 'fetch', () => network.promise);
  const response = new Response('{"name":"唐朝"}');
  const parseMock = context.mock.method(response, 'json');
  const first = loadJson<{ name: string }>(url);
  const second = loadJson<{ name: string }>(url);
  assert.equal(first, second);
  assert.equal(fetchMock.mock.callCount(), 1);
  network.resolve(response);
  assert.deepEqual(await first, { name: '唐朝' });
  assert.equal(await first, await second);
  assert.equal(loadJson(url), first);
  assert.equal(parseMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('单个消费者取消只拒绝其等待，其余消费者继续共享请求，监听器及时移除', async context => {
  const url = '/loader-tests/independent-abort.json';
  context.after(() => evictJson(url));
  const network = deferred<Response>();
  const fetchMock = context.mock.method(globalThis, 'fetch', () => network.promise);
  const firstController = new AbortController();
  const secondController = new AbortController();
  const shared = loadJson(url);
  const first = loadJson(url, { signal: firstController.signal });
  const second = loadJson(url, { signal: secondController.signal });
  assert.equal(getEventListeners(firstController.signal, 'abort').length, 1);
  assert.equal(getEventListeners(secondController.signal, 'abort').length, 1);
  const canceled = assert.rejects(first, { name: 'AbortError' });
  firstController.abort();
  await canceled;
  assert.equal(getEventListeners(firstController.signal, 'abort').length, 0);
  assert.equal(getEventListeners(secondController.signal, 'abort').length, 1);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, [url]);
  network.resolve(new Response('{"year":755}'));
  assert.deepEqual(await second, { year: 755 });
  assert.equal(await second, await shared);
  assert.equal(getEventListeners(secondController.signal, 'abort').length, 0);
  assert.equal(loadJson(url), shared);
});

test('已取消的消费者不发起请求，全部消费者取消后共享请求仍可完成并复用', async context => {
  const url = '/loader-tests/all-aborted.json';
  context.after(() => evictJson(url));
  const network = deferred<Response>();
  const fetchMock = context.mock.method(globalThis, 'fetch', () => network.promise);
  const canceledController = new AbortController();
  const reason = new Error('component disposed');
  canceledController.abort(reason);
  await assert.rejects(loadJson(url, { signal: canceledController.signal }), error => error === reason);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(getEventListeners(canceledController.signal, 'abort').length, 0);
  const controller = new AbortController();
  const waiting = loadJson(url, { signal: controller.signal });
  const canceled = assert.rejects(waiting, { name: 'AbortError' });
  controller.abort();
  await canceled;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  network.resolve(new Response('{"retained":true}'));
  assert.deepEqual(await loadJson(url), { retained: true });
  await assert.rejects(loadJson(url, { signal: canceledController.signal }), error => error === reason);
  assert.equal(fetchMock.mock.callCount(), 1);
});

for (const failure of ['http', 'parse', 'network'] as const) {
  test(`${failure}失败清理缓存和取消监听器，后续调用能够重新加载`, async context => {
    const url = `/loader-tests/retry-${failure}.json`;
    context.after(() => evictJson(url));
    const networkError = new Error('connection failed');
    let attempt = 0;
    const fetchMock = context.mock.method(globalThis, 'fetch', async () => {
      attempt++;
      if (attempt > 1) return new Response('{"retried":true}');
      if (failure === 'network') throw networkError;
      if (failure === 'http') return new Response('temporarily unavailable', { status: 503 });
      return new Response('{invalid json');
    });
    const controller = new AbortController();
    const first = loadJson(url);
    const second = loadJson(url);
    const subscriber = loadJson(url, { signal: controller.signal });
    assert.equal(first, second);
    const matches = (error: unknown) => failure === 'network' ? error === networkError
      : failure === 'http' ? error instanceof Error && /503/.test(error.message) : error instanceof SyntaxError;
    await Promise.all([assert.rejects(first, matches), assert.rejects(subscriber, matches)]);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    const retry = loadJson(url);
    assert.notEqual(retry, first);
    assert.deepEqual(await retry, { retried: true });
    assert.equal(loadJson(url), retry);
    assert.equal(fetchMock.mock.callCount(), 2);
  });
}

test('显式逐URL释放不会中止旧订阅者，旧成功不会覆盖新缓存', async context => {
  const url = '/loader-tests/evicted-success.json';
  const otherUrl = '/loader-tests/retained.json';
  context.after(() => { evictJson(url); evictJson(otherUrl); });
  const originalNetwork = deferred<Response>();
  const replacementNetwork = deferred<Response>();
  let attempt = 0;
  context.mock.method(globalThis, 'fetch', (input: string | URL | Request) => {
    if (input === otherUrl) return Promise.resolve(new Response('{"other":true}'));
    return attempt++ === 0 ? originalNetwork.promise : replacementNetwork.promise;
  });
  const other = loadJson(otherUrl);
  const original = loadJson(url);
  evictJson(url);
  const replacement = loadJson(url);
  assert.notEqual(replacement, original);
  assert.equal(loadJson(otherUrl), other);
  replacementNetwork.resolve(new Response('{"generation":2}'));
  assert.deepEqual(await replacement, { generation: 2 });
  originalNetwork.resolve(new Response('{"generation":1}'));
  assert.deepEqual(await original, { generation: 1 });
  assert.equal(loadJson(url), replacement);
  evictJson(url);
  evictJson(url);
  assert.equal(loadJson(otherUrl), other);
  await other;
});

test('被释放的旧请求稍后失败时不会误删同URL的新请求', async context => {
  const url = '/loader-tests/evicted-failure.json';
  context.after(() => evictJson(url));
  const originalNetwork = deferred<Response>();
  const replacementNetwork = deferred<Response>();
  let attempt = 0;
  const fetchMock = context.mock.method(globalThis, 'fetch', () => attempt++ === 0 ? originalNetwork.promise : replacementNetwork.promise);
  const original = loadJson(url);
  evictJson(url);
  const replacement = loadJson(url);
  const failed = assert.rejects(original, /old request failed/);
  originalNetwork.reject(new Error('old request failed'));
  await failed;
  assert.equal(loadJson(url), replacement);
  replacementNetwork.resolve(new Response('{"current":true}'));
  assert.deepEqual(await replacement, { current: true });
  assert.equal(loadJson(url), replacement);
  assert.equal(fetchMock.mock.callCount(), 2);
});
