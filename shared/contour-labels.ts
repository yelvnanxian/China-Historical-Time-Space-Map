import type { Feature, LineString } from "geojson";
import type { MountainContourProperties } from "./mountain-shapes";

type Contour = Feature<LineString, Pick<MountainContourProperties, "id" | "areaId" | "elevation" | "index">>;
export interface ContourLabelBox { left: number; right: number; top: number; bottom: number }
export interface ContourLabelPlacement { feature: Contour; point: [number, number]; box: ContourLabelBox }

const collides = (a: ContourLabelBox, b: ContourLabelBox, x: number, y: number) =>
  a.left < b.right + x && a.right > b.left - x && a.top < b.bottom + y && a.bottom > b.top - y;
// Dyadic fractions retain the preferred middle/quarter anchors, then sample
// denser positions on long lines without interpolating their original geometry.
const anchorFractions = Array.from({ length: 6 }, (_, level) => {
  const denominator = 2 ** (level + 1);
  return Array.from({ length: denominator / 2 }, (_, i) => (2 * i + 1) / denominator);
}).flat().concat([0, 1]);

/** Spread a limited label budget across the visible elevation range first. */
function elevationOrder(values: number[]): number[] {
  const remaining = new Set(values);
  const chosen: number[] = [];
  if (values.length) {
    // Summit contours have the least room between peak names; reserve their
    // first usable anchor before giving the wider foothill contours a turn.
    const highest = values[values.length - 1];
    chosen.push(highest); remaining.delete(highest);
  }
  while (remaining.size) {
    // Farthest from an already represented height, with stable ties. This
    // prevents many low-elevation fragments from exhausting the label budget.
    const next = [...remaining].sort((a, b) =>
      Math.min(...chosen.map(value => Math.abs(b - value))) - Math.min(...chosen.map(value => Math.abs(a - value))) || a - b)[0];
    chosen.push(next); remaining.delete(next);
  }
  return chosen;
}

/** Labels only use existing visible line vertices; no midpoint interpolation. */
export function placeContourLabels(features: readonly Contour[], options: {
  contains: (point: [number, number]) => boolean;
  project: (point: [number, number]) => { x: number; y: number };
  width: number; height: number; occupied: readonly ContourLabelBox[];
}): ContourLabelPlacement[] {
  const byElevation = new Map<number, { feature: Contour; points: [number, number][] }[]>();
  for (const feature of features) {
    if (!feature.properties.index || !Number.isFinite(feature.properties.elevation)) continue;
    const points = feature.geometry.coordinates.filter(point => options.contains(point as [number, number])) as [number, number][];
    if (!points.length) continue;
    const candidates = byElevation.get(feature.properties.elevation) ?? [];
    candidates.push({ feature, points });
    byElevation.set(feature.properties.elevation, candidates);
  }
  for (const candidates of byElevation.values()) candidates.sort((a, b) => b.points.length - a.points.length || a.feature.properties.id.localeCompare(b.feature.properties.id));
  const elevations = elevationOrder([...byElevation.keys()].sort((a, b) => a - b));
  const placements: ContourLabelPlacement[] = [];
  let remaining = true;
  while (remaining && placements.length < 24) {
    remaining = false;
    for (const elevation of elevations) {
      const candidates = byElevation.get(elevation)!;
      while (candidates.length && placements.length < 24) {
        remaining = true;
        const { feature, points } = candidates.shift()!;
        const tried = new Set<number>();
        let placement: ContourLabelPlacement | undefined;
        for (const fraction of anchorFractions) {
          const index = Math.floor((points.length - 1) * fraction);
          if (tried.has(index)) continue;
          tried.add(index);
          const point = points[index], pixel = options.project(point);
          const halfWidth = Math.max(25, String(elevation).length * 3 + 10);
          const box = { left: pixel.x - halfWidth, right: pixel.x + halfWidth, top: pixel.y - 10, bottom: pixel.y + 10 };
          if (box.left < 0 || box.top < 0 || box.right > options.width || box.bottom > options.height) continue;
          // Names only need a small clear gap. Reusing the wider contour-label
          // spacing here can exclude nearly every upper slope in a peak cluster.
          if (options.occupied.some(other => collides(box, other, 4, 3)) || placements.some(other => collides(box, other.box, 28, 16))) continue;
          placement = { feature, point, box }; break;
        }
        if (!placement) continue;
        placements.push(placement);
        break; // Each visible height gets one chance before repeating a height.
      }
      if (placements.length >= 24) break;
    }
  }
  return placements;
}
