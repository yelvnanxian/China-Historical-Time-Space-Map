import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { BoundaryManifest } from "../shared/boundaries";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { boundarySearchKey } from "../shared/boundary-search";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "public", "data", "boundaries");
const manifest: BoundaryManifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));

test("历史边界文件保持明确年代、真实来源记录和WGS84闭合面，分级数量一致", async () => {
  const identifiers = new Set<string>();
  assert.ok(manifest.datasets.length > 0);
  for (const dataset of manifest.datasets) {
    assert.ok(dataset.sourceName && dataset.sourceUrl.startsWith("https://"));
    assert.ok(dataset.note && dataset.coverage);
    assert.ok(Number.isInteger(dataset.year));
    for (const layer of dataset.layers) {
      const file = path.resolve(root, "public", layer.url.slice(1));
      assert.ok(file.startsWith(directory + path.sep));
      const collection: FeatureCollection<Polygon | MultiPolygon> = JSON.parse(await readFile(file, "utf8"));
      assert.equal(collection.type, "FeatureCollection");
      assert.equal(collection.features.length, layer.featureCount);
      assert.ok(collection.features.length > 0);
      for (const feature of collection.features) {
        const properties = feature.properties!;
        assert.ok(properties.id && !identifiers.has(properties.id), `重复区域 ${properties.id}`);
        identifiers.add(properties.id);
        assert.ok(properties.name && properties.sourceId && properties.recordId !== undefined);
        assert.equal(properties.year, dataset.year);
        assert.equal(properties.level, layer.level);
        if (properties.yearConflict) assert.ok(layer.warning, "来源年份冲突必须向使用者说明");
        assert.ok(feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon");
        const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        for (const polygon of polygons) for (const ring of polygon) {
          assert.ok(ring.length >= 4, `${properties.id} 环过短`);
          assert.deepEqual(ring[0], ring.at(-1), `${properties.id} 环未闭合`);
          for (const point of ring) {
            assert.ok(Number.isFinite(point[0]) && Math.abs(point[0]) <= 180, `${properties.id} 经度不合法`);
            assert.ok(Number.isFinite(point[1]) && Math.abs(point[1]) <= 90, `${properties.id} 纬度不合法`);
          }
        }
        assert.equal(properties.labelCoordinates?.length, 2);
      }
    }
  }
});

test("近似模型和国家/诸部分类不会冒充逐年完整疆域", () => {
  for (const dataset of manifest.datasets.filter(item => item.id.startsWith("hartwell-"))) {
    assert.equal(dataset.accuracy, "approximate-model");
    assert.match(dataset.note, /近似/);
    for (const layer of dataset.layers.filter(item => item.level === "country")) assert.match(layer.label, /诸部|諸部|独立/);
  }
});

test("简体搜索可以匹配原始繁体县名，同时保留名称文本", () => {
  assert.ok(boundarySearchKey("藍田縣").includes(boundarySearchKey("蓝田")));
  assert.ok(boundarySearchKey("鳳翔府").includes(boundarySearchKey("凤翔")));
  assert.ok(boundarySearchKey("臨安縣").includes(boundarySearchKey("临安")));
  assert.equal(boundarySearchKey("  長安  "), "长安");
});
