import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BoundaryDataset, BoundaryLayer, BoundarySelection } from "../../shared/boundaries";
import { boundaryIndexUrl, type BoundaryIndex } from "../../shared/boundary-index";
import { evictJson, loadJson } from "./load-json";

export type BoundaryRegions = FeatureCollection<Polygon | MultiPolygon, BoundarySelection & {
  labelCoordinates?: [number, number];
  color?: string;
}>;

const consumers = new Map<string, number>();

export function retainBoundaryDataset(dataset: BoundaryDataset): () => void {
  const urls = [boundaryIndexUrl(dataset.id), ...dataset.layers.map(layer => layer.url)];
  for (const url of urls) consumers.set(url, (consumers.get(url) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const url of urls) {
      const remaining = (consumers.get(url) ?? 1) - 1;
      if (remaining > 0) consumers.set(url, remaining);
      else { consumers.delete(url); evictJson(url); }
    }
  };
}

export async function loadBoundaryLayer(layer: BoundaryLayer, options: { signal?: AbortSignal } = {}): Promise<BoundaryRegions> {
  options.signal?.throwIfAborted();
  const request = loadJson<BoundaryRegions>(layer.url);
  const data = await (options.signal ? loadJson<BoundaryRegions>(layer.url, options) : request);
  options.signal?.throwIfAborted();
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length !== layer.featureCount
    || data.features.some(feature => !feature?.properties?.id || feature.properties.level !== layer.level
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type))) {
    evictJson(layer.url, request);
    throw new Error("边界文件格式错误");
  }
  return data;
}

export async function loadBoundaryIndex(dataset: BoundaryDataset, options: { signal?: AbortSignal } = {}): Promise<BoundaryIndex> {
  options.signal?.throwIfAborted();
  const url = boundaryIndexUrl(dataset.id);
  const request = loadJson<BoundaryIndex>(url);
  const data = await (options.signal ? loadJson<BoundaryIndex>(url, options) : request);
  options.signal?.throwIfAborted();
  const valid = data?.datasetId === dataset.id && Array.isArray(data.entries)
    && data.entries.length === dataset.layers.reduce((count, layer) => count + layer.featureCount, 0)
    && data.entries.every(entry => entry && typeof entry.id === "string" && entry.id && typeof entry.sourceId === "string"
      && entry.sourceId && typeof entry.name === "string" && entry.year === dataset.year
      && dataset.layers.some(layer => layer.level === entry.level)
      && Array.isArray(entry.bbox) && entry.bbox.length === 4 && entry.bbox.every(Number.isFinite)
      && entry.bbox[0] <= entry.bbox[2] && entry.bbox[1] <= entry.bbox[3]
      && (entry.labelCoordinates === undefined || Array.isArray(entry.labelCoordinates)
        && entry.labelCoordinates.length === 2 && entry.labelCoordinates.every(Number.isFinite)))
    && new Set(data.entries.map(entry => entry.id)).size === data.entries.length;
  if (!valid) {
    evictJson(url, request);
    throw new Error("边界文件格式错误");
  }
  return data;
}
