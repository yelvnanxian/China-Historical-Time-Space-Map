import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { LineString, MultiLineString, Position } from "geojson";
import {
  contextWaterGeometry,
  lineOutsideBounds,
  lowerYellowRiverMask,
  riverEpochAtYear,
  type MapBounds,
  type RiverCollection,
  type RiverEpoch,
  type RiverManifest,
} from "../shared/historical-rivers";
import type { PhysicalFeature, PhysicalFeatureCollection, PhysicalGeometry, PhysicalKind } from "../shared/physical-geography";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const json = <T,>(path: string): T => JSON.parse(read(path).toString("utf8"));
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const manifest = json<RiverManifest & { epochs: (RiverEpoch & { queryUrl: string })[] }>("public/data/historical-rivers/manifest.json");
const modernWater = json<PhysicalFeatureCollection>("public/data/physical-interactive.geojson");
const sourceLines = (geometry: LineString | MultiLineString): Position[][] => geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
const allLines = (data: RiverCollection) => data.features.flatMap(feature => sourceLines(feature.geometry));
const geometryAt = (epoch: RiverEpoch) => json<RiverCollection>(`public${epoch.url}`);
const boundsOf = (points: Position[]): MapBounds => [
  Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])),
  Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])),
];

function pointOnSegment(point: Position, start: Position, end: Position) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const squaredLength = dx * dx + dy * dy;
  if (squaredLength === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]) < 1e-8;
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / squaredLength;
  return t >= -1e-8 && t <= 1 + 1e-8
    && Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy) < 1e-8;
}

/** Each displayed segment must remain on one source segment; no shortcuts across bends or gaps. */
function assertOnlySourceSegments(output: Position[][], original: Position[][]) {
  const segments = original.flatMap(line => line.slice(1).map((end, index) => [line[index], end]));
  for (const line of output) {
    assert.ok(line.length >= 2);
    for (let i = 1; i < line.length; i++) {
      assert.ok(segments.some(([start, end]) => pointOnSegment(line[i - 1], start, end) && pointOnSegment(line[i], start, end)),
        `An output segment is absent from the source: ${JSON.stringify([line[i - 1], line[i]])}`);
    }
  }
}

function fixture(id: string, geometry: PhysicalGeometry, bounds: MapBounds, kind: PhysicalKind = "river", groupId = id): PhysicalFeature {
  return {
    type: "Feature", geometry,
    properties: { ...modernWater.features[0].properties, id, groupId, kind, bounds },
  };
}

const collection = (...features: PhysicalFeature[]): PhysicalFeatureCollection => ({ type: "FeatureCollection", features });

test("五期历史河道有可复核的来源元数据、原始快照和发布文件校验值", () => {
  assert.equal(manifest.epochs.length, 5);
  assert.ok(Number.isFinite(Date.parse(manifest.retrievedAt)));
  assert.match(manifest.dateRule, /起年包含、讫年不包含/);
  assert.match(manifest.coverageNote, /其他河流仍为现代参照/);
  assert.match(manifest.precisionNote, /不能用于认定古代河岸/);
  for (const epoch of manifest.epochs) {
    assert.equal(epoch.metadataPath, `data/evidence/historical-rivers/${epoch.id}-item.json`);
    assert.equal(epoch.snapshotPath, `data/evidence/historical-rivers/${epoch.id}-raw.geojson`);
    assert.equal(epoch.url, `/data/historical-rivers/${epoch.id}.geojson`);
    assert.equal(sha256(read(epoch.metadataPath)), epoch.metadataSha256, `${epoch.id}: metadata hash`);
    assert.equal(sha256(read(epoch.snapshotPath)), epoch.snapshotSha256, `${epoch.id}: raw hash`);
    assert.equal(sha256(read(`public${epoch.url}`)), epoch.geometrySha256, `${epoch.id}: output hash`);
    const item = json<{ id: string; title: string; owner: string; description: string; url: string }>(epoch.metadataPath);
    const service = json<{ serviceItemId: string; layers: { id: number; geometryType: string }[] }>(`data/evidence/historical-rivers/${epoch.id}-service.json`);
    assert.equal(item.id, epoch.sourceId);
    assert.equal(item.title, epoch.sourceTitle);
    assert.equal(item.owner, epoch.sourceOwner);
    assert.equal(item.description, epoch.sourceDescription);
    assert.equal(item.owner, "pkbol_worldmap");
    assert.equal(service.serviceItemId, epoch.sourceId);
    assert.equal(service.layers[0].geometryType, "esriGeometryPolyline");
    assert.equal(new URL(epoch.sourceUrl).searchParams.get("id"), item.id);
    const query = new URL(epoch.queryUrl);
    assert.equal(query.origin + query.pathname, `${item.url}/${service.layers[0].id}/query`);
    assert.equal(query.searchParams.get("where"), "1=1");
    assert.equal(query.searchParams.get("outFields"), "*");
    assert.equal(query.searchParams.get("outSR"), "4326");
    assert.equal(query.searchParams.get("returnGeometry"), "true");
    assert.equal(query.searchParams.get("f"), "geojson");
    assert.match(epoch.geometryNote, /保留来源全部顶点/);
  }
});

test("五期发布几何保留全部原始顶点、独立分段及来源属性，不平滑或拼接", () => {
  const expectedCounts = [86, 71, 146, 147, 100];
  const expectedParts = [1, 1, 2, 4, 1];
  for (const [epochIndex, epoch] of manifest.epochs.entries()) {
    const raw = json<RiverCollection & { exceededTransferLimit?: boolean }>(epoch.snapshotPath);
    const output = geometryAt(epoch);
    assert.equal(raw.type, "FeatureCollection");
    assert.ok(!raw.exceededTransferLimit);
    assert.equal(output.features.length, raw.features.length);
    assert.equal(output.features.length, epoch.featureCount);
    assert.ok(output.features.length > 0);
    output.features.forEach((feature, index) => {
      assert.deepEqual(feature.geometry, raw.features[index].geometry, `${epoch.id}: geometry ${index}`);
      assert.deepEqual(feature.properties?.sourceProperties, raw.features[index].properties);
      assert.equal(feature.properties?.sourceId, epoch.sourceId);
      assert.equal(feature.properties?.epochId, epoch.id);
      assert.equal(feature.properties?.startYear, epoch.startYear);
      assert.equal(feature.properties?.endYear, epoch.endYear);
      assert.equal(feature.properties?.dateLabel, epoch.label);
    });
    const lines = allLines(output), points = lines.flat();
    assert.equal(lines.length, expectedParts[epochIndex]);
    assert.equal(points.length, expectedCounts[epochIndex]);
    assert.equal(points.length, epoch.vertexCount);
    assert.deepEqual(boundsOf(points), epoch.bounds);
    assert.ok(points.some(point => point[0] === epoch.labelCoordinates[0] && point[1] === epoch.labelCoordinates[1]));
    for (const line of lines) {
      assert.ok(line.length >= 2);
      for (const point of line) {
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90);
      }
    }
  }
});

test("历史河道使用半开年代区间，唐代落在第二期，缺失时期不外推", () => {
  for (const [index, epoch] of manifest.epochs.entries()) {
    assert.equal(riverEpochAtYear(manifest.epochs, epoch.startYear)?.id, epoch.id);
    assert.equal(riverEpochAtYear(manifest.epochs, epoch.endYear - 1)?.id, epoch.id);
    assert.equal(riverEpochAtYear(manifest.epochs, epoch.endYear)?.id, manifest.epochs[index + 1]?.id);
  }
  for (const year of [618, 755, 907]) assert.equal(riverEpochAtYear(manifest.epochs, year)?.id, "yellow-11-1048");
  for (const year of [-603, 1855, 2026, Number.NaN, Infinity, -Infinity]) assert.equal(riverEpochAtYear(manifest.epochs, year), undefined);
  const withGap = manifest.epochs.filter(epoch => epoch.id !== "yellow-1048-1128");
  for (const year of [1048, 1100, 1127]) assert.equal(riverEpochAtYear(withGap, year), undefined);
  assert.equal(riverEpochAtYear([], 755), undefined);
});

test("五期有不同的实际走向，宋代北流与明清南流不会只是同一条现代线换标签", () => {
  const geometries = manifest.epochs.map(epoch => geometryAt(epoch));
  assert.equal(new Set(geometries.map(data => sha256(JSON.stringify(data.features.map(feature => feature.geometry))))).size, 5);
  const tang = allLines(geometries[1]), northern = allLines(geometries[2]), southern = allLines(geometries[4]);
  assert.ok(tang[0].at(-1)![1] > 37);
  assert.ok(Math.max(...northern.flat().map(point => point[1])) > 39);
  assert.ok(Math.max(...southern.flat().map(point => point[1])) < 35);
  assert.ok(southern[0].at(-1)![0] > 120);
  assert.ok(southern[0].at(-1)![1] < 35);
});

test("局部覆盖裁掉穿越区域的线段，即使两个端点都在区域外也不会跨空缺连线", () => {
  const original = [[0, 0], [6, 0]];
  const boxes: MapBounds[] = [[1, -1, 2, 1], [4, -1, 5, 1]];
  const output = lineOutsideBounds(original, boxes);
  assert.deepEqual(output, [[[0, 0], [1, 0]], [[2, 0], [4, 0]], [[5, 0], [6, 0]]]);
  assertOnlySourceSegments(output, [original]);
  assert.deepEqual(lineOutsideBounds([[1.2, 0], [1.8, 0]], boxes), []);
  assert.deepEqual(lineOutsideBounds([[0, 0], [1, 1]], []), [[[0, 0], [1, 1]]]);
});

test("裁剪保留弯折，出入覆盖区形成独立段，重叠覆盖区和切边不产生新河道", () => {
  const original = [[0, 0], [0.5, 0.5], [2, 2], [3, 0], [4, 0]];
  const boxes: MapBounds[] = [[1, 1, 2.5, 3], [2, 1, 3, 3]];
  const snapshot = structuredClone(original);
  const output = lineOutsideBounds(original, boxes);
  assert.equal(output.length, 2);
  assert.deepEqual(output[0].slice(0, 2), original.slice(0, 2));
  assert.deepEqual(output[0].at(-1), [1, 1]);
  assert.deepEqual(output[1][0], [2.5, 1]);
  assert.deepEqual(output[1].at(-1), [4, 0]);
  assertOnlySourceSegments(output, [original]);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(lineOutsideBounds([[1, 1], [2, 1]], [[1, 1, 2, 2]]), []);
  const outside = [[0, 4], [3, 4]];
  const unchangedShape = lineOutsideBounds(outside, [[1, 1, 2, 2]]);
  assert.equal(unchangedShape.length, 1);
  assert.deepEqual(unchangedShape[0][0], outside[0]);
  assert.deepEqual(unchangedShape[0].at(-1), outside[1]);
  assertOnlySourceSegments(unchangedShape, [outside]);
});

test("水系背景仅保留河湖，原始 MultiLineString 的空缺在局部覆盖后仍分离", () => {
  const river = fixture("separate-river", { type: "MultiLineString", coordinates: [[[0, 0], [3, 0]], [[5, 0], [8, 0]]] }, [0, 0, 8, 0]);
  const mountain = fixture("mountain", { type: "LineString", coordinates: [[0, 0], [3, 0]] }, [0, 0, 3, 0], "mountain");
  const sea = fixture("sea", { type: "Polygon", coordinates: [[[0, 0], [3, 0], [3, 3], [0, 0]]] }, [0, 0, 3, 3], "sea");
  const plateau = { ...mountain, properties: { ...mountain.properties, id: "plateau", kind: "plateau" as const } };
  const input = collection(river, mountain, sea, plateau), snapshot = structuredClone(input);
  const output = contextWaterGeometry(input, false, [[1, -1, 2, 1]]);
  assert.equal(output.features.length, 1);
  assert.equal(output.features[0].properties.id, river.properties.id);
  assert.equal(output.features[0].geometry.type, "MultiLineString");
  const lines = sourceLines(output.features[0].geometry as MultiLineString);
  assert.deepEqual(lines, [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[5, 0], [8, 0]]]);
  assertOnlySourceSegments(lines, sourceLines(river.geometry as MultiLineString));
  assert.deepEqual(input, snapshot);
});

test("黄河替换范围只作用于黄河，详细水系覆盖范围则只移除覆盖内的各河线", () => {
  const geometry: LineString = { type: "LineString", coordinates: [[110, 35], [120, 35]] };
  const yellow = fixture("yellow", geometry, [110, 35, 120, 35], "river", "river-huanghe");
  const other = fixture("other", structuredClone(geometry), [110, 35, 120, 35]);
  const input = collection(yellow, other);
  const replacement = contextWaterGeometry(input, true, []);
  assert.deepEqual(replacement.features.find(feature => feature.properties.id === "other")?.geometry, other.geometry);
  const keptYellow = replacement.features.find(feature => feature.properties.id === "yellow")!;
  assert.deepEqual(sourceLines(keptYellow.geometry as MultiLineString), [[[110, 35], [lowerYellowRiverMask[0], 35]]]);
  const detailed = contextWaterGeometry(input, false, [[113, 34, 115, 36]]);
  for (const feature of detailed.features) {
    assert.deepEqual(sourceLines(feature.geometry as MultiLineString), [[[110, 35], [113, 35]], [[115, 35], [120, 35]]]);
  }
  const both = contextWaterGeometry(input, true, [[110.5, 34, 111.5, 36]]);
  assert.deepEqual(sourceLines(both.features.find(feature => feature.properties.id === "yellow")!.geometry as MultiLineString),
    [[[110, 35], [110.5, 35]], [[111.5, 35], [lowerYellowRiverMask[0], 35]]]);
});

test("湖泊只有完全落在详细水系覆盖内才被替换，部分覆盖的湖面保持原几何", () => {
  const covered = fixture("covered", { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] }, [1, 1, 2, 2], "lake");
  const partial = fixture("partial", { type: "Polygon", coordinates: [[[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]] }, [2, 2, 4, 4], "lake");
  const outside = fixture("outside", { type: "MultiPolygon", coordinates: [[[[5, 5], [6, 5], [6, 6], [5, 5]]]] }, [5, 5, 6, 6], "lake");
  const output = contextWaterGeometry(collection(covered, partial, outside), false, [[0, 0, 3, 3]]);
  assert.deepEqual(output.features, [partial, outside]);
});

test("真实黄河上游的全部顶点、形状和独立分段保留，只裁掉现代下游覆盖段", () => {
  const snapshot = structuredClone(modernWater);
  const output = contextWaterGeometry(modernWater, true, []);
  const originalYellow = modernWater.features.filter(feature => feature.properties.groupId === "river-huanghe");
  assert.equal(originalYellow.length, 3);
  const upper = originalYellow.filter(feature => feature.properties.bounds[2] < lowerYellowRiverMask[0]);
  assert.equal(upper.length, 2);
  for (const feature of upper) {
    const kept = output.features.find(candidate => candidate.properties.id === feature.properties.id)!;
    assert.ok(kept, `${feature.properties.id}: upper river retained`);
    const before = sourceLines(feature.geometry as MultiLineString), after = sourceLines(kept.geometry as MultiLineString);
    assert.equal(after.length, before.length);
    before.forEach((line, index) => {
      assert.deepEqual(after[index][0], line[0]);
      assert.deepEqual(after[index].at(-1), line.at(-1));
      let nextIndex = 0;
      for (const point of line) {
        const found = after[index].findIndex((candidate, candidateIndex) => candidateIndex >= nextIndex && candidate[0] === point[0] && candidate[1] === point[1]);
        assert.ok(found >= 0, `${feature.properties.id}: original upper river vertex retained in order`);
        nextIndex = found + 1;
      }
    });
    assertOnlySourceSegments(after, before);
    assert.deepEqual(boundsOf(after.flat()), boundsOf(before.flat()));
  }
  const lower = originalYellow.find(feature => feature.properties.bounds[2] > lowerYellowRiverMask[0])!;
  const lowerBefore = sourceLines(lower.geometry as MultiLineString);
  const lowerAfter = sourceLines(output.features.find(feature => feature.properties.id === lower.properties.id)!.geometry as MultiLineString);
  assert.ok(lowerBefore.flat().some(point => point[0] > 119));
  assert.ok(lowerAfter.flat().every(point => point[0] <= lowerYellowRiverMask[0] + 1e-10));
  assert.ok(lowerAfter.flat().some(point => point[0] < 111));
  assertOnlySourceSegments(lowerAfter, lowerBefore);
  assert.deepEqual(modernWater, snapshot);
});

test("未启用历史下游替换时现代水系原样保留；启用后所有其他河湖保持原几何", () => {
  const onlyWater = modernWater.features.filter(feature => feature.properties.kind === "river" || feature.properties.kind === "lake");
  assert.deepEqual(contextWaterGeometry(modernWater, false, []).features, onlyWater);
  const output = contextWaterGeometry(modernWater, true, []);
  const others = onlyWater.filter(feature => feature.properties.groupId !== "river-huanghe");
  assert.deepEqual(output.features.filter(feature => feature.properties.groupId !== "river-huanghe"), others);
});
