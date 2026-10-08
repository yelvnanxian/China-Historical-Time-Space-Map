import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { availableYearStops, nearestYearStop, periodForYear, validExplorationYear, yearAxisValue, yearFromAxisValue, type YearStop } from "../shared/temporal-navigation";
import type { Catalog } from "../shared/types";
import type { HistoricalContextData } from "../shared/historical-context";
import type { BoundaryManifest } from "../shared/boundaries";
import type { TemporalSettlementsManifest } from "../shared/temporal-settlements";
import { exampleCatalog } from "./fixtures";

const root = new URL("../", import.meta.url);
test("重叠年代优先已知记录时期和当前时期，空档不假映射朝代", async () => {
  const catalog: Catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
  assert.equal(periodForYear(1276, catalog.periods, { preferredPeriodId: "yuan", entryId: "song-timeline-city-1276-0" })?.id, "song");
  assert.equal(periodForYear(1276, catalog.periods, { preferredPeriodId: "yuan" })?.id, "yuan");
  assert.equal(periodForYear(1276, catalog.periods, { preferredPeriodId: "song" })?.id, "song");
  assert.equal(periodForYear(1644, catalog.periods, { preferredPeriodId: "qing", entryId: "ming-timeline-kaifeng-1644-0" })?.id, "ming");
  assert.equal(periodForYear(618, catalog.periods, { preferredPeriodId: "sui", periodIds: ["tang"] })?.id, "tang");
  for (const year of [-1046, -222, 920, 1932, 0, 755.5]) assert.equal(periodForYear(year, catalog.periods), undefined, String(year));
});

test("资料年汇总全部城市纪年、事件、边界、已有治所与默认年，重复年保留类别与条数", async () => {
  const catalog = exampleCatalog();
  const context: HistoricalContextData = JSON.parse(await readFile(new URL("public/data/historical-context.json", root), "utf8"));
  const manifest: BoundaryManifest = JSON.parse(await readFile(new URL("public/data/boundaries/manifest.json", root), "utf8"));
  const settlements: TemporalSettlementsManifest = JSON.parse(await readFile(new URL("public/data/temporal-settlements/manifest.json", root), "utf8"));
  const all = availableYearStops(catalog, context, manifest, undefined, settlements);
  const tang = availableYearStops(catalog, context, manifest, "tang", settlements);
  assert.ok(all.some(stop => stop.year === 1932 && stop.kinds.includes("chronicle")), "跨期城市纪年不得被全局索引遗漏");
  assert.ok(tang.every(stop => stop.year >= 618 && stop.year <= 907));
  assert.ok(tang.find(stop => stop.year === 741)?.kinds.includes("boundary"));
  assert.deepEqual(new Set(tang.find(stop => stop.year === 755)?.kinds), new Set(["event", "chronicle", "reference", "seat"]));
  assert.equal(tang.find(stop => stop.year === 755)?.eventCount, 1);
  assert.ok(tang.find(stop => stop.year === 755)!.chronicleCount > 1);
  assert.ok(all.find(stop => stop.year === 1200)?.kinds.includes("seat"));
  assert.equal(new Set(all.map(stop => stop.year)).size, all.length);
  assert.deepEqual(all.map(stop => stop.year), all.map(stop => stop.year).sort((a, b) => a - b));
  assert.deepEqual(availableYearStops(catalog, context, manifest, "missing"), []);
});

test("早期六朝和其他时期的治所年份来自真实目录，不凭朝代默认年冒充已有资料", async () => {
  const catalog: Catalog = JSON.parse(await readFile(new URL("data/catalog.json", root), "utf8"));
  const settlements: TemporalSettlementsManifest = JSON.parse(await readFile(new URL("public/data/temporal-settlements/manifest.json", root), "utf8"));
  for (const period of catalog.periods) {
    const stops = availableYearStops(catalog, null, null, period.id, settlements);
    assert.ok(stops.find(stop => stop.year === period.year)?.kinds.includes("seat"), period.id);
  }
  assert.ok(availableYearStops(catalog).every(stop => !stop.kinds.includes("seat")), "目录未加载不能预告不存在或不可用的治所截面");
  const onlyHan = { ...settlements, packages: settlements.packages.filter(pack => pack.periodId === "han") };
  assert.ok(availableYearStops(catalog, null, null, "sui", onlyHan).every(stop => !stop.kinds.includes("seat")));
  assert.deepEqual(availableYearStops(catalog, null, null, "han", onlyHan).filter(stop => stop.kinds.includes("seat")).map(stop => stop.year), [2]);
});

test("吸附按真实年份距离，前后纪年不含零年，平局稳定落到较早资料年", () => {
  const stop = (year: number): YearStop => ({ year, kinds: ["event"], eventCount: 1, chronicleCount: 0 });
  assert.equal(nearestYearStop(755, [stop(618), stop(756), stop(907)])?.year, 756);
  assert.equal(nearestYearStop(741, [stop(740), stop(742)])?.year, 740);
  assert.equal(nearestYearStop(-210, [stop(-221), stop(-207)])?.year, -207);
  assert.equal(nearestYearStop(-1, [stop(1), stop(-2)])?.year, -2);
  assert.equal(yearAxisValue(1) - yearAxisValue(-1), 1);
  for (const year of [-9999, -221, -1, 1, 755, 9999]) assert.equal(yearFromAxisValue(yearAxisValue(year)), year);
  for (const year of [0, NaN, Infinity, 1.2, -10000, 10000]) assert.equal(validExplorationYear(year), false);
  assert.equal(nearestYearStop(755, []), undefined);
});
