export interface ModernRegionCorrespondence {
  historicalName: string;
  simplifiedName: string;
  modernNames: string[];
  method: "representative-point";
  note: string;
  sourceIds: string[];
}

export interface ModernCorrespondenceData {
  version: string;
  sources: { id: string; title: string; url: string; note: string }[];
  entries: Record<string, ModernRegionCorrespondence>;
}

export interface ModernCorrespondenceRegion {
  name: string;
  level: string;
  sourceId: string;
  sourceFeatureIndex: number;
  sourceRecordId: string | null;
  referenceYear?: number;
  relation?: string;
  sourceType?: string;
}

export interface ModernCorrespondenceSpatialEntry extends ModernRegionCorrespondence {
  matchStatus: "matched" | "unmatched";
  matchLevel: string;
  representativeCoordinates: [number, number] | null;
  historicalYear: number;
  historicalDatasetId: string;
  historicalLayerId: string;
  referenceYears: number[];
  modernRegions: ModernCorrespondenceRegion[];
  unmatchedReason?: string;
}

export interface ModernCorrespondenceSpatialData extends ModernCorrespondenceData {
  coordinateSystem: string;
  statistics: Record<string, unknown>;
  entries: Record<string, ModernCorrespondenceSpatialEntry>;
}

export interface ModernCorrespondenceSliceDescriptor {
  id: string;
  year: number;
  url: string;
  entryCount: number;
}

export interface ModernCorrespondenceSliceManifest extends Omit<ModernCorrespondenceSpatialData, "entries"> {
  schemaVersion: 1;
  notes: string[];
  sourceIdSets: string[][];
  datasets: ModernCorrespondenceSliceDescriptor[];
}

export interface ModernCorrespondenceSliceEntry extends Omit<ModernCorrespondenceSpatialEntry,
  "note" | "sourceIds" | "modernRegions" | "historicalDatasetId" | "historicalYear" | "method"> {
  noteRef: number;
  sourceIdsRef: number;
  modernRegionsRef: number;
}

export interface ModernCorrespondenceSlice {
  schemaVersion: 1;
  datasetId: string;
  year: number;
  method: "representative-point";
  modernRegionSets: ModernCorrespondenceRegion[][];
  entries: Record<string, ModernCorrespondenceSliceEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function dictionaryValue<Value>(values: Value[], index: number, field: string): Value {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new Error(`Invalid modern correspondence ${field} reference: ${index}`);
  }
  return values[index];
}

export function decodeModernCorrespondenceSlice(
  manifest: ModernCorrespondenceSliceManifest,
  slice: ModernCorrespondenceSlice,
  expectedDatasetId?: string,
): ModernCorrespondenceSpatialData {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 || typeof manifest.version !== "string"
    || typeof manifest.coordinateSystem !== "string" || !isRecord(manifest.statistics)
    || !Array.isArray(manifest.sources) || !isStringArray(manifest.notes)
    || !Array.isArray(manifest.sourceIdSets) || !manifest.sourceIdSets.every(isStringArray)
    || !Array.isArray(manifest.datasets)) {
    throw new Error("Invalid modern correspondence slice manifest");
  }
  const sourceIds = new Set<string>();
  for (const source of manifest.sources) {
    if (!isRecord(source) || ![source.id, source.title, source.url, source.note].every(value => typeof value === "string")
      || sourceIds.has(source.id)) throw new Error("Invalid modern correspondence source");
    sourceIds.add(source.id);
  }
  if (manifest.sourceIdSets.some(group => group.some(id => !sourceIds.has(id)))) {
    throw new Error("Unknown modern correspondence source reference");
  }
  const datasetIds = new Set<string>();
  for (const descriptor of manifest.datasets) {
    if (!isRecord(descriptor) || typeof descriptor.id !== "string" || typeof descriptor.url !== "string"
      || !Number.isFinite(descriptor.year) || !Number.isInteger(descriptor.entryCount) || descriptor.entryCount < 0
      || datasetIds.has(descriptor.id)) throw new Error("Invalid modern correspondence dataset descriptor");
    datasetIds.add(descriptor.id);
  }
  if (!isRecord(slice) || slice.schemaVersion !== 1 || slice.method !== "representative-point"
    || !Array.isArray(slice.modernRegionSets) || !isRecord(slice.entries)) {
    throw new Error("Invalid modern correspondence slice");
  }
  const descriptor = manifest.datasets.find(dataset => dataset.id === slice.datasetId);
  if (!descriptor || descriptor.year !== slice.year || (expectedDatasetId !== undefined && expectedDatasetId !== slice.datasetId)
    || Object.keys(slice.entries).length !== descriptor.entryCount) {
    throw new Error("Modern correspondence slice does not match the requested dataset");
  }
  for (const regions of slice.modernRegionSets) {
    if (!Array.isArray(regions) || regions.some(region => !isRecord(region) || typeof region.name !== "string"
      || typeof region.level !== "string" || !sourceIds.has(region.sourceId)
      || !Number.isInteger(region.sourceFeatureIndex))) {
      throw new Error("Invalid modern correspondence region dictionary");
    }
  }
  const entries = Object.fromEntries(Object.entries(slice.entries).map(([id, entry]) => {
    if (!isRecord(entry) || typeof entry.historicalName !== "string" || typeof entry.simplifiedName !== "string"
      || !isStringArray(entry.modernNames) || typeof entry.historicalLayerId !== "string"
      || !Array.isArray(entry.referenceYears) || !entry.referenceYears.every(Number.isFinite)
      || !["matched", "unmatched"].includes(entry.matchStatus) || typeof entry.matchLevel !== "string"
      || ["note", "sourceIds", "modernRegions", "historicalDatasetId", "historicalYear", "method"].some(key => key in entry)) {
      throw new Error(`Invalid modern correspondence entry: ${id}`);
    }
    const { noteRef, sourceIdsRef, modernRegionsRef, ...properties } = entry;
    const restored: ModernCorrespondenceSpatialEntry = {
      ...properties,
      historicalDatasetId: slice.datasetId,
      historicalYear: slice.year,
      method: slice.method,
      note: dictionaryValue(manifest.notes, noteRef, "note"),
      sourceIds: [...dictionaryValue(manifest.sourceIdSets, sourceIdsRef, "sources")],
      modernRegions: dictionaryValue(slice.modernRegionSets, modernRegionsRef, "regions").map(region => ({ ...region })),
    };
    return [id, restored];
  }));
  const { schemaVersion, notes, sourceIdSets, datasets, ...metadata } = manifest;
  return { ...metadata, entries };
}
