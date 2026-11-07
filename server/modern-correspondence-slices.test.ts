import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  decodeModernCorrespondenceSlice,
  type ModernCorrespondenceSlice,
  type ModernCorrespondenceSliceManifest,
  type ModernCorrespondenceSpatialData,
} from "../shared/modern-correspondence";
import { verifyModernCorrespondenceSlices } from "../scripts/verify-modern-correspondence-slices";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = promisify(execFile);

function fixture(): { manifest: ModernCorrespondenceSliceManifest; slice: ModernCorrespondenceSlice } {
  return {
    manifest: {
      schemaVersion: 1,
      version: "modern-correspondence-1",
      coordinateSystem: "WGS84 longitude/latitude",
      statistics: { total: 1 },
      sources: [{ id: "source", title: "来源原文", url: "https://example.com/source", note: "资料原注。" }],
      notes: ["代表点参考；不等于古今同一行政实体。"],
      sourceIdSets: [["source"]],
      datasets: [{ id: "example", year: 741, url: "/data/modern-correspondence/example.json", entryCount: 1 }],
    },
    slice: {
      schemaVersion: 1,
      datasetId: "example",
      year: 741,
      method: "representative-point",
      modernRegionSets: [[{ name: "西安市", level: "prefecture", sourceId: "source", sourceFeatureIndex: 0, sourceRecordId: "001", referenceYear: 2022 }]],
      entries: {
        "example-001": {
          historicalName: "長安縣", simplifiedName: "长安县", modernNames: ["陕西", "西安市"],
          matchStatus: "matched", matchLevel: "prefecture", representativeCoordinates: [108.9, 34.2],
          historicalLayerId: "example-county", referenceYears: [2022], noteRef: 0, sourceIdsRef: 0, modernRegionsRef: 0,
        },
      },
    },
  };
}

test("分片解码恢复全部文字、溯源字段和字典顺序，不修改输入", () => {
  const { manifest, slice } = fixture();
  Object.assign(manifest.sources[0], { year: 2022, version: "4.1", coordinateSystem: "CRS84" });
  Object.assign(slice.entries["example-001"], { retainedExtra: { originalText: "00 / 原文", values: [null, "", 0] } });
  const before = structuredClone({ manifest, slice });
  const decoded = decodeModernCorrespondenceSlice(manifest, slice, "example");
  assert.deepEqual(decoded.sources, manifest.sources);
  assert.deepEqual(decoded.statistics, { total: 1 });
  assert.deepEqual(decoded.entries["example-001"], {
    historicalName: "長安縣", simplifiedName: "长安县", modernNames: ["陕西", "西安市"],
    matchStatus: "matched", matchLevel: "prefecture", representativeCoordinates: [108.9, 34.2],
    historicalLayerId: "example-county", referenceYears: [2022], retainedExtra: { originalText: "00 / 原文", values: [null, "", 0] },
    historicalDatasetId: "example", historicalYear: 741, method: "representative-point",
    note: manifest.notes[0], sourceIds: ["source"], modernRegions: slice.modernRegionSets[0],
  });
  assert.deepEqual({ manifest, slice }, before);
  decoded.entries["example-001"].sourceIds.push("output-only");
  decoded.entries["example-001"].modernRegions[0].name = "output-only";
  assert.deepEqual({ manifest, slice }, before);
});

test("未匹配记录、空数组、原始未定名和缺失坐标原样恢复", () => {
  const { manifest, slice } = fixture();
  slice.modernRegionSets = [[]];
  Object.assign(slice.entries["example-001"], {
    historicalName: "00", simplifiedName: "00", modernNames: [], matchStatus: "unmatched", matchLevel: "unmatched",
    representativeCoordinates: null, referenceYears: [], unmatchedReason: "missing-or-invalid-representative-point",
  });
  const entry = decodeModernCorrespondenceSlice(manifest, slice).entries["example-001"];
  assert.equal(entry.historicalName, "00");
  assert.equal(entry.simplifiedName, "00");
  assert.equal(entry.representativeCoordinates, null);
  assert.deepEqual(entry.modernNames, []);
  assert.deepEqual(entry.modernRegions, []);
  assert.equal(entry.unmatchedReason, "missing-or-invalid-representative-point");
});

test("损坏、负数和越界字典引用不能悄悄变成缺资料", () => {
  for (const field of ["noteRef", "sourceIdsRef", "modernRegionsRef"] as const) {
    for (const reference of [-1, 0.5, 1, NaN]) {
      const { manifest, slice } = fixture();
      slice.entries["example-001"][field] = reference;
      assert.throws(() => decodeModernCorrespondenceSlice(manifest, slice), /reference/);
    }
  }
  const { manifest, slice } = fixture();
  manifest.sourceIdSets[0] = ["missing-source"];
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, slice), /source reference/);
});

test("拒绝异年、异数据集、不完整条目和不支持的分片格式", () => {
  const { manifest, slice } = fixture();
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, slice, "other"), /requested dataset/);
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, { ...slice, year: 1200 }), /requested dataset/);
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, { ...slice, datasetId: "other" }), /requested dataset/);
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, { ...slice, entries: {} }), /requested dataset/);
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, { ...slice, schemaVersion: 2 } as unknown as ModernCorrespondenceSlice), /Invalid/);
  Object.assign(slice.entries["example-001"], { historicalYear: 1200 });
  assert.throws(() => decodeModernCorrespondenceSlice(manifest, slice), /Invalid.*entry/);
});

test("离线生成可逐字节复现，全部标签、现代名、比较与检索结果保持一致", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-modern-slices-"));
  const originalPath = path.join(root, "public/data/modern-correspondence.json");
  const originalBytes = await readFile(originalPath);
  try {
    const command = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    const args = [path.join(root, "scripts/build-modern-correspondence.py"), "--offline", "--split-existing", "--slice-output", directory];
    await run(command, args, { cwd: root });
    const filenames = (await readdir(directory)).sort();
    const generated = await Promise.all(filenames.map(filename => readFile(path.join(directory, filename))));
    const report = await verifyModernCorrespondenceSlices({ slicesDirectory: directory });
    const original: ModernCorrespondenceSpatialData = JSON.parse(originalBytes.toString("utf8"));
    assert.equal(report.entries, Object.keys(original.entries).length);
    assert.equal(report.labels, report.entries);
    assert.equal(report.modernNames, Object.values(original.entries).reduce((total, entry) => total + entry.modernNames.length, 0));
    assert.equal(report.comparisonLayers, original.statistics.layerCount);
    assert.ok(report.queries > report.entries);
    assert.ok(report.searchResultIds > report.queries);
    assert.equal(filenames.length, report.datasets.length + 1);
    assert.ok(report.datasets.every(dataset => dataset.rawBytesWithManifest < 1_000_000));
    await run(command, args, { cwd: root });
    assert.deepEqual((await readdir(directory)).sort(), filenames);
    for (const [index, filename] of filenames.entries()) {
      assert.deepEqual(await readFile(path.join(directory, filename)), generated[index], `${filename}: generation is not deterministic`);
    }
    assert.deepEqual(await readFile(originalPath), originalBytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
