import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBoundarySelectionRequest, type BoundaryRequestState, type BoundarySelectionRequest } from "../shared/boundary-selection";

const a: BoundarySelectionRequest = { id: "tang-prefecture-a", requestId: 1, quiet: true, focus: false };
const input = { request: a, resetKey: "city-a", datasetId: "hartwell-741", dataReady: true, interactive: true, targetExists: true };

test("郡辖区请求等待资料加载，quiet和focus保持原值且只消费一次", () => {
  const pending = resolveBoundarySelectionRequest(undefined, { ...input, dataReady: false });
  assert.equal(pending.apply, undefined);
  assert.equal(pending.state?.completed, false);
  const loaded = resolveBoundarySelectionRequest(pending.state, input);
  assert.deepEqual(loaded.apply, a);
  assert.equal(loaded.apply?.quiet, true);
  assert.equal(loaded.apply?.focus, false);
  assert.equal(resolveBoundarySelectionRequest(loaded.state, input).apply, undefined);
});

test("已关联郡加载期间换成未知郡，会取消旧待处理请求，之后不能补画旧辖区", () => {
  const pending = resolveBoundarySelectionRequest(undefined, { ...input, dataReady: false });
  const changed = resolveBoundarySelectionRequest(pending.state, { ...input, resetKey: "unknown-city", dataReady: false });
  assert.equal(changed.apply, undefined);
  assert.equal(changed.state?.completed, true);
  const loaded = resolveBoundarySelectionRequest(changed.state, { ...input, resetKey: "unknown-city" });
  assert.equal(loaded.apply, undefined);
  assert.equal(resolveBoundarySelectionRequest(pending.state, { ...input, request: undefined }).state, undefined);
});

test("同批reset和新请求保留新目标，再选同一郡的新requestId也能重试", () => {
  const pending = resolveBoundarySelectionRequest(undefined, { ...input, dataReady: false });
  const next = { ...a, id: "tang-prefecture-b", requestId: 2 };
  const changed = resolveBoundarySelectionRequest(pending.state, { ...input, request: next, resetKey: "city-b" });
  assert.deepEqual(changed.apply, next);
  const repeated = { ...next, requestId: 3, focus: true, quiet: false };
  assert.deepEqual(resolveBoundarySelectionRequest(changed.state, { ...input, request: repeated, resetKey: "city-b" }).apply, repeated);
});

test("异步目录初次出现不取消请求，切到其他朝代数据集会取消旧时期pending", () => {
  const initial = resolveBoundarySelectionRequest(undefined, { ...input, datasetId: undefined, dataReady: false });
  const catalogLoaded = resolveBoundarySelectionRequest(initial.state, { ...input, dataReady: false });
  assert.equal(catalogLoaded.state?.completed, false);
  assert.deepEqual(resolveBoundarySelectionRequest(catalogLoaded.state, input).apply, a);
  const switched = resolveBoundarySelectionRequest(catalogLoaded.state, { ...input, datasetId: "hartwell-1080", dataReady: false });
  assert.equal(switched.state?.completed, true);
  assert.equal(resolveBoundarySelectionRequest(switched.state, { ...input, datasetId: "hartwell-1080" }).apply, undefined);
});

test("无效boundary id完成核查后清除旧高亮，数据未就绪时不误判为未知", () => {
  const unknown = { ...input, request: { id: "unknown-jun", requestId: 4 }, targetExists: false };
  const pending = resolveBoundarySelectionRequest(undefined, { ...unknown, dataReady: false });
  assert.equal(pending.clearSelection, undefined);
  const verified = resolveBoundarySelectionRequest(pending.state, unknown);
  assert.equal(verified.clearSelection, true);
  assert.equal(verified.apply, undefined);
});

test("已消费的静默选中不会因缩放、名称元数据刷新重新定位，也不会重开资料卡", () => {
  let state: BoundaryRequestState | undefined = resolveBoundarySelectionRequest(undefined, input).state;
  for (let render = 0; render < 10; render++) {
    const result = resolveBoundarySelectionRequest(state, { ...input });
    assert.equal(result.apply, undefined);
    assert.equal(result.clearSelection, undefined);
    state = result.state;
  }
});
