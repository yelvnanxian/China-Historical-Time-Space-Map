/** Reviewed Song-period associations. Never use coordinates to infer identity. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { simplifiedChinese } from "../shared/boundary-search";
import type { HistoricalResearchEntry } from "../shared/historical-research";
import type { SongBoundaryResearchDocument, SongBoundaryResearchRecord } from "../shared/song-boundary-research";
import type { Polygon, MultiPolygon } from "geojson";
import { insideMountainRegion } from "../shared/mountain-regions";

const root = fileURLToPath(new URL("../", import.meta.url));
const researchPath = "data/evidence/song-research/geography.json";
const modelPaths = ["public/data/boundaries/hartwell-1200-prefecture.geojson", "public/data/boundaries/hartwell-1200-county.geojson"];
const bytes = (relative: string) => readFile(path.join(root, relative));
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const researchBytes = await bytes(researchPath);
const catalogBytes = await bytes("data/catalog.json");
const catalog: { places: { id: string; coordinates: [number, number] }[] } = JSON.parse(catalogBytes.toString());
interface Source { id: string; title: string; kind: string; url: string; snapshotPath: string; snapshotSha256: string; rawSnapshotPath?: string; rawSnapshotSha256?: string }
interface Entry { id: string; catalogPlaceId: string; name: string; summary: string; namingNote: string; unresolved: string[]; facts: { topic: string; statement: string; evidence: { sourceId: string; quote: string; locator: string; sourceUrl: string }[] }[] }
interface Model { id: string; name: string; sourceName: string; recordId: string; sourceId: string; year: number; level: "prefecture" | "county"; sourceAdminType: string; sourceHierarchy: SongBoundaryResearchRecord["sourceHierarchy"] }
const research: { sources: Source[]; entries: Entry[] } = JSON.parse(researchBytes.toString());
const inputHashes: Record<string, string> = { [researchPath]: sha(researchBytes), "data/catalog.json": sha(catalogBytes) };
const models: Model[] = [];
const geometries = new Map<string, Polygon | MultiPolygon>();
for (const modelPath of modelPaths) {
  const modelBytes = await bytes(modelPath);
  inputHashes[modelPath] = sha(modelBytes);
  const features: { properties: Model; geometry: Polygon | MultiPolygon }[] = JSON.parse(modelBytes.toString()).features;
  models.push(...features.map(feature => feature.properties));
  for (const feature of features) geometries.set(feature.properties.id, feature.geometry);
}
const sources = new Map(research.sources.map(source => [source.id, source]));
assert.equal(sources.size, research.sources.length, "Duplicate source IDs");
const snapshots = new Map<string, string>();
for (const source of research.sources) {
  assert.ok(source.snapshotPath.startsWith("data/evidence/song-research/sources/") || source.kind === "secondary-reference" && ["data/evidence/historical-context/dali.txt", "data/evidence/historical-context/dunhuang.txt"].includes(source.snapshotPath));
  const snapshot = await bytes(source.snapshotPath);
  assert.equal(sha(snapshot), source.snapshotSha256, source.id);
  if (source.kind === "historical-text") {
    assert.ok(source.rawSnapshotPath && source.rawSnapshotSha256, source.id);
    assert.equal(sha(await bytes(source.rawSnapshotPath)), source.rawSnapshotSha256, source.id);
  }
  snapshots.set(source.id, snapshot.toString());
}

// Every ID and source-field tuple below was inspected independently. Naming
// changes and contradictory source fields require an explicit evidence rule.
interface Review {
  placeId: string; recordId: string; level: "prefecture" | "county";
  sourceName: string; type: string; polity: "宋代" | "金代"; province: string; parent: string;
  researchName: string; conflict?: "datong" | "chongqing" | "handan" | "huzhou" | "wuzhou";
}
const prefectures: [string, string, string, string, "宋代" | "金代", string, string?][] = [
  ["changan", "161", "京兆府", "Fu", "金代", "京兆路"],
  ["luoyang", "140", "河南府", "Fu", "金代", "南京路"],
  ["beijing", "49", "大兴府", "Fu", "金代", "中都路"],
  ["kaifeng", "134", "开封府", "Fu", "金代", "南京路"],
  ["nanjing", "220", "建康府", "Fu", "宋代", "江南东路"],
  ["hangzhou", "213", "临安府", "Fu", "宋代", "浙西路"],
  ["chengdu", "351", "成都府", "Fu", "宋代", "成都府路"],
  ["guangzhou", "279", "广州", "Zhou", "宋代", "广南东路"],
  ["yangzhou", "191", "扬", "Zhou", "宋代", "淮南东路", "扬州"],
  ["xiangyang", "243", "襄阳府", "Fu", "宋代", "京西南路"],
  ["jingzhou", "246", "江陵府", "Fu", "宋代", "荆湖北路"],
  ["quanzhou", "271", "泉州", "Zhou", "宋代", "福建路"],
  ["suzhou", "214", "平江府", "Fu", "宋代", "浙西路"],
  ["qizhou-jinan", "187", "济南府", "Fu", "金代", "山东东路"],
  ["yanzhou", "105", "兖州", "Zhou", "金代", "山东西路"],
  ["ezhou-jiangxia", "247", "鄂州", "Zhou", "宋代", "荆湖北路"],
  ["fuzhou-fujian", "269", "福州", "Zhou", "宋代", "福建路"],
  ["guizhou-guilin", "297", "静江府", "Fu", "宋代", "广南西路"],
  ["mingzhou", "206", "庆元府", "Fu", "宋代", "浙东路"],
  ["hongzhou", "229", "隆兴府", "Fu", "宋代", "江南西路"],
  ["runzhou", "215", "镇江府", "Fu", "宋代", "浙西路"],
  ["yuezhou", "205", "绍兴府", "Fu", "宋代", "浙东路"],
  ["changzhou", "218", "常州", "Zhou", "宋代", "浙西路"],
  ["wenzhou", "207", "温州", "Zhou", "宋代", "浙东路"],
  ["xuanzhou", "221", "宁国府", "Fu", "宋代", "江南东路"],
  ["shezhou", "222", "徽州", "Zhou", "宋代", "江南东路"],
  ["jiangzhou-jiujiang", "239", "江州", "Zhou", "宋代", "江南西路"],
  ["jizhou-luling", "231", "吉州", "Zhou", "宋代", "江南西路"],
  ["qianzhou-gan", "230", "赣州", "Zhou", "宋代", "江南西路"],
  ["tanzhou", "260", "潭州", "Zhou", "宋代", "荆湖南路"],
  ["yuezhou-baling", "252", "岳州", "Zhou", "宋代", "荆湖北路"],
  ["hengzhou-hunan", "261", "衡州", "Zhou", "宋代", "荆湖南路"],
  ["hanzhong", "322", "兴元府", "Fu", "宋代", "利州路"],
  ["zizhou", "337", "潼川府", "Fu", "宋代", "潼川府路"],
  ["mianzhou", "366", "绵州", "Zhou", "宋代", "成都府路"],
  ["hanzhou", "355", "汉州", "Zhou", "宋代", "成都府路"],
  ["langzhou", "325", "阆州", "Zhou", "宋代", "利州路"],
  ["suizhou-suining", "338", "遂宁府", "Fu", "宋代", "潼川府路"],
  ["kuizhou", "372", "夔州", "Zhou", "宋代", "夔州路"],
  ["jianzhou", "335", "隆庆府", "Fu", "宋代", "利州路"],
];
const reviewed: Review[] = prefectures.map(([placeId, recordId, sourceName, type, polity, province, researchName]) => ({ placeId, recordId, sourceName, type, polity, province, researchName: researchName ?? sourceName, parent: researchName ?? sourceName, level: "prefecture" }));
reviewed.push(
  { placeId: "huzhou", recordId: "217", level: "prefecture", sourceName: "湖州", type: "Zhou", polity: "宋代", province: "浙西路", parent: "胡州", researchName: "湖州", conflict: "huzhou" },
  { placeId: "wuzhou-jinhua", recordId: "208", level: "prefecture", sourceName: "务州", type: "Zhou", polity: "宋代", province: "浙东路", parent: "务州", researchName: "婺州", conflict: "wuzhou" },
  { placeId: "datong", recordId: "39", level: "prefecture", sourceName: "大同府", type: "Zhou", polity: "金代", province: "西京路", parent: "大同府", researchName: "大同府", conflict: "datong" },
  { placeId: "yuzhou-chongqing", recordId: "380", level: "prefecture", sourceName: "渝州", type: "Zhou", polity: "宋代", province: "夔州路", parent: "渝州", researchName: "重庆府", conflict: "chongqing" },
  { placeId: "jinyang", recordId: "305", level: "county", sourceName: "平晋", type: "Xian", polity: "金代", province: "河东北路", parent: "太原府", researchName: "平晋县" },
  { placeId: "linzi", recordId: "419", level: "county", sourceName: "临淄", type: "Xian", polity: "金代", province: "山东东路", parent: "益都府", researchName: "临淄县" },
  { placeId: "handan", recordId: "236", level: "county", sourceName: "邯郸", type: "Xian", polity: "金代", province: "河北西路", parent: "磁府", researchName: "邯郸县", conflict: "handan" },
);
const commonNotice = "这是1200年近似行政模型；城池参考点不代表府州县疆界。史料覆盖多个年份，领县、升降与改名须按记载年代阅读，不能由文字记载证明模型边线。";
const conflictNotices = {
  huzhou: "源隶属字形冲突：模型名为湖州，层级字段却作胡州；同源的乌程、归安等六县与《宋史》湖州完整县目一致，保留原字段与原几何，不据纠字宣称边线已核定。",
  wuzhou: "源名称冲突：模型名及层级字段作务州；其七个同源属县与《宋史》婺州县目完全对应，显示名据文献纠正为婺州。原名称、类型和几何保留，不另造务州，也不据纠字推定治所或边线准确。",
  datong: "源字段冲突：模型原名“大同府州”、原始类型为Zhou（州），但原名字段及《金史》为大同府。地图名称按史料显示大同府；原类型和原几何保留供核查，不能据此认定边线准确。",
  chongqing: "源年代冲突：标称1200年模型仍名“渝州”、类型为州；《宋史》记渝州改恭州，本纪记1189年升重庆府。这里只关联有文献升改链的旧称参考面，不把它当作已经核定的1200年重庆府辖域。",
  handan: "源隶属字段冲突：邯郸县模型的上级写作“磁府”，《金史》将邯郸列于磁州。保留原上级字段并提示差异，不将“磁府”另造为一座府，也不据此修画县界。",
};

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
    unresolved: [entry.namingNote, ...entry.unresolved, ...moreUnresolved],
  };
}

const byBoundary: SongBoundaryResearchDocument["byBoundary"] = {};
const covered = new Set<string>();
for (const review of reviewed) {
  const entries = research.entries.filter(entry => entry.catalogPlaceId === review.placeId);
  assert.equal(entries.length, 1, `A unique research entry is required for ${review.placeId}`);
  const entry = entries[0];
  assert.equal(simplifiedChinese(entry.name), review.researchName, entry.id);
  const candidates = models.filter(model => model.level === review.level && model.recordId === review.recordId);
  assert.equal(candidates.length, 1, entry.id);
  const model = candidates[0];
  assert.equal(model.year, 1200); assert.equal(model.sourceId, "hartwell-chgis-v5");
  assert.equal(simplifiedChinese(model.sourceName), review.sourceName);
  assert.equal(model.sourceAdminType, review.type);
  assert.equal(simplifiedChinese(model.sourceHierarchy.polity), review.polity);
  assert.equal(simplifiedChinese(model.sourceHierarchy.province), review.province);
  assert.equal(simplifiedChinese(model.sourceHierarchy.prefecture || model.sourceHierarchy.dependentPrefecture), review.parent);
  // Name + type + government + named parent must also be unique independently
  // of the reviewed ID, protecting against accidental same-name county links.
  assert.equal(models.filter(other => other.level === review.level && other.sourceName === model.sourceName && other.sourceAdminType === model.sourceAdminType && JSON.stringify(other.sourceHierarchy) === JSON.stringify(model.sourceHierarchy)).length, 1);
  const polityLabel = review.polity === "金代" ? "金" : "南宋";
  const place = catalog.places.find(place => place.id === review.placeId);
  assert.ok(place, review.placeId);
  // This check happens only AFTER documentary identity is established. It can
  // flag a conflict but must never select or replace an administrative unit.
  const inside = insideMountainRegion(place.coordinates, geometries.get(model.id)!);
  const pointNote = inside
    ? "目录参考点落在该来源模型内；这只是数据一致性检查，不能证明宋代治所坐标或边线准确。"
    : "点面位置存疑：当前城市参考点落在该1200年来源模型外。目录点与模型面均未经古址精确核定，保留两者供核查，不移动坐标、不改画范围，也不改配到最近区域。";
  const routeNote = ["hanzhong", "langzhou", "jianzhou"].includes(review.placeId)
    ? "源路级字段概称利州路；《宋史》记庆元二年再分东西路，1200年本处按利州东路阅读。这里保留府州面关联，不用概括路名抹去分路年代。" : "";
  const notice = [routeNote, review.polity === "金代" ? "1200年此地属金，作为宋代同期地点收录，不属于南宋。" : "1200年此地属南宋。", review.conflict ? conflictNotices[review.conflict] : "", !inside ? pointNote : "", commonNotice].filter(Boolean).join("");
  const historicalResearch = publish(entry, "same-unit", [notice]);
  let displayCorrection: SongBoundaryResearchRecord["displayCorrection"];
  const evidence = historicalResearch.findings.flatMap(finding => finding.evidence);
  if (review.conflict === "datong") {
    const citation = evidence.find(item => /府名大同/.test(item.quote));
    assert.ok(citation, "Datong requires a direct prefecture quotation");
    assert.equal(model.name, "大同府州");
    displayCorrection = { name: "大同府", note: conflictNotices.datong, sourceUrl: citation.sourceUrl };
  }
  if (review.conflict === "chongqing") {
    assert.ok(evidence.some(item => /渝州/.test(item.quote) && /恭州/.test(item.quote)), "Chongqing requires the Yu/Gongzhou name chain");
    const citation = evidence.find(item => /升恭州爲重慶府/.test(item.quote));
    assert.ok(citation, "Chongqing requires the dated Guangzong annal, not an inferred rename");
    displayCorrection = { name: "重庆府", note: conflictNotices.chongqing, sourceUrl: citation.sourceUrl };
  }
  if (review.conflict === "huzhou" || review.conflict === "wuzhou") {
    const countyNames = models.filter(item => item.level === "county" && simplifiedChinese(item.sourceHierarchy.polity) === review.polity && simplifiedChinese(item.sourceHierarchy.province) === review.province && simplifiedChinese(item.sourceHierarchy.prefecture || item.sourceHierarchy.dependentPrefecture) === review.parent).map(item => simplifiedChinese(item.sourceName)).sort();
    const expected = review.conflict === "huzhou" ? ["乌程", "归安", "安吉", "长兴", "德清", "武康"] : ["金华", "义乌", "永康", "武义", "浦江", "兰溪", "东阳"];
    assert.deepEqual(countyNames, expected.sort(), "Source typo needs the full same-source county set, never a nearby name guess");
    const citation = evidence.find(item => expected.every(name => simplifiedChinese(item.quote).replaceAll("淸", "清").includes(name)));
    assert.ok(citation, "All counties must occur in the same cited geography paragraph");
    if (review.conflict === "wuzhou") displayCorrection = { name: "婺州", note: conflictNotices.wuzhou, sourceUrl: citation.sourceUrl };
  }
  if (review.conflict === "handan") {
    const parent = evidence.find(item => /^磁州/.test(item.quote)), child = evidence.find(item => /^邯鄲/.test(item.quote));
    assert.ok(parent && child && parent.sourceId === child.sourceId, "Handan requires the Cizhou county list");
    const snapshot = snapshots.get(parent.sourceId)!;
    const parentIndex = snapshot.indexOf(parent.quote), childIndex = snapshot.indexOf(child.quote, parentIndex);
    assert.ok(childIndex > parentIndex && childIndex - parentIndex < 1000, "Handan must occur in the quoted Cizhou section");
  }
  byBoundary[model.id] = {
    boundaryId: model.id, catalogPlaceId: review.placeId, sourceName: model.sourceName, sourceDisplayName: model.name, sourceHierarchy: model.sourceHierarchy,
    modelYear: 1200, modelLevel: review.level, sourceAdminType: model.sourceAdminType,
    researchName: entry.name, researchEntryId: entry.id, polityLabel,
    catalogPointComparison: { coordinates: place.coordinates, status: inside ? "inside" : "outside", note: pointNote },
    linkBasis: review.conflict === "chongqing" ? "documented-rename" : review.conflict ? "documented-source-conflict" : "source-name-and-hierarchy",
    yearNotice: notice, ...(displayCorrection ? { displayCorrection } : {}), historicalResearch: [historicalResearch],
  };
  covered.add(entry.id);
}

const unlinkedReasons: Record<string, string> = {
  tongguan: "潼关是关隘，1200年源模型没有经过核对的同名关隘或县级范围；不能用附近华州、华阴县代替关隘本身。",
  yinchuan: "兴庆府是西夏都城相关建置，1200年源资料只收录西夏政权参考面，未提供已核对的兴庆府城市或府级范围；不能把西夏全境当作都城辖区。",
  dali: "大理城与大理国不是同一级对象，1200年源资料中的大理国面不能当作大理城的城市或府县辖区。",
  dunhuang: "沙州、敦煌的同期建置可依史料阅读，但1200年源模型没有已核对的同名府州县面；不能以西夏政权范围或最近区域替代。",
};
const unlinkedEntries: SongBoundaryResearchDocument["unlinkedEntries"] = [];
for (const entry of research.entries.filter(item => !covered.has(item.id))) {
  const reason = unlinkedReasons[entry.catalogPlaceId];
  assert.ok(reason, `New entry needs an independent boundary review: ${entry.id}`);
  unlinkedEntries.push({ catalogPlaceId: entry.catalogPlaceId, researchEntryId: entry.id, name: entry.name, reason, yearNotice: commonNotice, historicalResearch: [publish(entry, "unresolved", [reason, commonNotice])] });
}
const output: SongBoundaryResearchDocument = {
  version: "2026-09-27", periodId: "song", boundaryYear: 1200, byBoundary, unlinkedEntries,
  sources: research.sources.map(({ id, title, url, snapshotPath, snapshotSha256 }) => ({ id, title, url, snapshotPath, snapshotSha256 })), inputHashes,
  statistics: { researchEntries: research.entries.length, linkedEntries: covered.size, linkedBoundaries: Object.keys(byBoundary).length, unlinkedEntries: unlinkedEntries.length, sourceVolumes: research.sources.length },
  notes: ["按逐字史料及原模型名称、政权、层级、隶属字段逐条核对，不以最近点、距离或同名后缀猜配。", "只关联1200年宋金同期模型；1080年北宋辽模型不承接本包关联，也未绘制源资料缺失的国界。", "大同府原类型、重庆旧称、邯郸源上级及湖州、婺州字形冲突分别列出，原模型文件和几何没有修改。", "未关联的都城或关隘不借用国家、上级行政区或现代边界冒充本地辖区。"],
};
await writeFile(path.join(root, "public/data/song-boundary-research.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output.statistics));
