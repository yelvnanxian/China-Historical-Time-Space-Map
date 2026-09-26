import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Catalog } from "../shared/types";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { HistoricalContextData } from "../shared/historical-context";
import type { HistoricalResearchFinding } from "../shared/historical-research";
import { filterCityProfiles } from "../shared/city-profiles";
import { simplifiedChinese } from "../shared/boundary-search";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const catalog: Catalog = JSON.parse(await read("data/catalog.json"));
const profiles: CityPeriodProfilesData = JSON.parse(await read("public/data/city-period-profiles.json"));
const context: HistoricalContextData = JSON.parse(await read("public/data/historical-context.json"));
const research: {
  periodId: string;
  sources: { id: string; url: string; revisionId: string; snapshotPath: string; snapshotSha256: string; rawSnapshotPath?: string; rawSnapshotSha256?: string }[];
  entries: { catalogPlaceId: string; name: string; region: string; summary: string; namingNote: string; facts: HistoricalResearchFinding[]; unresolved: string[] }[];
} = JSON.parse(await read("data/evidence/song-research/geography.json"));
const expected = ["changan", "luoyang", "beijing", "kaifeng", "nanjing", "hangzhou", "chengdu", "guangzhou", "yangzhou", "xiangyang", "jingzhou", "jinyang", "datong", "linzi", "handan", "tongguan", "yinchuan", "quanzhou", "dali", "dunhuang", "suzhou", "qizhou-jinan", "yanzhou", "ezhou-jiangxia", "fuzhou-fujian", "yuzhou-chongqing", "guizhou-guilin", "mingzhou", "hongzhou"].sort();
const song = filterCityProfiles(profiles.profiles, catalog.places, "song");

test("宋代29个阅读入口都有当期档案、简体名称和政权说明", () => {
  assert.deepEqual(song.map(p => p.placeId).sort(), expected);
  assert.deepEqual(research.entries.map(e => e.catalogPlaceId).sort(), expected);
  assert.deepEqual(catalog.places.filter(p => p.periodIds.includes("song")).map(p => p.id).sort(), expected);
  for (const profile of song) {
    assert.ok(profile.region && profile.namingNote && profile.politicalContext, profile.id);
    assert.ok(profile.historicalResearch?.length && profile.evidence.length >= 2, profile.id);
    const name = catalog.places.find(p => p.id === profile.placeId)!.nameByPeriod!.song;
    for (const value of [name, profile.summary, profile.region, profile.namingNote, profile.politicalContext]) {
      assert.equal(value, simplifiedChinese(value), `${profile.id}: ${value}`);
      assert.doesNotMatch(value, /\{\{|\}\}|[A-Za-z\u0400-\u04ff\u3040-\u30ff\uac00-\ud7af]/);
    }
  }
  for (const [query, id] of [["临安", "hangzhou"], ["平江", "suzhou"], ["隆興", "hongzhou"], ["慶元", "mingzhou"], ["南京开封", "kaifeng"], ["建康", "nanjing"], ["平晋县", "jinyang"]]) {
    assert.ok(filterCityProfiles(profiles.profiles, catalog.places, "song", query).some(p => p.placeId === id), query);
  }
});

test("宋金并立不混同都城与同名南京，旧晋阳不冒充太原府治", () => {
  const byId = new Map(song.map(p => [p.placeId, p]));
  for (const id of ["changan", "luoyang", "beijing", "kaifeng", "jinyang", "datong", "linzi", "handan", "tongguan", "qizhou-jinan", "yanzhou"]) assert.match(byId.get(id)!.region!, /^金·/, id);
  assert.equal(byId.get("yinchuan")!.region, "西夏");
  assert.equal(byId.get("dali")!.region, "大理国");
  assert.match(byId.get("dunhuang")!.region!, /^西夏/);
  assert.match(byId.get("kaifeng")!.namingNote!, /今河南开封/);
  assert.match(byId.get("nanjing")!.namingNote!, /金朝位于开封/);
  const jinyang = catalog.places.find(p => p.id === "jinyang")!;
  assert.equal(jinyang.nameByPeriod!.song, "平晋县");
  assert.deepEqual(jinyang.coordinates, [112.45, 37.73]);
  assert.match(byId.get("jinyang")!.summary, /太原府附郭县为阳曲/);
  assert.match(byId.get("jinyang")!.namingNote!, /精确位置尚待/);
  assert.equal(catalog.places.find(p => p.id === "luoyang")!.nameByPeriod!.song, "河南府");
  assert.equal(catalog.places.find(p => p.id === "beijing")!.typeByPeriod!.song, "capital");
  assert.notEqual(catalog.places.find(p => p.id === "kaifeng")!.typeByPeriod?.song, "capital");
  assert.match(byId.get("ezhou-jiangxia")!.namingNote!, /不能因同名跳到现代鄂州市/);
});

test("宋代引文对应固定版本与双哈希，史料不冒充空间核定", async () => {
  const snapshots = new Map<string, string>();
  const sources = new Map(research.sources.map(s => [s.id, s]));
  for (const source of research.sources) {
    assert.match(source.url, /oldid=\d+/);
    const content = await read(source.snapshotPath);
    assert.equal(createHash("sha256").update(content).digest("hex"), source.snapshotSha256, source.id);
    snapshots.set(source.id, content);
    if (source.rawSnapshotPath) {
      const raw = await read(source.rawSnapshotPath);
      assert.equal(createHash("sha256").update(raw).digest("hex"), source.rawSnapshotSha256, source.id);
      assert.equal(String(JSON.parse(raw).parse.revid), source.revisionId, source.id);
    }
  }
  for (const entry of research.entries) {
    assert.ok(entry.unresolved.length >= 2, entry.catalogPlaceId);
    assert.ok(!("coordinates" in entry) && !("geometry" in entry));
    for (const fact of entry.facts) {
      assert.equal(fact.statement, simplifiedChinese(fact.statement));
      for (const quote of fact.evidence) {
        assert.equal(quote.sourceUrl, sources.get(quote.sourceId)!.url);
        assert.ok(snapshots.get(quote.sourceId)!.includes(quote.quote), `${entry.catalogPlaceId}/${quote.locator}`);
        assert.ok(quote.locator.length > 5);
        assert.doesNotMatch(quote.quote, /\{\{|\}\}/);
      }
    }
  }
});

test("重庆与隆兴升府据本纪核年，待考地点不凑纪年", () => {
  const events = context.cityTimelines.flatMap(t => t.entries.filter(e => e.id.startsWith("song-timeline-")));
  assert.ok(events.length >= 45);
  for (const entry of events) {
    assert.ok(entry.year >= 960 && entry.year <= 1279, entry.id);
    assert.ok(entry.dateLabel && entry.sourceIds.length && entry.evidence.length, entry.id);
    assert.equal(entry.title, simplifiedChinese(entry.title));
    assert.equal(entry.summary, simplifiedChinese(entry.summary));
  }
  for (const [pid, title, year, source] of [["yuzhou-chongqing", "恭州升重庆府", 1189, "song-research-songshi-36"], ["hongzhou", "洪州升隆兴府", 1163, "song-research-songshi-33"]] as const) {
    const event = context.cityTimelines.find(t => t.placeId === pid)!.entries.find(e => e.title === title)!;
    assert.equal(event.year, year);
    assert.ok(event.sourceIds.includes(source));
    assert.ok(research.entries.find(e => e.catalogPlaceId === pid)!.unresolved.some(v => /本纪/.test(v)));
  }
  assert.ok(!events.some(e => /hongzhou/.test(e.id) && e.year === 1165));
  for (const pid of ["linzi", "handan", "tongguan"]) assert.ok(!events.some(e => e.id.startsWith(`song-timeline-${pid}-`)));
  assert.ok(events.some(e => e.year === 1222 && /嘉定/.test(e.title)), "晚于截面的沿革有独立纪年");
});
