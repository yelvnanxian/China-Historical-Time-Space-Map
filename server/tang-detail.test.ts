import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";
import type { TangDetailCollection, TangDetailManifest } from "../shared/tang-detail";
import { simplifiedChinese } from "../shared/boundary-search";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest: TangDetailManifest = JSON.parse(await readFile(path.join(root, "public/data/tang-detail/manifest.json"), "utf8"));
const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
const publicPath = (url: string) => path.join(root, "public", url);

/** Read the actual small official ZIP, without requiring a Python GIS runtime. */
function zipMembers(buffer: Buffer): Map<string, Buffer> {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  assert.ok(end >= 0);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const output = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const local = buffer.readUInt32LE(offset + 42);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    assert.ok(method === 0 || method === 8);
    output.set(path.extname(name), method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return output;
}

function sourcePoints(members: Map<string, Buffer>) {
  const dbf = members.get(".dbf")!;
  const shp = members.get(".shp")!;
  const rowCount = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const rowLength = dbf.readUInt16LE(10);
  const fields: { name: string; width: number }[] = [];
  for (let offset = 32; dbf[offset] !== 0x0d; offset += 32) {
    fields.push({ name: dbf.subarray(offset, offset + 11).toString("ascii").replace(/\0.*$/, ""), width: dbf[offset + 16] });
  }
  const points = new Map<string, { coordinates: [number, number]; record: Record<string, string> }>();
  let shapeOffset = 100;
  for (let index = 0; index < rowCount; index += 1) {
    const rowStart = headerLength + index * rowLength;
    assert.notEqual(dbf[rowStart], 0x2a, "No deleted rows may silently shift source indices");
    let columnOffset = rowStart + 1;
    const record: Record<string, string> = {};
    for (const field of fields) {
      record[field.name] = dbf.subarray(columnOffset, columnOffset + field.width).toString("utf8").trim();
      columnOffset += field.width;
    }
    assert.equal(shp.readUInt32LE(shapeOffset + 8), 1, "Source must be POINT, never polygon centroid");
    points.set(record.SYS_ID, { coordinates: [shp.readDoubleLE(shapeOffset + 12), shp.readDoubleLE(shapeOffset + 20)], record });
    shapeOffset += 8 + shp.readUInt32BE(shapeOffset + 4) * 2;
  }
  return points;
}

test("唐细节历史点逐条来自原始SHP POINT，并隔离内部坐标冲突", async () => {
  const data: TangDetailCollection = JSON.parse(await readFile(publicPath(manifest.historical.url), "utf8"));
  assert.equal(data.features.length, 1682);
  assert.equal(manifest.historical.countyCount, 1365);
  assert.equal(manifest.historical.prefectureCount, 317);
  assert.equal(manifest.historical.withheldCount, 127);
  const source = new Map<string, ReturnType<typeof sourcePoints>>();
  for (const level of ["county", "prefecture"]) {
    source.set(level, sourcePoints(zipMembers(await readFile(path.join(root, `data/evidence/tang-detail/chgis/${level}-wgs84.zip`)))));
  }
  const ids = new Set<string>();
  for (const feature of data.features) {
    const p = feature.properties;
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.equal(feature.geometry.type, "Point");
    if (feature.geometry.type !== "Point") continue;
    const original = source.get(p.level!)!.get(p.sourceRecordId!)!;
    assert.ok(original, p.id);
    assert.equal(p.sourceRecord?.NAME_CH, original.record.NAME_CH);
    assert.equal(p.name, simplifiedChinese(original.record.NAME_CH));
    assert.deepEqual(feature.geometry.coordinates, original.coordinates.map(number => Math.round(number * 1e6) / 1e6));
    assert.ok(Number(original.record.BEG_YR) <= 755 && 755 <= Number(original.record.END_YR));
    assert.ok(Math.abs(feature.geometry.coordinates[0] - Number(original.record.X_COOR)) <= .02);
    assert.ok(Math.abs(feature.geometry.coordinates[1] - Number(original.record.Y_COOR)) <= .02);
    assert.equal(p.modernReferenceOnly, false);
    assert.ok(p.beginRule && p.endRule && p.geometryNote.includes("起讫年"));
  }
  assert.ok(!ids.has("chgis-county-83042"), "The source's visibly displaced 长社县 record stays withheld");
});

test("唐细节全部来源归档哈希可验证，现代原始数据以gzip无损保存", async () => {
  assert.equal(manifest.sources.length, 8);
  for (const source of manifest.sources) {
    const bytes = await readFile(path.join(root, source.snapshotPath));
    assert.equal(digest(bytes), source.snapshotSha256, source.id);
    assert.ok(source.license && source.attribution);
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    assert.equal(new URL(source.url).protocol, "https:");
    assert.ok(bytes.byteLength < 100_000_000);
    if (source.snapshotPath.endsWith(".gz")) {
      const region = path.basename(source.snapshotPath).replace(/\.json\.gz$/, "");
      const meta = JSON.parse(await readFile(path.join(root, `data/evidence/tang-detail/osm/${region}-source.json`), "utf8"));
      assert.equal(digest(gunzipSync(bytes)), meta.uncompressedSnapshotSha256);
      assert.equal(digest(await readFile(path.join(root, meta.queryPath))), meta.querySha256);
      assert.equal(meta.modernReferenceOnly, true);
    }
  }
});

function coordinatePairs(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as number[]];
  return value.flatMap(coordinatePairs);
}

test("现代细节按视野分包、ID唯一、实际几何完整且明确现代参照", async () => {
  assert.ok(manifest.modernRegions.length >= 20);
  const ids = new Set<string>();
  const kinds = new Set<string>();
  const sourceIds = new Set(manifest.sources.map(source => source.id));
  for (const pack of manifest.modernRegions) {
    const filename = publicPath(pack.url);
    assert.ok((await stat(filename)).size < 8_100_000, pack.id);
    const compressed = await readFile(filename);
    const expanded = gunzipSync(compressed);
    assert.ok(expanded.byteLength < 8_100_000, pack.id);
    const data: TangDetailCollection = JSON.parse(expanded.toString("utf8"));
    assert.equal(data.features.length, pack.featureCount);
    assert.ok(pack.minZoom === 8 || pack.minZoom === 10);
    for (const feature of data.features) {
      const p = feature.properties;
      assert.ok(!ids.has(p.id), `Cross-region duplicate: ${p.id}`); ids.add(p.id); kinds.add(p.kind);
      assert.equal(p.modernReferenceOnly, true);
      assert.ok(p.geometryNote.includes("现代") && p.geometryNote.includes("不是唐代"));
      assert.ok(sourceIds.has(p.sourceId));
      assert.equal(p.sourceUrl, `https://www.openstreetmap.org/${p.osmType}/${p.osmId}`);
      assert.equal(p.name, simplifiedChinese(p.name));
      assert.ok("coordinates" in feature.geometry);
      if (!("coordinates" in feature.geometry)) continue;
      const points = coordinatePairs(feature.geometry.coordinates);
      assert.ok(points.length > 0);
      for (const [longitude, latitude] of points) {
        assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude));
        assert.ok(longitude >= pack.bounds[0] && longitude <= pack.bounds[2]);
        assert.ok(latitude >= pack.bounds[1] && latitude <= pack.bounds[3]);
      }
    }
  }
  assert.ok(ids.size > 50_000);
  for (const kind of ["river", "stream", "canal", "water", "peak", "saddle"]) assert.ok(kinds.has(kind));
  assert.equal(manifest.modernCoverageRegions.length, 6);
  const packs = new Map(manifest.modernRegions.map(pack => [pack.id, pack]));
  for (const region of manifest.modernCoverageRegions) {
    assert.ok(region.packageIds.length > 0);
    assert.ok(region.packageIds.every(id => packs.get(id)?.minZoom === 8));
  }
});
