import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import type { Feature, LineString } from "geojson";
import { placeContourLabels } from "../shared/contour-labels";
import type { MountainContourCollection, MountainShapesManifest } from "../shared/mountain-shapes";

const feature = (id: string, elevation: number, points: [number, number][], index = true): Feature<LineString, { id: string; areaId: string; elevation: number; index: boolean }> => ({ type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: { id, areaId: "source-area", elevation, index } });
const viewport = { contains: ([x, y]: [number, number]) => x >= 0 && y >= 0 && x <= 1200 && y <= 900, project: ([x, y]: [number, number]) => ({ x, y }), width: 1200, height: 900, occupied: [] };

test("同一低海拔大量碎线不会耗尽高程标注名额，每个可见高度先分配一次", () => {
  const low = Array.from({ length: 35 }, (_, i) => feature(`low-${i}`, 250, [[50 + i % 10 * 100, 50 + Math.floor(i / 10) * 65], [51 + i % 10 * 100, 50 + Math.floor(i / 10) * 65]]));
  const high = [500, 750, 1000, 1250, 1500].map((elevation, i) => feature(`high-${i}`, elevation, [[100 + i * 160, 600], [101 + i * 160, 600]]));
  const placements = placeContourLabels([...low, ...high], viewport);
  assert.equal(placements.length, 24);
  assert.deepEqual([...new Set(placements.map(p => p.feature.properties.elevation))].sort((a, b) => a - b), [250, 500, 750, 1000, 1250, 1500]);
  assert.equal(new Set(placements.slice(0, 6).map(p => p.feature.properties.elevation)).size, 6);
  assert.equal(new Set(placements.map(p => p.feature.properties.id)).size, placements.length);
});

test("峰名遮挡几何中点时尝试同一等高线其他真实顶点，点击数据保留原ID与海拔", () => {
  const line = feature("contour-1250", 1250, [[150, 300], [250, 300], [350, 300], [450, 300], [550, 300]]);
  const peakLabel = { left: 300, right: 410, top: 270, bottom: 330 };
  const placements = placeContourLabels([line], { ...viewport, occupied: [peakLabel] });
  assert.equal(placements.length, 1);
  assert.notDeepEqual(placements[0].point, [350, 300]);
  assert.ok(placements[0].box.right + 4 <= peakLabel.left || placements[0].box.left - 4 >= peakLabel.right);
  assert.equal(placements[0].feature, line);
  assert.equal(placements[0].feature.properties.elevation, 1250);
  assert.ok(line.geometry.coordinates.includes(placements[0].point));
});

test("只标可见真实顶点且避让既有文字及其他等高线，不在画外中点或插值位置造标签", () => {
  const line = feature("crossing", 500, [[-800, 200], [-600, 200], [-400, 200], [100, 200], [250, 200]]);
  const sameLine = feature("overlap", 750, [[100, 200], [250, 200]]);
  const invisible = feature("outside", 1500, [[-400, 500], [-300, 500]]);
  const detail = feature("fine-line", 550, [[900, 600], [1000, 600]], false);
  const placements = placeContourLabels([line, sameLine, invisible, detail], viewport);
  assert.ok(placements.some(p => p.feature === line));
  assert.ok(placements.every(p => viewport.contains(p.point) && p.feature.geometry.coordinates.includes(p.point)));
  assert.ok(placements.every(p => p.feature !== invisible && p.feature !== detail));
  for (const [i, a] of placements.entries()) for (const b of placements.slice(i + 1)) {
    assert.ok(a.box.right + 28 <= b.box.left || b.box.right + 28 <= a.box.left || a.box.bottom + 16 <= b.box.top || b.box.bottom + 16 <= a.box.top);
  }
  const blocked = placeContourLabels([line], { ...viewport, occupied: [{ left: 0, right: 1200, top: 0, bottom: 900 }] });
  assert.deepEqual(blocked, []);
});

test("庐山zoom11真实视口有密集峰名时仍标出低中高海拔，锚点全部属于原始线", async () => {
  const manifest: MountainShapesManifest = JSON.parse(await readFile(new URL("../public/data/mountain-shapes/manifest.json", import.meta.url), "utf8"));
  const area = manifest.areas.find(a => a.id === "lushan-hanyang")!;
  const data: MountainContourCollection = JSON.parse(gunzipSync(await readFile(new URL(`../public${area.contoursUrl}`, import.meta.url))).toString());
  const [lng, lat] = area.sourcePeak.coordinates;
  // Captured from the 1280 × 720 browser at z11. The map is 1242 × 489;
  // its camera offsets the source peak to (441, 248) to avoid the detail card.
  // MapLibre uses a 512 px world tile, not a 256 px tile.
  const width = 1242, height = 489, worldSize = 512 * 2 ** 11;
  const mercatorY = (latitude: number) => (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2;
  const project = ([x, y]: [number, number]) => ({ x: 441 + (x - lng) / 360 * worldSize, y: 248 + (mercatorY(y) - mercatorY(lat)) * worldSize });
  const contains = (point: [number, number]) => { const p = project(point); return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height; };
  // Actual relative DOM rectangles: selected Hanyang, Nankang, and 18 peaks.
  const occupied = [
    [407, 216, 476, 245], [647, 376, 735, 398], [407, 104, 470, 127], [540, 51, 603, 74],
    [494, 388, 557, 411], [326, 362, 389, 385], [312, 398, 375, 421], [269, 252, 332, 275],
    [256, 187, 319, 210], [496, 149, 559, 172], [430, 295, 493, 318], [544, 95, 607, 118],
    [345, 263, 408, 286], [472, 236, 535, 259], [466, 263, 529, 286], [469, 175, 532, 198],
    [668, 19, 731, 42], [359, 305, 422, 328], [470, 70, 533, 93], [536, -3, 599, 20],
  ].map(([left, top, right, bottom]) => ({ left, top, right, bottom }));
  const placements = placeContourLabels(data.features, { width, height, project, contains, occupied });
  const elevations = new Set(placements.map(p => p.feature.properties.elevation));
  assert.deepEqual([...elevations].sort((a, b) => a - b), [250, 500, 750, 1000, 1250]);
  assert.ok(placements.length <= 24);
  for (const placement of placements) {
    assert.ok(data.features.includes(placement.feature as typeof data.features[number]));
    assert.ok(placement.feature.geometry.coordinates.includes(placement.point));
    assert.ok(occupied.every(box => placement.box.right + 4 <= box.left || box.right + 4 <= placement.box.left || placement.box.bottom + 3 <= box.top || box.bottom + 3 <= placement.box.top));
  }
  for (const [i, a] of placements.entries()) for (const b of placements.slice(i + 1)) {
    assert.ok(a.box.right + 28 <= b.box.left || b.box.right + 28 <= a.box.left || a.box.bottom + 16 <= b.box.top || b.box.bottom + 16 <= a.box.top);
  }
});
