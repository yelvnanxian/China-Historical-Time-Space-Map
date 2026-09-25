import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { boundsOverlap, isModernYellowRiver, replaceModernYellowGeometry, showTangDetail } from "../shared/tang-detail-display";
import type { TangDetailCollection, TangDetailManifest, TangDetailProperties } from "../shared/tang-detail";
import type { MapViewLevel } from "../shared/map-detail-levels";
import { lineOutsideBounds, lowerYellowRiverMask } from "../shared/historical-rivers";

const root = new URL("../public", import.meta.url);
function readCollection(url: string): TangDetailCollection {
  const data = readFileSync(new URL(`.${url}`, `${root.href}/`));
  return JSON.parse((url.endsWith(".gz") ? gunzipSync(data) : data).toString("utf8"));
}
const manifest: TangDetailManifest = JSON.parse(readFileSync(new URL("data/tang-detail/manifest.json", `${root.href}/`), "utf8"));
const historical = readCollection(manifest.historical.url);
const modern = ["central-plains-overview-part0", "jianghuai-overview-part0", "jianghuai-overview-part1", "jianghuai-overview-part2", "jianghuai-240-64-part0"]
  .flatMap(id => readCollection(manifest.modernRegions.find(region => region.id === id)!.url).features);

test("唐代府州与县治依真实资料的不同阈值出现，放大不会提前显示低层治所", () => {
  const prefecture = historical.features.find(feature => feature.properties.level === "prefecture")!.properties;
  const county = historical.features.find(feature => feature.properties.level === "county")!.properties;
  assert.equal(prefecture.minZoom, 6);
  assert.equal(county.minZoom, 7.2);
  assert.equal(showTangDetail(prefecture, 5.99, "both", "auto"), false);
  assert.equal(showTangDetail(prefecture, 6, "both", "auto"), true);
  assert.equal(showTangDetail(county, 6.6, "both", "auto"), false);
  assert.equal(showTangDetail(county, 7.19, "both", "auto"), false);
  assert.equal(showTangDetail(county, 7.2, "both", "auto"), true);
  for (const feature of historical.features) {
    const p = feature.properties;
    assert.equal(showTangDetail(p, p.minZoom - .01, "cities", "cities"), false, p.id);
    assert.equal(showTangDetail(p, p.minZoom, "cities", "cities"), true, p.id);
    assert.equal(showTangDetail(p, 14, "nature", "auto"), false, p.id);
  }
});

test("国家、省道、府州手动预设保持纯行政范围；县域与城池预设允许历史治所", () => {
  const p = historical.features.find(feature => feature.properties.level === "county")!.properties;
  for (const mode of ["both", "cities"] as const) {
    for (const level of ["country", "province", "prefecture"] as const) assert.equal(showTangDetail(p, 12, mode, level), false);
    for (const level of ["auto", "county", "cities"] as const) assert.equal(showTangDetail(p, 12, mode, level), true);
  }
});

test("现代河湖在自然模式和同时显示模式遵守各自缩放阈值，在城市模式完全隐藏", () => {
  const levels: MapViewLevel[] = ["auto", "country", "province", "prefecture", "county", "cities"];
  assert.ok(modern.some(feature => feature.properties.minZoom === 8));
  assert.ok(modern.some(feature => feature.properties.minZoom === 10));
  for (const feature of modern) {
    const p = feature.properties;
    assert.equal(p.modernReferenceOnly, true);
    assert.notEqual(p.kind, "settlement");
    for (const level of levels) {
      assert.equal(showTangDetail(p, 14, "cities", level), false, p.id);
      assert.equal(showTangDetail(p, p.minZoom - .01, "nature", level), false, p.id);
      assert.equal(showTangDetail(p, p.minZoom, "nature", level), true, p.id);
      assert.equal(showTangDetail(p, p.minZoom, "both", level), true, p.id);
    }
  }
});

test("替换现代黄河只识别主河，真实的双河水库与名称相近的地方河渠不会误删", () => {
  const expectedUnrelated = [
    ["osm-relation-5942053", "双河水库"], ["osm-way-233075125", "双河水库"],
    ["osm-way-305588438", "季黄河"], ["osm-way-424776373", "上黄河"],
    ["osm-way-245395931", "东姜黄河"], ["osm-way-247018630", "西姜黄河"],
  ];
  for (const [id, name] of expectedUnrelated) {
    const feature = modern.find(item => item.properties.id === id)!;
    assert.ok(feature, `Real source fixture exists: ${id}`);
    assert.equal(feature.properties.name, name);
    assert.ok(boundsOverlap(feature.properties.bounds, lowerYellowRiverMask), `${id}: located within the historical lower-river mask`);
    assert.equal(isModernYellowRiver(feature.properties), false, `${id}: unrelated water must survive the Yellow River replacement`);
  }
  const yellow = modern.find(feature => feature.properties.id === "osm-way-396407371")!;
  assert.equal(yellow.properties.name, "黄河");
  assert.equal(isModernYellowRiver(yellow.properties), true);
  assert.equal(yellow.geometry.type, "LineString");
  if (yellow.geometry.type === "LineString") assert.deepEqual(lineOutsideBounds(yellow.geometry.coordinates, [lowerYellowRiverMask]), []);
});

test("黄河中英文及指定名称别名可识别，任意来源说明与现代故道名称不代替主河身份", () => {
  const base = modern.find(feature => feature.properties.id === "osm-way-396407371")!.properties;
  const property = (change: Partial<TangDetailProperties>): TangDetailProperties => ({ ...base, name: "未命名河流", nameEn: "", tags: {}, ...change });
  for (const name of ["黄河", "黃河", "Yellow River", "HUANG HE", "huanghe"]) assert.equal(isModernYellowRiver(property({ name })), true, name);
  assert.equal(isModernYellowRiver(property({ tags: { alt_name: "其他称呼; 黄河" } })), true);
  assert.equal(isModernYellowRiver(property({ tags: { "name:zh": "黃河" } })), true);
  assert.equal(isModernYellowRiver(property({ tags: { description: "Near the Yellow River" } })), false);
  assert.equal(isModernYellowRiver(property({ name: "黄河故道" })), false);
  assert.equal(isModernYellowRiver(property({ nameEn: "Shuanghe Reservoir" })), false);
  assert.equal(isModernYellowRiver(property({ name: "黄河", modernReferenceOnly: false })), false);
});

test("详细地区与视野相交含边界相接，远离覆盖区域的视野不会要求当地包", () => {
  const region = manifest.modernCoverageRegions.find(item => item.id === "guanzhong")!;
  assert.ok(boundsOverlap(region.bounds, [108, 34, 109, 35]));
  assert.ok(boundsOverlap([108, 34, 109, 35], region.bounds));
  assert.ok(boundsOverlap(region.bounds, [region.bounds[2], 34, region.bounds[2] + 1, 35]));
  assert.equal(boundsOverlap(region.bounds, [119, 30, 121, 32]), false);
  assert.equal(boundsOverlap(region.bounds, [108, 40, 109, 41]), false);
  assert.equal(boundsOverlap([119, 30, 121, 32], region.bounds), false);
});

test("历史河道替换对渲染与搜索共用规则：移除有证据的下游线面，现代模式原样恢复", () => {
  const associations = JSON.parse(readFileSync(new URL("data/tang-detail/yellow-river-water-associations.json", `${root.href}/`), "utf8"));
  const ids = new Set<string>(associations.associations.map((item: { waterId: string }) => item.waterId));
  const river = modern.find(feature => feature.properties.id === "osm-way-396407371")!;
  const unnamedWater = modern.find(feature => feature.properties.id === "osm-relation-9732460")!;
  const unrelated = modern.find(feature => feature.properties.id === "osm-relation-5942053")!;
  assert.ok(unnamedWater && ids.has(unnamedWater.properties.id));
  assert.equal(replaceModernYellowGeometry(river, true, ids), undefined);
  assert.equal(replaceModernYellowGeometry(unnamedWater, true, ids), undefined);
  assert.equal(replaceModernYellowGeometry(unrelated, true, ids), unrelated);
  assert.equal(replaceModernYellowGeometry(unnamedWater, false, ids), unnamedWater);
  assert.equal(replaceModernYellowGeometry(river, false, ids), river);
  const withoutEvidence = replaceModernYellowGeometry(unnamedWater, true, new Set());
  assert.equal(withoutEvidence, unnamedWater, "无关联证据时不可根据范围猜删无名水面");
});
