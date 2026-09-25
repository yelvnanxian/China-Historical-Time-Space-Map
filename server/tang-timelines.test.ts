import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createHash } from "node:crypto";
import type { HistoricalContextData, CityTimeline } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const tang: Pick<HistoricalContextData, "sources" | "cityTimelines"> = await read("data/tang-city-timelines.json");
const integrated: HistoricalContextData = await read("public/data/historical-context.json");
const targets = await read("data/tang-expansion/completion-targets.json");
const baseline: { cityCount: number; cityTimelines: CityTimeline[] } = await read("data/evidence/tang-timelines/legacy-baseline.json");
const coverage = await read("data/evidence/tang-timelines/coverage.json");
const byCity = new Map(integrated.cityTimelines.map(city => [city.placeId, city]));
const byTangCity = new Map(tang.cityTimelines.map(city => [city.placeId, city]));

test("唐104入口均有真实纪年节点，96入口至少3个年份，史料不足不凑数", () => {
  assert.equal(targets.towns.length, 104);
  assert.deepEqual([...byTangCity.keys()].sort(), targets.towns.map((town: { placeId: string }) => town.placeId).sort());
  assert.equal(tang.cityTimelines.reduce((n, city) => n + city.entries.length, 0), 346);
  assert.equal(tang.cityTimelines.filter(city => new Set(city.entries.map(entry => entry.year)).size >= 3).length, 96);
  const incomplete = tang.cityTimelines.filter(city => new Set(city.entries.map(entry => entry.year)).size < 3).map(city => city.placeId).sort();
  assert.deepEqual(incomplete, ["linzi", "tongguan", "mawei", "tingzhou-beiting", "yutian-hotan", "shule-kashgar", "yanqi", "xianyang"].sort());
  for (const city of tang.cityTimelines) {
    assert.ok(city.entries.length >= 1);
    for (const entry of city.entries) {
      assert.ok(Number.isInteger(entry.year) && entry.year >= 618 && entry.year <= 907);
      assert.ok(entry.title.trim() && entry.summary.trim() && entry.evidence.length);
      assert.ok(byCity.get(city.placeId)?.entries.some(item => item.id === entry.id));
    }
  }
  assert.equal(coverage.coveredCount, 104);
  assert.equal(coverage.threeOrMoreCount, 96);
  assert.equal(coverage.entryCount, 346);
});

test("原22城71条跨朝大事记逐项保留，已有关联事件不重复加入", () => {
  assert.equal(baseline.cityCount, 22);
  assert.equal(baseline.cityTimelines.reduce((n, city) => n + city.entries.length, 0), 71);
  for (const oldCity of baseline.cityTimelines) {
    const city = byCity.get(oldCity.placeId)!;
    assert.ok(city);
    assert.ok(new Set(oldCity.entries.map(entry => entry.year)).size >= 3);
    assert.ok(oldCity.entries.at(-1)!.year - oldCity.entries[0].year >= 100);
    for (const oldEntry of oldCity.entries) assert.deepEqual(city.entries.find(entry => entry.id === oldEntry.id), oldEntry);
    assert.equal(new Set(city.entries.map(entry => entry.id)).size, city.entries.length);
  }
  assert.equal(integrated.cityTimelines.length, 106);
  assert.equal(integrated.cityTimelines.reduce((n, city) => n + city.entries.length, 0), 414);
  for (const id of ["chronicle-anshi-757-luoyang", "chronicle-anshi-756-chengdu", "chronicle-anshi-756-tongguan"])
    assert.equal(integrated.cityTimelines.flatMap(city => city.entries).filter(entry => entry.id === id).length, 1, id);
});

test("唐新增节点逐字存在于固定修订快照，快照SHA256和来源引用完整", async () => {
  const sources = new Map(tang.sources.map(source => [source.id, source]));
  const texts = new Map(await Promise.all(tang.sources.map(async source => {
    const absolute = path.resolve(root, source.snapshotPath);
    assert.ok(absolute.startsWith(path.join(root, "data/evidence") + path.sep));
    const content = await readFile(absolute, "utf8");
    assert.equal(createHash("sha256").update(content).digest("hex"), source.snapshotSha256, source.id);
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.match(url.searchParams.get("oldid") ?? "", /^\d+$/, source.id);
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    return [source.id, content] as const;
  })));
  const ids = new Set<string>();
  for (const city of tang.cityTimelines) for (const entry of city.entries) {
    assert.ok(!ids.has(entry.id), entry.id); ids.add(entry.id);
    assert.deepEqual([...new Set(entry.evidence.map(evidence => evidence.sourceId))].sort(), [...entry.sourceIds].sort());
    for (const evidence of entry.evidence) {
      assert.ok(sources.has(evidence.sourceId));
      assert.ok(evidence.supports.trim());
      assert.ok(texts.get(evidence.sourceId)?.includes(evidence.quote), `${city.placeId}: ${evidence.quote}`);
    }
  }
});

test("同名年号、县州层级和史料异文不造成唐事件错年错城", () => {
  const yearForTitle = (city: string, title: string) => byTangCity.get(city)?.entries.find(entry => entry.title === title)?.year;
  assert.equal(yearForTitle("wenzhou", "分永嘉、安固二县置温州"), 675);
  assert.equal(yearForTitle("xiangyang", "设置襄州节度使"), 761);
  assert.equal(yearForTitle("nanjing", "改上元县，重新隶属润州"), 761);
  assert.equal(yearForTitle("yutian-hotan", "于阗地区设置毗沙都督府"), 675);
  assert.equal(yearForTitle("zhengzhou", "郑州州治迁到管城"), 633);
  assert.equal(yearForTitle("liuzhou", "南昆州改称柳州"), 634);
  assert.equal(yearForTitle("qizhou-jinan", "临淄郡改称济南郡"), 746);
  assert.ok(byTangCity.get("linzi")!.entries.every(entry => !entry.title.includes("改称临淄郡")));
  assert.equal(yearForTitle("xizhou-gaochang", "唐平高昌后设置西州及都护府"), 640);
  assert.ok(!byTangCity.get("xizhou-gaochang")!.entries.some(entry => entry.year === 639));
  assert.ok(!byTangCity.get("tingzhou-beiting")!.entries.some(entry => /陷吐蕃/.test(entry.title)));
  assert.ok(!byTangCity.get("tongguan")!.entries.some(entry => entry.year === 755));
  assert.ok(!byTangCity.get("xianyang")!.entries.some(entry => entry.year === 705), "神龙初不强定为705年");
});
