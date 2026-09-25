import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { boundaryCountryCoverage, type BoundaryManifest } from "../shared/boundaries";
import { automaticBoundaryLevel, resolveMapDetailLevel, viewLevelForBoundarySelection } from "../shared/map-detail-levels";

test("自动层级在缩放边界切换，县域面不会在全国视野参与显示或命中", () => {
  const cases = [[3.99, "country"], [4, "province"], [5.39, "province"], [5.4, "prefecture"], [6.59, "prefecture"], [6.6, "county"]] as const;
  for (const [zoom, level] of cases) {
    assert.equal(automaticBoundaryLevel(zoom), level);
    const view = resolveMapDetailLevel("auto", zoom);
    assert.deepEqual(view.visibleLevels, [level]);
    assert.deepEqual(view.interactiveLevels, [level]);
    assert.equal(view.showCities, zoom >= 5.4);
  }
  assert.equal(automaticBoundaryLevel(Number.NaN), "country");
});

test("唐国家资料缺主国界时自动用省道与诸部背景，点击优先省道且不拼造国界", async () => {
  const manifest: BoundaryManifest = JSON.parse(await readFile(new URL("../public/data/boundaries/manifest.json", import.meta.url), "utf8"));
  const tang = manifest.datasets.find(dataset => dataset.periodId === "tang")!;
  const coverage = boundaryCountryCoverage(tang);
  assert.equal(coverage.count, 3);
  assert.equal(coverage.incomplete, true);
  assert.match(coverage.note, /未提供唐朝完整国界/);
  const available = tang.layers.map(layer => layer.level);
  const view = resolveMapDetailLevel("auto", 3, available, { primaryCountryCoverage: !coverage.incomplete });
  assert.equal(view.activeLevel, "province");
  assert.deepEqual(view.visibleLevels, ["country", "province"]);
  assert.deepEqual(view.interactiveLevels, ["province", "country"]);
  assert.equal(view.showCities, false);
  const manual = resolveMapDetailLevel("country", 7, available, { primaryCountryCoverage: false });
  assert.deepEqual(manual.visibleLevels, ["country"]);
  assert.equal(manual.showCities, false);
});

test("手动预设在任何缩放下保持所选层级；只城池完全不提供行政面命中", () => {
  for (const zoom of [2, 4.9, 8]) {
    for (const level of ["country", "province", "prefecture", "county"] as const) {
      const view = resolveMapDetailLevel(level, zoom);
      assert.deepEqual(view.visibleLevels, [level]);
      assert.deepEqual(view.interactiveLevels, [level]);
      assert.equal(view.showCities, level === "county");
    }
    assert.deepEqual(resolveMapDetailLevel("cities", zoom).visibleLevels, []);
    assert.deepEqual(resolveMapDetailLevel("cities", zoom).interactiveLevels, []);
    assert.equal(resolveMapDetailLevel("cities", zoom).showCities, true);
  }
});

test("跨层搜索固定结果层级，视野定位缩放后仍显示该辖区", () => {
  for (const level of ["province", "prefecture", "county"] as const) {
    const preset = viewLevelForBoundarySelection(level);
    for (const fitZoom of [2.8, 5.1, 7.8]) assert.ok(resolveMapDetailLevel(preset, fitZoom).visibleLevels.includes(level));
  }
});

test("缺失层级只在自动模式回退，手动选择不冒充别的层级且无资料时仍可显示城池", () => {
  assert.equal(resolveMapDetailLevel("auto", 7, ["province"]).activeLevel, "province");
  assert.equal(resolveMapDetailLevel("county", 7, ["province"]).activeLevel, null);
  assert.equal(resolveMapDetailLevel("county", 7, ["province"]).showCities, true);
  assert.deepEqual(resolveMapDetailLevel("auto", 7, []).visibleLevels, []);
  assert.equal(resolveMapDetailLevel("auto", 7, []).showCities, true);
  assert.equal(resolveMapDetailLevel("country", 3, []).showCities, false);
});
