import type { Feature, LineString, Point, Position } from "geojson";
import type { MountainDetailProperties } from "./mountain-detail";

export type MountainSelectionFeature = Feature<LineString | Point, MountainDetailProperties>;
const radians = Math.PI / 180;
const earthRadiusKm = 6371.0088;

function angularDistance(a: Position, b: Position): number {
  const latA = a[1] * radians, latB = b[1] * radians;
  const value = Math.sin((latB - latA) / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

function bearing(a: Position, b: Position): number {
  const latA = a[1] * radians, latB = b[1] * radians, longitude = (b[0] - a[0]) * radians;
  return Math.atan2(Math.sin(longitude) * Math.cos(latB), Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(longitude));
}

/** Shortest horizontal distance to the source segments, including their ends. */
export function pointToMountainLineDistanceKm(point: Position, line: readonly Position[]): number {
  if (line.length < 2) return Infinity;
  let shortest = Infinity;
  for (let index = 1; index < line.length; index++) {
    const a = line[index - 1], b = line[index];
    const segment = angularDistance(a, b), fromA = angularDistance(a, point);
    let distance = Math.min(fromA, angularDistance(b, point));
    if (segment > 1e-12 && segment < Math.PI - 1e-12) {
      const difference = bearing(a, point) - bearing(a, b);
      const along = Math.atan2(Math.sin(fromA) * Math.cos(difference), Math.cos(fromA));
      if (along >= 0 && along <= segment) {
        distance = Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(fromA) * Math.sin(difference)))));
      }
    }
    shortest = Math.min(shortest, distance * earthRadiusKm);
  }
  return shortest;
}

/** Proximity only: nearby records do not establish membership of a mountain range. */
export function nearbyMountainRidges(peak: MountainSelectionFeature | undefined, loaded: readonly MountainSelectionFeature[]) {
  if (peak?.geometry.type !== "Point" || peak.properties.kind !== "peak") return [];
  const unique = new Map<string, { feature: MountainSelectionFeature; distanceKm: number }>();
  for (const feature of loaded) {
    if (feature.geometry.type !== "LineString" || feature.properties.kind !== "ridge" || unique.has(feature.properties.id)) continue;
    const distanceKm = pointToMountainLineDistanceKm(peak.geometry.coordinates, feature.geometry.coordinates);
    if (distanceKm <= 10) unique.set(feature.properties.id, { feature, distanceKm });
  }
  return [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm || a.feature.properties.id.localeCompare(b.feature.properties.id)).slice(0, 3);
}

/** Canvas/label selection only moves a distant peak into view. An explicit
 * focus action also recenters a close peak or frames a complete source line. */
export function mountainSelectionFocus(feature: MountainSelectionFeature, currentZoom: number, explicit = false): { points: [number, number][]; maxZoom: number } | undefined {
  if (feature.geometry.type === "Point") {
    if (!explicit && currentZoom >= 10.5) return undefined;
    const [longitude, latitude] = feature.geometry.coordinates;
    return { points: [[longitude, latitude]], maxZoom: 11 };
  }
  if (!explicit) return undefined;
  const [west, south, east, north] = feature.properties.bounds;
  return { points: [[west, south], [east, north]], maxZoom: Math.max(10, feature.properties.minZoom + 1) };
}
