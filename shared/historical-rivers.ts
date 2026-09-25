import type { FeatureCollection, LineString, MultiLineString, Position } from "geojson";
import type { PhysicalFeatureCollection } from "./physical-geography";

export type MapBounds = [number, number, number, number];
export interface WaterDetailReplacement { groupId: string; bounds: MapBounds }
export interface RiverEpoch {
  id: string; startYear: number; endYear: number; label: string; url: string;
  bounds: MapBounds; labelCoordinates: [number, number]; featureCount: number; vertexCount: number;
  sourceId: string; sourceTitle: string; sourceOwner: string; sourceUrl: string; sourceDescription: string;
  metadataPath: string; metadataSha256: string; snapshotPath: string; snapshotSha256: string; geometrySha256: string;
  geometryNote: string;
}
export interface RiverManifest { version: string; retrievedAt: string; epochs: RiverEpoch[]; dateRule: string; coverageNote: string; precisionNote: string }
export type RiverCollection = FeatureCollection<LineString | MultiLineString>;

export function riverEpochAtYear(epochs: readonly RiverEpoch[], year: number) {
  return epochs.find(epoch => year >= epoch.startYear && year < epoch.endYear);
}

/** The modern lower Yellow River starts east of the historical layer's western seam.
 * This is a display cut, never a newly reconstructed ancient connecting segment. */
export const lowerYellowRiverMask: MapBounds = [112.4472, 25, 125, 40];

function inside(point: Position, box: MapBounds) {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
}

/** Clip context lines out of replacement coverage, retaining original vertices elsewhere.
 * Intersections only cut existing segments; gaps must never be joined with new lines. */
export function lineOutsideBounds(line: Position[], boxes: readonly MapBounds[]): Position[][] {
  const result: Position[][] = [];
  let current: Position[] = [];
  const flush = () => { if (current.length > 1) result.push(current); current = []; };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const at = (t: number): Position => t === 0 ? a : t === 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const breaks = new Set([0, 1]);
    for (const box of boxes) {
      for (const [axis, edge] of [[0, box[0]], [0, box[2]], [1, box[1]], [1, box[3]]]) {
        const delta = b[axis] - a[axis];
        if (!delta) continue;
        const t = (edge - a[axis]) / delta;
        if (t > 0 && t < 1) breaks.add(t);
      }
    }
    const times = [...breaks].sort((x, y) => x - y);
    for (let j = 1; j < times.length; j++) {
      const start = times[j - 1], end = times[j];
      if (boxes.some(box => inside(at((start + end) / 2), box))) { flush(); continue; }
      const p = at(start), q = at(end);
      const last = current.at(-1);
      if (!last || last[0] !== p[0] || last[1] !== p[1]) { flush(); current.push(p); }
      current.push(q);
    }
  }
  flush();
  return result;
}

export function contextWaterGeometry(data: PhysicalFeatureCollection, replaceYellowLower: boolean, detailBounds: readonly MapBounds[], replacements: readonly WaterDetailReplacement[] = []): PhysicalFeatureCollection {
  return { type: "FeatureCollection", features: data.features.flatMap(feature => {
    const { geometry, properties } = feature;
    if (properties.kind !== "river" && properties.kind !== "lake") return [];
    const boxes = [...detailBounds, ...replacements.filter(item => item.groupId === properties.groupId).map(item => item.bounds), ...(replaceYellowLower && properties.groupId === "river-huanghe" ? [lowerYellowRiverMask] : [])];
    if (!boxes.length) return [feature];
    if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
      const lines = (geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates).flatMap(line => lineOutsideBounds(line, boxes));
      return lines.length ? [{ ...feature, geometry: { type: "MultiLineString" as const, coordinates: lines } }] : [];
    }
    // Coarse lakes wholly covered by a loaded detail region are replaced by its actual water polygons.
    if (boxes.some(box => inside([properties.bounds[0], properties.bounds[1]], box) && inside([properties.bounds[2], properties.bounds[3]], box))) return [];
    return [feature];
  }) };
}
