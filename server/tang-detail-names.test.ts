import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { TangDetailCollection } from "../shared/tang-detail";
import { localizeTangDetailFeature, tangDetailDisplayName } from "../shared/tang-detail-names";

const collections = new Map<string, TangDetailCollection>();
function fixture(pack: string, id: string) {
  if (!collections.has(pack)) {
    const raw = readFileSync(new URL(`../public/data/tang-detail/${pack}.geojson.gz`, import.meta.url));
    collections.set(pack, JSON.parse(gunzipSync(raw).toString("utf8")));
  }
  const feature = collections.get(pack)!.features.find(item => item.properties.id === id);
  assert.ok(feature, `Published source feature exists: ${id}`);
  return feature;
}

test("只有繁体源标签的四个真实河段恢复简体名称且不改变几何或原标签", () => {
  const samples = [
    ["modern-jianghuai-overview-part0", "osm-way-71187088", "张家港"],
    ["modern-jianghuai-overview-part2", "osm-way-651797718", "张家港"],
    ["modern-jianghuai-overview-part2", "osm-way-651797719", "张家港"],
    ["modern-taihu-overview-part0", "osm-way-32589910", "东环河"],
  ];
  for (const [pack, id, expected] of samples) {
    const original = fixture(pack, id);
    assert.equal(original.properties.name, "未命名河流");
    assert.ok(original.properties.tags?.["name:zh-Hant"]);
    const localized = localizeTangDetailFeature(original);
    assert.equal(localized.properties.name, expected, id);
    assert.equal(localized.geometry, original.geometry);
    assert.equal(localized.properties.tags, original.properties.tags);
    assert.equal(original.properties.name, "未命名河流", "Published object remains unchanged");
  }
});

test("虎头山使用已有汉字通用名称，不能被name:zh中的拼音覆盖", () => {
  const original = fixture("modern-city-xiangyang-224-63-part0", "osm-node-8984600853");
  assert.equal(original.properties.name, "Hutou Shan");
  assert.equal(original.properties.tags?.name, "虎头山");
  assert.equal(original.properties.tags?.["name:zh"], "Hutou Shan");
  assert.equal(tangDetailDisplayName(original.properties), "虎头山");
});

test("现有中文沙颍河保留原命名，不被不同的繁体别名替换", () => {
  const original = fixture("modern-central-plains-overview-part0", "osm-way-50196408");
  assert.equal(original.properties.name, "沙颍河");
  assert.equal(original.properties.tags?.["name:zh-Hant"], "潁河");
  assert.equal(localizeTangDetailFeature(original), original);
});

test("无中文来源的真实外语名称保留原记录，不能根据拼音猜译", () => {
  const samples = [
    ["modern-guanzhong-overview-part0", "osm-way-85191223", "Dabeigou Shuiku"],
    ["modern-west-chengdu-208-61-part0", "osm-way-953303543", "Dasha Jiang"],
    ["modern-west-turpan-178-86-part0", "osm-way-1252908789", "قنات"],
  ];
  for (const [pack, id, expected] of samples) {
    const original = fixture(pack, id);
    assert.equal(tangDetailDisplayName(original.properties), expected);
    assert.equal(localizeTangDetailFeature(original), original);
  }
});
