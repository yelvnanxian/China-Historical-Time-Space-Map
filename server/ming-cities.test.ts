import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Catalog } from "../shared/types";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { HistoricalContextData } from "../shared/historical-context";
import { filterCityProfiles } from "../shared/city-profiles";
import { simplifiedChinese } from "../shared/boundary-search";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const catalog: Catalog = JSON.parse(await read("data/catalog.json"));
const profiles: CityPeriodProfilesData = JSON.parse(await read("public/data/city-period-profiles.json"));
const context: HistoricalContextData = JSON.parse(await read("public/data/historical-context.json"));
const expected = ["changan", "luoyang", "beijing", "kaifeng", "nanjing", "hangzhou", "chengdu", "guangzhou", "yangzhou", "xiangyang", "jingzhou", "jinyang", "datong", "linzi", "handan", "tongguan", "yinchuan", "quanzhou", "dali", "suzhou", "qizhou-jinan", "yanzhou", "ezhou-jiangxia", "fuzhou-fujian", "yuzhou-chongqing", "guizhou-guilin", "mingzhou", "hongzhou"].sort();

test("明代28个阅读入口全部有对应档案与明确的名称年代说明", () => {
  const ming = filterCityProfiles(profiles.profiles, catalog.places, "ming");
  assert.deepEqual(ming.map(p => p.placeId).sort(), expected);
  assert.deepEqual(catalog.places.filter(p => p.periodIds.includes("ming")).map(p => p.id).sort(), expected);
  for (const profile of ming) {
    assert.ok(profile.region && profile.namingNote && profile.politicalContext, profile.id);
    assert.ok(profile.historicalResearch?.length, profile.id);
    for (const text of [profile.summary, profile.namingNote, profile.politicalContext]) {
      assert.equal(text, simplifiedChinese(text), profile.id);
      assert.doesNotMatch(text, /\{\{|\}\}/);
    }
  }
  assert.equal(catalog.places.find(p => p.id === "jinyang")?.nameByPeriod?.ming, "太原县");
  assert.match(ming.find(p => p.placeId === "jinyang")!.summary, /太原县/);
  for (const [query, placeId] of [["寧波", "mingzhou"], ["重庆", "yuzhou-chongqing"], ["太原县", "jinyang"]]) {
    assert.ok(filterCityProfiles(profiles.profiles, catalog.places, "ming", query).some(p => p.placeId === placeId));
  }
});

test("明代已核事实逐条有固定版本原文，待考事项不冒充坐标与疆界结论", async () => {
  const sources = new Map(profiles.sources.map(s => [s.id, s]));
  const snapshots = new Map<string, string>();
  for (const profile of profiles.profiles.filter(p => p.periodId === "ming")) {
    for (const entry of profile.historicalResearch ?? []) {
      assert.ok(entry.unresolved.length > 0, `${profile.id} 应保留空间资料的限制`);
      assert.ok(entry.findings.length > 0);
      for (const finding of entry.findings) {
        assert.ok(finding.evidence.length > 0, `${profile.id}/${finding.statement}`);
        assert.equal(finding.statement, simplifiedChinese(finding.statement));
        for (const evidence of finding.evidence) {
          const source = sources.get(evidence.sourceId);
          assert.ok(source, evidence.sourceId);
          assert.match(source.url, /oldid=\d+/);
          assert.equal(evidence.sourceUrl, source.url);
          assert.ok(evidence.locator.trim());
          if (!snapshots.has(source.id)) snapshots.set(source.id, await read(source.snapshotPath));
          assert.ok(snapshots.get(source.id)!.includes(evidence.quote), `${profile.id}/${evidence.locator}`);
          assert.doesNotMatch(evidence.quote, /\{\{/, "页面不可露出Wiki模板语法");
        }
      }
    }
  }
});

test("明代纪年节点以实际引文为准，建国前建置不伪装成洪武年间", () => {
  const additions = context.cityTimelines.flatMap(t => t.entries.filter(e => e.id.startsWith("ming-")));
  assert.ok(additions.length > 15, "明代补充应包含可追溯的纪年节点");
  for (const entry of additions) {
    assert.ok(entry.evidence.length && entry.sourceIds.length, entry.id);
    assert.ok(Number.isInteger(entry.year) && entry.dateLabel && entry.summary);
    if (entry.year < 1368) assert.doesNotMatch(entry.dateLabel, /洪武/);
    assert.doesNotMatch(entry.summary, /精确县界|实测城址/);
  }
});
