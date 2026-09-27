import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { simplifiedChinese } from "../shared/boundary-search";
import type { SongSettlementsCollection, SongSettlementsManifest } from "../shared/song-settlements";

const root = new URL("../", import.meta.url);
const bytes = (file: string) => readFile(new URL(file, root));
const json = async <T>(file: string) => JSON.parse((await bytes(file)).toString()) as T;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const manifest = await json<SongSettlementsManifest>("public/data/song-settlements/manifest.json");
const published = await json<SongSettlementsCollection>(`public${manifest.url}`);
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
const sources = new Map(await Promise.all((['county', 'prefecture'] as const).map(async level => [level, sourceRows(await bytes(`data/evidence/tang-detail/chgis/${level}-wgs84.zip`))] as const)));
const audit = await json<{
  withheldRecords: { level: "county" | "prefecture"; sourceRecordId: string; recordIndex: number; reasons: string[]; originalCoordinates: number[] }[];
  sameNameGroups: { recordIds: string[] }[];
  reviewedBoundaryLinks: { settlementId: string; boundaryId: string }[];
  outputHashes: Record<string, string>;
}>("data/evidence/song-settlements/selection-audit.json");

test("宋1200时序点全量追溯官方SHP/DBF，保留原记录和坐标，不生成标签中心或现代点", () => {
  assert.equal(published.features.length, 1560);
  assert.equal(manifest.featureCount, 1560);
  assert.deepEqual(manifest.countsByLevel, { county: 1209, prefecture: 351 });
  const ids = new Set<string>();
  for (const feature of published.features) {
    const p = feature.properties, original = sources.get(p.level)![p.sourceRecordIndex];
    assert.ok(original, p.id);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.equal(p.id, `chgis-song-${p.level}-${original.record.SYS_ID}`);
    assert.equal(feature.id, p.id);
    assert.equal(feature.geometry.type, "Point");
    assert.deepEqual(p.originalCoordinates, original.coordinates);
    assert.deepEqual(feature.geometry.coordinates, original.coordinates.map(value => Math.round(value * 1e6) / 1e6));
    assert.equal(p.sourceRecordId, original.record.SYS_ID);
    assert.equal(p.sourceName, original.record.NAME_CH);
    assert.equal(p.name, simplifiedChinese(original.record.NAME_CH));
    assert.equal(p.subtype, simplifiedChinese(original.record.TYPE_CH));
    assert.equal(p.presentLocation, simplifiedChinese(original.record.PRES_LOC));
    assert.equal(p.year, 1200);
    assert.ok(p.beginYear <= 1200 && p.endYear >= 1200);
    assert.equal(p.beginYear, Number(original.record.BEG_YR));
    assert.equal(p.endYear, Number(original.record.END_YR));
    assert.equal(p.beginRuleCode, original.record.BEG_RULE);
    assert.equal(p.endRuleCode, original.record.END_RULE);
    assert.deepEqual(p.fieldCoordinates, [Number(original.record.X_COOR), Number(original.record.Y_COOR)]);
    assert.ok(Math.max(...feature.geometry.coordinates.map((value, index) => Math.abs(value - p.fieldCoordinates[index]))) <= .02);
    assert.ok(/\p{Script=Han}/u.test(p.name) && !/[A-Za-z\u0400-\u04ff]/u.test(p.name));
    for (const [field, value] of Object.entries(p.sourceRecord)) {
      if (typeof value === "number") assert.equal(value, Number(original.record[field]), `${p.id}: ${field}`);
      else assert.equal(String(value ?? ""), original.record[field], `${p.id}: ${field}`);
    }
    assert.match(p.geometryNote, /不是面中心、标签点/);
  }
});

test("1666条来源时序记录完整分入发布或隔离，坐标冲突及单年规则矛盾不得上图", () => {
  const publishedKeys = new Set(published.features.map(feature => `${feature.properties.level}:${feature.properties.sourceRecordIndex}`));
  const withheldKeys = new Set(audit.withheldRecords.map(row => `${row.level}:${row.recordIndex}`));
  assert.equal(audit.withheldRecords.length, 106);
  assert.equal(manifest.withheldCount, 106);
  let selectedCount = 0, coordinateConflicts = 0, dateConflicts = 0;
  for (const [level, rows] of sources) for (const row of rows) {
    const p = row.record, begin = Number(p.BEG_YR), end = Number(p.END_YR);
    if (!(begin <= 1200 && end >= 1200)) continue;
    selectedCount += 1;
    const key = `${level}:${row.index}`;
    assert.notEqual(publishedKeys.has(key), withheldKeys.has(key), key);
    const coordinateConflict = Math.max(...row.coordinates.map((value, index) => Math.abs(value - Number(p[index ? "Y_COOR" : "X_COOR"])))) > .02;
    const dateConflict = [p.BEG_RULE, p.END_RULE].includes("9") && begin !== end;
    if (coordinateConflict) coordinateConflicts += 1;
    if (dateConflict) dateConflicts += 1;
    assert.equal(withheldKeys.has(key), coordinateConflict || dateConflict, `${key}: all excluded rows need a documented reason`);
    if (withheldKeys.has(key)) {
      const rejected = audit.withheldRecords.find(item => item.level === level && item.recordIndex === row.index)!;
      assert.equal(rejected.sourceRecordId, p.SYS_ID);
      assert.deepEqual(rejected.originalCoordinates, row.coordinates);
      assert.ok(rejected.reasons.length);
    }
  }
  assert.equal(selectedCount, 1666); assert.equal(manifest.eligibleSourceCount, selectedCount);
  assert.equal(coordinateConflicts, 104); assert.equal(dateConflicts, 2);
  for (const record of ["211182", "211283"]) assert.ok(!published.features.some(feature => feature.properties.level === "prefecture" && feature.properties.sourceRecordId === record));
  assert.ok(!published.features.some(feature => feature.properties.id === "chgis-song-county-44847"), "邯郸县坐标字段冲突保持隔离，不借现有目录坐标补入");
});

test("宽界与缺失日期规则单独揭示，源文件分组不伪装成统一府县类型", () => {
  assert.deepEqual(manifest.countsByDateStatus, { "specified-endpoints": 881, "broad-endpoints": 112, "incomplete-date-rules": 567 });
  assert.ok(published.features.some(feature => feature.properties.level === "county" && feature.properties.subtype === "羁縻州"));
  assert.ok(published.features.some(feature => feature.properties.level === "prefecture" && feature.properties.subtype === "郡"));
  const counts: Record<string, number> = {};
  for (const { properties: p } of published.features) {
    counts[p.dateStatus] = (counts[p.dateStatus] ?? 0) + 1;
    assert.ok(p.dateCaution && p.beginRule && p.endRule);
    if (p.dateStatus === "specified-endpoints") {
      assert.ok(["4", "5", "6", "9"].includes(p.beginRuleCode));
      assert.ok(["4", "5", "6", "9"].includes(p.endRuleCode));
      assert.match(p.dateCaution, /未经逐年独立核验/);
    } else assert.match(p.dateCaution, /候选/);
    assert.equal(p.minZoom, p.level === "county" ? 8 : 6);
  }
  assert.deepEqual(counts, manifest.countsByDateStatus);
  assert.match(manifest.coverageNote, /1350年前.*覆盖缺口/);
});

test("同名异地及来源时序重叠保持独立，不把相同名称合为一处治所", () => {
  assert.equal(manifest.sameNameGroupCount, 50);
  assert.equal(audit.sameNameGroups.length, 50);
  const shanyin = published.features.filter(feature => feature.properties.name === "山阴县");
  assert.equal(shanyin.length, 2);
  assert.deepEqual(shanyin.map(feature => feature.properties.sourceRecordId).sort(), ["40762", "95058"]);
  assert.ok(shanyin.some(feature => feature.properties.presentLocation.includes("浙江")));
  assert.ok(shanyin.some(feature => feature.properties.presentLocation.includes("山西")));
  const aozhou = published.features.filter(feature => feature.properties.name === "隩州");
  assert.equal(aozhou.length, 2);
  for (const group of audit.sameNameGroups) for (const id of group.recordIds) {
    const p = published.features.find(feature => feature.properties.id === id)!.properties;
    assert.deepEqual(p.sameNameRecordIds?.slice().sort(), group.recordIds.filter(other => other !== id).sort());
    assert.match(p.sameNameNote!, /不按同名、近邻或同坐标合并/);
  }
});

test("只有20条审过的源身份关联辖区与政权，府县和旧称冲突保持分离", async () => {
  const links = published.features.filter(feature => feature.properties.boundaryId);
  assert.equal(links.length, 20); assert.equal(manifest.boundaryLinkedCount, 20);
  const research = await json<{ byBoundary: Record<string, { catalogPlaceId: string; researchName: string; researchEntryId: string; modelLevel: string; polityLabel: string }> }>("public/data/song-boundary-research.json");
  for (const { properties: p } of published.features) {
    if (!p.boundaryId) {
      assert.equal(p.polityLabel, undefined);
      assert.match(p.polityNote, /没有政权或上级隶属字段/);
      continue;
    }
    const r = research.byBoundary[p.boundaryId];
    assert.ok(r);
    assert.equal(p.name, r.researchName); assert.equal(p.level, r.modelLevel);
    assert.equal(p.catalogPlaceId, r.catalogPlaceId); assert.equal(p.researchEntryId, r.researchEntryId);
    assert.equal(p.polityLabel, r.polityLabel);
    assert.equal(p.boundaryLinkBasis, "reviewed-source-record-and-documentary-identity");
    assert.match(p.boundaryNote!, /不以包含关系或最近点推断隶属/);
  }
  const linan = links.find(feature => feature.properties.sourceRecordId === "32344")!;
  assert.equal(linan.properties.boundaryId, "hartwell-1200-prefecture-v5_1200_chin_chn_1200_p-213");
  const pingjin = links.find(feature => feature.properties.sourceRecordId === "95597")!;
  assert.equal(pingjin.properties.name, "平晋县");
  assert.equal(pingjin.properties.boundaryId, "hartwell-1200-county-v5_1200_chin_chn_1200_c-305");
  assert.equal(links.find(feature => feature.properties.sourceRecordId === "211263")!.properties.name, "重庆府");
  assert.equal(links.find(feature => feature.properties.sourceRecordId === "210115")!.properties.subtype, "府");
});

test("宋治所来源、派生物和所有模型输入哈希可重复验证", async () => {
  for (const [file, expected] of Object.entries({ ...manifest.inputHashes, ...audit.outputHashes })) assert.equal(hash(await bytes(file)), expected, file);
  for (const source of manifest.sources) {
    assert.equal(hash(await bytes(source.snapshotPath)), source.snapshotSha256);
    assert.equal(hash(await bytes(source.metadataPath)), source.metadataSha256);
    assert.ok(source.license && source.attribution && source.url.startsWith("https://doi.org/"));
  }
  assert.ok((await bytes(`public${manifest.url}`)).length < 4_000_000);
});
