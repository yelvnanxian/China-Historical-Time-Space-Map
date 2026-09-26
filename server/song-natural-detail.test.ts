import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { riverEpochAtYear, type RiverManifest } from "../shared/historical-rivers";
import { detailBelongsToPeriod, replaceModernYellowGeometry, showTangDetail, canSelectTangDetail } from "../shared/tang-detail-display";
import type { TangDetailCollection, TangDetailManifest } from "../shared/tang-detail";
import type { MountainShapesManifest } from "../shared/mountain-shapes";

const root = new URL("../", import.meta.url);
const bytes = (path: string) => readFileSync(new URL(path, root));
const json = <T,>(path: string): T => JSON.parse(bytes(path).toString());
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const manifest = json<TangDetailManifest>("public/data/tang-detail/manifest.json");
const collection = (url: string): TangDetailCollection => JSON.parse((url.endsWith(".gz") ? gunzipSync(bytes(`public${url}`)) : bytes(`public${url}`)).toString());

test("宋代所有城市入口具有真实现代取数窗口，覆盖审计不把查询框当历史或完整地物边界", () => {
  const places = json<{ places: { id: string; periodIds: string[]; coordinates: [number, number] }[] }>("data/catalog.json").places.filter(p => p.periodIds.includes("song"));
  const audit = json<{ note: string; placeCount: number; coveredPlaceCount: number; uncoveredPlaceIds: string[]; places: { placeId: string; coordinates: number[]; queryRegionIds: string[] }[] }>("data/evidence/song-natural-coverage.json");
  assert.equal(audit.placeCount, places.length);
  assert.equal(audit.coveredPlaceCount, places.length);
  assert.deepEqual(audit.uncoveredPlaceIds, []);
  assert.match(audit.note, /不表示所有河湖山峰已收录/);
  for (const place of places) {
    const [lon, lat] = place.coordinates;
    const regions = manifest.modernCoverageRegions.filter(r => r.bounds[0] <= lon && lon <= r.bounds[2] && r.bounds[1] <= lat && lat <= r.bounds[3]);
    assert.ok(regions.length, place.id);
    const row = audit.places.find(r => r.placeId === place.id)!;
    assert.ok(row, place.id);
    assert.deepEqual(row.coordinates, place.coordinates);
    assert.deepEqual(row.queryRegionIds, regions.map(r => r.id));
    for (const region of regions) assert.ok(region.packageIds.length > 0, region.id);
  }
});

test("宋1200年黄河使用1128—1368真实分段几何，现代下游及关联水面同步替换", () => {
  const rivers = json<RiverManifest>("public/data/historical-rivers/manifest.json");
  const epoch = riverEpochAtYear(rivers.epochs, 1200)!;
  assert.equal(epoch.id, "yellow-1128-1368");
  assert.equal(hash(bytes(`public${epoch.url}`)), epoch.geometrySha256);
  const geometry = json<TangDetailCollection>(`public${epoch.url}`);
  const raw = json<TangDetailCollection>(epoch.snapshotPath);
  assert.deepEqual(geometry.features.map(f => f.geometry), raw.features.map(f => f.geometry));
  const water = collection(manifest.modernRegions.find(r => r.id === "central-plains-overview-part0")!.url);
  const yellow = water.features.find(f => f.properties.id === "osm-way-396407371")!;
  assert.ok(yellow);
  assert.equal(detailBelongsToPeriod(yellow.properties, "song"), true);
  const associations = json<{ associations: { waterId: string }[] }>("public/data/tang-detail/yellow-river-water-associations.json");
  const ids = new Set(associations.associations.map(item => item.waterId));
  assert.equal(replaceModernYellowGeometry(yellow, true, ids), undefined);
  assert.equal(replaceModernYellowGeometry(yellow, false, ids), yellow);
  for (const historical of collection(manifest.historical.url).features) assert.equal(detailBelongsToPeriod(historical.properties, "song"), false);
});

test("宋代低山近览使用可追溯的真实峰点和50米等高线，点选模式不删除现代图形", () => {
  const terrain = json<MountainShapesManifest>("public/data/mountain-shapes/manifest.json");
  for (const id of ["hangzhou-beigaofeng", "nanjing-beigaofeng", "fuzhou-gushan", "quanzhou-qingyuan", "nanchang-shigunao"]) {
    const area = terrain.areas.find(item => item.id === id)!;
    assert.ok(area, id);
    assert.equal(area.contourInterval, 50);
    assert.equal(area.indexInterval, 250);
    assert.equal(area.minZoom, 9);
    assert.equal(area.modernReferenceOnly, true);
    const peak = collection(area.sourcePeak.sourcePackUrl).features.find(f => f.properties.id === area.sourcePeak.id)!;
    assert.ok(peak);
    assert.equal(peak.properties.kind, "peak");
    assert.equal(peak.geometry.type, "Point");
    if (peak.geometry.type !== "Point") throw Error("source peak must be a point");
    assert.deepEqual(peak.geometry.coordinates, area.center);
    assert.equal(detailBelongsToPeriod(peak.properties, "song"), true);
    for (const mode of ["all", "cities", "mountains", "rivers"] as const) {
      assert.equal(showTangDetail(peak.properties, 12, mode), true);
      assert.equal(canSelectTangDetail(peak.properties, mode), mode === "all" || mode === "mountains");
    }
  }
});
