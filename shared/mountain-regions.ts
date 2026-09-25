import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import type { PhysicalBounds, PhysicalFeatureCollection, PhysicalFeatureProperties } from "./physical-geography";

export type MountainRegionFeature = Feature<Polygon | MultiPolygon, PhysicalFeatureProperties>;
export const mountainRegionSourceId = "mountain-regions";
export const mountainRegionHitLayer = "mountain-region-hit";
export const mountainRegionShortcuts = [
  { id: "ne_10m_geography_regions_polys-431", label: "秦岭" },
  { id: "ne_10m_geography_regions_polys-429", label: "太行山" },
  { id: "ne_10m_geography_regions_polys-550", label: "祁连山" },
  { id: "ne_10m_geography_regions_polys-713", label: "天山" },
  { id: "ne_10m_geography_regions_polys-553", label: "大别山" },
] as const;
export const majorMountainRegionIds: string[] = [
  ...mountainRegionShortcuts.map(item => item.id),
  "ne_10m_geography_regions_polys-673", // 昆仑山
  "ne_10m_geography_regions_polys-716", // 喜马拉雅山
  "ne_10m_geography_regions_polys-666", // 大兴安岭
];

/** Preserve original naming polygons. They are a cartographic distribution
 * reference, not surveyed boundaries, query rectangles, or point buffers. */
export function mountainRegionFeatures(data: PhysicalFeatureCollection): MountainRegionFeature[] {
  return data.features.filter((feature): feature is MountainRegionFeature => feature.properties.kind === "mountain" && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"));
}

export function mountainRegionLabelMinZoom(groupId: string, sourceMinZoom: number): number {
  return majorMountainRegionIds.includes(groupId) ? 2.8 : Math.min(sourceMinZoom, 4.8);
}

function inRing(point: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index], b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function insideMountainRegion(point: Position, geometry: Polygon | MultiPolygon): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(ring => inRing(point, ring)));
}

/** Find a label inside the actual source polygon AND the viewport, keeping
 * disconnected components and holes separate. Only label placement changes. */
export function visibleMountainRegionLabelPoint(geometry: Polygon | MultiPolygon, viewport: PhysicalBounds, preferred?: [number, number]): [number, number] | undefined {
  const [west, south, east, north] = viewport;
  if (!(west < east && south < north)) return undefined;
  if (preferred && preferred[0] >= west && preferred[0] <= east && preferred[1] >= south && preferred[1] <= north && insideMountainRegion(preferred, geometry)) return preferred;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: { point: [number, number]; score: number } | undefined;
  for (const polygon of polygons) {
    const lower = Math.max(south, Math.min(...polygon[0].map(point => point[1])));
    const upper = Math.min(north, Math.max(...polygon[0].map(point => point[1])));
    if (lower >= upper) continue;
    for (let step = 1; step < 10; step++) {
      const latitude = lower + (upper - lower) * step / 10;
      const crossings: number[] = [];
      for (const ring of polygon) for (let index = 1; index < ring.length; index++) {
        const a = ring[index - 1], b = ring[index];
        if ((a[1] <= latitude && b[1] > latitude) || (b[1] <= latitude && a[1] > latitude)) crossings.push(a[0] + (latitude - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      crossings.sort((a, b) => a - b);
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const left = Math.max(west, crossings[index]), right = Math.min(east, crossings[index + 1]);
        if (right - left <= 1e-9) continue;
        const point: [number, number] = [(left + right) / 2, latitude];
        const score = (right - left) / (east - west) - Math.abs(latitude - (south + north) / 2) / (north - south) * .15;
        if ((!best || score > best.score) && insideMountainRegion(point, geometry)) best = { point, score };
      }
    }
  }
  return best?.point;
}
