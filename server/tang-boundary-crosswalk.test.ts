import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { boundaryContainsPoint, type TangBoundaryCrosswalk } from "../shared/tang-boundary-crosswalk";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import type { TangDetailCollection } from "../shared/tang-detail";
import type { Place } from "../shared/types";

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
