import assert from "node:assert/strict";
import { test } from "node:test";
import { mountainSelectionFocus, nearbyMountainRidges, pointToMountainLineDistanceKm, type MountainSelectionFeature } from "../shared/mountain-detail-interaction";

function peak(): MountainSelectionFeature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {
    id: "peak", name: "测试峰", originalName: "测试峰", hasChineseName: true, kind: "peak", osmType: "node", osmId: 1, osmVersion: 1,
    sourceId: "source", sourceUrl: "https://www.openstreetmap.org/node/1", modernReferenceOnly: true, geometryNote: "来源峰顶点",
    bounds: [0, 0, 0, 0], labelCoordinates: [90, 40], minZoom: 7, tags: {},
  } };
}
function ridge(id: string, latitude: number): MountainSelectionFeature {
  return { ...peak(), geometry: { type: "LineString", coordinates: [[-1, latitude], [1, latitude]] }, properties: {
    ...peak().properties, id, name: id, kind: "ridge", osmType: "way", bounds: [-1, latitude, 1, latitude],
  } };
}

test("山峰低于10.5级点选近览真实峰顶坐标，高缩放不自动改变视野", () => {
  assert.deepEqual(mountainSelectionFocus(peak(), 8), { points: [[0, 0]], maxZoom: 11 });
  assert.deepEqual(mountainSelectionFocus(peak(), 10.49), { points: [[0, 0]], maxZoom: 11 });
  assert.equal(mountainSelectionFocus(peak(), 10.5), undefined);
  assert.equal(mountainSelectionFocus(peak(), 14), undefined);
  assert.deepEqual(mountainSelectionFocus(peak(), 14, true), { points: [[0, 0]], maxZoom: 11 });
});

test("山脊普通点选保留视野，明确定位完整来源线时一次返回完整范围", () => {
  const line = ridge("source-line", .03);
  assert.equal(mountainSelectionFocus(line, 8), undefined);
  assert.deepEqual(mountainSelectionFocus(line, 12, true), { points: [[-1, .03], [1, .03]], maxZoom: 10 });
});

test("峰顶到线使用最近线段而非端点或标签，超出线段按端点计算", () => {
  const crossing = pointToMountainLineDistanceKm([0, .05], [[-1, 0], [1, 0]]);
  assert.ok(Math.abs(crossing - 5.559754) < .001);
  const outside = pointToMountainLineDistanceKm([-1, 0], [[0, 0], [1, 0]]);
  assert.ok(Math.abs(outside - 111.19508) < .001);
  assert.ok(pointToMountainLineDistanceKm([0, 0], [[1, 0], [1, 0]]) > 111);
  assert.equal(pointToMountainLineDistanceKm([0, 0], [[0, 0]]), Infinity);
});

test("点线距离跨日期变更线仍使用短弧，纬度距离按球面计算", () => {
  assert.ok(Math.abs(pointToMountainLineDistanceKm([180, .05], [[179, 0], [-179, 0]]) - 5.559754) < .001);
  assert.ok(pointToMountainLineDistanceKm([0, 60], [[.1, 59.5], [.1, 60.5]]) < 6);
});

test("附近山脊仅取已加载真实ridge线的十公里内最近三条并去重", () => {
  const near = ridge("near", .01), next = ridge("next", .02), third = ridge("third", .03), fourth = ridge("fourth", .04);
  const outside = ridge("outside", .1);
  outside.properties.labelCoordinates = [0, 0];
  const cliff = ridge("cliff", .001); cliff.properties.kind = "cliff";
  const found = nearbyMountainRidges(peak(), [fourth, outside, near, near, cliff, peak(), third, next]);
  assert.deepEqual(found.map(item => item.feature.properties.id), ["near", "next", "third"]);
  assert.ok(found.every(item => item.distanceKm <= 10));
  assert.equal(nearbyMountainRidges(peak(), [outside]).length, 0);
  assert.equal(nearbyMountainRidges(near, [next]).length, 0);
  assert.equal(nearbyMountainRidges(undefined, [near]).length, 0);
});
