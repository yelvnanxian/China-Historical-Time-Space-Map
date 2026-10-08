import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import type { BoundaryManifest } from "../shared/boundaries";
import { boundaryDatasetAtYear, eventIncludesYear } from "../shared/temporal-map";
import type { HistoricalEvent } from "../shared/types";

const manifest: BoundaryManifest = JSON.parse(readFileSync(new URL("../public/data/boundaries/manifest.json", import.meta.url), "utf8"));
test("浏览年份自动选择同朝最近边界，不跨朝代借用或伪造年份", () => {
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "song", 1080)?.year, 1080);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "song", 1200)?.year, 1200);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "song", 1138)?.year, 1080);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "tang", 755)?.year, 741);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "qing", 1911)?.year, 1911);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "han", 2), undefined);
  assert.equal(boundaryDatasetAtYear(manifest.datasets, "unassigned", 1938), undefined);
});
test("事件只在确年或明确持续区间出现，不把全朝事件当当年事件", () => {
  const event = { year: 755, endYear: 763 } as HistoricalEvent;
  assert.ok(eventIncludesYear(event, 755) && eventIncludesYear(event, 763));
  assert.ok(!eventIncludesYear(event, 754) && !eventIncludesYear(event, 764));
  assert.ok(eventIncludesYear({ year: -221 } as HistoricalEvent, -221));
  assert.ok(!eventIncludesYear({ year: -221 } as HistoricalEvent, -220));
});
