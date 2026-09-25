import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import type { MountainDetailCollection, MountainDetailManifest } from "../shared/mountain-detail";
import { simplifiedChinese } from "../shared/boundary-search";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest: MountainDetailManifest = JSON.parse(await readFile(path.join(root, "public/data/mountain-detail/manifest.json"), "utf8"));
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Element = { type: "way" | "node"; id: number; version: number; lat?: number; lon?: number; nodes?: number[]; geometry?: { lat: number; lon: number }[]; tags: Record<string, string> };

test("山地资料每个查询与完整原始快照的哈希可追溯", async () => {
  assert.equal(manifest.acquisition.complete, true, "Release must contain all requested query snapshots");
  assert.deepEqual(manifest.acquisition.missingTiles, []);
  assert.deepEqual(manifest.regions.map(region => region.id), ["qinling", "taihang", "qilian", "tianshan", "west-sichuan"]);
  assert.ok(manifest.sources.length >= 5);
  for (const source of manifest.sources) {
    const bytes = await readFile(path.join(root, source.snapshotPath));
    assert.equal(sha(bytes), source.snapshotSha256, source.id);
    assert.equal(sha(gunzipSync(bytes)), source.uncompressedSnapshotSha256, source.id);
    const query = await readFile(path.join(root, source.queryPath));
    assert.equal(sha(query), source.querySha256, source.id);
    assert.match(query.toString(), /out meta geom;/);
    assert.equal(source.modernReferenceOnly, true);
    assert.ok(source.attribution.includes("OpenStreetMap") && source.license.includes("ODbL"));
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
  }
});

test("所有山脊线逐顶点等于完整OSM way，山峰不连接、不用命名范围代替实测线", async () => {
  const originals = new Map<string, Map<string, Element>>();
  for (const source of manifest.sources) {
    const raw = JSON.parse(gunzipSync(await readFile(path.join(root, source.snapshotPath))).toString("utf8"));
    assert.equal(raw.elements.length, source.elementCount);
    originals.set(source.id, new Map(raw.elements.map((element: Element) => [`osm-${element.type}-${element.id}`, element])));
  }
  const ids = new Set<string>();
  const counts: Record<string, number> = { ridge: 0, arete: 0, cliff: 0, peak: 0 };
  let chinese = 0;
  for (const pack of manifest.packs) {
    const data: MountainDetailCollection = JSON.parse(gunzipSync(await readFile(path.join(root, "public", pack.url))).toString("utf8"));
    assert.equal(data.features.length, pack.featureCount);
    for (const feature of data.features) {
      const p = feature.properties;
      assert.ok(!ids.has(p.id), `Duplicate ${p.id}`); ids.add(p.id);
      counts[p.kind] += 1;
      if (p.hasChineseName) chinese += 1;
      const original = originals.get(p.sourceId)?.get(p.id);
      assert.ok(original, p.id);
      assert.deepEqual(p.tags, original.tags);
      assert.equal(p.kind, original.tags.natural);
      assert.equal(p.osmVersion, original.version);
      assert.equal(p.sourceUrl, `https://www.openstreetmap.org/${original.type}/${original.id}`);
      assert.equal(p.modernReferenceOnly, true);
      assert.match(p.geometryNote, /现代/);
      assert.equal(p.name, simplifiedChinese(p.name));
      if (feature.geometry.type === "Point") {
        assert.equal(p.kind, "peak");
        assert.equal(original.type, "node");
        assert.ok(Object.keys(original.tags).some(key => /^name(:.*)?$/.test(key) && original.tags[key]));
        assert.deepEqual(feature.geometry.coordinates, [original.lon, original.lat]);
        assert.equal(p.mappedLengthKm, undefined);
      } else {
        assert.equal(original.type, "way");
        assert.ok(["ridge", "arete", "cliff"].includes(p.kind));
        assert.equal(feature.geometry.coordinates.length, original.nodes?.length, `${p.id} must keep complete way`);
        assert.deepEqual(feature.geometry.coordinates, original.geometry?.map(point => [point.lon, point.lat]));
        assert.ok(p.mappedLengthKm !== undefined && p.mappedLengthKm > 0);
        assert.ok(feature.geometry.coordinates.some(point => point[0] === p.labelCoordinates[0] && point[1] === p.labelCoordinates[1]));
      }
      const points = feature.geometry.type === "Point" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const [x, y] of points) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(x >= p.bounds[0] && y >= p.bounds[1] && x <= p.bounds[2] && y <= p.bounds[3]);
        assert.ok(x >= pack.bounds[0] && y >= pack.bounds[1] && x <= pack.bounds[2] && y <= pack.bounds[3]);
      }
    }
  }
  assert.equal(ids.size, manifest.featureCount);
  assert.equal(chinese, manifest.namedChineseCount);
  assert.deepEqual(counts, manifest.countsByKind);
  assert.ok(counts.ridge > 100 && counts.cliff > 100 && counts.peak > 100);
});
