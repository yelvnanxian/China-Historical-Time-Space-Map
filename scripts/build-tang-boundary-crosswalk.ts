/** Build explicit, reviewable identity links. Never use nearest-point or nearest-polygon matching. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { TangDetailCollection } from "../shared/tang-detail";
import type { Place } from "../shared/types";
import { boundarySearchKey } from "../shared/boundary-search";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import { boundaryContainsPoint, type TangBoundaryCrosswalk, type TangBoundaryLink, type TangBoundaryEvidence } from "../shared/tang-boundary-crosswalk";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const json = <T,>(path: string): T => JSON.parse(read(path).toString("utf8"));
type Area = Feature<Polygon | MultiPolygon, { id: string; name: string; sourceName: string; level: string; sourceCode: string; recordId: string; sourceHierarchy: { polity: string; province: string; prefecture: string } }>;
const prefectures = json<FeatureCollection<Polygon | MultiPolygon, Area["properties"]>>("public/data/boundaries/hartwell-741-prefecture.geojson").features;
const counties = json<FeatureCollection<Polygon | MultiPolygon, Area["properties"]>>("public/data/boundaries/hartwell-741-county.geojson").features;
const old = json<TangDetailCollection>("public/data/tang-detail/settlements-741.geojson").features;
const current = json<TangDetailCollection>("public/data/tang-detail/settlements-755.geojson").features;
const catalog = json<{ places: Place[] }>("data/catalog.json");
const key = (name: string) => boundarySearchKey(name).replace(/(?:大都督府|大都护府|都督府|都护府|府|州|郡|县)$/u, "");
const hierarchy = (area: Area) => [area.properties.sourceHierarchy.polity, area.properties.sourceHierarchy.province, area.properties.sourceHierarchy.prefecture].join("|");
const byId = new Map([...prefectures, ...counties].map(area => [area.properties.id, area]));
const settlements: TangBoundaryCrosswalk["settlements"] = {};
const missing: { id: string; name: string; year: number | null; reason: string; candidates?: string[] }[] = [];
const note = "关联显示741年Hartwell州级参考辖区。郡、州、府属于同一行政层级；对应关系不证明741—755年间边界完全不变。";
const areaName = (area: Area) => getBoundaryDisplayLabel(area.properties).name;

function matchingArea(feature: TangDetailCollection["features"][number]): Area[] {
  if (feature.geometry.type !== "Point") return [];
  const point = feature.geometry.coordinates;
  return (feature.properties.level === "county" ? counties : prefectures).filter(area =>
    key(areaName(area)) === key(feature.properties.name) && boundaryContainsPoint(area.geometry, point));
}

for (const feature of old) {
  const p = feature.properties;
  const found = matchingArea(feature);
  if (found.length !== 1) { missing.push({ id: p.id, name: p.name, year: 741, reason: found.length ? "同名且包含治所的模型面不唯一" : "无同时满足同名与点在面内的741模型记录", candidates: found.map(area => area.properties.id) }); continue; }
  const sourceArea = found[0];
  const parents = p.level === "county" ? prefectures.filter(area => hierarchy(area) === hierarchy(sourceArea)) : [sourceArea];
  if (parents.length !== 1) { missing.push({ id: p.id, name: p.name, year: 741, reason: "县面来源的省道/州级隶属字段无法唯一关联父级" }); continue; }
  const parent = parents[0];
  const evidence: TangBoundaryEvidence[] = [
    { sourceId: "chgis-settlements-741", recordIds: [p.id], summary: `741年治所记录${p.name}，与Hartwell同名记录相符，且原始治所点位于该记录模型面内。` },
    { sourceId: `chgis-v6-${p.level}-points`, recordIds: [p.sourceRecordId!], summary: "原始CHGIS点归档中的SYS_ID；县点与府州点分别保留各自数据集来源。" },
    { sourceId: "hartwell-741", recordIds: [parent.properties.id], summary: "使用该州级记录的原始模型面。" },
    ...(sourceArea === parent ? [] : [{ sourceId: "hartwell-741-counties", recordIds: [sourceArea.properties.id], summary: `县面原始sourceHierarchy明确列为${sourceArea.properties.sourceHierarchy.province}／${sourceArea.properties.sourceHierarchy.prefecture}，唯一关联该府州面。` }]),
  ];
  settlements[p.id] = { boundaryId: parent.properties.id, boundaryName: areaName(parent), boundaryYear: 741, entityName: p.name, entityYear: 741,
    relation: p.level === "county" ? "source-county-parent" : "same-name-in-model", ...(p.level === "county" ? { countyBoundaryId: sourceArea.properties.id } : {}), note, evidence };
}

for (const feature of current) {
  const p = feature.properties;
  if (settlements[p.id]) {
    settlements[p.id] = { ...settlements[p.id], entityYear: 755,
      evidence: [...settlements[p.id].evidence, { sourceId: "chgis-settlements-755", recordIds: [p.id], summary: "741与755筛选均保留同一个CHGIS原始SYS_ID，来源存续年覆盖两年。" }] };
    continue;
  }
  // A recorded rename with contiguous dates at the exact same source point is
  // identity evidence. A nearby seat or a gap in dates does not pass this rule.
  const predecessors = old.filter(previous => previous.properties.level === p.level
    && JSON.stringify(previous.geometry) === JSON.stringify(feature.geometry)
    && previous.properties.endYear === (p.beginYear ?? 0) - 1
    && previous.properties.sourceRecord?.END_CHG_TY !== "撤销"
    && p.sourceRecord?.BEG_CHG_TY === "更名");
  if (predecessors.length !== 1 || !settlements[predecessors[0].properties.id]) {
    missing.push({ id: p.id, name: p.name, year: 755, reason: "缺少唯一、同址、年代连续且来源明确更名的741记录链" });
    continue;
  }
  const previous = predecessors[0], linked = settlements[previous.properties.id];
  settlements[p.id] = { ...linked, entityName: p.name, entityYear: 755, relation: "documented-rename",
    evidence: [...linked.evidence, { sourceId: "chgis-settlements-755", recordIds: [previous.properties.id, p.id], summary: `来源记录${previous.properties.name}止于${previous.properties.endYear}年，${p.name}始于${p.beginYear}年，BEG_CHG_TY为“更名”，两条原始点几何完全相同。` }],
    note: `${p.name}的来源改名链对应${linked.boundaryName}。${note}` };
}

const places: TangBoundaryCrosswalk["places"] = {};
for (const place of catalog.places.filter(place => place.periodIds.includes("tang"))) {
  // Catalog period names and primary names are identity evidence. General alias
  // lists can contain later dynasties, so do not use them to infer Tang identity.
  const names = [...new Set([place.nameByPeriod?.tang, place.name].filter((name): name is string => !!name).map(key))];
  const records = [...old, ...current].filter(feature => names.includes(key(feature.properties.name)) && settlements[feature.properties.id]
    && boundaryContainsPoint(byId.get(settlements[feature.properties.id].boundaryId)!.geometry, place.coordinates));
  const namedModelAreas = [...prefectures, ...counties].filter(area => names.includes(key(areaName(area))));
  const modelParents = namedModelAreas.flatMap(area => area.properties.level === "prefecture" ? [{ parent: area, child: area }] : prefectures.filter(parent => hierarchy(parent) === hierarchy(area)).map(parent => ({ parent, child: area })))
    .filter(({ parent }) => boundaryContainsPoint(parent.geometry, place.coordinates));
  const targets = [...new Set([...records.map(record => settlements[record.properties.id].boundaryId), ...modelParents.map(({ parent }) => parent.properties.id)])];
  if (targets.length !== 1) { missing.push({ id: place.id, name: place.nameByPeriod?.tang ?? place.name, year: null, reason: targets.length ? "唐代名称对应多个州级辖区" : "唐代主名未与已核对的治所记录及其州级面同时匹配", candidates: targets }); continue; }
  const matching = records[0];
  const model = modelParents.find(({ parent }) => parent.properties.id === targets[0]);
  const linked: TangBoundaryLink = matching ? settlements[matching.properties.id] : {
    boundaryId: model!.parent.properties.id, boundaryName: areaName(model!.parent), boundaryYear: 741,
    entityName: place.nameByPeriod?.tang ?? place.name, entityYear: null, relation: "catalog-name-in-model", note,
    evidence: [{ sourceId: model!.child.properties.level === "county" ? "hartwell-741-counties" : "hartwell-741", recordIds: [model!.child.properties.id], summary: `目录唐代主名对应原始模型记录${areaName(model!.child)}；其sourceHierarchy明确隶属${model!.child.properties.sourceHierarchy.province}／${model!.child.properties.sourceHierarchy.prefecture}。只关联州级模型，未将目录近似点认作精确县治。` },
      { sourceId: "hartwell-741", recordIds: [model!.parent.properties.id], summary: "来源隶属字段对应唯一州级模型。" }],
  };
  places[place.id] = { ...linked, entityName: place.nameByPeriod?.tang ?? place.name, entityYear: null, relation: "catalog-name-in-model",
    evidence: [...linked.evidence, { sourceId: "catalog", recordIds: [place.id, ...(matching ? [matching.properties.id] : [])], summary: `目录唐代名或主名与来源名称一致，且目录近似定位落在已核对的州级模型面内；没有采用最近点匹配或现代别名推定。` }] };
}

const sourceSpecs = [
  ["chgis-settlements-741", "CHGIS V6 741年府州与县治所合并筛选", "https://dataverse.harvard.edu/dataverse/chgis_v6", "public/data/tang-detail/settlements-741.geojson"],
  ["chgis-settlements-755", "CHGIS V6 755年府州与县治所合并筛选", "https://dataverse.harvard.edu/dataverse/chgis_v6", "public/data/tang-detail/settlements-755.geojson"],
  ["chgis-v6-prefecture-points", "CHGIS V6 原始府州时序点", "https://doi.org/10.7910/DVN/WW1PD6", "data/evidence/tang-detail/chgis/prefecture-wgs84.zip"],
  ["chgis-v6-county-points", "CHGIS V6 原始县时序点", "https://doi.org/10.7910/DVN/Q9VOF5", "data/evidence/tang-detail/chgis/county-wgs84.zip"],
  ["hartwell-741", "Hartwell 741年州级模型边界", "https://sites.fas.harvard.edu/~chgis/data/hartwell/", "public/data/boundaries/hartwell-741-prefecture.geojson"],
  ["hartwell-741-counties", "Hartwell 741年县级模型与来源隶属字段", "https://sites.fas.harvard.edu/~chgis/data/hartwell/", "public/data/boundaries/hartwell-741-county.geojson"],
  ["catalog", "本项目已核对的唐代城邑目录", "https://zh.wikisource.org/wiki/舊唐書", "data/catalog.json"],
  ["boundary-name-corrections", "经源字段和几何核对的名称纠正", "https://doi.org/10.7910/DVN/29302", "shared/boundary-name-corrections.json"],
];
const result: TangBoundaryCrosswalk = { version: "1.0.0", boundaryDatasetId: "hartwell-741", boundaryYear: 741, settlements, places,
  sources: sourceSpecs.map(([id, title, url, path]) => ({ id, title, url, path, sha256: createHash("sha256").update(read(path)).digest("hex") })),
  notes: [note, "只有同名且原始治所在模型面内，或确切记录ID/同址连续更名链，才建立对应。模型不能核定古代实际疆界。", "县治的州级归属取县面原始省道与府州隶属字段。未匹配、同名歧义、异址或时间断档均不猜配。", "742年改州为郡、758年复州是命名层级转换；本表不把治所点扩成新郡界，也不将741轮廓改标为755实测边界。"],
};
writeFileSync(new URL("public/data/tang-boundary-crosswalk.json", root), JSON.stringify(result, null, 2) + "\n");
const nameCorrections = ["33", "35"].map(recordId => {
  const area = prefectures.find(item => item.properties.recordId === recordId)!;
  return { boundaryId: area.properties.id, originalProperties: area.properties, correctedName: areaName(area),
    childRecords: counties.filter(child => hierarchy(child) === hierarchy(area)).map(child => child.properties),
    matchingSourceSeats: old.filter(feature => feature.properties.level === "prefecture" && matchingArea(feature).some(candidate => candidate.properties.id === area.properties.id)).map(feature => ({ properties: feature.properties, geometry: feature.geometry })) };
});
writeFileSync(new URL("data/evidence/tang-detail/boundary-crosswalk-audit.json", root), JSON.stringify({ matchedSettlements: Object.keys(settlements).length, matchedPlaces: Object.keys(places).length, nameCorrections, unmatched: missing }, null, 2) + "\n");
console.log(JSON.stringify({ matchedSettlements: Object.keys(settlements).length, renamedSettlements: Object.values(settlements).filter(link => link.relation === "documented-rename").length, matchedPlaces: Object.keys(places).length, unmatchedPlaces: missing.filter(item => item.year === null) }, null, 2));
