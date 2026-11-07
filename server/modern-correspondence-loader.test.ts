import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test, type TestContext } from "node:test";
import {
  decodeModernCorrespondenceSlice,
  type ModernCorrespondenceSlice,
  type ModernCorrespondenceSliceManifest,
} from "../shared/modern-correspondence";
import { evictJson } from "../src/lib/load-json";
import { evictModernCorrespondence, loadModernCorrespondence } from "../src/lib/modern-correspondence";

const manifestUrl = "/data/modern-correspondence/manifest.json";
const tangId = "hartwell-741";
const songId = "hartwell-1200";
const sliceUrl = (datasetId: string) => `/data/modern-correspondence/${datasetId}.json`;

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function fixture(context: TestContext) {
  for (const id of [tangId, songId, "unknown"]) evictModernCorrespondence(id);
  context.after(() => { for (const id of [tangId, songId, "unknown"]) evictModernCorrespondence(id); });
  const manifest: ModernCorrespondenceSliceManifest = {
    schemaVersion: 1,
    version: "modern-correspondence-1",
    coordinateSystem: "WGS84 longitude/latitude",
    statistics: { total: 2 },
    sources: [{ id: "source", title: "保留资料原文", url: "https://example.com/source", note: "年份、版本与原注逐字保留。" }],
    notes: ["代表点参考；不是古今同一行政实体的证明。\n保留第二行。"],
    sourceIdSets: [["source"]],
    datasets: [tangId, songId].map((id, index) => ({ id, year: index === 0 ? 741 : 1200, url: sliceUrl(id), entryCount: 1 })),
  };
  const slices: Record<string, ModernCorrespondenceSlice> = Object.fromEntries(manifest.datasets.map(dataset => [dataset.id, {
    schemaVersion: 1,
    datasetId: dataset.id,
    year: dataset.year,
    method: "representative-point",
    modernRegionSets: [[{ name: "西安市", level: "prefecture", sourceId: "source", sourceFeatureIndex: 3, sourceRecordId: "001" }]],
    entries: {
      [`${dataset.id}-county-001`]: {
        historicalName: "長安縣", simplifiedName: "长安县", modernNames: ["陕西", "西安市", "香港特别行政区", "保留原文 Original"],
        matchStatus: "matched", matchLevel: "prefecture", representativeCoordinates: [108.9, 34.2],
        historicalLayerId: `${dataset.id}-county`, referenceYears: [2022], noteRef: 0, sourceIdsRef: 0, modernRegionsRef: 0,
      },
    },
  } satisfies ModernCorrespondenceSlice]));
  return { manifest, slices };
}

test("同数据集并发与后续调用只下载目录和切片一次，并共享解码结果及完整文字", async context => {
  const { manifest, slices } = fixture(context);
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (input === manifestUrl) return Response.json(manifest);
    assert.equal(input, sliceUrl(tangId));
    return Response.json(slices[tangId]);
  });
  const [first, second] = await Promise.all([loadModernCorrespondence(tangId), loadModernCorrespondence(tangId)]);
  assert.equal(first, second);
  assert.equal(await loadModernCorrespondence(tangId), first);
  assert.deepEqual(first, decodeModernCorrespondenceSlice(manifest, slices[tangId], tangId));
  assert.deepEqual(first.entries[`${tangId}-county-001`].modernNames, slices[tangId].entries[`${tangId}-county-001`].modernNames);
  assert.equal(first.entries[`${tangId}-county-001`].note, manifest.notes[0]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("两个数据集共享目录但各取对应切片，显式重试只释放目标切片", async context => {
  const { manifest, slices } = fixture(context);
  const counts = new Map<string, number>();
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    counts.set(url, (counts.get(url) ?? 0) + 1);
    if (url === manifestUrl) return Response.json(manifest);
    const descriptor = manifest.datasets.find(dataset => dataset.url === url);
    assert.ok(descriptor, `Unexpected whole-file or unrelated request: ${url}`);
    return Response.json(slices[descriptor.id]);
  });
  const [tang, song] = await Promise.all([loadModernCorrespondence(tangId), loadModernCorrespondence(songId)]);
  assert.deepEqual(Object.keys(tang.entries), [`${tangId}-county-001`]);
  assert.deepEqual(Object.keys(song.entries), [`${songId}-county-001`]);
  assert.deepEqual([...counts], [[manifestUrl, 1], [sliceUrl(tangId), 1], [sliceUrl(songId), 1]]);
  evictModernCorrespondence(tangId);
  await Promise.all([loadModernCorrespondence(tangId), loadModernCorrespondence(songId)]);
  assert.deepEqual([...counts], [[manifestUrl, 2], [sliceUrl(tangId), 2], [sliceUrl(songId), 1]]);
});

test("未知数据集和损坏目录会释放旧目录，后续资料恢复可以重试", async context => {
  const { manifest, slices } = fixture(context);
  let manifestAttempts = 0;
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (input !== manifestUrl) return Response.json(slices[tangId]);
    manifestAttempts += 1;
    if (manifestAttempts === 1) return Response.json({ ...manifest, datasets: [] });
    if (manifestAttempts === 2) return Response.json({ ...manifest, notes: [null] });
    return Response.json(manifest);
  });
  await assert.rejects(loadModernCorrespondence(tangId), /Unknown.*dataset/);
  await assert.rejects(loadModernCorrespondence(tangId), /Invalid.*manifest/);
  const result = await loadModernCorrespondence(tangId);
  assert.equal(result.entries[`${tangId}-county-001`].historicalYear, 741);
  assert.equal(manifestAttempts, 3);
  assert.equal(fetchMock.mock.callCount(), 4);
});

test("目录切片URL必须精确对应数据集，不能跳出目录、替换数据集或附加参数", async context => {
  const { manifest } = fixture(context);
  const urls = ["https://example.com/other.json", "/data/modern-correspondence/../other.json", sliceUrl(songId), `${sliceUrl(tangId)}?v=other`, `${sliceUrl(tangId)}#other`];
  let currentUrl = urls[0];
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(input, manifestUrl);
    return Response.json({ ...manifest, datasets: [{ ...manifest.datasets[0], url: currentUrl }] });
  });
  for (const url of urls) {
    currentUrl = url;
    await assert.rejects(loadModernCorrespondence(tangId), /dataset descriptor/);
  }
  await assert.rejects(loadModernCorrespondence("../hartwell-741"), /dataset ID/);
  assert.equal(fetchMock.mock.callCount(), urls.length);
});

for (const failure of ["http", "parse", "network", "references", "dataset"] as const) {
  test(`${failure}切片失败后能够重试，失败对象不会进入解码缓存`, async context => {
    const { manifest, slices } = fixture(context);
    let sliceAttempts = 0;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      if (input === manifestUrl) return Response.json(manifest);
      assert.equal(input, sliceUrl(tangId));
      sliceAttempts += 1;
      if (sliceAttempts > 1) return Response.json(slices[tangId]);
      if (failure === "http") return new Response("unavailable", { status: 503 });
      if (failure === "parse") return new Response("{invalid json");
      if (failure === "network") throw new Error("connection failed");
      if (failure === "dataset") return Response.json(slices[songId]);
      const broken = structuredClone(slices[tangId]);
      broken.entries[`${tangId}-county-001`].noteRef = 99;
      return Response.json(broken);
    });
    await assert.rejects(loadModernCorrespondence(tangId));
    assert.deepEqual(await loadModernCorrespondence(tangId), decodeModernCorrespondenceSlice(manifest, slices[tangId], tangId));
    assert.equal(sliceAttempts, 2);
  });
}

test("已取消订阅不发请求；等待目录时取消不会继续发起切片请求", async context => {
  const { manifest, slices } = fixture(context);
  const pendingManifest = deferred<Response>();
  const fetchMock = context.mock.method(globalThis, "fetch", (input: string | URL | Request) => input === manifestUrl
    ? pendingManifest.promise : Promise.resolve(Response.json(slices[tangId])));
  const disposed = new AbortController();
  const reason = new Error("component disposed");
  disposed.abort(reason);
  await assert.rejects(loadModernCorrespondence(tangId, { signal: disposed.signal }), error => error === reason);
  assert.equal(fetchMock.mock.callCount(), 0);
  const controller = new AbortController();
  const waiting = loadModernCorrespondence(tangId, { signal: controller.signal });
  const rejected = assert.rejects(waiting, { name: "AbortError" });
  controller.abort();
  await rejected;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  pendingManifest.resolve(Response.json(manifest));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.ok(await loadModernCorrespondence(tangId));
  assert.equal(fetchMock.mock.callCount(), 2);
});

for (const stage of ["manifest", "slice"] as const) {
  test(`等待${stage}时一个消费者取消，不影响另一消费者及后续缓存`, async context => {
    const { manifest, slices } = fixture(context);
    const pending = deferred<Response>();
    const stageStarted = deferred<void>();
    const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      if (input === (stage === "manifest" ? manifestUrl : sliceUrl(tangId))) {
        stageStarted.resolve();
        return pending.promise;
      }
      return Response.json(input === manifestUrl ? manifest : slices[tangId]);
    });
    const controller = new AbortController();
    const canceled = loadModernCorrespondence(tangId, { signal: controller.signal });
    const retained = loadModernCorrespondence(tangId);
    await stageStarted.promise;
    const rejected = assert.rejects(canceled, { name: "AbortError" });
    controller.abort();
    await rejected;
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    pending.resolve(Response.json(stage === "manifest" ? manifest : slices[tangId]));
    const result = await retained;
    assert.equal(await loadModernCorrespondence(tangId), result);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.ok(fetchMock.mock.calls.every(call => call.arguments.length === 1));
  });
}

test("相同切片遇到新目录必须使用新字典，不复用旧目录解码结果", async context => {
  const { manifest, slices } = fixture(context);
  let manifestAttempts = 0;
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (input !== manifestUrl) return Response.json(slices[tangId]);
    manifestAttempts += 1;
    return Response.json(manifestAttempts === 1 ? manifest : { ...manifest, notes: ["新目录的完整参考说明。"] });
  });
  const previous = await loadModernCorrespondence(tangId);
  evictJson(manifestUrl);
  const current = await loadModernCorrespondence(tangId);
  assert.notEqual(previous, current);
  assert.equal(previous.entries[`${tangId}-county-001`].note, manifest.notes[0]);
  assert.equal(current.entries[`${tangId}-county-001`].note, "新目录的完整参考说明。");
  assert.equal(await loadModernCorrespondence(tangId), current);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test("解码缓存不能让错配数据集的同一个切片对象绕过数据集校验", async context => {
  const { manifest, slices } = fixture(context);
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (input === manifestUrl) return Response.json(manifest);
    const response = new Response();
    context.mock.method(response, "json", async () => slices[tangId]);
    return response;
  });
  assert.ok(await loadModernCorrespondence(tangId));
  await assert.rejects(loadModernCorrespondence(songId), /requested dataset/);
});

for (const stage of ["manifest", "slice"] as const) {
  test(`旧${stage}校验失败不能删除重试后已成功的新目录与切片缓存`, async context => {
    const { manifest, slices } = fixture(context);
    const oldNetwork = deferred<Response>();
    const oldStarted = deferred<void>();
    let manifestAttempts = 0;
    let sliceAttempts = 0;
    const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const isManifest = input === manifestUrl;
      const attempt = isManifest ? ++manifestAttempts : ++sliceAttempts;
      if (attempt === 1 && (stage === "manifest") === isManifest) {
        oldStarted.resolve();
        return oldNetwork.promise;
      }
      return Response.json(isManifest ? { ...manifest, notes: ["当前目录参考说明。"] } : slices[tangId]);
    });
    const previous = loadModernCorrespondence(tangId);
    await oldStarted.promise;
    evictModernCorrespondence(tangId);
    const current = await loadModernCorrespondence(tangId);
    const rejected = assert.rejects(previous, /Invalid/);
    if (stage === "manifest") oldNetwork.resolve(Response.json({ ...manifest, sourceIdSets: [["unknown"]] }));
    else {
      const broken = structuredClone(slices[tangId]);
      broken.entries[`${tangId}-county-001`].modernRegionsRef = 99;
      oldNetwork.resolve(Response.json(broken));
    }
    await rejected;
    const callsAfterRetry = fetchMock.mock.callCount();
    assert.equal(await loadModernCorrespondence(tangId), current);
    assert.equal(current.entries[`${tangId}-county-001`].note, "当前目录参考说明。");
    assert.equal(fetchMock.mock.callCount(), callsAfterRetry);
    assert.equal(manifestAttempts, 2);
    assert.equal(sliceAttempts, stage === "manifest" ? 1 : 2);
  });
}
