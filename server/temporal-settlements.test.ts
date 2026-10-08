import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { simplifiedChinese } from "../shared/boundary-search";
import { searchTemporalSettlements, temporalSettlementActive, temporalSettlementLink, temporalTangSettlementKey, temporalSettlementYearLabel, type TemporalSettlementsCollection, type TemporalSettlementsManifest } from "../shared/temporal-settlements";
const root = new URL("../", import.meta.url);
const bytes = (file: string) => readFile(new URL(file, root));
const json = async <T>(file: string) => JSON.parse((await bytes(file)).toString()) as T;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
type SourceRow = { record: Record<string, string>; coordinates: [number, number]; index: number };
/** Independently read the actual source ZIP, DBF and SHP without the builder. */
function sourceRows(archive: Buffer): SourceRow[] {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  assert.ok(end >= 0);
  const count = archive.readUInt16LE(end + 10), members = new Map<string, Buffer>();
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    const method = archive.readUInt16LE(offset + 10), size = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28), extraLength = archive.readUInt16LE(offset + 30), commentLength = archive.readUInt16LE(offset + 32);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const local = archive.readUInt32LE(offset + 42);
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const compressed = archive.subarray(start, start + size);
    assert.ok(method === 0 || method === 8);
    members.set(path.extname(name), method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const dbf = members.get(".dbf")!, shp = members.get(".shp")!;
  assert.equal(shp.readUInt32LE(32), 1);
  const rows = dbf.readUInt32LE(4), header = dbf.readUInt16LE(8), rowLength = dbf.readUInt16LE(10);
  const fields: { name: string; width: number }[] = [];
  for (let position = 32; dbf[position] !== 0x0d; position += 32) fields.push({ name: dbf.subarray(position, position + 11).toString("ascii").replace(/\0.*$/, ""), width: dbf[position + 16] });
  const result: SourceRow[] = [];
  let shapeOffset = 100;
  for (let index = 0; index < rows; index += 1) {
    const start = header + index * rowLength;
    assert.notEqual(dbf[start], 0x2a, "A deleted record must not silently shift indices");
    const record: Record<string, string> = {};
    let column = start + 1;
    for (const field of fields) {
      record[field.name] = dbf.subarray(column, column + field.width).toString("utf8").trim();
      column += field.width;
    }
    assert.equal(shp.readUInt32BE(shapeOffset), index + 1);
    assert.equal(shp.readUInt32LE(shapeOffset + 8), 1, "Seat coordinates must come from POINT geometry");
    result.push({ record, index, coordinates: [shp.readDoubleLE(shapeOffset + 12), shp.readDoubleLE(shapeOffset + 20)] });
    shapeOffset += 8 + shp.readUInt32BE(shapeOffset + 4) * 2;
  }
  assert.equal(shapeOffset, shp.length);
  return result;
}
const manifest = await json<TemporalSettlementsManifest>("public/data/temporal-settlements/manifest.json");
const sources = new Map(await Promise.all((['county', 'prefecture'] as const).map(async level => [level, sourceRows(await bytes(`data/evidence/tang-detail/chgis/${level}-wgs84.zip`))] as const)));
const packages = new Map(await Promise.all(manifest.packages.map(async pack => [pack.periodId, JSON.parse(gunzipSync(await bytes(`public${pack.url}`)).toString()) as TemporalSettlementsCollection] as const)));
const unique = new Map([...packages.values()].flatMap(data => data.features).map(feature => [feature.properties.id, feature]));
type AuditRow = { id: string; level: "county" | "prefecture"; sourceRecordIndex: number; sourceRecordId: string };
const audit = await json<{ acceptedSourceRows: AuditRow[]; withheldRecords: (AuditRow & { reasons: string[] })[]; outputHashes: Record<string, string> }>("data/evidence/temporal-settlements/selection-audit.json");

test("全时序包逐条保留官方SHP POINT、DBF原文和源行身份，不把同名或重复SYS_ID吞掉", () => {
  assert.equal(manifest.sourceRecordCount, 15748);
  assert.equal(manifest.uniqueFeatureCount, 14862);
  assert.equal(unique.size, 14778, "84 accepted intervals fall outside the currently configured dynasty windows");
  for (const feature of unique.values()) {
    const p = feature.properties, row = sources.get(p.level)![p.sourceRecordIndex];
    assert.ok(row, p.id);
    assert.equal(p.id, `chgis-temporal-${p.level}-${row.record.SYS_ID}-${row.index}`);
    assert.equal(feature.id, p.id);
    assert.equal(feature.geometry.type, "Point");
    assert.deepEqual(p.originalCoordinates, row.coordinates);
    assert.deepEqual(feature.geometry.coordinates, row.coordinates.map(value => Math.round(value * 1e6) / 1e6));
    assert.equal(p.sourceName, row.record.NAME_CH);
    assert.equal(p.name, simplifiedChinese(row.record.NAME_CH));
    assert.equal(p.subtype, simplifiedChinese(row.record.TYPE_CH));
    assert.equal(p.presentLocation, simplifiedChinese(row.record.PRES_LOC));
    assert.equal(p.beginYear, Number(row.record.BEG_YR)); assert.equal(p.endYear, Number(row.record.END_YR));
    assert.equal(p.beginRuleCode, row.record.BEG_RULE); assert.equal(p.endRuleCode, row.record.END_RULE);
    assert.equal(p.name, simplifiedChinese(p.name));
    assert.match(p.geometryNote, /不是行政面中心/);
    for (const [field, value] of Object.entries(p.sourceRecord)) {
      if (typeof value === "number") assert.equal(value, Number(row.record[field]), `${p.id}: ${field}`);
      else assert.equal(String(value ?? ""), row.record[field], `${p.id}: ${field}`);
    }
  }
  const repeated = [...unique.values()].filter(f => f.properties.level === "prefecture" && f.properties.sourceRecordId === "35000");
  assert.equal(repeated.length, 2); assert.notEqual(repeated[0].id, repeated[1].id);
});

test("所有15748源行完整归入14862接纳或886隔离，日期与坐标异常不向其他年代泄漏", () => {
  const accepted = new Set(audit.acceptedSourceRows.map(row => `${row.level}:${row.sourceRecordIndex}`));
  const rejected = new Map(audit.withheldRecords.map(row => [`${row.level}:${row.sourceRecordIndex}`, row]));
  assert.equal(accepted.size, 14862); assert.equal(rejected.size, 886); assert.equal(manifest.withheldCount, 886);
  for (const [level, rows] of sources) for (const row of rows) {
    const p = row.record, key = `${level}:${row.index}`;
    assert.notEqual(accepted.has(key), rejected.has(key), key);
    const begin = Number(p.BEG_YR), end = Number(p.END_YR);
    const coordinates = [Number(p.X_COOR), Number(p.Y_COOR)];
    const invalid = !Number.isInteger(begin) || !Number.isInteger(end) || !begin || !end || begin > end || begin > 1912 || end > 1912
      || [p.BEG_RULE, p.END_RULE].includes("9") && begin !== end
      || !coordinates.every(Number.isFinite) || !row.coordinates.every(Number.isFinite)
      || Math.abs(row.coordinates[0]) > 180 || Math.abs(row.coordinates[1]) > 90
      || Math.max(...row.coordinates.map((v, index) => Math.abs(v - coordinates[index]))) > .02
      || !/[\u3400-\u9fff]/.test(p.NAME_CH) || /[A-Za-z\u0400-\u04ff]/.test(p.NAME_CH);
    assert.equal(rejected.has(key), invalid, key);
    if (rejected.has(key)) assert.ok(rejected.get(key)!.reasons.length);
  }
  assert.ok(![...unique.values()].some(f => f.properties.endYear === 11911 || f.properties.beginYear === 2115));
});

test("11朝代包只按时段交集拆分，年份变化即筛掉尚未建置或已结束的点和搜索结果", async () => {
  const periods = await json<{ id: string; name: string; startYear: number; endYear: number; year: number }[]>("data/evidence/temporal-settlements/period-definitions.json");
  assert.equal(manifest.packages.length, 11);
  const expectedRepresentativeCounts = [338, 1110, 1035, 1128, 1363, 1153, 1681, 1560, 1529, 1595, 1656];
  for (const [index, pack] of manifest.packages.entries()) {
    const p = periods.find(item => item.id === pack.periodId)!;
    assert.deepEqual([pack.startYear, pack.endYear, pack.representativeYear], [p.startYear, p.endYear, p.year]);
    const features = packages.get(pack.periodId)!.features;
    assert.equal(features.length, pack.featureCount);
    assert.equal(new Set(features.map(f => f.id)).size, features.length);
    for (const f of features) assert.ok(f.properties.beginYear <= pack.endYear && f.properties.endYear >= pack.startYear);
    const active = searchTemporalSettlements(features, pack.representativeYear, "");
    assert.equal(active.length, expectedRepresentativeCounts[index]);
    assert.equal(active.length, pack.representativeYearCount);
    assert.ok(pack.compressedBytes < 450_000);
    assert.deepEqual(features.map(f => f.id).sort(), [...unique.values()].filter(f => f.properties.beginYear <= pack.endYear && f.properties.endYear >= pack.startYear).map(f => f.id).sort());
  }
  const song = packages.get("song")!.features;
  const chongqing = song.find(f => f.properties.sourceRecordId === "211263")!;
  assert.equal(temporalSettlementActive(chongqing.properties, 1188), false);
  assert.equal(temporalSettlementActive(chongqing.properties, 1189), true);
  assert.equal(temporalSettlementActive(chongqing.properties, 1278), true);
  assert.equal(temporalSettlementActive(chongqing.properties, 1279), false);
  assert.ok(!searchTemporalSettlements(song, 1188, "重庆府").some(f => f.id === chongqing.id));
  assert.ok(searchTemporalSettlements(song, 1189, "重庆府").some(f => f.id === chongqing.id));
  assert.equal(searchTemporalSettlements(song, 0, "").length, 0);
  assert.equal(searchTemporalSettlements(song, Number.NaN, "").length, 0);
  assert.equal(temporalSettlementYearLabel(-221), "前221年");
});

test("已核20条1200关系只在1200显示，其他年不套用南宋金政权、辖区或城池档案", () => {
  const linked = [...unique.values()].filter(f => f.properties.documented1200);
  assert.equal(linked.length, 20);
  for (const { properties: p } of linked) {
    assert.equal(temporalSettlementLink(p, 1200), p.documented1200);
    for (const year of [755, 1129, 1199, 1201, 1279, 1391, 1582]) assert.equal(temporalSettlementLink(p, year), undefined);
    assert.ok(!("polityLabel" in p) && !("boundaryId" in p) && !("catalogPlaceId" in p));
    assert.match(p.polityNote, /不能因浏览朝代、年份/);
  }
  assert.equal(searchTemporalSettlements(packages.get("song")!.features, 1199, "南宋").length, 0);
  assert.ok(searchTemporalSettlements(packages.get("song")!.features, 1200, "南宋").length > 0);
  const old = packages.get("tang")!.features.find(f => f.properties.name === "长安" || f.properties.name === "长安县")!;
  assert.ok(old && !old.properties.documented1200);
});

test("755治所保留既有741参考辖区和存疑核查身份，其他浏览年份不调用755诊断", async () => {
  const old = await json<{ features: { properties: { id: string; level: string; sourceRecordId: string }; geometry: { coordinates: number[] } }[] }>("public/data/tang-detail/settlements-755.geojson");
  const crosswalk = await json<{ boundaryYear: number; settlements: Record<string, { boundaryYear: number; note: string }> }>("public/data/tang-boundary-crosswalk.json");
  const diagnostics = await json<{ sourceYear: number; boundaryYear: number; bySettlement: Record<string, { sourcePoint: { coordinates: number[] } }> }>("public/data/tang-county-diagnostics.json");
  const features = searchTemporalSettlements(packages.get("tang")!.features, 755, "");
  let linked = 0;
  for (const feature of features) {
    const p = feature.properties, key = temporalTangSettlementKey(p, 755)!;
    const legacy = old.features.find(f => f.properties.id === key);
    assert.ok(legacy);
    assert.deepEqual(feature.geometry.coordinates, legacy.geometry.coordinates);
    for (const year of [741, 754, 756, 1200]) assert.equal(temporalTangSettlementKey(p, year), undefined);
    if (crosswalk.settlements[key]) {
      linked += 1;
      assert.equal(crosswalk.settlements[key].boundaryYear, 741);
      assert.match(crosswalk.settlements[key].note, /741/);
    }
    if (diagnostics.bySettlement[key]) assert.deepEqual(diagnostics.bySettlement[key].sourcePoint.coordinates, feature.geometry.coordinates);
  }
  assert.equal(linked, 1023);
  assert.equal(diagnostics.sourceYear, 755); assert.equal(diagnostics.boundaryYear, 741);
  assert.equal(old.features.length - features.length, 1, "One legacy point now has a quarantined source timeslice-rule conflict");
});

test("源定年不确定性完整保留，候选数量不被称为全朝代城镇覆盖", () => {
  for (const { properties: p } of unique.values()) {
    assert.ok(p.beginRule && p.endRule && p.dateCaution);
    if (p.dateStatus === "specified-endpoints") {
      assert.ok(["4", "5", "6", "9"].includes(p.beginRuleCode));
      assert.ok(["4", "5", "6", "9"].includes(p.endRuleCode));
    } else if (p.dateStatus === "broad-endpoints") assert.match(p.dateCaution, /朝代.*候选/);
    else assert.match(p.dateCaution, /缺失或未定义/);
    assert.equal(p.minZoom, p.level === "county" ? 8 : 6);
  }
  assert.match(manifest.coverageNote, /1350年前.*缺口.*不是任何朝代的全部城镇/);
  assert.equal(searchTemporalSettlements(packages.get("song")!.features, 1200, "山阴县").length, 2);
});

test("时序包及官方来源哈希可重复核验，分包按gzip魔数解压不依赖HTTP行为", async () => {
  for (const [file, expected] of Object.entries({ ...manifest.inputHashes, ...audit.outputHashes })) assert.equal(hash(await bytes(file)), expected, file);
  for (const pack of manifest.packages) {
    const compressed = await bytes(`public${pack.url}`), uncompressed = gunzipSync(compressed);
    assert.equal(compressed.readUInt16BE(0), 0x1f8b);
    assert.equal(hash(compressed), pack.sha256);
    assert.equal(compressed.length, pack.compressedBytes); assert.equal(uncompressed.length, pack.expandedBytes);
  }
});
