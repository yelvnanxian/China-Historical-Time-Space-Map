import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
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
