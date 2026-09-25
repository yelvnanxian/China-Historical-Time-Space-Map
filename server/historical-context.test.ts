import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { HistoricalContextData, HistoricalContextEvidence } from "../shared/historical-context";
import type { Catalog } from "../shared/types";

const root = fileURLToPath(new URL("../", import.meta.url));
const data: HistoricalContextData = JSON.parse(await readFile(path.join(root, "public/data/historical-context.json"), "utf8"));
const catalog: Catalog = JSON.parse(await readFile(path.join(root, "data/catalog.json"), "utf8"));
const places = new Map(catalog.places.map(place => [place.id, place]));
const events = new Map(catalog.events.map(event => [event.id, event]));
const sources = new Map(data.sources.map(source => [source.id, source]));
const snapshots = new Map(await Promise.all(data.sources.map(async source => {
  const snapshot = path.resolve(root, source.snapshotPath);
  assert.ok(snapshot.startsWith(path.join(root, "data/evidence") + path.sep), "快照必须位于本地证据目录");
  return [source.id, await readFile(snapshot, "utf8")] as const;
})));

function verifyEvidence(sourceIds: string[], evidence: HistoricalContextEvidence[]) {
  assert.ok(sourceIds.length > 0 && evidence.length > 0);
  assert.equal(new Set(sourceIds).size, sourceIds.length, "引用来源不重复");
  assert.deepEqual([...new Set(evidence.map(item => item.sourceId))].sort(), [...sourceIds].sort());
  for (const item of evidence) {
    assert.ok(sources.has(item.sourceId), `缺少来源 ${item.sourceId}`);
    assert.ok(item.quote.length > 5 && item.supports.trim());
    assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), `原文快照没有引文：${item.sourceId} / ${item.quote}`);
  }
}

test("历史内容来源保留真实文本快照、取得日期和一致的SHA256", () => {
  assert.equal(sources.size, data.sources.length, "来源ID唯一");
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  for (const source of data.sources) {
    assert.ok(source.title.trim() && source.note.trim());
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    assert.match(source.snapshotSha256, /^[a-f0-9]{64}$/);
    assert.equal(createHash("sha256").update(snapshots.get(source.id)!).digest("hex"), source.snapshotSha256);
    if (url.hostname === "zh.wikipedia.org") assert.match(url.searchParams.get("oldid") ?? "", /^\d+$/, "百科引用固定修订，避免正文变更后无法复查");
  }
});

test("历史地理事件关联现有地区并明确坐标角色，不伪造古河道线路", () => {
  assert.ok(data.geographyEntries.length >= 6);
  const ids = new Set<string>();
  for (const entry of data.geographyEntries) {
    assert.ok(!ids.has(entry.id));
    ids.add(entry.id);
    assert.ok(Number.isInteger(entry.year) && entry.year !== 0);
    assert.ok(entry.title.trim() && entry.dateLabel.trim() && entry.summary.trim() && entry.impact.trim());
    assert.ok(["river-change", "flood", "canal", "water-management", "lake-change"].includes(entry.kind));
    assert.ok(["event-area", "affected-area", "regional-reference"].includes(entry.locationRole));
    assert.ok(entry.coordinateNote.includes("参考") && entry.coordinateNote.length > 20);
    assert.ok(entry.affectedPlaceIds.length > 0);
    entry.affectedPlaceIds.forEach(id => assert.ok(places.has(id), `未知关联城市 ${id}`));
    const reference = places.get(entry.referencePlaceId);
    assert.ok(reference);
    assert.deepEqual(entry.referenceCoordinates, reference.coordinates, "地区参考点必须来自已记录坐标");
    assert.ok(!("route" in entry) && !("geometry" in entry), "本批没有可核验古河道几何，不添加复原线路");
    verifyEvidence(entry.sourceIds, entry.evidence);
  }
});

test("城市大事记按年排序，保留已有跨朝覆盖且每条原文、事件关联完整", () => {
  assert.ok(data.cityTimelines.length >= 22, "V0.7至少覆盖22座城市的沿革");
  assert.ok(data.cityTimelines.reduce((count, city) => count + city.entries.length, 0) >= 71);
  const cityIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const timeline of data.cityTimelines) {
    assert.ok(places.has(timeline.placeId) && !cityIds.has(timeline.placeId));
    cityIds.add(timeline.placeId);
    assert.ok(timeline.entries.length >= 1, "史料不足三条时保留实际数量");
    const years = timeline.entries.map(entry => entry.year);
    assert.deepEqual(years, [...years].sort((a, b) => a - b));
    for (const entry of timeline.entries) {
      assert.ok(!entryIds.has(entry.id), `重复大事记 ${entry.id}`);
      entryIds.add(entry.id);
      assert.ok(Number.isInteger(entry.year) && entry.year !== 0);
      assert.ok(entry.title.trim() && entry.dateLabel.trim() && entry.summary.trim());
      verifyEvidence(entry.sourceIds, entry.evidence);
      if (entry.relatedEventId) {
        const event = events.get(entry.relatedEventId);
        assert.ok(event, `关联事件不存在 ${entry.relatedEventId}`);
        assert.equal(event.year, entry.year);
        assert.ok(event.placeIds.includes(timeline.placeId));
      }
    }
  }
});
