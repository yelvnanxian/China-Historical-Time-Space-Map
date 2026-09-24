import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { isOptionalPhysicalLayerError, naturalSurfaceSelectionEnabled, physicalWaterGeometry } from "../shared/map-interactions";
import type { PhysicalFeatureCollection } from "../shared/physical-geography";

test("同时显示和城池模式不允许河线或湖面抢占行政区域点选", () => {
  assert.equal(naturalSurfaceSelectionEnabled("both"), false);
  assert.equal(naturalSurfaceSelectionEnabled("cities"), false);
  assert.equal(naturalSurfaceSelectionEnabled("nature"), true);
});

test("山系走向和河湖错误局部降级，底图错误仍交给全局处理", () => {
  assert.equal(isOptionalPhysicalLayerError({ sourceId: "mountain-directions" }), true);
  assert.equal(isOptionalPhysicalLayerError({ sourceId: "physical-interactive" }), true);
  assert.equal(isOptionalPhysicalLayerError({ sourceId: "land" }), false);
  assert.equal(isOptionalPhysicalLayerError({ error: new Error("worker failed") }), false);
  assert.equal(isOptionalPhysicalLayerError(null), false);
});

test("渲染数据中彻底移除山系、高原、海域命名范围，保留真实河湖几何", async () => {
  const data: PhysicalFeatureCollection = JSON.parse(await readFile(new URL("../public/data/physical-interactive.geojson", import.meta.url), "utf8"));
  const rendered = physicalWaterGeometry(data);
  assert.ok(data.features.some(feature => feature.properties.kind === "mountain"));
  assert.equal(rendered.features.length, 511);
  assert.ok(rendered.features.every(feature => ["river", "lake"].includes(feature.properties.kind)));
  for (const feature of rendered.features) {
    assert.equal(feature, data.features.find(original => original.id === feature.id), "不能替换或改写原始河湖几何");
  }
  assert.equal(data.features.length, 581, "视图过滤不删除来源记录");
});
