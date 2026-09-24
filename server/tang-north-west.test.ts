import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { CityPeriodProfile } from "../shared/city-profiles";
import type { HistoricalContextSource } from "../shared/historical-context";
import type { Place } from "../shared/types";
import { simplifiedChinese } from "../shared/boundary-search";

const root = fileURLToPath(new URL("../", import.meta.url));
interface Profile extends CityPeriodProfile { region: string; namingNote: string }
interface Bundle {
  newPlaces: Place[];
  sources: HistoricalContextSource[];
  profiles: Profile[];
  coverage: { existingPlaceIds: string[]; newPlaceIds: string[] };
}
const bundle: Bundle = JSON.parse(await readFile(path.join(root, "data/tang-expansion/north-west.json"), "utf8"));
const expectedExisting = "changan luoyang beijing fanyang jinyang datong linzi handan tongguan dunhuang mawei lingwu suiyang xiangzhou heyang shanzhou zhengzhou huazhou-hua huaizhou hengzhou beizhou pingyuan fuzhou-fu luzhou dengzhou xuzhou-xuchang xuzhou-pengcheng kaifeng".split(" ");
const snapshots = new Map(await Promise.all(bundle.sources.map(async source => {
  const target = path.resolve(root, source.snapshotPath);
  assert.ok(target.startsWith(path.join(root, "data/evidence/tang-expansion/north-west") + path.sep));
  return [source.id, await readFile(target, "utf8")] as const;
})));

test("唐北西批完整覆盖28既有入口和22新入口，每篇有至少两条事实摘录", () => {
  assert.deepEqual([...bundle.coverage.existingPlaceIds].sort(), [...expectedExisting].sort());
  assert.equal(bundle.newPlaces.length, 22);
  assert.equal(bundle.profiles.length, 50);
  const ids = new Set(bundle.profiles.map(p => p.placeId));
  assert.equal(ids.size, 50);
  for (const id of [...expectedExisting, ...bundle.newPlaces.map(p => p.id)]) assert.ok(ids.has(id));
  for (const profile of bundle.profiles) {
    assert.equal(profile.periodId, "tang");
    assert.equal(profile.id, `tang-${profile.placeId}`);
    assert.ok(profile.summary.length >= 60 && profile.namingNote.length >= 20);
    assert.ok(["关中与两京", "河北与河东", "中原与山东", "河西与西域"].includes(profile.region));
    assert.ok(profile.evidence.length >= 2);
    assert.deepEqual([...new Set(profile.evidence.map(e => e.sourceId))].sort(), [...profile.sourceIds].sort());
    for (const text of [profile.summary, profile.namingNote, profile.region, profile.politicalContext ?? "", ...profile.evidence.map(e => e.supports)]) {
      assert.equal(text, simplifiedChinese(text), `${profile.id}: 编辑文本应为简体`);
    }
  }
  for (const place of bundle.newPlaces) {
    assert.deepEqual(place.periodIds, ["tang"]);
    assert.ok(place.nameByPeriod?.tang && place.location?.accuracy === "approximate");
    assert.ok(place.location.note.includes("现代") && place.location.note.includes("没有核定唐代"));
    assert.ok(place.sourceIds.every(id => snapshots.has(id)));
    assert.ok(place.location.sourceIds.every(id => snapshots.has(id)));
    for (const text of [place.name, place.modernName ?? "", place.summary, place.location.note, ...(place.aliases ?? []), ...Object.values(place.nameByPeriod ?? {})]) {
      assert.equal(text, simplifiedChinese(text), `${place.id}: 名称或说明应为简体`);
    }
    assert.equal(new Set(place.aliases).size, place.aliases.length);
  }
});

test("唐北西批来源固定修订、SHA256和逐字引文全部可回查", () => {
  assert.equal(snapshots.size, bundle.sources.length);
  for (const source of bundle.sources) {
    assert.ok(source.id.startsWith("tang-nw-"));
    assert.equal(createHash("sha256").update(snapshots.get(source.id)!).digest("hex"), source.snapshotSha256);
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    if (/wik(isource|ipedia)\.org$/.test(url.hostname)) assert.match(url.searchParams.get("oldid") ?? "", /^\d+$/);
  }
  for (const profile of bundle.profiles) for (const evidence of profile.evidence) {
    assert.ok(evidence.quote.length > 5 && evidence.supports.length > 5);
    assert.ok(snapshots.get(evidence.sourceId)?.includes(evidence.quote), `${profile.id}: 引文不在快照中`);
  }
});

test("唐北西批22坐标逐条来自原始GeoNames现代记录并降为0.01度地区参考", async () => {
  const selection: { archiveSha256: string; selectedRecords: { placeId: string; geonameId: string; rawRecord: string; displayCoordinates: [number, number] }[] } = JSON.parse(await readFile(path.join(root, "data/evidence/tang-expansion/north-west/geonames-selection.json"), "utf8"));
  assert.match(selection.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(selection.selectedRecords.length, 22);
  const records = new Map(selection.selectedRecords.map(record => [record.placeId, record]));
  for (const place of bundle.newPlaces) {
    const record = records.get(place.id);
    assert.ok(record);
    const fields = record.rawRecord.split("\t");
    assert.equal(fields.length, 19);
    assert.equal(fields[0], record.geonameId);
    assert.equal(fields[6], "P", "参考坐标必须是现代居民点记录");
    const rounded = [Math.round(Number(fields[5]) * 100) / 100, Math.round(Number(fields[4]) * 100) / 100];
    assert.deepEqual(place.coordinates, rounded);
    assert.deepEqual(record.displayCoordinates, rounded);
  }
});
