import {
  decodeModernCorrespondenceSlice,
  type ModernCorrespondenceSlice,
  type ModernCorrespondenceSliceManifest,
  type ModernCorrespondenceSpatialData,
} from "../../shared/modern-correspondence";
import { evictJson, loadJson } from "./load-json";

const manifestUrl = "/data/modern-correspondence/manifest.json";
const decodedByManifest = new WeakMap<ModernCorrespondenceSliceManifest, WeakMap<ModernCorrespondenceSlice, ModernCorrespondenceSpatialData>>();
const datasetPattern = /^[a-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function validateManifest(value: ModernCorrespondenceSliceManifest): void {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.version !== "string"
    || typeof value.coordinateSystem !== "string" || !isRecord(value.statistics)
    || !Array.isArray(value.sources) || !isStringArray(value.notes)
    || !Array.isArray(value.sourceIdSets) || !value.sourceIdSets.every(isStringArray)
    || !Array.isArray(value.datasets)) {
    throw new Error("Invalid modern correspondence slice manifest");
  }
  const sources = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source) || ![source.id, source.title, source.url, source.note].every(item => typeof item === "string")
      || sources.has(source.id)) throw new Error("Invalid modern correspondence manifest source");
    sources.add(source.id);
  }
  if (value.sourceIdSets.some(group => group.some(id => !sources.has(id)))) {
    throw new Error("Invalid modern correspondence manifest source reference");
  }
  const datasets = new Set<string>();
  for (const descriptor of value.datasets) {
    if (!isRecord(descriptor) || typeof descriptor.id !== "string" || !datasetPattern.test(descriptor.id)
      || descriptor.url !== `/data/modern-correspondence/${descriptor.id}.json`
      || !Number.isFinite(descriptor.year) || !Number.isInteger(descriptor.entryCount) || descriptor.entryCount < 0
      || datasets.has(descriptor.id)) {
      throw new Error("Invalid modern correspondence manifest dataset descriptor");
    }
    datasets.add(descriptor.id);
  }
}

export async function loadModernCorrespondence(
  datasetId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ModernCorrespondenceSpatialData> {
  options.signal?.throwIfAborted();
  if (!datasetPattern.test(datasetId)) throw new Error("Invalid modern correspondence dataset ID");
  const manifestRequest = loadJson<ModernCorrespondenceSliceManifest>(manifestUrl);
  const manifest = await (options.signal ? loadJson<ModernCorrespondenceSliceManifest>(manifestUrl, options) : manifestRequest);
  options.signal?.throwIfAborted();
  try {
    validateManifest(manifest);
  } catch (error) {
    evictJson(manifestUrl, manifestRequest);
    throw error;
  }
  const descriptor = manifest.datasets.find(dataset => dataset.id === datasetId);
  if (!descriptor) {
    evictJson(manifestUrl, manifestRequest);
    throw new Error(`Unknown modern correspondence dataset: ${datasetId}`);
  }
  const sliceRequest = loadJson<ModernCorrespondenceSlice>(descriptor.url);
  const slice = await (options.signal ? loadJson<ModernCorrespondenceSlice>(descriptor.url, options) : sliceRequest);
  options.signal?.throwIfAborted();
  let decodedSlices = decodedByManifest.get(manifest);
  const cached = decodedSlices?.get(slice);
  if (cached && slice.datasetId === datasetId) return cached;
  try {
    const decoded = decodeModernCorrespondenceSlice(manifest, slice, datasetId);
    if (!decodedSlices) {
      decodedSlices = new WeakMap();
      decodedByManifest.set(manifest, decodedSlices);
    }
    decodedSlices.set(slice, decoded);
    return decoded;
  } catch (error) {
    evictJson(descriptor.url, sliceRequest);
    evictJson(manifestUrl, manifestRequest);
    throw error;
  }
}

export function evictModernCorrespondence(datasetId: string): void {
  evictJson(manifestUrl);
  if (datasetPattern.test(datasetId)) evictJson(`/data/modern-correspondence/${datasetId}.json`);
}
