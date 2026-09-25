import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson";
import type { TangDetailCollection, TangDetailManifest, TangDetailProperties } from "../shared/tang-detail";

const root = fileURLToPath(new URL("../", import.meta.url));
interface LinkEvidence {
  riverId: string;
  riverSourceUrl: string;
  riverSourceId: string;
  nameMatches: { key: string; value: string; normalized: string }[];
  sourceVertexIndex: number;
  sourcePoint: [number, number];
  interiorVertexCount: number;
  intersectionLengthDegrees: number;
}
interface WaterAssociation {
  waterId: string;
  waterSourceUrl: string;
  waterSourceId: string;
  riverIds: string[];
  evidence: LinkEvidence[];
  bounds: [number, number, number, number];
}
const filename = path.join(root, "public/data/tang-detail/yellow-river-water-associations.json");
const bytes = await readFile(filename);
const data: { associations: WaterAssociation[]; statistics: Record<string, number> } = JSON.parse(bytes.toString("utf8"));
const audit = JSON.parse(await readFile(path.join(root, "data/evidence/tang-detail/yellow-river-water-association-audit.json"), "utf8"));
const manifestBytes = await readFile(path.join(root, "public/data/tang-detail/manifest.json"));
const manifest: TangDetailManifest = JSON.parse(manifestBytes.toString("utf8"));
const wanted = new Set(data.associations.flatMap(item => [item.waterId, ...item.riverIds]));
const features = new Map<string, TangDetailCollection["features"][number]>();
for (const pack of manifest.modernRegions.filter(pack => pack.minZoom === 8 || pack.countsByKind.water)) {
  const packData: TangDetailCollection = JSON.parse(gunzipSync(await readFile(path.join(root, "public", pack.url))).toString("utf8"));
  for (const feature of packData.features) if (wanted.has(feature.properties.id)) features.set(feature.properties.id, feature);
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replaceAll("黃", "黄").toLowerCase().replace(/\s/g, "");
}

function strictlyInRing(point: number[], ring: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [ax, ay] = ring[previous];
    const [bx, by] = ring[index];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-13 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return false;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function strictlyInWater(point: number[], geometry: Polygon | MultiPolygon) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(polygon => strictlyInRing(point, polygon[0]) && polygon.slice(1).every(hole => !strictlyInRing(point, hole)));
}

test("现代黄河水面关联的每条证据都是主河真实源顶点且严格落在水面内", () => {
  assert.equal(data.associations.length, 33);
  assert.equal(new Set(data.associations.map(item => item.waterId)).size, data.associations.length);
  let links = 0;
  for (const association of data.associations) {
    const water = features.get(association.waterId)!;
    assert.ok(water, association.waterId);
    assert.equal(water.properties.kind, "water");
    assert.equal(water.properties.tags?.water, "river");
    assert.ok(water.geometry.type === "Polygon" || water.geometry.type === "MultiPolygon");
    if (water.geometry.type !== "Polygon" && water.geometry.type !== "MultiPolygon") continue;
    assert.equal(association.waterSourceUrl, water.properties.sourceUrl);
    assert.equal(association.waterSourceId, water.properties.sourceId);
    assert.deepEqual(association.bounds, water.properties.bounds);
    assert.deepEqual(association.riverIds, association.evidence.map(item => item.riverId));
    for (const evidence of association.evidence) {
      const river = features.get(evidence.riverId)! as Feature<LineString, TangDetailProperties>;
      assert.ok(river, evidence.riverId);
      assert.equal(river.properties.kind, "river");
      assert.equal(river.properties.tags?.waterway, "river");
      assert.equal(river.geometry.type, "LineString");
      assert.deepEqual(evidence.sourcePoint, river.geometry.coordinates[evidence.sourceVertexIndex]);
      assert.ok(strictlyInWater(evidence.sourcePoint, water.geometry), association.waterId);
      const innerCount = river.geometry.coordinates.filter(point => strictlyInWater(point, water.geometry as Polygon | MultiPolygon)).length;
      assert.equal(evidence.interiorVertexCount, innerCount);
      assert.ok(evidence.intersectionLengthDegrees > 0);
      assert.equal(evidence.riverSourceUrl, river.properties.sourceUrl);
      assert.equal(evidence.riverSourceId, river.properties.sourceId);
      assert.ok(evidence.nameMatches.length > 0);
      for (const match of evidence.nameMatches) {
        assert.equal(match.value, river.properties.tags?.[match.key]);
        assert.equal(match.normalized, normalized(match.value));
        assert.ok(["黄河", "huanghe", "yellowriver"].includes(match.normalized));
      }
      links += 1;
    }
  }
  assert.equal(links, 47);
});

test("无名主河水面回归与双洎河等名称排除，证据哈希可回查", () => {
  const ids = new Set(data.associations.map(item => item.waterId));
  for (const id of [9732460, 9952665, 8928723, 9967095, 11794477, 11782019, 11810431, 11810650]) assert.ok(ids.has(`osm-relation-${id}`));
  const riverIds = new Set(data.associations.flatMap(item => item.riverIds));
  assert.ok(audit.nameRejections.length > 0);
  assert.ok(audit.nameRejections.some((item: { names: Record<string, string> }) => Object.values(item.names).includes("双洎河")));
  for (const rejection of audit.nameRejections) assert.ok(!riverIds.has(rejection.riverId), rejection.riverId);
  assert.ok(data.statistics.unassociatedWaterSurfaces > data.statistics.associatedWaterSurfaces);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), audit.outputSha256);
  assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), audit.sourceManifestSha256);
});
