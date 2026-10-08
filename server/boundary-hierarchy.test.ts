import assert from "node:assert/strict";
import { test } from "node:test";
import { boundaryHierarchyRelations } from "../shared/boundary-hierarchy";
import type { BoundarySelection } from "../shared/boundaries";

const region = (id: string, level: BoundarySelection["level"], hierarchy: BoundarySelection["sourceHierarchy"], extra: Partial<BoundarySelection> = {}): BoundarySelection => ({ id, level, name: id, year: 741, sourceId: "hartwell", sourceHierarchy: hierarchy, ...extra });
const path = { polity: "唐代", province: "關內", prefecture: "京兆", dependentPrefecture: "" };
const province = region("province", "province", { polity: "唐代", province: "關內" });
const prefecture = region("prefecture", "prefecture", path);
const county = region("county", "county", path);

test("县的州与道由完整sourceHierarchy路径链接，州可反查下辖县", () => {
  const peers = [province, prefecture, county, region("county2", "county", path)];
  assert.deepEqual(boundaryHierarchyRelations(county, peers).parents.map(item => item.id), ["province", "prefecture"]);
  assert.deepEqual(boundaryHierarchyRelations(prefecture, peers).children.map(item => item.id), ["county", "county2"]);
  assert.deepEqual(boundaryHierarchyRelations(province, peers).children.map(item => item.id), ["prefecture"]);
});

test("异年异源异政权、字段缺失和行政后缀不同不能充当上级", () => {
  const candidates = [region("otherYear", "prefecture", path, { year: 755 }), region("otherSource", "prefecture", path, { sourceId: "other" }), region("otherPolity", "prefecture", { ...path, polity: "宋代" }), region("missingPolity", "prefecture", { ...path, polity: "" }), region("missingProvince", "prefecture", { ...path, province: "" }), region("suffix", "prefecture", { ...path, prefecture: "京兆府" })];
  assert.deepEqual(boundaryHierarchyRelations(county, candidates).parents, []);
  assert.match(boundaryHierarchyRelations(region("missing", "county", undefined), candidates).missingReason!, /缺少/);
});

test("直属与依附府州字段不混同，重复路径显示歧义而不认定上级", () => {
  const dependent = region("dependent", "prefecture", { ...path, prefecture: "", dependentPrefecture: "京兆" });
  assert.deepEqual(boundaryHierarchyRelations(county, [dependent]).parents, []);
  const duplicate = region("duplicate", "prefecture", path);
  const relation = boundaryHierarchyRelations(county, [prefecture, duplicate]);
  assert.deepEqual(relation.parents, []);
  assert.equal(relation.ambiguousParents[0].candidates.length, 2);
  assert.deepEqual(boundaryHierarchyRelations(prefecture, [prefecture, duplicate, county]).children, []);
});

test("县同时列明府和属州时可跳明确祖级府，列表注明包含属州路径", () => {
  const countyUnderDependent = region("dependentCounty", "county", { ...path, dependentPrefecture: "某州" });
  const anotherDependent = region("otherDependent", "prefecture", { ...path, dependentPrefecture: "别州" });
  const peers = [province, prefecture, countyUnderDependent, anotherDependent];
  assert.deepEqual(boundaryHierarchyRelations(countyUnderDependent, peers).parents.map(item => item.id), ["province", "prefecture"]);
  assert.deepEqual(boundaryHierarchyRelations(prefecture, peers).children.map(item => item.id), ["dependentCounty"]);
  assert.deepEqual(boundaryHierarchyRelations(anotherDependent, peers).children, []);
});
