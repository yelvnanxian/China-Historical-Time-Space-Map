import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { Position, Polygon, MultiPolygon } from "geojson";
import type { MountainDirectionAvailability, MountainDirectionCollection } from "../shared/mountain-directions";
import type { PhysicalFeatureCollection } from "../shared/physical-geography";

const root = fileURLToPath(new URL("../", import.meta.url));
async function json<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}
const data = await json<MountainDirectionCollection>("public/data/mountain-directions.geojson");
const original = await json<PhysicalFeatureCollection>("public/data/physical-regions.geojson");
const byId = new Map(original.features.map(feature => [feature.properties.groupId, feature]));
const manifest = await json<{
  method: string;
  source: { snapshotPath: string; sha256: string; url: string };
  input: { path: string; sha256: string };
  output: { path: string; sha256: string; bytes: number };
  validation: { path: string; sha256: string };
  availability: MountainDirectionAvailability[];
  counts: { candidateMountains: number; withDirection: number; labelOnly: number; skippedComponents: number };
}>("public/data/mountain-directions-sources.json");

function distance(point: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / denominator));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function inRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (distance(point, a, b) < 1e-8) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function inPolygon(point: Position, coordinates: Position[][]): boolean {
  return inRing(point, coordinates[0]) && !coordinates.slice(1).some(ring => inRing(point, ring));
}

test("仅山系生成有来源的示意线，不伪造高原海域线或闭合范围", () => {
  const ids = new Set<string>(), groups = new Set<string>();
  for (const feature of data.features) {
    const p = feature.properties;
    assert.ok(!ids.has(p.id) && !groups.has(p.groupId));
    ids.add(p.id); groups.add(p.groupId);
    const source = byId.get(p.groupId);
    assert.ok(source && source.properties.kind === "mountain");
    assert.equal(p.sourcePolygonId, source.properties.id);
    assert.equal(p.name, source.properties.name);
    assert.equal(p.kind, "mountain");
    assert.equal(p.schematic, true);
    assert.equal(p.sourceUrl, source.properties.sourceUrl);
    assert.equal(p.method, manifest.method);
    assert.match(p.geometryNote, /走向示意，非测绘山脊线/);
    assert.match(p.geometryNote, /概括范围/);
    assert.ok(["LineString", "MultiLineString"].includes(feature.geometry.type));
    const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const line of lines) {
      assert.ok(line.length >= 2);
      assert.notDeepEqual(line[0], line.at(-1), "不能把闭合外轮廓伪装成山系走向");
    }
  }
  assert.equal(data.features.length, manifest.counts.withDirection);
});

test("走向线和定位点位于实际来源内部，各多面分量不跨空白强连", () => {
  for (const feature of data.features) {
    const p = feature.properties;
    const source = byId.get(p.groupId)!.geometry as Polygon | MultiPolygon;
    const polygons = source.type === "Polygon" ? [source.coordinates] : source.coordinates;
    const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const allPoints = lines.flat();
    for (const line of lines) {
      const probes: Position[] = [line[0]];
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        for (const t of [0.25, 0.5, 0.75, 1]) probes.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      assert.ok(polygons.some(polygon => probes.every(point => inPolygon(point, polygon))), `${p.name} 单段不可跨分离来源面或绕到外部`);
      const strictlyInterior = line.filter(point => polygons.some(polygon => inPolygon(point, polygon) && polygon.every(ring =>
        ring.slice(1).every((b, i) => distance(point, ring[i], b) > 1e-6))));
      assert.ok(strictlyInterior.length / line.length > 0.8, `${p.name} 不应描绘来源外边界`);
    }
    const label = p.labelCoordinates;
    assert.ok(lines.some(line => line.slice(1).some((b, i) => distance(label, line[i], b) < 1e-9)), `${p.name} 名称定位点必须在线上`);
    assert.deepEqual(p.bounds, [Math.min(...allPoints.map(point => point[0])), Math.min(...allPoints.map(point => point[1])),
      Math.max(...allPoints.map(point => point[0])), Math.max(...allPoints.map(point => point[1]))]);
  }
});

test("52个候选都有导线或仅名称状态，不适合者明确保留原因", () => {
  const candidates = original.features.filter(feature => feature.properties.kind === "mountain");
  const directions = new Set(data.features.map(feature => feature.properties.groupId));
  assert.equal(manifest.availability.length, candidates.length);
  assert.equal(new Set(manifest.availability.map(item => item.groupId)).size, candidates.length);
  assert.deepEqual(manifest.availability.map(item => item.groupId).sort(), candidates.map(feature => feature.properties.groupId).sort());
  for (const status of manifest.availability) {
    assert.ok(status.reason.trim());
    assert.equal(directions.has(status.groupId), status.status === "available");
  }
  assert.equal(candidates.length, 52);
  assert.equal(manifest.counts.withDirection + manifest.counts.labelOnly, candidates.length);
  assert.ok(manifest.availability.some(item => item.name === "南高止山脉" && item.status === "label-only" && item.reason.includes("主方向")));
  for (const name of ["秦岭", "昆仑山脉", "喜马拉雅山脉", "天山山脉", "祁连山", "太行山"]) {
    assert.ok(data.features.some(feature => feature.properties.name === name), name);
  }
});

test("派生数据、原面、原始快照与完整几何验证报告均有一致校验值", async () => {
  for (const item of [manifest.input, manifest.output, manifest.validation,
    { path: manifest.source.snapshotPath, sha256: manifest.source.sha256 }]) {
    const bytes = await readFile(path.join(root, item.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, item.path);
  }
  const validation = await json<{ records: { name: string; status: string; outsideSourceLengthDegrees?: number;
    labelDistanceToLineDegrees?: number; components: { status: string; reason: string }[] }[] }>(manifest.validation.path);
  assert.equal(validation.records.length, 52);
  for (const record of validation.records.filter(item => item.status === "available")) {
    assert.ok((record.outsideSourceLengthDegrees ?? Infinity) < 1e-8, `${record.name} 连续线段不能越过原面`);
    assert.ok((record.labelDistanceToLineDegrees ?? Infinity) < 1e-9);
  }
  assert.equal(validation.records.flatMap(record => record.components).filter(component => component.status === "skipped").length,
    manifest.counts.skippedComponents);
});
