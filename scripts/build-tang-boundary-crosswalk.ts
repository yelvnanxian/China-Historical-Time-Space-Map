/** Build explicit, reviewable identity links. Never use nearest-point or nearest-polygon matching. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { TangDetailCollection } from "../shared/tang-detail";
import type { Place } from "../shared/types";
import { boundarySearchKey, simplifiedChinese } from "../shared/boundary-search";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import { boundaryContainsPoint, type TangBoundaryCrosswalk, type TangBoundaryLink, type TangBoundaryEvidence, type TangBoundaryNameStep, type TangBoundaryMissingLink } from "../shared/tang-boundary-crosswalk";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const json = <T,>(path: string): T => JSON.parse(read(path).toString("utf8"));
type Area = Feature<Polygon | MultiPolygon, { id: string; name: string; sourceName: string; level: string; sourceCode: string; recordId: string; sourceHierarchy: { polity: string; province: string; prefecture: string } }>;
const prefectures = json<FeatureCollection<Polygon | MultiPolygon, Area["properties"]>>("public/data/boundaries/hartwell-741-prefecture.geojson").features;
const counties = json<FeatureCollection<Polygon | MultiPolygon, Area["properties"]>>("public/data/boundaries/hartwell-741-county.geojson").features;
const old = json<TangDetailCollection>("public/data/tang-detail/settlements-741.geojson").features;
const current = json<TangDetailCollection>("public/data/tang-detail/settlements-755.geojson").features;
const catalog = json<{ places: Place[] }>("data/catalog.json");
interface SourceNameRecord {
  recordId: string;
  sourceRecordIndex: number;
  coordinates: [number, number];
  originalCoordinates: [number, number];
  sourceRecord: { NAME_CH: string; BEG_YR: number; END_YR: number; BEG_CHG_TY: string; END_CHG_TY: string; BEG_RULE: string; END_RULE: string; LEV_RANK: string };
}
const nameRecordsPath = "data/evidence/tang-detail/chgis/tang-prefecture-name-records.json";
const nameRecordsDocument = json<{ sourcePath: string; sourceSha256: string; records: SourceNameRecord[]; withheld: SourceNameRecord[] }>(nameRecordsPath);
if (createHash("sha256").update(read(nameRecordsDocument.sourcePath)).digest("hex") !== nameRecordsDocument.sourceSha256) throw Error("府州名称证据与原始CHGIS归档哈希不符，请重新提取。");
const nameRecords = nameRecordsDocument.records;
const allNameRecords = [...nameRecords, ...nameRecordsDocument.withheld];
const nameRecordById = new Map(nameRecords.map(record => [record.recordId, record]));
const key = (name: string) => boundarySearchKey(name).replace(/(?:大都督府|大都护府|都督府|都护府|府|州|郡|县)$/u, "");
const hierarchy = (area: Area) => [area.properties.sourceHierarchy.polity, area.properties.sourceHierarchy.province, area.properties.sourceHierarchy.prefecture].join("|");
const byId = new Map([...prefectures, ...counties].map(area => [area.properties.id, area]));
const settlements: TangBoundaryCrosswalk["settlements"] = {};
const missing: { id: string; name: string; year: number | null; reason: string; candidates?: string[] }[] = [];
const note = "关联显示741年Hartwell州级参考辖区。唐代郡、州、府属于县之上的同一行政层级；对应关系不证明741—755年间边界完全不变。模型源名称可能使用较晚称谓，不代表755年的正式名称。";
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

// Some nominal 741 model labels use later names (e.g. 江陵府、成都府、处州).
// Follow only bidirectionally unique, explicitly dated source renames at the
// exact original SHP coordinate. Neither proximity nor containment is identity.
function precedes(a: SourceNameRecord, b: SourceNameRecord) {
  return JSON.stringify(a.originalCoordinates) === JSON.stringify(b.originalCoordinates)
    && a.sourceRecord.LEV_RANK === b.sourceRecord.LEV_RANK
    && a.sourceRecord.END_YR + 1 === b.sourceRecord.BEG_YR
    && a.sourceRecord.END_CHG_TY === "更名" && b.sourceRecord.BEG_CHG_TY === "更名"
    && ["4", "5", "6"].includes(a.sourceRecord.END_RULE) && ["4", "5", "6"].includes(b.sourceRecord.BEG_RULE);
}
const successors = new Map(allNameRecords.map(record => [record.recordId, allNameRecords.filter(candidate => precedes(record, candidate))]));
const predecessors = new Map(allNameRecords.map(record => [record.recordId, allNameRecords.filter(candidate => precedes(candidate, record))]));
function namePaths(recordId: string): Map<string, SourceNameRecord[]> {
  const start = nameRecordById.get(recordId);
  const paths = new Map<string, SourceNameRecord[]>();
  if (!start) return paths;
  paths.set(recordId, [start]);
  const queue = [start];
  while (queue.length) {
    const record = queue.shift()!;
    const next = successors.get(record.recordId)!;
    const previous = predecessors.get(record.recordId)!;
    const adjacent = [
      ...(next.length === 1 && nameRecordById.has(next[0].recordId) && predecessors.get(next[0].recordId)!.length === 1 ? next : []),
      ...(previous.length === 1 && nameRecordById.has(previous[0].recordId) && successors.get(previous[0].recordId)!.length === 1 ? previous : []),
    ];
    for (const candidate of adjacent) {
      if (paths.has(candidate.recordId)) continue;
      paths.set(candidate.recordId, [...paths.get(record.recordId)!, candidate]);
      queue.push(candidate);
    }
  }
  return paths;
}
function nameStep(record: SourceNameRecord): TangBoundaryNameStep {
  return { sourceRecordId: record.recordId, name: simplifiedChinese(record.sourceRecord.NAME_CH),
    beginYear: record.sourceRecord.BEG_YR, endYear: record.sourceRecord.END_YR,
    beginChange: record.sourceRecord.BEG_CHG_TY, endChange: record.sourceRecord.END_CHG_TY, coordinates: record.coordinates };
}
const pathsById = new Map(nameRecords.map(record => [record.recordId, namePaths(record.recordId)]));
const supplementalLinks: { id: string; name: string; year: number; boundaryId: string; boundaryName: string; nameChain: TangBoundaryNameStep[]; modelNameAnchor: TangBoundaryLink["modelNameAnchor"] }[] = [];
const uniqueFeatures = new Map([...old, ...current].map(feature => [feature.properties.id, feature]));
for (const feature of uniqueFeatures.values()) {
  const p = feature.properties;
  if (p.level !== "prefecture" || settlements[p.id] || feature.geometry.type !== "Point") continue;
  const point = feature.geometry.coordinates;
  const start = nameRecordById.get(p.sourceRecordId!);
  if (!start || JSON.stringify(start.coordinates) !== JSON.stringify(point)) continue;
  const paths = pathsById.get(start.recordId)!;
  const candidates = [...paths.values()].flatMap(path => {
    const anchor = path.at(-1)!;
    return prefectures.filter(area => key(areaName(area)) === key(anchor.sourceRecord.NAME_CH)
      && boundaryContainsPoint(area.geometry, point))
      .map(area => ({ area, path, anchor, exact: boundarySearchKey(areaName(area)) === boundarySearchKey(anchor.sourceRecord.NAME_CH) }));
  });
  if (new Set(candidates.map(candidate => candidate.area.properties.id)).size !== 1) continue;
  const chosen = candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || a.path.length - b.path.length)[0];
  const chain = [...paths.keys()].map(id => nameRecordById.get(id)!).sort((a, b) => a.sourceRecord.BEG_YR - b.sourceRecord.BEG_YR).map(nameStep);
  const modelNameAnchor = { ...nameStep(chosen.anchor), match: chosen.exact ? "full-name" as const : "administrative-stem" as const };
  const sourceIds = chain.map(step => step.sourceRecordId);
  const evidence: TangBoundaryEvidence[] = [
    { sourceId: `chgis-settlements-${p.year}`, recordIds: [p.id], summary: `${p.year}年发布治所${p.name}的SYS_ID、原始点与名称证据归档一致。` },
    { sourceId: "chgis-v6-prefecture-points", recordIds: sourceIds, summary: "原始CHGIS府州DBF记录和SHP点；跨名链要求原始SHP坐标完全相同、LEV_RANK相同、年份连续、双方变更类型为更名且前后双向唯一。" },
    { sourceId: "chgis-tang-prefecture-name-records", recordIds: sourceIds, summary: `可复核名称链：${chain.map(step => `${step.name}（${step.beginYear}—${step.endYear}，SYS_ID ${step.sourceRecordId}）`).join(" → ")}。` },
    { sourceId: "hartwell-741", recordIds: [chosen.area.properties.id], summary: `模型源名${areaName(chosen.area)}与来源记录${modelNameAnchor.name}匹配，且原始治所点落在该具名面内；所有可达名称只指向这一个模型面。` },
  ];
  settlements[p.id] = { boundaryId: chosen.area.properties.id, boundaryName: areaName(chosen.area), boundaryYear: 741,
    entityName: p.name, entityYear: p.year!, relation: chosen.path.length > 1 ? "documented-model-name-chain" : "same-name-in-model",
    nameChain: chain, modelNameAnchor, evidence,
    note: `模型源名“${areaName(chosen.area)}”的名称依据为${modelNameAnchor.beginYear}—${modelNameAnchor.endYear}年“${modelNameAnchor.name}”记录，只确认单位身份对应。${note}` };
  supplementalLinks.push({ id: p.id, name: p.name, year: p.year!, boundaryId: chosen.area.properties.id, boundaryName: areaName(chosen.area), nameChain: chain, modelNameAnchor });
}

const unmatchedSettlements: Record<string, TangBoundaryMissingLink> = {};
for (const feature of current) {
  const p = feature.properties;
  if (settlements[p.id] || feature.geometry.type !== "Point") continue;
  const point = feature.geometry.coordinates;
  const names = new Set([key(p.name), ...(p.level === "prefecture" ? [...pathsById.get(p.sourceRecordId!)?.keys() ?? []].map(id => key(nameRecordById.get(id)!.sourceRecord.NAME_CH)) : [])]);
  const named = (p.level === "county" ? counties : prefectures).filter(area => names.has(key(areaName(area))));
  const inside = named.filter(area => boundaryContainsPoint(area.geometry, point));
  const reasonCode = !named.length ? "no-named-model" : !inside.length ? "outside-named-model" : inside.length > 1 ? "ambiguous-named-model" : "unresolved-source-parent";
  const reason = { "no-named-model": "现有来源名称及可核对连续更名链没有对应的具名模型面。", "outside-named-model": "有同名模型记录，但原始治所点在这些模型面之外，不能据名称或邻近强配。", "ambiguous-named-model": "同名且包含治所的模型面不唯一，暂不指定辖区。", "unresolved-source-parent": "尚无满足年代、身份和唯一来源隶属规则的完整关联证据。" }[reasonCode];
  unmatchedSettlements[p.id] = { entityName: p.name, entityYear: 755, level: p.level!, reasonCode, reason, candidateBoundaryIds: named.map(area => area.properties.id) };
}
const coverageCount = (features: typeof current) => ({ total: features.length, matched: features.filter(feature => settlements[feature.properties.id]).length,
  unmatched: features.filter(feature => !settlements[feature.properties.id]).length });
const coverage: NonNullable<TangBoundaryCrosswalk["coverage"]> = { year: 755, ...coverageCount(current),
  byLevel: { prefecture: coverageCount(current.filter(feature => feature.properties.level === "prefecture")), county: coverageCount(current.filter(feature => feature.properties.level === "county")) },
  auxiliarySettlementLinks: Object.keys(settlements).filter(id => !current.some(feature => feature.properties.id === id)).length };

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
  ["chgis-tang-prefecture-name-records", "CHGIS V6 唐代府州原始名称及连续变更证据", "https://doi.org/10.7910/DVN/WW1PD6", nameRecordsPath],
  ["hartwell-741", "Hartwell 741年州级模型边界", "https://sites.fas.harvard.edu/~chgis/data/hartwell/", "public/data/boundaries/hartwell-741-prefecture.geojson"],
  ["hartwell-741-counties", "Hartwell 741年县级模型与来源隶属字段", "https://sites.fas.harvard.edu/~chgis/data/hartwell/", "public/data/boundaries/hartwell-741-county.geojson"],
  ["catalog", "本项目已核对的唐代城邑目录", "https://zh.wikisource.org/wiki/舊唐書", "data/catalog.json"],
  ["boundary-name-corrections", "经源字段和几何核对的名称纠正", "https://doi.org/10.7910/DVN/29302", "shared/boundary-name-corrections.json"],
];
const result: TangBoundaryCrosswalk = { version: "1.1.0", boundaryDatasetId: "hartwell-741", boundaryYear: 741, settlements, places, coverage, unmatchedSettlements,
  sources: sourceSpecs.map(([id, title, url, path]) => ({ id, title, url, path, sha256: createHash("sha256").update(read(path)).digest("hex") })),
  notes: [note, "只有同名且原始治所在模型面内，或确切记录ID/同址连续更名链，才建立对应。模型不能核定古代实际疆界。", "县治的州级归属取县面原始省道与府州隶属字段。未匹配、同名歧义、异址或时间断档均不猜配。", "742年改州为郡、758年复州是命名层级转换；本表不把治所点扩成新郡界，也不将741轮廓改标为755实测边界。", "coverage只统计已发布755年治所；settlements另外含741年辅助记录，不可把映射表ID总数当成755年可见治所数。"],
};
writeFileSync(new URL("public/data/tang-boundary-crosswalk.json", root), JSON.stringify(result, null, 2) + "\n");
const nameCorrections = ["33", "35"].map(recordId => {
  const area = prefectures.find(item => item.properties.recordId === recordId)!;
  return { boundaryId: area.properties.id, originalProperties: area.properties, correctedName: areaName(area),
    childRecords: counties.filter(child => hierarchy(child) === hierarchy(area)).map(child => child.properties),
    matchingSourceSeats: old.filter(feature => feature.properties.level === "prefecture" && matchingArea(feature).some(candidate => candidate.properties.id === area.properties.id)).map(feature => ({ properties: feature.properties, geometry: feature.geometry })) };
});
const activePrefectureTypes = Object.fromEntries([...new Set(current.filter(feature => feature.properties.level === "prefecture").map(feature => feature.properties.subtype))]
  .map(type => [type, coverageCount(current.filter(feature => feature.properties.level === "prefecture" && feature.properties.subtype === type))]));
const missingReasons = Object.fromEntries([...new Set(Object.values(unmatchedSettlements).map(item => item.reasonCode))]
  .map(reason => [reason, { prefecture: Object.values(unmatchedSettlements).filter(item => item.level === "prefecture" && item.reasonCode === reason).length,
    county: Object.values(unmatchedSettlements).filter(item => item.level === "county" && item.reasonCode === reason).length }]));
const unmatched755PrefecturesBySubtype = Object.fromEntries(Object.keys(activePrefectureTypes).map(type => [type,
  current.filter(feature => feature.properties.level === "prefecture" && feature.properties.subtype === type && unmatchedSettlements[feature.properties.id])
    .map(feature => ({ id: feature.properties.id, sourceRecordId: feature.properties.sourceRecordId, ...unmatchedSettlements[feature.properties.id] }))]));
const audit = { totalLinkedRecordIds: Object.keys(settlements).length, active755: coverage, active755PrefectureTypes: activePrefectureTypes,
  active755MissingReasons: missingReasons, unmatched755PrefecturesBySubtype,
  matchedPlaces: Object.keys(places).length, supplementalLinks, supplementalActive755: supplementalLinks.filter(link => link.year === 755), nameCorrections,
  unmatched: missing.filter(item => item.year === null || !settlements[item.id]), unmatched755: unmatchedSettlements };
writeFileSync(new URL("data/evidence/tang-detail/boundary-crosswalk-audit.json", root), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify({ totalLinkedRecordIds: Object.keys(settlements).length, active755: coverage, active755PrefectureTypes: activePrefectureTypes,
  supplementalRecordIds: supplementalLinks.length, matchedPlaces: Object.keys(places).length, missingReasons }, null, 2));
