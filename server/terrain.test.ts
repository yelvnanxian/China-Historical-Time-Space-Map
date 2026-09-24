import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { isTerrainError } from "../shared/terrain";

const directory = fileURLToPath(new URL("../public/data/terrain/", import.meta.url));
type TerrainManifest = {
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  encoding: string;
  note: string;
  tileCount: number;
  totalBytes: number;
  tiles: { path: string; sourceUrl: string; bytes: number; sha256: string }[];
};
const manifest: TerrainManifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function tilePoint(longitude: number, latitude: number, zoom: number) {
  const count = 2 ** zoom;
  return [(longitude + 180) / 360 * count, (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * count];
}

test("地形缓存覆盖全部承诺范围和缩放，PNG原始字节与来源校验一致", async () => {
  assert.equal(manifest.encoding, "terrarium");
  assert.deepEqual(manifest.bounds, [55, -5, 155, 65]);
  assert.equal(manifest.minzoom, 0);
  assert.equal(manifest.maxzoom, 6);
  assert.match(manifest.note, /现代高程/);
  assert.match(manifest.note, /不代表/);
  const expected = new Set<string>();
  for (let zoom = manifest.minzoom; zoom <= manifest.maxzoom; zoom++) {
    const [x0, y0] = tilePoint(manifest.bounds[0], manifest.bounds[3], zoom).map(Math.floor);
    const [x1, y1] = tilePoint(manifest.bounds[2], manifest.bounds[1], zoom).map(Math.floor);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) expected.add(`${zoom}/${x}/${y}.png`);
  }
  assert.equal(manifest.tileCount, 454);
  assert.equal(manifest.tiles.length, expected.size);
  assert.equal(new Set(manifest.tiles.map(tile => tile.path)).size, manifest.tiles.length);
  let bytes = 0;
  for (const tile of manifest.tiles) {
    assert.ok(expected.delete(tile.path), `非预期或重复瓦片 ${tile.path}`);
    assert.equal(tile.sourceUrl, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile.path}`);
    const file = await readFile(path.join(directory, tile.path));
    assert.deepEqual(file.subarray(0, 8), pngSignature);
    assert.equal(file.readUInt32BE(16), 256);
    assert.equal(file.readUInt32BE(20), 256);
    assert.equal(file.length, tile.bytes);
    assert.equal(createHash("sha256").update(file).digest("hex"), tile.sha256, tile.path);
    bytes += file.length;
  }
  assert.equal(expected.size, 0);
  assert.equal(bytes, manifest.totalBytes);
});

// Minimal standard PNG unfiltering independently decodes actual source cells;
// no browser rendering or pre-recorded elevation labels are used for this check.
async function elevationAt(longitude: number, latitude: number): Promise<number> {
  const [tileX, tileY] = tilePoint(longitude, latitude, 6);
  const x = Math.floor(tileX), y = Math.floor(tileY);
  const image = await readFile(path.join(directory, `6/${x}/${y}.png`));
  assert.equal(image[24], 8, "Expected 8-bit PNG channels");
  assert.equal(image[25], 2, "Expected true-color RGB PNG");
  assert.equal(image[28], 0, "Expected non-interlaced PNG");
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < image.length;) {
    const length = image.readUInt32BE(offset);
    if (image.toString("ascii", offset + 4, offset + 8) === "IDAT") compressed.push(image.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * 3;
  assert.equal(filtered.length, height * (stride + 1));
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = filtered[row * (stride + 1)];
    assert.ok(filter >= 0 && filter <= 4);
    for (let column = 0; column < stride; column++) {
      const index = row * stride + column;
      const left = column >= 3 ? pixels[index - 3] : 0;
      const up = row > 0 ? pixels[index - stride] : 0;
      const upperLeft = row > 0 && column >= 3 ? pixels[index - stride - 3] : 0;
      const predictor = left + up - upperLeft;
      const a = Math.abs(predictor - left), b = Math.abs(predictor - up), c = Math.abs(predictor - upperLeft);
      const paeth = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      const correction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth;
      pixels[index] = (filtered[row * (stride + 1) + column + 1] + correction) & 255;
    }
  }
  const index = (Math.floor((tileY - y) * height) * width + Math.floor((tileX - x) * width)) * 3;
  return pixels[index] * 256 + pixels[index + 1] + pixels[index + 2] / 256 - 32768;
}

test("真实高程区分青藏高原、横断山、四川盆地与华北平原", async () => {
  const [plateau, mountains, basin, plain] = await Promise.all([
    elevationAt(90, 32), elevationAt(100.8, 29.5), elevationAt(104.1, 30.6), elevationAt(116, 36),
  ]);
  assert.ok(plateau > 4000 && plateau < 6000, `青藏高原高程异常 ${plateau}`);
  assert.ok(mountains > 3500 && mountains < 6000, `横断山高程异常 ${mountains}`);
  assert.ok(basin > 200 && basin < 1000, `四川盆地高程异常 ${basin}`);
  assert.ok(plain >= 0 && plain < 200, `华北平原高程异常 ${plain}`);
  assert.ok(plateau - plain > 3500);
  assert.ok(mountains - basin > 2500);
});

test("DEM故障局部降级，正常底图和行政边界故障保留原处理", () => {
  for (const event of [
    { sourceId: "modern-terrain-dem", error: new Error("Failed to fetch") },
    { sourceId: "modern-terrain-shading", error: new Error("PNG decode failed") },
    { error: new Error("AJAXError 404: http://localhost:5173/data/terrain/6/49/26.png") },
    { error: { url: "/data/terrain/6/49/26.png" } },
    { error: new Error("layers.modern-terrain-hillshade: invalid property") },
  ]) assert.equal(isTerrainError(event), true);
  for (const event of [
    null, undefined, "Failed to fetch", {}, { sourceId: 5 }, { error: "terrain" },
    { sourceId: "land", error: new Error("Failed to fetch /data/land.geojson") },
    { sourceId: "historical-boundaries", error: new Error("Failed to fetch") },
    { error: new Error("WebGL renderer could not initialize") },
  ]) assert.equal(isTerrainError(event), false);
});
