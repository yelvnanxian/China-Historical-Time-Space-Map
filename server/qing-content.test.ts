import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { CityTimelineEntry, HistoricalContextData, HistoricalContextSource } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"));
const tmp = await mkdtemp(path.join(os.tmpdir(), "map-qing-content-"));
execFileSync("python3", [path.join(root, "scripts/build-qing-content.py"), "--output-root", tmp], { cwd: root, stdio: "pipe" });
const profiles = await readJson<CityPeriodProfilesData>(path.join(tmp, "public/data/city-period-profiles.json"));
const context = await readJson<HistoricalContextData>(path.join(tmp, "public/data/historical-context.json"));
const pack = await readJson<{
  sources: HistoricalContextSource[];
  profiles: CityPeriodProfilesData["profiles"];
  timelineAdditions: { placeId: string; entry: CityTimelineEntry }[];
  excludedCandidates: { placeId: string; quote: string; reason: string }[];
}>(path.join(tmp, "data/evidence/qing-research/content.json"));
await rm(tmp, { recursive: true, force: true });

test("清代首批六城档案和十三个确年节点可由固定修订逐字复查", async () => {
  assert.deepEqual(pack.profiles.map(p => p.placeId).sort(), ["changan", "chengdu", "hangzhou", "kaifeng", "nanjing", "yinchuan"]);
  assert.equal(pack.timelineAdditions.length, 13);
  const sources = new Map(pack.sources.map(source => [source.id, source]));
  const snapshots = new Map(await Promise.all(pack.sources.map(async source => {
    const text = await readFile(path.join(root, source.snapshotPath), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), source.snapshotSha256);
    assert.match(new URL(source.url).searchParams.get("oldid") ?? "", /^\d+$/);
    return [source.id, text] as const;
  })));
  for (const record of [...pack.profiles, ...pack.timelineAdditions.map(row => row.entry)]) {
    assert.equal(record.summary, simplifiedChinese(record.summary), record.id);
    assert.ok(!("coordinates" in record) && !("geometry" in record), record.id);
    assert.deepEqual([...new Set(record.evidence.map(q => q.sourceId))].sort(), [...record.sourceIds].sort());
    for (const citation of record.evidence) {
      assert.ok(sources.has(citation.sourceId));
      assert.ok(snapshots.get(citation.sourceId)?.includes(citation.quote), record.id);
      assert.ok(citation.supports.length > 10);
    }
  }
  for (const profile of pack.profiles) assert.match(profile.politicalContext!, /固定修订.*地方志/);
});

test("清代合并保留其他朝代以及原有条目，不复制既有1724年宁夏节点", async () => {
  const originalProfiles = await readJson<CityPeriodProfilesData>(path.join(root, "public/data/city-period-profiles.json"));
  const originalContext = await readJson<HistoricalContextData>(path.join(root, "public/data/historical-context.json"));
  const targetProfiles = new Set(pack.profiles.map(p => p.id));
  assert.deepEqual(profiles.profiles.filter(p => !targetProfiles.has(p.id)), originalProfiles.profiles.filter(p => !targetProfiles.has(p.id)));
  assert.equal(new Set(profiles.profiles.map(p => p.id)).size, profiles.profiles.length);
  const targetEntries = new Set(pack.timelineAdditions.map(row => row.entry.id));
  for (const original of originalContext.cityTimelines) {
    const result = context.cityTimelines.find(row => row.placeId === original.placeId)!;
    assert.ok(result);
    assert.deepEqual(result.entries.filter(e => !targetEntries.has(e.id)), original.entries.filter(e => !targetEntries.has(e.id)));
  }
  assert.equal(context.cityTimelines.find(t => t.placeId === "yinchuan")!.entries.filter(e => e.year === 1724).length, 1);
  const ids = context.cityTimelines.flatMap(row => row.entries.map(e => e.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("清代待核的置县和开埠冲突不变成确定时间轴节点", () => {
  assert.deepEqual(pack.excludedCandidates.map(row => row.placeId).sort(), ["dunhuang", "hangzhou", "nanjing"]);
  assert.ok(pack.excludedCandidates.every(row => row.quote && row.reason));
  assert.ok(!pack.timelineAdditions.some(row => row.placeId === "dunhuang"));
  assert.ok(!pack.timelineAdditions.some(row => row.placeId === "hangzhou" && [1895, 1896].includes(row.entry.year)));
  assert.ok(!pack.timelineAdditions.some(row => row.placeId === "nanjing" && row.entry.year === 1906));
  const movement = pack.timelineAdditions.find(row => row.placeId === "chengdu" && row.entry.year === 1911)!.entry;
  assert.match(movement.dateLabel, /1911年6月/);
  assert.doesNotMatch(movement.dateLabel, /宣统三年六月/, "公历六月不自动写成农历纪月");
});
