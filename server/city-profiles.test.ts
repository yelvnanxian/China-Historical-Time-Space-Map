import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import { filterCityProfiles } from "../shared/city-profiles";
import { simplifiedChinese } from "../shared/boundary-search";
import type { Catalog } from "../shared/types";

const root = fileURLToPath(new URL("../", import.meta.url));
const data: CityPeriodProfilesData = JSON.parse(await readFile(path.join(root, "public/data/city-period-profiles.json"), "utf8"));
const catalog: Catalog = JSON.parse(await readFile(path.join(root, "data/catalog.json"), "utf8"));
const places = new Map(catalog.places.map(place => [place.id, place]));
const sources = new Map(data.sources.map(source => [source.id, source]));
const snapshots = new Map(await Promise.all(data.sources.map(async source => {
  const snapshot = path.resolve(root, source.snapshotPath);
  assert.ok(snapshot.startsWith(path.join(root, "data/evidence") + path.sep));
  return [source.id, await readFile(snapshot, "utf8")] as const;
})));

test("本朝看点11时期各有至少3座当期可见代表城，不能重复摘要充数", () => {
  assert.equal(catalog.periods.length, 11);
  assert.equal(new Set(data.profiles.map(profile => profile.id)).size, data.profiles.length);
  assert.equal(new Set(data.profiles.map(profile => profile.summary)).size, data.profiles.length);
  for (const period of catalog.periods) {
    const profiles = data.profiles.filter(profile => profile.periodId === period.id);
    assert.ok(profiles.length >= 3, `缺少当期看点 ${period.id}`);
    assert.equal(new Set(profiles.map(profile => profile.placeId)).size, profiles.length);
  }
  for (const profile of data.profiles) {
    assert.ok(catalog.periods.some(period => period.id === profile.periodId));
    assert.ok(places.get(profile.placeId)?.periodIds.includes(profile.periodId), `当期不可见的城市 ${profile.id}`);
    assert.ok(profile.summary.trim().length >= 30);
    assert.ok(!("coordinates" in profile) && !("geometry" in profile), "文字档案不冒充古址坐标核定");
  }
});

test("唐代主要城镇清单全部完成，既有唐地点和新增66点均有可核查档案", async () => {
  const targets: { towns: { placeId: string }[] } = JSON.parse(await readFile(path.join(root, "data/tang-expansion/completion-targets.json"), "utf8"));
  const expected = targets.towns.map(town => town.placeId).sort();
  const tang = data.profiles.filter(profile => profile.periodId === "tang");
  assert.equal(expected.length, 104);
  assert.deepEqual(tang.map(profile => profile.placeId).sort(), expected);
  assert.deepEqual(catalog.places.filter(place => place.periodIds.includes("tang")).map(place => place.id).sort(), expected);
  assert.equal(catalog.places.length, 106);
  for (const profile of tang) {
    assert.ok(profile.evidence.length >= 2 && profile.region && profile.namingNote, profile.id);
    assert.equal(new Set(profile.evidence.map(item => item.quote)).size, profile.evidence.length);
    assert.equal(profile.summary, simplifiedChinese(profile.summary), profile.id);
  }
  for (const place of catalog.places) {
    for (const name of [place.name, place.modernName, ...place.aliases, ...Object.values(place.nameByPeriod ?? {})]) {
      assert.equal(name, simplifiedChinese(name), `${place.id}: ${name}`);
      assert.doesNotMatch(name, /[A-Za-z\u0400-\u04ff\u3040-\u30ff\uac00-\ud7af]/, `${place.id}: ${name}`);
    }
  }
});

test("名城搜索兼容繁简、今名及天宝郡名，地域筛选与朝代互不串档", () => {
  for (const query of ["苏州", "蘇州", "吴郡", "吳郡"]) {
    const matches = filterCityProfiles(data.profiles, catalog.places, "tang", query);
    assert.ok(matches.some(profile => places.get(profile.placeId)?.name === "苏州"), query);
  }
  const all = filterCityProfiles(data.profiles, catalog.places, "tang");
  assert.equal(all.length, 104);
  const regional = filterCityProfiles(data.profiles, catalog.places, "tang", "", "河西与西域");
  assert.ok(regional.length >= 10 && regional.every(profile => profile.region === "河西与西域"));
  assert.equal(filterCityProfiles(data.profiles, catalog.places, "tang", "苏州", "河西与西域").length, 0);
  assert.deepEqual(filterCityProfiles(data.profiles, catalog.places, "tang", "不存在的城邑"), []);
  assert.equal(filterCityProfiles(data.profiles, catalog.places, "song").length, 3);
});

test("本朝看点引用可追溯固定修订、真实快照及逐字原文", () => {
  assert.equal(sources.size, data.sources.length);
  for (const source of data.sources) {
    assert.ok(source.title.trim() && source.note.trim());
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    assert.match(source.snapshotSha256, /^[a-f0-9]{64}$/);
    assert.equal(createHash("sha256").update(snapshots.get(source.id)!).digest("hex"), source.snapshotSha256);
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    if (url.hostname === "zh.wikipedia.org") assert.match(url.searchParams.get("oldid") ?? "", /^\d+$/);
  }
  for (const profile of data.profiles) {
    assert.ok(profile.sourceIds.length && profile.evidence.length, `无证据档案 ${profile.id}`);
    assert.equal(new Set(profile.sourceIds).size, profile.sourceIds.length);
    assert.deepEqual([...new Set(profile.evidence.map(item => item.sourceId))].sort(), [...profile.sourceIds].sort());
    for (const item of profile.evidence) {
      assert.ok(sources.has(item.sourceId));
      assert.ok(item.quote.length > 5 && item.supports.trim().length > 5);
      assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), `原文不含摘录 ${profile.id}/${item.sourceId}`);
    }
  }
});
