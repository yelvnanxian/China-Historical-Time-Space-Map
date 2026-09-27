import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapGeoJSONFeature } from "maplibre-gl";
import type { SongSettlementsCollection } from "../shared/song-settlements";
import { searchSongSettlements, settlementInView, showSongSettlement } from "../shared/song-settlement-display";
import { chooseNaturalMapHit } from "../shared/map-hit-test";

const fixture = (id: string, name: string, location: string, x: number, level: "county" | "prefecture" = "county") => ({
  type: "Feature", geometry: { type: "Point", coordinates: [x, 30] },
  properties: { id, name, sourceName: name, sourceRecordId: id, presentLocation: location, level, year: 1200, minZoom: level === "county" ? 8 : 6 },
}) as SongSettlementsCollection["features"][number];

test("宋代治所名称搜索跨视野且兼容繁简；同名异地记录均保留", () => {
  const nearby = fixture("test-1", "永康县", "浙江金华", 120);
  const distant = fixture("test-2", "永康县", "四川成都", 104);
  const exact = fixture("test-3", "永康", "测试地区", 115, "prefecture");
  const features = [nearby, distant, exact];
  assert.deepEqual(searchSongSettlements(features, "", "all", [119, 29, 121, 31]), [nearby]);
  assert.deepEqual(new Set(searchSongSettlements(features, "永康縣", "all", [119, 29, 121, 31]).map(f => f.properties.id)), new Set(["test-1", "test-2"]));
  assert.equal(searchSongSettlements(features, "四川")[0], distant);
  assert.equal(searchSongSettlements(features, "test-2")[0], distant);
  assert.equal(searchSongSettlements(features, "永康")[0], exact);
  assert.equal(searchSongSettlements(features, "永康", "prefecture").length, 1);
  assert.equal(searchSongSettlements(features, "不存在").length, 0);
  assert.equal(features.length, 3);
});

test("宋代治所按源显示阈值逐级出现，切朝代后不残留；跨日界线视野正常", () => {
  const county = fixture("county", "测试县", "", 120).properties;
  const prefecture = fixture("prefecture", "测试州", "", 120, "prefecture").properties;
  assert.equal(showSongSettlement(prefecture, 6, "song"), true);
  assert.equal(showSongSettlement(county, 7.9, "song"), false);
  assert.equal(showSongSettlement(county, 8, "song"), true);
  for (const period of ["tang", "ming"]) assert.equal(showSongSettlement(county, 12, period), false);
  assert.equal(showSongSettlement(county, NaN, "song"), false);
  assert.equal(settlementInView([179, 30], [170, 20, -170, 40]), true);
  assert.equal(settlementInView([0, 30], [170, 20, -170, 40]), false);
});

test("宋治所圆点仅城池/全部可点，全部模式交叉处河湖与等高线优先", () => {
  const hit = (layer: string) => ({ layer: { id: layer } }) as MapGeoJSONFeature;
  const town = hit("song-settlement-hit"), river = hit("tang-detail-hit"), contour = hit("mountain-shape-contour-hit");
  assert.equal(chooseNaturalMapHit([town], "cities"), town);
  assert.equal(chooseNaturalMapHit([town], "all"), town);
  assert.equal(chooseNaturalMapHit([town], "rivers"), undefined);
  assert.equal(chooseNaturalMapHit([town], "mountains"), undefined);
  assert.equal(chooseNaturalMapHit([town, river], "all"), river);
  assert.equal(chooseNaturalMapHit([town, contour], "all"), contour);
  assert.equal(chooseNaturalMapHit([town, river], "cities"), town);
});
