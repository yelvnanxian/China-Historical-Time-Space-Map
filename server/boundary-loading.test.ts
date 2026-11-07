import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoundaryDataset, BoundaryLevel } from '../shared/boundaries';
import type { BoundaryIndex } from '../shared/boundary-index';
import { boundaryTargetReady, neededBoundaryLayers } from '../shared/boundary-loading';
import { resolveBoundarySelectionRequest } from '../shared/boundary-selection';
import { resolveMapDetailLevel } from '../shared/map-detail-levels';

const levels: BoundaryLevel[] = ['country', 'province', 'prefecture', 'county'];
const dataset: BoundaryDataset = {
  id: 'hartwell-741', year: 741, periodId: 'tang', title: '唐', sourceName: 'test', sourceUrl: 'test', accuracy: 'approximate-model', note: '', coverage: '',
  layers: levels.map(level => ({ id: `tang-${level}`, level, label: level, featureCount: 1, url: `/data/${level}.geojson` })),
};
const index: BoundaryIndex = {
  datasetId: dataset.id,
  entries: levels.map(level => ({ id: `region-${level}`, name: level, level, sourceId: 'test', year: 741, bbox: [108, 33, 110, 35] })),
};
const request = { id: 'region-county', requestId: 1, focus: false, quiet: true };

test('默认视野保留诸部与省道，仅跨缩放阈值加载需要层级', () => {
  const low = resolveMapDetailLevel('auto', 3.4, levels, { primaryCountryCoverage: false });
  assert.deepEqual(neededBoundaryLayers(dataset, low.visibleLevels, index).map(layer => layer.level), ['country', 'province']);
  const high = resolveMapDetailLevel('auto', 6.6, levels, { primaryCountryCoverage: false });
  assert.deepEqual(neededBoundaryLayers(dataset, high.visibleLevels, index).map(layer => layer.level), ['county']);
  assert.deepEqual(neededBoundaryLayers(dataset, low.visibleLevels, index).map(layer => layer.level), ['country', 'province']);
  assert.deepEqual(neededBoundaryLayers(undefined, low.visibleLevels, index), []);
});

test('搜索与辖区请求从完整索引追加目标层，不加载无关层或其他年份索引', () => {
  assert.deepEqual(neededBoundaryLayers(dataset, ['province'], index, [request.id]).map(layer => layer.level), ['province', 'county']);
  assert.deepEqual(neededBoundaryLayers(dataset, ['province'], index, [request.id, request.id, 'region-prefecture']).map(layer => layer.level), ['province', 'prefecture', 'county']);
  assert.deepEqual(neededBoundaryLayers(dataset, ['province'], { ...index, datasetId: 'hartwell-1200' }, [request.id]).map(layer => layer.level), ['province']);
  assert.deepEqual(neededBoundaryLayers(dataset, ['province'], index, ['unmapped-county']).map(layer => layer.level), ['province']);
});

test('未加载县保持请求pending，失败不消费，补齐几何才执行quiet定位一次', () => {
  const input = { request, resetKey: 'selected-city', datasetId: dataset.id, interactive: true, targetExists: false };
  const initial = resolveBoundarySelectionRequest(undefined, { ...input, dataReady: boundaryTargetReady(dataset, index, ['tang-province'], request.id) });
  assert.equal(initial.state?.completed, false);
  assert.equal(initial.clearSelection, undefined);
  const failed = resolveBoundarySelectionRequest(initial.state, { ...input, dataReady: boundaryTargetReady(dataset, index, ['tang-province'], request.id) });
  assert.equal(failed.state?.completed, false);
  assert.equal(failed.apply, undefined);
  const loaded = resolveBoundarySelectionRequest(failed.state, { ...input, targetExists: true, dataReady: boundaryTargetReady(dataset, index, ['tang-province', 'tang-county'], request.id) });
  assert.deepEqual(loaded.apply, request);
  assert.equal(loaded.apply?.focus, false);
  assert.equal(loaded.apply?.quiet, true);
  assert.equal(resolveBoundarySelectionRequest(loaded.state, { ...input, targetExists: true, dataReady: true }).apply, undefined);
});

test('完整索引到达前不判未知目标，异年或旧索引不能完成请求', () => {
  const target = 'unknown-county';
  assert.equal(boundaryTargetReady(dataset, undefined, ['tang-county'], target), false);
  assert.equal(boundaryTargetReady(dataset, { ...index, datasetId: 'hartwell-1200' }, ['tang-county'], target), false);
  assert.equal(boundaryTargetReady(dataset, index, [], target), true);
  const input = { request: { id: target, requestId: 2 }, resetKey: 'selected-city', datasetId: dataset.id, interactive: true, targetExists: false };
  const waiting = resolveBoundarySelectionRequest(undefined, { ...input, dataReady: false });
  assert.equal(waiting.clearSelection, undefined);
  const checked = resolveBoundarySelectionRequest(waiting.state, { ...input, dataReady: boundaryTargetReady(dataset, index, [], target) });
  assert.equal(checked.clearSelection, true);
  assert.equal(checked.state?.completed, true);
  const cancelled = resolveBoundarySelectionRequest(waiting.state, { ...input, datasetId: 'hartwell-1200', dataReady: false });
  assert.equal(cancelled.state?.completed, true);
  assert.equal(cancelled.apply, undefined);
});
