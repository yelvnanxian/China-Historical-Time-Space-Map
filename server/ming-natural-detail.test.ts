import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { TangDetailCollection, TangDetailManifest } from "../shared/tang-detail";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root));
const json = async <T,>(path: string): Promise<T> => JSON.parse((await read(path)).toString("utf8"));
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest = await json<TangDetailManifest>("public/data/tang-detail/manifest.json");
const cities = ["datong", "handan", "yinchuan", "dali", "yanzhou", "nanchang", "chongqing", "guilin"];
const regionIds = cities.flatMap(city => city === "chongqing"
  ? ["city-ming-chongqing-east"] : [`city-ming-${city}`]);

test("明代七城及重庆东窗有独立现代查询、可核验的原始响应和地图分包", async () => {
  for (const id of regionIds) {
    const region = manifest.modernCoverageRegions.find(item => item.id === id);
    assert.ok(region, id);
    const metadata = await json<{
      bounds: number[]; snapshotPath: string; snapshotSha256: string;
      uncompressedSnapshotSha256: string; queryPath: string; querySha256: string;
      modernReferenceOnly: boolean; note: string; osmBaseTimestamp: string;
    }>(`data/evidence/tang-detail/osm/${id}-source.json`);
    assert.deepEqual(region.bounds, metadata.bounds, `${id}: query window is the declared coverage`);
    assert.equal(metadata.modernReferenceOnly, true);
    assert.match(metadata.note, /不是历史辖区/);
    assert.ok(Number.isFinite(Date.parse(metadata.osmBaseTimestamp)));
    const rawBytes = await read(metadata.snapshotPath);
    assert.equal(digest(rawBytes), metadata.snapshotSha256);
    assert.equal(digest(gunzipSync(rawBytes)), metadata.uncompressedSnapshotSha256);
    const query = await read(metadata.queryPath);
    assert.equal(digest(query), metadata.querySha256);
    assert.match(query.toString(), /out meta geom;/);
    const packs = manifest.modernRegions.filter(pack => pack.regionId === id);
    assert.ok(packs.some(pack => pack.minZoom === 8), `${id}: overview water is available before close zoom`);
    assert.ok(packs.some(pack => pack.minZoom === 10), `${id}: local detail is available when zoomed in`);
    assert.ok(region.packageIds.length > 0);
    const features = (await Promise.all(packs.map(async pack => {
      const data: TangDetailCollection = JSON.parse(gunzipSync(await read(`public${pack.url}`)).toString("utf8"));
      assert.equal(data.features.length, pack.featureCount);
      return data.features;
    }))).flat();
    assert.ok(features.some(feature => feature.properties.kind === "river"), `${id}: real river source records`);
    assert.ok(features.some(feature => feature.properties.kind === "water"), `${id}: real water surface source records`);
    for (const feature of features) {
      assert.equal(feature.properties.modernReferenceOnly, true);
      assert.notEqual(feature.properties.kind, "settlement");
      assert.equal(feature.properties.year, undefined);
      assert.match(feature.properties.geometryNote, /现代OSM原始几何/);
    }
  }
});

test("八城新增河线逐顶点等于原始OSM记录，不用连线补造缺口", async () => {
  for (const id of regionIds) {
    const raw: { elements: { type: string; id: number; geometry?: { lon: number; lat: number }[]; tags?: Record<string, string> }[] } =
      JSON.parse(gunzipSync(await read(`data/evidence/tang-detail/osm/${id}.json.gz`)).toString("utf8"));
    const originals = new Map(raw.elements.map(element => [`osm-${element.type}-${element.id}`, element]));
    for (const pack of manifest.modernRegions.filter(item => item.regionId === id)) {
      const data: TangDetailCollection = JSON.parse(gunzipSync(await read(`public${pack.url}`)).toString("utf8"));
      for (const feature of data.features) {
        const original = originals.get(feature.properties.id);
        assert.ok(original, feature.properties.id);
        assert.deepEqual(feature.properties.tags, original.tags ?? {});
        if (["river", "stream", "canal"].includes(feature.properties.kind)) {
          assert.equal(feature.geometry.type, "LineString");
          if (feature.geometry.type === "LineString") {
            assert.deepEqual(feature.geometry.coordinates, original.geometry?.map(point => [point.lon, point.lat]), feature.properties.id);
          }
        }
      }
    }
  }
});

test("重庆仅发布已取得的东窗，西窗失败明确记录且不宣称完整覆盖", async () => {
  const audit = await json<{ missingRegions: { regionId: string; bounds: number[]; queryPath: string; querySha256: string; reason: string }[];
    completeCityWindows: number; partiallyCoveredCities: string[]; successfulQueryWindows: number }>("data/evidence/tang-detail/ming-water-expansion.json");
  const west = audit.missingRegions.find(item => item.regionId === "city-ming-chongqing-west")!;
  const east = manifest.modernCoverageRegions.find(item => item.id === "city-ming-chongqing-east")!;
  assert.equal(audit.completeCityWindows, 7);
  assert.deepEqual(audit.partiallyCoveredCities, ["重庆"]);
  assert.equal(audit.successfulQueryWindows, 8);
  assert.equal(manifest.modernCoverageRegions.some(item => item.id === west.regionId), false);
  assert.deepEqual(west.bounds, [106.3504, 29.3637, 106.5504, 29.7637]);
  assert.deepEqual(east.bounds, [106.5504, 29.3637, 106.7504, 29.7637]);
  assert.equal(west.bounds[2], east.bounds[0]);
  assert.equal(west.bounds[1], east.bounds[1]);
  assert.equal(west.bounds[3], east.bounds[3]);
  assert.equal(digest(await read(west.queryPath)), west.querySha256);
  assert.match(west.reason, /未生成或发布/);
});

test("除重庆保留半窗缺口外，明代其余名城参考点均在实际采集窗口内", async () => {
  const catalog = await json<{ places: { id: string; periodIds: string[]; coordinates: [number, number] }[] }>("data/catalog.json");
  const places = catalog.places.filter(place => place.periodIds.includes("ming"));
  assert.ok(places.length >= 28);
  for (const place of places) {
    if (place.id === "yuzhou-chongqing") continue;
    const [longitude, latitude] = place.coordinates;
    assert.ok(manifest.modernCoverageRegions.some(({ bounds }) => longitude >= bounds[0] && longitude <= bounds[2]
      && latitude >= bounds[1] && latitude <= bounds[3]), place.id);
  }
});
