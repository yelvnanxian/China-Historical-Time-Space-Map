/** Offline, reviewed Ming identity links. No coordinate or proximity matching. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { simplifiedChinese } from "../shared/boundary-search";
import type { HistoricalResearchEntry } from "../shared/historical-research";
import type { MingBoundaryResearchDocument } from "../shared/ming-boundary-research";

const root = fileURLToPath(new URL("../", import.meta.url));
const researchPath = "data/evidence/ming-research/geography.json";
const modelPath = "public/data/boundaries/hartwell-1391-prefecture.geojson";
const countyModelPath = "public/data/boundaries/hartwell-1391-county.geojson";
const outputPath = "public/data/ming-boundary-research.json";
const bytes = async (relative: string) => readFile(path.join(root, relative));
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const researchBytes = await bytes(researchPath), modelBytes = await bytes(modelPath), countyModelBytes = await bytes(countyModelPath);

interface Source { id: string; title: string; kind: string; url: string; snapshotPath: string; snapshotSha256: string; rawSnapshotPath: string; rawSnapshotSha256: string }
interface Entry { id: string; name: string; summary: string; namingNote: string; unresolved: string[]; facts: { topic: string; statement: string; evidence: { sourceId: string; quote: string; locator: string; sourceUrl: string }[] }[] }
interface Model { id: string; name: string; sourceName: string; recordId: string; sourceId: string; year: number; level: string; sourceAdminType: string; sourceHierarchy: { province: string; prefecture: string } }
const research: { sources: Source[]; entries: Entry[] } = JSON.parse(researchBytes.toString());
const models: Model[] = JSON.parse(modelBytes.toString()).features.map((feature: { properties: Model }) => feature.properties);
const countyModels: Model[] = JSON.parse(countyModelBytes.toString()).features.map((feature: { properties: Model }) => feature.properties);
const sources = new Map(research.sources.map(source => [source.id, source]));
assert.equal(sources.size, research.sources.length, "Duplicate source IDs");
const snapshots = new Map<string, string>();
for (const source of research.sources) {
  assert.ok(source.snapshotPath.startsWith("data/evidence/ming-research/sources/"));
  const snapshot = await bytes(source.snapshotPath), raw = await bytes(source.rawSnapshotPath);
  assert.equal(sha(snapshot), source.snapshotSha256, source.id);
  assert.equal(sha(raw), source.rawSnapshotSha256, source.id);
  snapshots.set(source.id, snapshot.toString());
}

// Each pair is individually selected from the original name, type and hierarchy.
// The IDs guard against an accidental match to a same-name county or another region.
const reviewed: [string, string, string, string][] = [
  ["beijing", "5", "顺天府", "京师"], ["nanjing", "13", "应天府", "南京"],
  ["fengyang-boundary", "24", "凤阳府", "中都"], ["huaian-boundary", "30", "淮安府", "中都"],
  ["yangzhou", "29", "扬州府", "中都"], ["suzhou", "25", "苏州府", "中都"],
  ["qizhou-jinan", "14", "济南府", "山东"], ["yanzhou", "15", "兖州府", "山东"],
  ["datong", "65", "大同府", "山西"],
  ["kaifeng", "67", "开封府", "河南"], ["changan", "84", "西安府", "陜西"],
  ["chengdu", "111", "成都府", "四川"], ["yuzhou-chongqing", "115", "重庆府", "四川"],
  ["ezhou-jiangxia", "178", "武昌府", "湖广"], ["xiangyang", "180", "襄阳府", "湖广"],
  ["hangzhou", "151", "杭州府", "浙江"], ["fuzhou-fujian", "194", "福州府", "福建"],
  ["quanzhou", "195", "泉州府", "福建"], ["guangzhou", "202", "广州府", "广东"],
  ["guizhou-guilin", "225", "桂林府", "广西"], ["yunnan-boundary", "279", "云南府", "云南"],
  ["luoyang", "71", "河南府", "河南"], ["jingzhou", "183", "荆州府", "湖广"],
  ["dali", "277", "大理府", "云南"], ["mingzhou", "159", "宁波府", "浙江"], ["hongzhou", "162", "南昌府", "江西"],
];
const chronologyNotice = "这是标称1391年的近似模型；《明史》本条记述明代多个时期，所列州县、户口和后续建置不统一属于1391年或页面代表年1582年。史料说明行政沿革，不证明模型边线。";
const shuntianNotice = "名称与模型年份冲突：《明史》记1368年改北平府，1403年（永乐元年）才改顺天府。1391年应读作北平府；模型原名“顺天府”保留供核查，不将其认作1391年正式名称，也不将1391年模型当作1582年精确辖域。";
const guiyangNotice = "《明史》记1476年置程番府、1568年迁治、1569年改贵阳府，1601年才升军民府。因此1582年应称贵阳府；“贵阳军民府”是后来的记载标题，不能套入1391年。";

function publish(entry: Entry, correspondence: string, moreUnresolved: string[] = []): HistoricalResearchEntry {
  assert.ok(entry.facts.length && entry.summary && entry.namingNote, entry.id);
  return {
    id: entry.id, title: `${entry.name} · 建置与年代`, summary: entry.summary, correspondence,
    findings: entry.facts.map(fact => ({ topic: fact.topic, statement: fact.statement, evidence: fact.evidence.map(citation => {
      const source = sources.get(citation.sourceId);
      assert.ok(source, citation.sourceId);
      assert.equal(citation.sourceUrl, source.url);
      assert.ok(citation.quote && snapshots.get(source.id)!.includes(citation.quote), `${entry.id}: quotation not in snapshot`);
      return { sourceId: source.id, sourceTitle: source.title, sourceKind: source.kind, sourceUrl: source.url, quote: citation.quote, locator: citation.locator };
    }) })),
    unresolved: [entry.namingNote, ...entry.unresolved, "与源模型关联只核对行政单位名称和层级；治所位置、历年领县和真实辖域仍须逐条互证。", ...moreUnresolved],
  };
}

const byBoundary: MingBoundaryResearchDocument["byBoundary"] = {};
const covered = new Set<string>();
for (const [slug, recordId, name, province] of reviewed) {
  const entryId = `ming-geography-${slug}`;
  const entry = research.entries.find(item => item.id === entryId);
  assert.ok(entry, `Missing reviewed entry ${entryId}`);
  assert.equal(simplifiedChinese(entry.name), name);
  const candidates = models.filter(model => simplifiedChinese(model.sourceName) === name && simplifiedChinese(model.sourceHierarchy.province) === province && model.sourceAdminType === "Fu");
  assert.equal(candidates.length, 1, `Non-unique reviewed name and hierarchy: ${entryId}`);
  const model = candidates[0];
  assert.equal(model.recordId, recordId);
  assert.equal(model.sourceId, "hartwell-chgis-v5"); assert.equal(model.year, 1391); assert.equal(model.level, "prefecture");
  assert.equal(simplifiedChinese(model.sourceHierarchy.prefecture), name.replace(/府$/, ""));
  const yearNotice = slug === "beijing" ? shuntianNotice : chronologyNotice;
  const published = publish(entry, "same-unit", [yearNotice]);
  if (slug === "beijing") {
    const citation = published.findings.flatMap(finding => finding.evidence).find(item => item.quote.includes("改爲北平府") && item.quote.includes("改府爲順天府"));
    assert.ok(citation, "The North Peiping / Shuntian name chain requires direct quotation");
    published.findings.push({ topic: "chronology", statement: "洪武元年（1368）为北平府；永乐元年（1403）改顺天府。标称1391年模型使用了后来的府名。", evidence: [citation] });
  }
  byBoundary[model.id] = { boundaryId: model.id, sourceName: model.sourceName, modelYear: 1391, modelLevel: "prefecture", sourceAdminType: "Fu", researchName: entry.name, researchEntryId: entry.id, linkBasis: "source-name-and-hierarchy", yearNotice, historicalResearch: [published] };
  covered.add(entry.id);
}

// County identity includes its actual administrative type and named parent. Do
// not strip suffixes to merge e.g. Taiyuan county and Taiyuan prefecture.
const reviewedCounties: [string, string, string, string, string][] = [
  ["linzi", "260", "临淄", "山东", "青州"],
  ["handan", "116", "邯郸", "京师", "广平"],
  ["jinyang", "488", "太原", "山西", "太原"],
];
for (const [slug, recordId, sourceStem, province, parent] of reviewedCounties) {
  const entryId = `ming-geography-${slug}`;
  const entry = research.entries.find(item => item.id === entryId);
  assert.ok(entry, entryId); assert.equal(entry.name, `${sourceStem}县`);
  const candidates = countyModels.filter(model => simplifiedChinese(model.sourceName) === sourceStem && model.sourceAdminType === "Xian"
    && simplifiedChinese(model.sourceHierarchy.province) === province && simplifiedChinese(model.sourceHierarchy.prefecture) === parent);
  assert.equal(candidates.length, 1, `Non-unique county name and parent: ${entryId}`);
  const model = candidates[0];
  assert.equal(model.recordId, recordId); assert.equal(model.year, 1391); assert.equal(model.level, "county");
  assert.equal(simplifiedChinese(model.name), entry.name);
  const published = publish(entry, "same-unit", [chronologyNotice]);
  byBoundary[model.id] = { boundaryId: model.id, sourceName: model.sourceName, modelYear: 1391, modelLevel: "county", sourceAdminType: "Xian", researchName: entry.name, researchEntryId: entry.id, linkBasis: "source-name-and-hierarchy", yearNotice: chronologyNotice, historicalResearch: [published] };
  covered.add(entry.id);
}

const unlinkedEntries: MingBoundaryResearchDocument["unlinkedEntries"] = [];
const unlinkedReasons: Record<string, string> = {
  "ming-geography-tongguan": "潼关卫是军事建置，与目录中的潼关关隘及上级西安府层级不同；尚未建立经核查的卫所模型关联。",
  "ming-geography-yinchuan": "宁夏卫与宁夏后卫、宁夏中卫、宁夏右屯卫等是不同军事建置；不因名称相近把宁夏卫挂到府级文件的宁夏后卫面。",
  "ming-geography-guiyang-boundary": "1391源模型没有同名贵阳府或贵阳军民府记录；其中“贵州府”不能仅因字近或位置相邻就视为本条前身。",
};
for (const entry of research.entries.filter(item => !covered.has(item.id))) {
  assert.ok(unlinkedReasons[entry.id], `A new entry needs independent link review: ${entry.id}`);
  const isGuiyang = entry.id === "ming-geography-guiyang-boundary";
  const yearNotice = isGuiyang ? guiyangNotice : chronologyNotice;
  const published = publish(entry, "unresolved", [yearNotice]);
  if (isGuiyang) {
    assert.ok(!models.some(model => simplifiedChinese(model.sourceName) === "贵阳军民府" || simplifiedChinese(model.sourceName) === "贵阳府"));
    const citation = published.findings.flatMap(finding => finding.evidence).find(item => item.quote.includes("三年三月改府名貴陽") && item.quote.includes("萬曆二十九年"));
    assert.ok(citation, "Guiyang date distinction requires the original passage");
    published.findings.push({ topic: "chronology", statement: "1582年属于贵阳府阶段，1601年升军民府在其后。标称1391年的模型没有可直接关联的同名府面。", evidence: [citation] });
  }
  unlinkedEntries.push({ researchEntryId: entry.id, name: entry.name, reason: unlinkedReasons[entry.id], yearNotice, historicalResearch: [published] });
}

const output: MingBoundaryResearchDocument = {
  version: "2026-09-25", periodId: "ming", boundaryYear: 1391, byBoundary, unlinkedEntries,
  sources: research.sources.map(({ id, title, url, snapshotPath, snapshotSha256 }) => ({ id, title, url, snapshotPath, snapshotSha256 })),
  inputHashes: { [researchPath]: sha(researchBytes), [modelPath]: sha(modelBytes), [countyModelPath]: sha(countyModelBytes) },
  statistics: { researchEntries: research.entries.length, linkedEntries: covered.size, linkedBoundaries: Object.keys(byBoundary).length, unlinkedEntries: unlinkedEntries.length, sourceVolumes: research.sources.length },
  notes: ["本包只关联原模型同名、同类型且隶属字段唯一的具名府、县记录，不通过距离或最近点推断身份；府名与县名不会去掉后缀合并。", "1391是源文件标称年份；源名本身可能使用晚出名称。原始名称与几何完整保留，年代冲突另行显示。", "正文包含明代跨年沿革，不能将整篇《明史》的领州县数字或晚明建置回填到1391年或1582年。", "贵阳及未完成模型核查的卫所保留为未关联史料笔记，不强配近名行政区或绘制新边界。"],
};
await writeFile(path.join(root, outputPath), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output.statistics));
