import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  comparisonCityRecord, comparisonGeometryBounds, comparisonLinkLayers, createComparisonCameraSync, initialComparisonYears,
  localizeComparisonRegions, selectComparisonYear, type ComparisonDocuments, type ComparisonRegions,
} from "../shared/boundary-comparison";
import type { BoundaryManifest } from "../shared/boundaries";

const json = async (file: string) => JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), "utf8"));

test("两年选择互换而不重复，任意历史年份可选择邻近资料", () => {
  assert.deepEqual(selectComparisonYear([741, 1200], 0, 1200), [1200, 741]);
  assert.deepEqual(selectComparisonYear([741, 1200], 1, 741), [1200, 741]);
  assert.deepEqual(selectComparisonYear([741, 1200], 1, 1391), [741, 1391]);
  assert.deepEqual(initialComparisonYears(755, [741, 1200, 1391]), [741, 1200]);
  assert.deepEqual(initialComparisonYears(2000, [741, 1080, 1200, 1290, 1391, 1820, 1911]), [1911, 1820]);
});

test("同步相机可承受jumpTo同步触发move，收起重建后保留最后视野", () => {
  const initial = { center: [106.5, 34.5] as [number, number], zoom: 3.4, bearing: 0, pitch: 0 };
  const sync = createComparisonCameraSync(initial);
  let jumps = 0;
  const fakeMap = (side: 0 | 1) => ({
    center: [...initial.center] as [number, number], zoom: initial.zoom,
    getCenter() { return { toArray: () => [...this.center] }; },
    getZoom() { return this.zoom; },
    jumpTo(view: typeof initial) {
      assert.ok(++jumps < 20, "相机同步不应递归反馈");
      this.center = [...view.center]; this.zoom = view.zoom;
      sync.move(side);
    },
  });
  const left = fakeMap(0), right = fakeMap(1);
  sync.attach(0, left); sync.attach(1, right);
  left.center = [117.25, 36.75]; left.zoom = 7.3; sync.move(0);
  assert.deepEqual(right.center, [117.25, 36.75]);
  assert.equal(right.zoom, 7.3);
  right.center = [112.2, 30.8]; right.zoom = 8.1; sync.move(1);
  assert.deepEqual(left.center, [112.2, 30.8]);
  sync.attach(0, null); sync.attach(1, null);
  const restoredRight = fakeMap(1), restoredLeft = fakeMap(0);
  sync.attach(1, restoredRight); sync.attach(0, restoredLeft);
  for (const map of [restoredLeft, restoredRight]) {
    assert.deepEqual(map.center, [112.2, 30.8]);
    assert.equal(map.zoom, 8.1);
  }
  assert.equal(jumps, 6);
});

test("相机同步发生异常后释放锁，重建另一侧仍可恢复同步", () => {
  const initial = { center: [106.5, 34.5] as [number, number], zoom: 3.4, bearing: 0, pitch: 0 };
  const sync = createComparisonCameraSync(initial);
  const broken = { getCenter: () => ({ toArray: () => [100, 30] }), getZoom: () => 6, jumpTo: () => { throw Error("context unavailable"); } };
  assert.throws(() => sync.attach(1, broken), /context unavailable/);
  sync.attach(1, null);
  let received: typeof initial | undefined;
  const source = { getCenter: () => ({ toArray: () => [112, 35] }), getZoom: () => 6, jumpTo: () => {} };
  sync.attach(0, source);
  sync.move(0);
  sync.attach(1, { getCenter: () => ({ toArray: () => [0, 0] }), getZoom: () => 3, jumpTo: view => { received = view; sync.move(1); } });
  assert.deepEqual(received, { center: [112, 35], zoom: 6, bearing: 0, pitch: 0 });
});

test("三朝关联只使用已有目录键，不因城市同名、别名或相邻范围补配", async () => {
  const [tang, song, ming] = await Promise.all([json("tang-boundary-crosswalk.json"), json("song-boundary-research.json"), json("ming-boundary-research.json")]);
  const docs: ComparisonDocuments = { tang, song, ming };
  for (const year of [741, 1200, 1391] as const) {
    assert.equal(comparisonCityRecord("unlisted-place", year, docs).links.length, 0);
    assert.equal(comparisonCityRecord("洛阳", year, docs).links.length, 0);
    assert.ok(comparisonCityRecord("luoyang", year, docs).links.length > 0);
  }
  assert.equal(comparisonCityRecord("tongguan", 1200, docs).links.length, 0);
  assert.match(comparisonCityRecord("tongguan", 1200, docs).missingReason, /关隘/);
  assert.equal(comparisonCityRecord("tongguan", 1391, docs).links.length, 0);
  assert.equal(comparisonCityRecord("guiyang", 1391, docs).links.length, 0);
  const kaifengSong = comparisonCityRecord("kaifeng", 1200, docs);
  assert.ok(kaifengSong.links.every(link => link.polity === "金"));
});

test("关联读取层级取自记录，不会拿异年层或缺失邻近层替代", async () => {
  const manifest: BoundaryManifest = await json("boundaries/manifest.json");
  const tang = manifest.datasets.find(dataset => dataset.year === 741)!;
  assert.deepEqual(comparisonLinkLayers(tang, [{ boundaryId: "hartwell-1200-county-example", name: "异年县", note: "", level: "county" }]), []);
  assert.deepEqual(comparisonLinkLayers(tang, [{ boundaryId: "hartwell-741-prefecture-example", name: "本年州", note: "", level: "prefecture" }]), ["prefecture"]);
});

test("显示名称保留原始几何并过滤外文", () => {
  const geometry = { type: "Polygon" as const, coordinates: [[[1, 2], [4, 2], [4, 6], [1, 2]]] };
  const regions: ComparisonRegions = { type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: { id: "example", name: "Unknown", year: 1200, level: "county", sourceId: "test" } }] };
  const localized = localizeComparisonRegions(regions);
  assert.strictEqual(localized.features[0].geometry, geometry);
  assert.equal(localized.features[0].properties.name, "Unknown");
  assert.equal(localized.features[0].properties.displayName, "来源未命名区域");
  assert.deepEqual(comparisonGeometryBounds(localized.features), [[1, 2], [4, 6]]);
  assert.equal(comparisonGeometryBounds([]), undefined);
});

test("宋代纠正名称优先于原始名称，现代对照也只显示中文", async () => {
  const song = await json("song-boundary-research.json");
  const correction = Object.values(song.byBoundary).find((record: any) => record.displayCorrection) as any;
  assert.ok(correction, "实际资料应有经过核对的名称纠正");
  const source: ComparisonRegions = await json(`boundaries/hartwell-1200-${correction.modelLevel}.geojson`);
  const original = source.features.find(feature => feature.properties.id === correction.boundaryId)!;
  const result = localizeComparisonRegions({ type: "FeatureCollection", features: [original] }, { version: "test", sources: [], entries: { [correction.boundaryId]: { historicalName: original.properties.name, simplifiedName: original.properties.name, modernNames: ["Test city", "南京市"], method: "representative-point", note: "", sourceIds: [] } } }, song);
  assert.equal(result.features[0].properties.displayName, correction.displayCorrection.name);
  assert.equal(result.features[0].properties.modernLabel, "现代对应待核、南京市");
  assert.strictEqual(result.features[0].geometry, original.geometry);
});

test("全部实际城市关联都能按其精确ID取回原面，缺关联保持空集", async () => {
  const [tang, song, ming, manifest] = await Promise.all([json("tang-boundary-crosswalk.json"), json("song-boundary-research.json"), json("ming-boundary-research.json"), json("boundaries/manifest.json")]) as [ComparisonDocuments["tang"], ComparisonDocuments["song"], ComparisonDocuments["ming"], BoundaryManifest];
  const docs = { tang, song, ming };
  const ids = new Set([...Object.keys(tang!.places), ...Object.values(song!.byBoundary).map(record => record.catalogPlaceId), ...Object.values(ming!.byBoundary).map(record => record.researchEntryId.replace(/^ming-geography-/, ""))]);
  for (const year of [741, 1200, 1391] as const) {
    const dataset = manifest.datasets.find(item => item.year === year)!;
    const batches: ComparisonRegions[] = await Promise.all(dataset.layers.filter(layer => layer.level === "prefecture" || layer.level === "county").map(layer => json(layer.url.replace("/data/", ""))));
    const modelIds = new Set(batches.flatMap(batch => batch.features.map(feature => feature.properties.id)));
    for (const id of ids) for (const link of comparisonCityRecord(id, year, docs).links) assert.ok(modelIds.has(link.boundaryId), `${year} ${id} ${link.boundaryId}`);
  }
});
