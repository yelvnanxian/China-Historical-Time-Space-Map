import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { boundaryContainsPoint, type TangBoundaryCrosswalk } from "../shared/tang-boundary-crosswalk";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import type { TangDetailCollection } from "../shared/tang-detail";
import type { Place } from "../shared/types";
import { boundarySearchKey, simplifiedChinese } from "../shared/boundary-search";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const json = <T,>(path: string): T => JSON.parse(read(path).toString("utf8"));
type AreaProperties = { id: string; name: string; level: string; sourceCode: string; sourceHierarchy: { polity: string; province: string; prefecture: string } };
const crosswalk = json<TangBoundaryCrosswalk>("public/data/tang-boundary-crosswalk.json");
const old = json<TangDetailCollection>("public/data/tang-detail/settlements-741.geojson");
const current = json<TangDetailCollection>("public/data/tang-detail/settlements-755.geojson");
const prefectures = json<FeatureCollection<Polygon | MultiPolygon, AreaProperties>>("public/data/boundaries/hartwell-741-prefecture.geojson");
const counties = json<FeatureCollection<Polygon | MultiPolygon, AreaProperties>>("public/data/boundaries/hartwell-741-county.geojson");
const areas = new Map([...prefectures.features, ...counties.features].map(feature => [feature.properties.id, feature]));
const oldById = new Map(old.features.map(feature => [feature.properties.id, feature]));
const currentById = new Map(current.features.map(feature => [feature.properties.id, feature]));

test("郡州关联发布记录与证据文件哈希一致，每个目标确为原始741府州面", () => {
  assert.equal(crosswalk.boundaryYear, 741);
  assert.ok(Object.keys(crosswalk.settlements).length >= 1200);
  assert.ok(Object.keys(crosswalk.places).length >= 90);
  for (const source of crosswalk.sources) assert.equal(createHash("sha256").update(read(source.path)).digest("hex"), source.sha256, source.id);
  const sourceIds = new Set(crosswalk.sources.map(source => source.id));
  assert.equal(crosswalk.sources.find(source => source.id === "chgis-v6-county-points")?.url, "https://doi.org/10.7910/DVN/Q9VOF5");
  assert.equal(crosswalk.sources.find(source => source.id === "chgis-v6-prefecture-points")?.url, "https://doi.org/10.7910/DVN/WW1PD6");
  for (const [id, link] of [...Object.entries(crosswalk.settlements), ...Object.entries(crosswalk.places)]) {
    const area = areas.get(link.boundaryId)!;
    assert.ok(area, id);
    assert.equal(area.properties.level, "prefecture", id);
    assert.equal(link.boundaryYear, 741);
    assert.equal(link.boundaryName, getBoundaryDisplayLabel(area.properties).name);
    assert.match(link.note, /741/);
    assert.match(link.note, /不证明/);
    assert.ok(link.evidence.length >= 2);
    assert.ok(link.evidence.every(evidence => sourceIds.has(evidence.sourceId) && evidence.recordIds.length && evidence.summary.length));
  }
});

test("每条郡州改名链都有完全相同的原始点、连续年份和来源明确更名字段", () => {
  const renamed = Object.entries(crosswalk.settlements).filter(([, link]) => link.relation === "documented-rename");
  assert.ok(renamed.length >= 200);
  for (const [id, link] of renamed) {
    const chain = [...link.evidence].reverse().find(evidence => evidence.sourceId === "chgis-settlements-755" && evidence.recordIds.length === 2)!;
    assert.ok(chain, id);
    const predecessor = oldById.get(chain.recordIds[0])!, successor = currentById.get(id)!;
    assert.ok(predecessor && successor, id);
    assert.deepEqual(successor.geometry, predecessor.geometry, id);
    assert.equal(successor.properties.beginYear, predecessor.properties.endYear! + 1, id);
    assert.equal(successor.properties.sourceRecord?.BEG_CHG_TY, "更名", id);
    const sourceCandidates = old.features.filter(feature => feature.properties.level === successor.properties.level
      && JSON.stringify(feature.geometry) === JSON.stringify(successor.geometry)
      && feature.properties.endYear === successor.properties.beginYear! - 1
      && feature.properties.sourceRecord?.END_CHG_TY !== "撤销");
    assert.equal(sourceCandidates.length, 1, `${id}: uniqueness includes source records without existing crosswalk links`);
    assert.equal(link.boundaryId, crosswalk.settlements[predecessor.properties.id].boundaryId, id);
  }
  for (const [name, boundary] of [["定襄郡", "忻州"], ["范阳郡", "幽州"], ["广陵郡", "扬州"], ["会稽郡", "越州"], ["吴郡", "苏州"]]) {
    const feature = current.features.find(feature => feature.properties.name === name)!;
    assert.ok(feature, name);
    assert.equal(crosswalk.settlements[feature.properties.id]?.boundaryName, boundary, name);
  }
});

test("县治归属来自对应县面明确的省道府州隶属字段，不取最近府州", () => {
  const linked = Object.entries(crosswalk.settlements).filter(([, link]) => link.countyBoundaryId);
  assert.ok(linked.length > 700);
  for (const [id, link] of linked) {
    const county = areas.get(link.countyBoundaryId!)!, parent = areas.get(link.boundaryId)!;
    assert.equal(county.properties.level, "county");
    assert.deepEqual(county.properties.sourceHierarchy, parent.properties.sourceHierarchy, id);
    const source = oldById.get(id) ?? currentById.get(id)!;
    assert.ok(link.evidence.some(evidence => evidence.sourceId === "chgis-v6-county-points"));
    assert.equal(source.geometry.type, "Point");
    if (source.geometry.type === "Point") assert.ok(boundaryContainsPoint(county.geometry, source.geometry.coordinates), id);
  }
});

test("精选入口关联到具名州级模型，长安洛阳与许徐州不串位，未核实入口保持无关联", () => {
  const catalog = json<{ places: Place[] }>("data/catalog.json");
  const placeById = new Map(catalog.places.map(place => [place.id, place]));
  for (const [id, link] of Object.entries(crosswalk.places)) {
    const place = placeById.get(id)!;
    assert.ok(place.periodIds.includes("tang"));
    assert.ok(boundaryContainsPoint(areas.get(link.boundaryId)!.geometry, place.coordinates), id);
  }
  for (const [id, boundary] of [["changan", "京兆府"], ["luoyang", "河南府"], ["jinyang", "太原府"], ["xuzhou-xuchang", "许州"], ["xuzhou-pengcheng", "徐州"], ["yangzhou", "扬州"]]) {
    assert.equal(crosswalk.places[id]?.boundaryName, boundary, id);
  }
  for (const id of ["dali", "qiuci", "yutian-hotan", "shule-kashgar"]) assert.equal(crosswalk.places[id], undefined, id);
  const audit = json<{ unmatched: { id: string; year: number | null; reason: string }[] }>("data/evidence/tang-detail/boundary-crosswalk-audit.json");
  assert.ok(audit.unmatched.some(item => item.id === "dali" && item.year === null));
  assert.ok(audit.unmatched.every(item => item.reason.length > 5));
});

test("许徐源名称对调修正由8与7个同源子县及各自CHGIS治所共同支持", () => {
  const cases = [["33", "徐州", "许州", "許", 8], ["35", "許州", "徐州", "徐", 7]] as const;
  for (const [recordId, originalName, correctedName, parentName, childCount] of cases) {
    const area = areas.get(`hartwell-741-prefecture-v5_0741_chin_chn_0741_p-${recordId}`)!;
    assert.equal(area.properties.name, originalName);
    const display = getBoundaryDisplayLabel(area.properties);
    assert.equal(display.name, correctedName);
    assert.equal(display.originalName, originalName);
    const children = counties.features.filter(child => child.properties.sourceCode.startsWith(area.properties.sourceCode.slice(0, -2)));
    assert.equal(children.length, childCount);
    assert.ok(children.every(child => child.properties.sourceHierarchy.prefecture === parentName));
    const seats = old.features.filter(feature => feature.properties.name === correctedName && feature.properties.level === "prefecture");
    assert.equal(seats.length, 1);
    assert.equal(seats[0].geometry.type, "Point");
    if (seats[0].geometry.type === "Point") assert.ok(boundaryContainsPoint(area.geometry, seats[0].geometry.coordinates));
  }
});

test("点在面内核查尊重孔洞和分离面，面外点不会因距离近而通过", () => {
  const polygon: Polygon = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]] };
  assert.equal(boundaryContainsPoint(polygon, [1, 1]), true);
  assert.equal(boundaryContainsPoint(polygon, [5, 5]), false);
  assert.equal(boundaryContainsPoint(polygon, [10.00001, 5]), false);
  const multipart: MultiPolygon = { type: "MultiPolygon", coordinates: [polygon.coordinates, [[[20, 0], [22, 0], [22, 2], [20, 2], [20, 0]]]] };
  assert.equal(boundaryContainsPoint(multipart, [21, 1]), true);
  assert.equal(boundaryContainsPoint(multipart, [15, 1]), false);
});

test("755覆盖统计只计当前1682个治所，跨年辅助ID和未关联原因明确分开", () => {
  const coverage = crosswalk.coverage!;
  assert.deepEqual(coverage, { year: 755, total: 1682, matched: 1024, unmatched: 658,
    byLevel: { prefecture: { total: 317, matched: 232, unmatched: 85 }, county: { total: 1365, matched: 792, unmatched: 573 } }, auxiliarySettlementLinks: 245 });
  assert.equal(Object.keys(crosswalk.settlements).length, coverage.matched + coverage.auxiliarySettlementLinks);
  assert.equal(Object.keys(crosswalk.unmatchedSettlements!).length, coverage.unmatched);
  for (const level of ["prefecture", "county"] as const) {
    const features = current.features.filter(feature => feature.properties.level === level);
    assert.equal(coverage.byLevel[level].total, features.length);
    assert.equal(coverage.byLevel[level].matched, features.filter(feature => crosswalk.settlements[feature.properties.id]).length);
  }
  for (const { properties: p } of current.features) {
    const missing = crosswalk.unmatchedSettlements![p.id];
    assert.equal(Number(!!crosswalk.settlements[p.id]) + Number(!!missing), 1, p.id);
    if (missing) {
      assert.equal(missing.entityName, p.name);
      assert.equal(missing.level, p.level);
      assert.equal(missing.entityYear, 755);
      assert.ok(missing.reason.length > 10);
    }
  }
});

test("江陵郡荆州与江陵县关联同一原始模型，江陵府760年起的名称不会伪装成755称谓", () => {
  const ids = ["chgis-prefecture-34442", "chgis-prefecture-34443", "chgis-county-43676"];
  for (const id of ids) assert.equal(crosswalk.settlements[id].boundaryId, "hartwell-741-prefecture-v5_0741_chin_chn_0741_p-94", id);
  const link = crosswalk.settlements[ids[0]];
  assert.equal(link.entityName, "江陵郡");
  assert.equal(link.entityYear, 755);
  assert.equal(link.boundaryName, "江陵府");
  assert.deepEqual(link.nameChain!.filter(step => step.beginYear >= 621).map(step => [step.sourceRecordId, step.name, step.beginYear, step.endYear]), [
    ["34443", "荆州", 621, 741], ["34442", "江陵郡", 742, 757], ["34441", "荆州", 758, 759], ["34437", "江陵府", 760, 1129],
  ]);
  assert.equal(link.modelNameAnchor!.name, "江陵府");
  assert.equal(link.modelNameAnchor!.beginYear, 760);
  assert.equal(link.modelNameAnchor!.match, "full-name");
  assert.match(link.note, /不代表755年的正式名称/);
  assert.equal(crosswalk.places.jingzhou.boundaryId, link.boundaryId);
});

test("新增跨期源名称链逐条对应原始记录，双方明确更名、原始坐标完全相同且双向唯一", () => {
  type Row = { recordId: string; coordinates: [number, number]; originalCoordinates: [number, number]; sourceRecord: Record<string, string | number> };
  const document = json<{ records: Row[]; withheld: Row[] }>("data/evidence/tang-detail/chgis/tang-prefecture-name-records.json");
  const rows = [...document.records, ...document.withheld];
  const byId = new Map(document.records.map(row => [row.recordId, row]));
  const supplemental = Object.entries(crosswalk.settlements).filter(([, link]) => link.nameChain);
  assert.equal(supplemental.length, 26);
  for (const [id, link] of supplemental) {
    const source = currentById.get(id) ?? oldById.get(id)!;
    const chain = link.nameChain!;
    assert.ok(chain.some(step => step.sourceRecordId === source.properties.sourceRecordId), id);
    assert.ok(link.evidence.some(evidence => evidence.sourceId === "chgis-tang-prefecture-name-records"));
    for (let index = 0; index < chain.length; index += 1) {
      const step = chain[index], row = byId.get(step.sourceRecordId)!;
      assert.ok(row, `${id}: withheld or absent records cannot enter identity chains`);
      assert.equal(step.name, simplifiedChinese(String(row.sourceRecord.NAME_CH)));
      assert.equal(step.beginYear, row.sourceRecord.BEG_YR);
      assert.equal(step.endYear, row.sourceRecord.END_YR);
      assert.deepEqual(step.coordinates, row.coordinates);
      assert.deepEqual(source.geometry.type === "Point" && source.geometry.coordinates, row.coordinates);
      if (!index) continue;
      const previous = byId.get(chain[index - 1].sourceRecordId)!;
      assert.deepEqual(previous.originalCoordinates, row.originalCoordinates);
      assert.equal(previous.sourceRecord.LEV_RANK, row.sourceRecord.LEV_RANK);
      assert.equal(Number(previous.sourceRecord.END_YR) + 1, row.sourceRecord.BEG_YR);
      assert.equal(previous.sourceRecord.END_CHG_TY, "更名");
      assert.equal(row.sourceRecord.BEG_CHG_TY, "更名");
      assert.ok(["4", "5", "6"].includes(String(previous.sourceRecord.END_RULE)));
      assert.ok(["4", "5", "6"].includes(String(row.sourceRecord.BEG_RULE)));
      const sameSiteAndLevel = rows.filter(candidate => JSON.stringify(candidate.originalCoordinates) === JSON.stringify(row.originalCoordinates)
        && candidate.sourceRecord.LEV_RANK === row.sourceRecord.LEV_RANK);
      assert.equal(sameSiteAndLevel.filter(candidate => candidate.sourceRecord.BEG_YR === row.sourceRecord.BEG_YR
        && candidate.sourceRecord.BEG_CHG_TY === "更名" && ["4", "5", "6"].includes(String(candidate.sourceRecord.BEG_RULE))).length, 1);
      assert.equal(sameSiteAndLevel.filter(candidate => candidate.sourceRecord.END_YR === previous.sourceRecord.END_YR
        && candidate.sourceRecord.END_CHG_TY === "更名" && ["4", "5", "6"].includes(String(candidate.sourceRecord.END_RULE))).length, 1);
    }
    const anchor = link.modelNameAnchor!;
    assert.ok(chain.some(step => step.sourceRecordId === anchor.sourceRecordId));
    const nameKey = (name: string) => boundarySearchKey(name).replace(/(?:大都督府|大都护府|都督府|都护府|府|州|郡|县)$/u, "");
    assert.equal(nameKey(anchor.name), nameKey(link.boundaryName));
    if (anchor.match === "full-name") assert.equal(boundarySearchKey(anchor.name), boundarySearchKey(link.boundaryName));
    assert.ok(source.geometry.type === "Point" && boundaryContainsPoint(areas.get(link.boundaryId)!.geometry, source.geometry.coordinates));
  }
  for (const [name, model] of [["蜀郡", "成都府"], ["洪源郡", "黎州"], ["缙云郡", "处州"], ["潭阳郡", "叙州"], ["襄阳郡", "襄阳府"], ["龙水郡", "宜州"]]) {
    const feature = current.features.find(feature => feature.properties.name === name)!;
    assert.equal(crosswalk.settlements[feature.properties.id]?.boundaryName, model, name);
  }
});

test("同名面在异地与缺少名称证据的府州仍不关联，不能以最近或面内关系猜配", () => {
  for (const id of ["chgis-prefecture-210473", "chgis-prefecture-211248", "chgis-prefecture-99426"]) {
    const missing = crosswalk.unmatchedSettlements![id];
    assert.equal(missing.reasonCode, "outside-named-model", id);
    const feature = currentById.get(id)!;
    for (const areaId of missing.candidateBoundaryIds) {
      assert.ok(feature.geometry.type === "Point");
      assert.equal(boundaryContainsPoint(areas.get(areaId)!.geometry, feature.geometry.coordinates), false, id);
    }
    assert.equal(crosswalk.settlements[id], undefined);
  }
  const noModel = crosswalk.unmatchedSettlements!["chgis-prefecture-99405"];
  assert.equal(noModel.entityName, "牂州");
  assert.equal(noModel.reasonCode, "no-named-model");
  assert.equal(crosswalk.settlements["chgis-prefecture-99405"], undefined);
});
