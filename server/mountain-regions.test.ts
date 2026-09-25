import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { MultiPolygon, Polygon } from "geojson";
import type { PhysicalFeatureCollection } from "../shared/physical-geography";
import { insideMountainRegion, majorMountainRegionIds, mountainRegionFeatures, mountainRegionLabelMinZoom, mountainRegionShortcuts, visibleMountainRegionLabelPoint } from "../shared/mountain-regions";

test("独立山地范围保持52条来源命名原面，排除高原与河湖且主要山系全国可读", async () => {
  const data: PhysicalFeatureCollection = JSON.parse(await readFile(new URL("../public/data/physical-interactive.geojson", import.meta.url), "utf8"));
  const regions = mountainRegionFeatures(data);
  assert.equal(regions.length, 52);
  for (const feature of regions) {
    assert.equal(feature, data.features.find(original => original.properties.id === feature.properties.id));
    assert.match(feature.properties.geometryNote, /地图概括命名范围/);
  }
  for (const { id } of mountainRegionShortcuts) {
    const source = regions.find(feature => feature.properties.groupId === id)!;
    assert.ok(source);
    assert.ok(mountainRegionLabelMinZoom(id, source.properties.minZoom) <= 3.4);
    assert.ok(majorMountainRegionIds.includes(id));
  }
});

test("局部视野仍可在真实面内挂名称，完整来源面和全局定位点不被改写", () => {
  const geometry: Polygon = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 2], [0, 2], [0, 0]]] };
  const snapshot = JSON.stringify(geometry);
  const preferred: [number, number] = [1, 1];
  const point = visibleMountainRegionLabelPoint(geometry, [8, .5, 9, 1.5], preferred)!;
  assert.ok(point && point[0] > 8 && point[0] < 9 && point[1] > .5 && point[1] < 1.5);
  assert.ok(insideMountainRegion(point, geometry));
  assert.deepEqual(preferred, [1, 1]);
  assert.equal(JSON.stringify(geometry), snapshot);
  assert.equal(visibleMountainRegionLabelPoint(geometry, [0, 0, 5, 2], preferred), preferred);
  assert.equal(visibleMountainRegionLabelPoint(geometry, [20, 20, 21, 21], preferred), undefined);
});

test("山地局部标签避开孔洞和分离面的空隙，不用包围框冒充真实覆盖", () => {
  const ring: Polygon = { type: "Polygon", coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
  ] };
  assert.equal(visibleMountainRegionLabelPoint(ring, [4, 4, 6, 6]), undefined);
  const nearHole = visibleMountainRegionLabelPoint(ring, [2, 4, 6, 6])!;
  assert.ok(nearHole && nearHole[0] < 3 && insideMountainRegion(nearHole, ring));
  const islands: MultiPolygon = { type: "MultiPolygon", coordinates: [
    [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    [[[8, 0], [10, 0], [10, 2], [8, 2], [8, 0]]],
  ] };
  assert.equal(visibleMountainRegionLabelPoint(islands, [3, .5, 7, 1.5]), undefined);
  const local = visibleMountainRegionLabelPoint(islands, [8.5, .5, 9.5, 1.5], [1, 1])!;
  assert.ok(local && insideMountainRegion(local, islands));
});

test("真实山系源面在中心以外的小视野可定位可见部分，包括多面天山", async () => {
  const data: PhysicalFeatureCollection = JSON.parse(await readFile(new URL("../public/data/physical-interactive.geojson", import.meta.url), "utf8"));
  for (const feature of mountainRegionFeatures(data)) {
    const [west, south, east, north] = feature.properties.bounds;
    const point = visibleMountainRegionLabelPoint(feature.geometry, [west, south, east, north]);
    assert.ok(point && insideMountainRegion(point, feature.geometry), feature.properties.name);
    const local = visibleMountainRegionLabelPoint(feature.geometry, [point[0] - .03, point[1] - .03, point[0] + .03, point[1] + .03], [west - 1, south - 1]);
    assert.ok(local && insideMountainRegion(local, feature.geometry), `局部名称：${feature.properties.name}`);
  }
});
