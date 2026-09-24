import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BoundaryManifest } from "../shared/boundaries";
import type {
  ModernCorrespondenceData,
  ModernRegionCorrespondence,
} from "../shared/modern-correspondence";

interface SpatialEntry extends ModernRegionCorrespondence {
  matchStatus: "matched" | "unmatched";
  matchLevel: string;
  representativeCoordinates: [number, number];
  historicalYear: number;
  historicalDatasetId: string;
  referenceYears: number[];
  unmatchedReason?: string;
  modernRegions: {
    name: string;
    sourceId: string;
    sourceFeatureIndex: number;
    sourceRecordId: string;
  }[];
}

type Correspondence = Omit<ModernCorrespondenceData, "entries"> & {
  entries: Record<string, SpatialEntry>;
  statistics: {
    total: number;
    matched: number;
    unmatched: number;
    coverageRate: number;
    layerCount: number;
    simplifiedNameChanged: number;
  };
};

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = path.join(root, "data/evidence/modern-correspondence");
const data: Correspondence = JSON.parse(
  await readFile(path.join(root, "public/data/modern-correspondence.json"), "utf8"),
);
const manifest: BoundaryManifest = JSON.parse(
  await readFile(path.join(root, "public/data/boundaries/manifest.json"), "utf8"),
);

test("所有历史面都有古名、简体字和可追溯的空间对应，原名及代表点不被替换", async () => {
  const seen = new Set<string>();
  for (const dataset of manifest.datasets) {
    for (const layer of dataset.layers) {
      const collection: FeatureCollection<Polygon | MultiPolygon> = JSON.parse(
        await readFile(path.join(root, "public", layer.url.slice(1)), "utf8"),
      );
      for (const feature of collection.features) {
        const properties = feature.properties!;
        const entry = data.entries[properties.id];
        assert.ok(entry, `缺少对照：${properties.id}`);
        assert.ok(!seen.has(properties.id));
        seen.add(properties.id);
        assert.equal(entry.historicalName, properties.name);
        assert.ok(entry.simplifiedName.trim());
        assert.equal(entry.historicalYear, dataset.year);
        assert.equal(entry.historicalDatasetId, dataset.id);
        assert.deepEqual(entry.representativeCoordinates, properties.labelCoordinates);
        assert.equal(entry.method, "representative-point");
      }
    }
  }
  assert.equal(seen.size, Object.keys(data.entries).length);
  assert.equal(seen.size, data.statistics.total);
});

test("现代地名来自声明的空间资料，统计不把未匹配面算成覆盖", () => {
  const sourceIds = new Set(data.sources.map((source) => source.id));
  for (const source of data.sources) {
    assert.ok(source.title && source.note && source.url.startsWith("https://"));
  }
  let matched = 0;
  let changed = 0;
  for (const entry of Object.values(data.entries)) {
    assert.ok(entry.sourceIds.every((id) => sourceIds.has(id)));
    assert.ok(entry.sourceIds.includes("opencc-t2s"));
    if (entry.historicalName !== entry.simplifiedName) changed += 1;
    if (entry.matchStatus === "matched") {
      matched += 1;
      assert.ok(entry.modernNames.length > 0);
      assert.deepEqual(
        entry.modernNames,
        [...new Set(entry.modernRegions.map((region) => region.name))],
      );
      assert.ok(entry.modernRegions.every((region) =>
        sourceIds.has(region.sourceId) && Number.isInteger(region.sourceFeatureIndex),
      ));
      assert.match(entry.note, /代表点所在现代地区/);
      assert.match(entry.note, /不是古今同一行政实体/);
      assert.equal(entry.unmatchedReason, undefined);
    } else {
      assert.equal(entry.modernNames.length, 0);
      assert.equal(entry.modernRegions.length, 0);
      assert.ok(entry.unmatchedReason);
      assert.match(entry.note, /未匹配/);
    }
  }
  assert.equal(matched, data.statistics.matched);
  assert.equal(Object.keys(data.entries).length - matched, data.statistics.unmatched);
  assert.equal(changed, data.statistics.simplifiedNameChanged);
  assert.ok(Math.abs(data.statistics.coverageRate - matched / data.statistics.total) < 0.000001);
  assert.equal(data.statistics.layerCount, manifest.datasets.reduce((sum, dataset) => sum + dataset.layers.length, 0));
});

test("同名古县按各自位置对应，简体转换不会把不同长安县合并", () => {
  const entries = Object.values(data.entries);
  const lantian = entries.find((entry) => entry.historicalYear === 741 && entry.historicalName === "藍田縣");
  assert.ok(lantian);
  assert.equal(lantian.simplifiedName, "蓝田县");
  assert.ok(lantian.modernNames.includes("西安市"));
  const changan = entries.filter((entry) => entry.historicalName === "長安縣");
  assert.ok(changan.some((entry) => entry.modernNames.includes("西安市")));
  assert.ok(changan.some((entry) => entry.modernNames.includes("赤峰市")));
  assert.ok(changan.every((entry) => entry.simplifiedName === "长安县"));
});

test("岛礁代表点无现代面覆盖时明确留空，不按最近行政区猜配", () => {
  const island = data.entries["chgis-1820-province-25047"];
  assert.ok(island);
  assert.equal(island.historicalName, "万里长沙");
  assert.equal(island.matchStatus, "unmatched");
  assert.deepEqual(island.modernNames, []);
  assert.equal(island.unmatchedReason, "water-or-source-geometry-gap");
  assert.match(island.note, /未用最近地区猜配/);
});

test("现代对照生成后所有历史GeoJSON原始文件哈希保持不变", async () => {
  const report: { historicalInputs: { file: string; sha256: string }[]; historicalGeoJSONUnchanged: boolean } = JSON.parse(
    await readFile(path.join(evidence, "coverage-report.json"), "utf8"),
  );
  assert.equal(report.historicalGeoJSONUnchanged, true);
  for (const input of report.historicalInputs) {
    const digest = createHash("sha256").update(await readFile(path.join(root, input.file))).digest("hex");
    assert.equal(digest, input.sha256, `历史边界被对照生成步骤改动：${input.file}`);
  }
});
