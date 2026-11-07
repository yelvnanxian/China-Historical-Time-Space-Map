import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BoundaryManifest, BoundarySelection } from "../shared/boundaries";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import { localizeComparisonRegions, type ComparisonRegions } from "../shared/boundary-comparison";
import { boundarySearchKey } from "../shared/boundary-search";
import { chinesePlaceName } from "../shared/place-name-localization";
import type { SongBoundaryResearchDocument } from "../shared/song-boundary-research";
import {
  decodeModernCorrespondenceSlice,
  type ModernCorrespondenceSlice,
  type ModernCorrespondenceSliceManifest,
  type ModernCorrespondenceSpatialData,
} from "../shared/modern-correspondence";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async <Value>(filename: string): Promise<Value> => JSON.parse(await readFile(filename, "utf8"));
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function displayRecord(properties: BoundarySelection, data: ModernCorrespondenceSpatialData, song: SongBoundaryResearchDocument) {
  const match = data.entries[properties.id];
  const correction = song.byBoundary[properties.id]?.displayCorrection;
  const display = {
    ...getBoundaryDisplayLabel(properties, match?.simplifiedName),
    ...(correction ? { name: correction.name, nameCorrectionNote: correction.note, nameSourceUrl: correction.sourceUrl } : {}),
  };
  const modernNames = (match?.modernNames ?? []).map(name => chinesePlaceName(name, "现代地区名称待核定"));
  return {
    ...display,
    modernNames,
    correspondenceNote: match?.note ?? "现代地区对应尚未收录。",
    correspondenceSourceIds: match?.sourceIds ?? [],
    searchKey: boundarySearchKey([display.name, display.originalName, ...modernNames].join(" ")),
  };
}

export async function verifyModernCorrespondenceSlices(options: { slicesDirectory?: string; dataRoot?: string } = {}) {
  const dataRoot = path.resolve(options.dataRoot ?? path.join(root, "public/data"));
  const slicesDirectory = path.resolve(options.slicesDirectory ?? path.join(dataRoot, "modern-correspondence"));
  const originalPath = path.join(dataRoot, "modern-correspondence.json");
  const [originalBytes, manifestBytes, boundaries, song] = await Promise.all([
    readFile(originalPath),
    readFile(path.join(slicesDirectory, "manifest.json")),
    readJson<BoundaryManifest>(path.join(dataRoot, "boundaries/manifest.json")),
    readJson<SongBoundaryResearchDocument>(path.join(dataRoot, "song-boundary-research.json")),
  ]);
  const original: ModernCorrespondenceSpatialData = JSON.parse(originalBytes.toString("utf8"));
  const manifest: ModernCorrespondenceSliceManifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.deepEqual(manifest.datasets.map(dataset => dataset.id), boundaries.datasets.map(dataset => dataset.id));
  const combined: ModernCorrespondenceSpatialData["entries"] = {};
  const measurements = [];
  let labels = 0;
  let modernNames = 0;
  let comparisonLayers = 0;
  let queries = 0;
  let searchResultIds = 0;
  for (const dataset of boundaries.datasets) {
    const descriptor = manifest.datasets.find(item => item.id === dataset.id)!;
    assert.equal(descriptor.url, `/data/modern-correspondence/${dataset.id}.json`);
    const sliceBytes = await readFile(path.join(slicesDirectory, `${dataset.id}.json`));
    const slice: ModernCorrespondenceSlice = JSON.parse(sliceBytes.toString("utf8"));
    const restored = decodeModernCorrespondenceSlice(manifest, slice, dataset.id);
    const expectedEntries = Object.fromEntries(Object.entries(original.entries).filter(([, entry]) => entry.historicalDatasetId === dataset.id));
    assert.deepEqual(restored, { ...original, entries: expectedEntries }, `${dataset.id}: full correspondence objects changed`);
    assert.deepEqual(Object.keys(restored.entries), Object.keys(expectedEntries), `${dataset.id}: entry order changed`);
    assert.ok(sliceBytes.length + manifestBytes.length < 1_000_000, `${dataset.id}: slice plus manifest must be below 1 MB`);
    const beforeSearch: { id: string; key: string }[] = [];
    const afterSearch: { id: string; key: string }[] = [];
    const datasetQueries = new Set(["", "长安", "長安", "西安", "  西安  ", "００", "于潜", "於潛", "__无匹配检索__"]);
    for (const layer of dataset.layers) {
      assert.ok(layer.url.startsWith("/data/"));
      const regions = await readJson<ComparisonRegions>(path.join(dataRoot, layer.url.slice("/data/".length)));
      assert.deepEqual(
        localizeComparisonRegions(regions, original, song),
        localizeComparisonRegions(regions, restored, song),
        `${layer.id}: comparison display changed`,
      );
      comparisonLayers += 1;
      for (const feature of regions.features) {
        const properties = feature.properties;
        const previous = displayRecord(properties, original, song);
        const next = displayRecord(properties, restored, song);
        assert.deepEqual(next, previous, `${properties.id}: map label, modern names or search key changed`);
        const entry = original.entries[properties.id];
        assert.ok(entry && restored.entries[properties.id], `${properties.id}: missing correspondence`);
        beforeSearch.push({ id: properties.id, key: previous.searchKey });
        afterSearch.push({ id: properties.id, key: next.searchKey });
        for (const query of [entry.historicalName, entry.simplifiedName, previous.name, previous.originalName, ...entry.modernNames, ...previous.modernNames]) {
          datasetQueries.add(query);
        }
        labels += 1;
        modernNames += previous.modernNames.length;
      }
    }
    assert.deepEqual(beforeSearch.map(row => row.id), Object.keys(expectedEntries), `${dataset.id}: feature order changed`);
    for (const query of datasetQueries) {
      const normalized = boundarySearchKey(query);
      const beforeIds = normalized ? beforeSearch.filter(row => row.key.includes(normalized)).map(row => row.id) : [];
      const afterIds = normalized ? afterSearch.filter(row => row.key.includes(normalized)).map(row => row.id) : [];
      assert.deepEqual(afterIds, beforeIds, `${dataset.id}: search results or order changed for ${JSON.stringify(query)}`);
      assert.deepEqual(afterIds.slice(0, 20), beforeIds.slice(0, 20), `${dataset.id}: visible search results changed`);
      queries += 1;
      searchResultIds += beforeIds.length;
    }
    for (const [id, entry] of Object.entries(restored.entries)) {
      assert.ok(!Object.hasOwn(combined, id), `Duplicate correspondence ID: ${id}`);
      combined[id] = entry;
    }
    measurements.push({
      datasetId: dataset.id,
      entryCount: descriptor.entryCount,
      rawBytes: sliceBytes.length,
      rawBytesWithManifest: sliceBytes.length + manifestBytes.length,
      queryCount: datasetQueries.size,
      sha256: digest(sliceBytes),
    });
  }
  assert.deepEqual(combined, original.entries);
  assert.deepEqual(Object.keys(combined), Object.keys(original.entries));
  assert.equal(labels, Object.keys(original.entries).length);
  assert.equal(digest(await readFile(originalPath)), digest(originalBytes), "Retained correspondence file changed during verification");
  return {
    sourceSha256: digest(originalBytes),
    sourceBytes: originalBytes.length,
    manifestBytes: manifestBytes.length,
    entries: Object.keys(combined).length,
    labels,
    modernNames,
    comparisonLayers,
    queries,
    searchResultIds,
    datasets: measurements,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    "slices-dir": { type: "string" },
    "data-root": { type: "string" },
    report: { type: "string" },
  } });
  const report = await verifyModernCorrespondenceSlices({ slicesDirectory: values["slices-dir"], dataRoot: values["data-root"] });
  const output = JSON.stringify(report, null, 2) + "\n";
  if (values.report) {
    const filename = path.resolve(values.report);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, output);
  }
  console.log(output.trimEnd());
}
