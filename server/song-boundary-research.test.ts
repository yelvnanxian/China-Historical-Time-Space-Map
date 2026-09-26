import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import { getSongBoundaryResearch, songBoundaryPeriodNotice, type SongBoundaryResearchDocument } from "../shared/song-boundary-research";

const root = new URL("../", import.meta.url);
const bytes = (file: string) => readFile(new URL(file, root));
const json = async <T>(file: string) => JSON.parse((await bytes(file)).toString()) as T;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const published = await json<SongBoundaryResearchDocument>("public/data/song-boundary-research.json");
const bundle = await json<{ entries: { id: string; catalogPlaceId: string; name: string }[] }>("data/evidence/song-research/geography.json");
type Model = { id: string; name: string; sourceName: string; sourceAdminType: string; level: string; year: number; sourceHierarchy: { polity: string; province: string; prefecture: string; dependentPrefecture: string } };
const models = (await Promise.all(["prefecture", "county"].map(async level => (await json<{ features: { properties: Model }[] }>(`public/data/boundaries/hartwell-1200-${level}.geojson`)).features))).flat().map(feature => feature.properties);
const records = Object.values(published.byBoundary);
const byPlace = (id: string) => records.find(record => record.catalogPlaceId === id)!;

test("宋代29个城市入口逐项关联或说明缺口，府县、北宋南宋及政权不混用", () => {
  assert.equal(published.boundaryYear, 1200);
  assert.deepEqual({ ...published.statistics, sourceVolumes: undefined }, { researchEntries: 29, linkedEntries: 25, linkedBoundaries: 25, unlinkedEntries: 4, sourceVolumes: undefined });
  assert.deepEqual([...records, ...published.unlinkedEntries].map(record => record.researchEntryId).sort(), bundle.entries.map(entry => entry.id).sort());
  assert.equal(new Set([...records, ...published.unlinkedEntries].map(record => record.catalogPlaceId)).size, 29);
  for (const record of records) {
    const model = models.find(item => item.id === record.boundaryId);
    assert.ok(model, record.boundaryId);
    assert.equal(record.modelYear, 1200); assert.equal(model.year, 1200);
    assert.equal(record.sourceName, model.sourceName); assert.equal(record.sourceDisplayName, model.name);
    assert.equal(record.sourceAdminType, model.sourceAdminType); assert.equal(record.modelLevel, model.level);
    assert.deepEqual(record.sourceHierarchy, model.sourceHierarchy);
    assert.equal(record.researchName, bundle.entries.find(entry => entry.catalogPlaceId === record.catalogPlaceId)?.name);
    assert.equal(record.polityLabel, model.sourceHierarchy.polity === "金代" ? "金" : "南宋");
    if (record.polityLabel === "金") assert.match(record.yearNotice, /不属于南宋/);
    if (record.linkBasis === "source-name-and-hierarchy") assert.equal(record.researchName, simplifiedChinese(model.name));
    assert.equal(getSongBoundaryResearch(published, record.boundaryId), record);
  }
  assert.equal(getSongBoundaryResearch(published, "hartwell-1080-prefecture-v5_1080_chin_chn_1080_p-1"), undefined);
  assert.equal(getSongBoundaryResearch(undefined, undefined), undefined);
  assert.match(songBoundaryPeriodNotice(1080), /北宋.*辽.*1200.*不能混用/);
  assert.match(songBoundaryPeriodNotice(1200), /西夏.*大理.*不将.*南宋辖地/);
});

test("临安府、平江府、庆元府不误连同名县，晋阳只关联平晋县", () => {
  assert.equal(byPlace("hangzhou").boundaryId, "hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-213");
  assert.equal(byPlace("suzhou").boundaryId, "hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-214");
  assert.equal(byPlace("mingzhou").boundaryId, "hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-206");
  for (const id of ["1012", "1191", "1044"]) assert.equal(published.byBoundary[`hartwell-1200-county-v5_1200_chin_chn_1200_c-${id}`], undefined);
  assert.equal(byPlace("jinyang").modelLevel, "county");
  assert.equal(byPlace("jinyang").researchName, "平晋县");
  assert.equal(byPlace("jinyang").boundaryId, "hartwell-1200-county-v5_1200_chin_chn_1200_c-305");
  assert.equal(published.byBoundary["hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-115"], undefined);
  assert.equal(byPlace("kaifeng").modelLevel, "prefecture");
  assert.equal(published.byBoundary["hartwell-1200-county-v5_1200_chin_chn_1200_c-544"], undefined);
});

test("大同与重庆纠正显示名但保留源类型、年代冲突与直接文献链", () => {
  const datong = byPlace("datong"), chongqing = byPlace("yuzhou-chongqing"), handan = byPlace("handan");
  assert.equal(datong.sourceDisplayName, "大同府州");
  assert.equal(datong.sourceAdminType, "Zhou");
  assert.equal(datong.displayCorrection?.name, "大同府");
  assert.match(datong.yearNotice, /源字段冲突/);
  assert.ok(datong.historicalResearch[0].findings.flatMap(f => f.evidence).some(item => item.quote.includes("府名大同，金因之")));
  assert.equal(chongqing.sourceName, "渝州");
  assert.equal(chongqing.sourceAdminType, "Zhou");
  assert.equal(chongqing.linkBasis, "documented-rename");
  assert.equal(chongqing.displayCorrection?.name, "重庆府");
  assert.match(chongqing.yearNotice, /1189.*不把它当作已经核定/);
  const renameEvidence = chongqing.historicalResearch[0].findings.flatMap(f => f.evidence);
  assert.ok(renameEvidence.some(item => item.quote.includes("渝州") && item.quote.includes("恭州")));
  assert.ok(renameEvidence.some(item => item.sourceId === "song-research-songshi-36" && item.quote.includes("升恭州爲重慶府")));
  assert.equal(handan.sourceHierarchy.prefecture, "磁府");
  assert.match(handan.yearNotice, /磁府.*磁州/);
  assert.equal(handan.modelLevel, "county");
});

test("未收录同级面时说明缺口，不把西夏大理国境或最近区域充作城市辖区", () => {
  assert.deepEqual(published.unlinkedEntries.map(record => record.catalogPlaceId).sort(), ["dali", "dunhuang", "tongguan", "yinchuan"]);
  assert.ok(!records.some(record => record.boundaryId.includes("country")));
  assert.match(published.unlinkedEntries.find(record => record.catalogPlaceId === "yinchuan")!.reason, /不能把西夏全境/);
  assert.match(published.unlinkedEntries.find(record => record.catalogPlaceId === "dali")!.reason, /不是同一级/);
  assert.match(published.unlinkedEntries.find(record => record.catalogPlaceId === "tongguan")!.reason, /不能用附近/);
});

test("泉州点面不一致公开提示，不移动点或转配近邻；其余参考点包含关系不等于史实认证", () => {
  const quanzhou = byPlace("quanzhou");
  assert.equal(quanzhou.boundaryId, "hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-271");
  assert.equal(quanzhou.catalogPointComparison.status, "outside");
  assert.deepEqual(quanzhou.catalogPointComparison.coordinates, [118.68, 24.88]);
  assert.match(quanzhou.yearNotice, /参考点落在.*模型外/);
  assert.match(quanzhou.catalogPointComparison.note, /不移动坐标.*不改配到最近区域/);
  for (const record of records.filter(record => record.catalogPlaceId !== "quanzhou")) {
    assert.equal(record.catalogPointComparison.status, "inside");
    assert.match(record.catalogPointComparison.note, /不能证明宋代治所坐标/);
  }
});

test("宋代史料引文可回溯固定快照，原模型字节与输入哈希保持一致", async () => {
  for (const [file, expectedHash] of Object.entries(published.inputHashes)) assert.equal(hash(await bytes(file)), expectedHash, file);
  const snapshots = new Map<string, string>();
  for (const source of published.sources) {
    assert.match(source.url, /^https:\/\/zh\.(?:wikisource|wikipedia)\.org\/w\/index\.php\?.*oldid=\d+/);
    const snapshot = await bytes(source.snapshotPath);
    assert.equal(hash(snapshot), source.snapshotSha256, source.id);
    snapshots.set(source.id, snapshot.toString());
  }
  for (const record of [...records, ...published.unlinkedEntries]) for (const research of record.historicalResearch) {
    assert.ok(research.summary && research.findings.length && research.unresolved.length);
    for (const finding of research.findings) for (const citation of finding.evidence) {
      assert.ok(snapshots.get(citation.sourceId)?.includes(citation.quote), research.id);
      assert.equal(citation.sourceUrl, published.sources.find(source => source.id === citation.sourceId)?.url);
    }
  }
  assert.equal(hash(await bytes("public/data/boundaries/hartwell-1200-prefecture.geojson")), "efa3333cd7986a8f019f05daae908322e3bc987454d51331c5ec43517cb28747");
  assert.equal(hash(await bytes("public/data/boundaries/hartwell-1200-county.geojson")), "2a2d1012f5d2d4893b1cef501319cc61b17a98d2ed5b62c0fd88e08b5abe7c98");
  assert.equal(hash(await bytes("public/data/boundaries/hartwell-1080-prefecture.geojson")), "ac1588c8713c71fbbdf51c994173ae5044b625e0b35bf20669bcc429260ff7c6");
});
