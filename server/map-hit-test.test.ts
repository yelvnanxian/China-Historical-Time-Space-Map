import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapGeoJSONFeature } from "maplibre-gl";
import { chooseNaturalMapHit } from "../shared/map-hit-test";

const feature = (layer: string) => ({ layer: { id: layer }, properties: { id: layer } }) as unknown as MapGeoJSONFeature;
test("全部模式在行政面前选具体地物，精细线优于概览线且不依赖监听顺序", () => {
  const coarse = feature("physical-river-hit"), fine = feature("tang-detail-hit"), boundary = feature("boundary-county-fill");
  assert.equal(chooseNaturalMapHit([coarse, boundary, fine], "all"), fine);
  assert.equal(chooseNaturalMapHit([fine, coarse, boundary], "all"), fine);
  assert.equal(chooseNaturalMapHit([coarse, fine], "cities"), undefined);
  assert.equal(chooseNaturalMapHit([coarse, fine], "mountains"), undefined);
});
test("山川与河流交叉时按当前点选对象仲裁，城市筛选忽略自然命中", () => {
  const ridge = feature("mountain-detail-line-hit"), river = feature("historical-river-hit"), mountain = feature("tang-detail-peaks");
  const hits = [mountain, ridge, river];
  assert.equal(chooseNaturalMapHit(hits, "rivers"), river);
  assert.equal(chooseNaturalMapHit(hits, "mountains"), ridge);
  assert.equal(chooseNaturalMapHit(hits, "all"), river);
  assert.equal(chooseNaturalMapHit(hits, "cities"), undefined);
});
test("无标签治所圆点仍可在城池和全部中点选，自然筛选不截获该点", () => {
  const town = feature("tang-detail-towns"), river = feature("tang-detail-hit");
  assert.equal(chooseNaturalMapHit([town], "cities"), town);
  assert.equal(chooseNaturalMapHit([town], "all"), town);
  assert.equal(chooseNaturalMapHit([town], "mountains"), undefined);
  assert.equal(chooseNaturalMapHit([town], "rivers"), undefined);
  assert.equal(chooseNaturalMapHit([town, river], "all"), river);
});
