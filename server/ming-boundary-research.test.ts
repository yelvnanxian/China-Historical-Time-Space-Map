import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import { getMingBoundaryResearch, type MingBoundaryResearchDocument } from "../shared/ming-boundary-research";

const root = new URL("../", import.meta.url);
const bytes = async (file: string) => readFile(new URL(file, root));
const json = async <T>(file: string) => JSON.parse((await bytes(file)).toString()) as T;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const published = await json<MingBoundaryResearchDocument>("public/data/ming-boundary-research.json");
const bundle = await json<{ entries: { id: string; name: string }[] }>("data/evidence/ming-research/geography.json");
type Models = { features: { properties: { id: string; name: string; sourceName: string; level: string; sourceAdminType: string; year: number; sourceHierarchy: { province: string; prefecture: string } } }[] };
const models = await json<Models>("public/data/boundaries/hartwell-1391-prefecture.geojson");
const countyModels = await json<Models>("public/data/boundaries/hartwell-1391-county.geojson");

test("明代建置史料完整收录且按具名源记录与准确层级关联，不提升县面或强配未定单位", () => {
  const linked = Object.values(published.byBoundary);
  assert.deepEqual(published.statistics, { researchEntries: 32, linkedEntries: 29, linkedBoundaries: 29, unlinkedEntries: 3, sourceVolumes: 7 });
  assert.deepEqual([...linked.map(record => record.researchEntryId), ...published.unlinkedEntries.map(record => record.researchEntryId)].sort(), bundle.entries.map(entry => entry.id).sort());
  for (const record of linked) {
    const model = [...models.features, ...countyModels.features].find(feature => feature.properties.id === record.boundaryId)?.properties;
    assert.ok(model, record.boundaryId);
    assert.equal(model.level, record.modelLevel); assert.equal(model.sourceAdminType, record.sourceAdminType); assert.equal(model.year, 1391);
    assert.equal(record.sourceName, model.sourceName);
    assert.equal(record.researchName, simplifiedChinese(model.name));
    if (record.modelLevel === "prefecture") {
      assert.equal(record.researchName, simplifiedChinese(model.sourceName));
      assert.equal(record.researchName.replace(/府$/, ""), simplifiedChinese(model.sourceHierarchy.prefecture));
    } else {
      assert.equal(record.sourceAdminType, "Xian");
      assert.equal(record.researchName, `${simplifiedChinese(model.sourceName)}县`);
      assert.ok(model.sourceHierarchy.prefecture);
    }
    assert.equal(record.linkBasis, "source-name-and-hierarchy");
    assert.equal(record.modelYear, 1391);
    assert.match(record.yearNotice, /1391/); assert.match(record.yearNotice, /1582/);
    assert.equal(getMingBoundaryResearch(published, record.boundaryId), record);
  }
  assert.equal(getMingBoundaryResearch(published, "hartwell-1391-county-v5_1391_chin_chn_1391_c-133"), undefined);
  assert.equal(getMingBoundaryResearch(undefined, undefined), undefined);
});

test("明代逐字证据与固定快照一致，发布包绑定未改动的输入与原模型", async () => {
  for (const [file, expectedHash] of Object.entries(published.inputHashes)) assert.equal(hash(await bytes(file)), expectedHash, file);
  const sourceSnapshots = new Map<string, string>();
  for (const source of published.sources) {
    assert.match(source.url, /^https:\/\/zh\.wikisource\.org\/w\/index\.php\?oldid=\d+$/);
    const snapshot = await bytes(source.snapshotPath);
    assert.equal(hash(snapshot), source.snapshotSha256, source.id);
    sourceSnapshots.set(source.id, snapshot.toString());
  }
  const records = [...Object.values(published.byBoundary), ...published.unlinkedEntries];
  for (const record of records) for (const research of record.historicalResearch) {
    assert.ok(research.summary && research.findings.length && research.unresolved.length);
    for (const finding of research.findings) for (const citation of finding.evidence) {
      assert.ok(sourceSnapshots.get(citation.sourceId)?.includes(citation.quote), research.id);
      assert.equal(citation.sourceUrl, published.sources.find(source => source.id === citation.sourceId)?.url);
      assert.ok(citation.locator && citation.sourceTitle);
    }
  }
  // This hash is the independently audited V0.13 original-reprojection file.
  assert.equal(hash(await bytes("public/data/boundaries/hartwell-1391-prefecture.geojson")), "5b8940f9733254424df68934f1a9a7588dbb7cadb344629436a0e6a04c1cb9f7");
});

test("顺天府明确保留1391模型的后出名称冲突，不冒称1391正式府名", () => {
  const shuntian = published.byBoundary["hartwell-1391-prefecture-v5_1391_chin_chn_1391_p-5"];
  assert.equal(shuntian.sourceName, "順天府");
  assert.match(shuntian.yearNotice, /1391年应读作北平府/);
  assert.match(shuntian.yearNotice, /1403年/);
  const chronology = shuntian.historicalResearch[0].findings.find(finding => finding.topic === "chronology");
  assert.ok(chronology);
  assert.match(chronology.evidence[0].quote, /洪武元年.*改爲北平府/);
  assert.match(chronology.evidence[0].quote, /永樂元年.*改府爲順天府/);
});

test("贵阳府1582与1601军民府分期明确，无证据时不关联1391贵州府", () => {
  assert.equal(published.byBoundary["hartwell-1391-prefecture-v5_1391_chin_chn_1391_p-253"], undefined);
  const guiyang = published.unlinkedEntries.find(record => record.researchEntryId === "ming-geography-guiyang-boundary");
  assert.ok(guiyang);
  assert.match(guiyang.yearNotice, /1476.*1568.*1569.*1601/);
  assert.match(guiyang.yearNotice, /1582年应称贵阳府/);
  assert.match(guiyang.reason, /贵州府.*不能/);
  assert.equal(guiyang.historicalResearch[0].correspondence, "unresolved");
  const chronology = guiyang.historicalResearch[0].findings.find(finding => finding.topic === "chronology");
  assert.ok(chronology);
  assert.match(chronology.evidence[0].quote, /三年三月改府名貴陽/);
  assert.match(chronology.evidence[0].quote, /萬曆二十九年.*升爲軍民府/);
});

test("太原县入口不关联太原府，县与卫的关系不会靠同名后缀猜配", () => {
  const taiyuan = published.byBoundary["hartwell-1391-county-v5_1391_chin_chn_1391_c-488"];
  assert.ok(taiyuan);
  assert.equal(taiyuan.researchEntryId, "ming-geography-jinyang");
  assert.equal(taiyuan.researchName, "太原县");
  assert.equal(taiyuan.modelLevel, "county");
  assert.equal(published.byBoundary["hartwell-1391-prefecture-v5_1391_chin_chn_1391_p-64"], undefined);
  assert.equal(published.byBoundary["hartwell-1391-prefecture-v5_1391_chin_chn_1391_p-82"], undefined);
  assert.ok(published.unlinkedEntries.some(record => record.researchEntryId === "ming-geography-yinchuan" && /宁夏后卫/.test(record.reason)));
  assert.deepEqual(["116", "260"].map(id => published.byBoundary[`hartwell-1391-county-v5_1391_chin_chn_1391_c-${id}`].researchName), ["邯郸县", "临淄县"]);
});
