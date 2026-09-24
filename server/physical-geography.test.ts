import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { Position, Polygon, MultiPolygon } from "geojson";
import { simplifiedChinese } from "../shared/boundary-search";
import type { PhysicalFeatureCollection, PhysicalInteractionIndex } from "../shared/physical-geography";

const root = fileURLToPath(new URL("../", import.meta.url));
async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}
const data = await readJson<PhysicalFeatureCollection>("public/data/physical-interactive.geojson");
const index = await readJson<PhysicalInteractionIndex>("public/data/physical-interactions.json");
const regions = await readJson<PhysicalFeatureCollection>("public/data/physical-regions.geojson");
const manifest = await readJson<{
  repositoryCommit: string;
  sources: { dataset: string; url: string; snapshotPath: string; sha256: string; downloadedAt: string }[];
  readOnlyInputs: { path: string; sha256: string }[];
  outputs: Record<string, { sha256: string; bytes: number }>;
  featureCounts: Record<string, number>;
}>("public/data/physical-geography-sources.json");
const byId = new Map(data.features.map(feature => [feature.properties.id, feature]));

function vertices(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as Position];
  return value.flatMap(vertices);
}

function segmentDistance(point: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function inRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (segmentDistance(point, a, b) < 1e-10) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function insidePolygon(point: Position, geometry: Polygon | MultiPolygon): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(hole => inRing(point, hole)));
}

test("山系和海域使用固定公开源的完整多边形，河湖复制现有几何且原文件未变", async () => {
  const originalById = new Map<string, { geometry: unknown }>();
  for (const input of manifest.readOnlyInputs) {
    const bytes = await readFile(path.join(root, input.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), input.sha256, input.path);
    if (!input.path.endsWith("physical-labels.geojson")) {
      for (const feature of JSON.parse(bytes.toString()).features) originalById.set(feature.id, feature);
    }
  }
  const sources = new Map<string, { features: { geometry: unknown }[] }>();
  for (const source of manifest.sources) {
    assert.ok(source.url.includes(manifest.repositoryCommit), "下载地址固定版本");
    assert.ok(Number.isFinite(Date.parse(source.downloadedAt)));
    const bytes = await readFile(path.join(root, source.snapshotPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
    sources.set(source.dataset, JSON.parse(bytes.toString()));
  }
  for (const feature of data.features) {
    const p = feature.properties;
    const original = originalById.get(p.id) ?? sources.get(p.sourceDataset)?.features[p.sourceFeatureIndices[0]];
    assert.ok(original, `必须能追溯原始记录：${p.id}`);
    assert.deepEqual(feature.geometry, original.geometry, `不能用猜测范围替换源几何：${p.id}`);
    if (["mountain", "plateau"].includes(p.kind)) assert.match(p.geometryNote, /地图概括命名范围.*不是测绘边界/);
  }
  assert.deepEqual(regions.features, data.features.filter(feature => ["mountain", "plateau"].includes(feature.properties.kind)));
  assert.equal(originalById.size, 277 + 234);
});

test("每个可交互对象都有稳定标识、简体可读名称和落在其实际几何中的定位点", () => {
  assert.equal(byId.size, data.features.length);
  const counts: Record<string, number> = {};
  for (const feature of data.features) {
    const p = feature.properties;
    assert.equal(feature.id, p.id);
    assert.ok(p.name.trim() && p.nameEn.trim() && !/^\d+$/.test(p.name));
    assert.equal(simplifiedChinese(p.name), p.name, p.name);
    assert.equal(p.modernBackgroundOnly, true);
    assert.ok(p.sourceUrl.startsWith("https://") && p.geometryNote);
    assert.ok(Number.isFinite(p.minZoom));
    counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    const points = vertices(feature.geometry.coordinates);
    assert.ok(points.length > 1);
    for (const [lng, lat] of points) assert.ok(Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90);
    const [west, south, east, north] = p.bounds;
    assert.deepEqual([west, south, east, north], [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
      Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]);
    const label = p.labelCoordinates;
    assert.ok(label[0] >= west && label[0] <= east && label[1] >= south && label[1] <= north);
    const geometry = feature.geometry;
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      assert.ok(insidePolygon(label, geometry), `${p.name} 定位点不能落到范围外或湖中孔洞中`);
    } else {
      const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
      assert.ok(lines.some(line => line.slice(1).some((b, i) => segmentDistance(label, line[i], b) < 1e-9)), `${p.name} 定位点必须在河线上`);
    }
  }
  assert.deepEqual(counts, manifest.featureCounts);
  const names = new Set(data.features.map(f => f.properties.name));
  for (const name of ["黄河", "长江", "秦岭", "太行山", "祁连山", "天山山脉", "昆仑山脉", "喜马拉雅山脉", "青藏高原", "黄土高原", "云贵高原", "蒙古高原"]) assert.ok(names.has(name), name);
  assert.ok(!names.has("塔什干日本滞留者墓地"), "不恢复上游明显错译湖名");
});

test("搜索分组完整覆盖图形，长江黄河分段统一高亮且同音河流不误合并", () => {
  const groupedIds: string[] = [];
  const groups = new Map(index.groups.map(group => [group.id, group]));
  assert.equal(groups.size, index.groups.length);
  for (const group of index.groups) {
    assert.equal(group.id, group.groupId);
    assert.ok(group.featureIds.length > 0 && group.name);
    for (const id of group.featureIds) {
      const feature = byId.get(id);
      assert.ok(feature, id);
      assert.equal(feature.properties.groupId, group.id);
      assert.equal(feature.properties.name, group.name);
      groupedIds.push(id);
      const b = feature.properties.bounds;
      assert.ok(b[0] >= group.bounds[0] && b[1] >= group.bounds[1] && b[2] <= group.bounds[2] && b[3] <= group.bounds[3]);
    }
  }
  assert.equal(new Set(groupedIds).size, groupedIds.length);
  assert.deepEqual(groupedIds.sort(), [...byId.keys()].sort());
  assert.equal(groups.get("river-changjiang")?.featureIds.length, 2);
  assert.equal(groups.get("river-huanghe")?.featureIds.length, 3);
  assert.equal(groups.get("river-minjiang-sichuan")?.name, "岷江");
  assert.equal(groups.get("river-minjiang-fujian")?.name, "闽江");
  assert.notEqual(groups.get("river-minjiang-sichuan")?.id, groups.get("river-minjiang-fujian")?.id);
  const huang = groups.get("river-huanghe")!;
  assert.ok(huang.featureIds.includes("ne_10m_rivers_lake_centerlines-953"), "穿湖线与同一河流一并高亮");
});

test("发布资产的哈希与来源清单一致", async () => {
  for (const [filename, expected] of Object.entries(manifest.outputs)) {
    const bytes = await readFile(path.join(root, "public/data", filename));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256);
  }
});
