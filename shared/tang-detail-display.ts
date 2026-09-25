import type { TangDetailCollection, TangDetailProperties } from "./tang-detail";
import { lineOutsideBounds, lowerYellowRiverMask, type MapBounds } from "./historical-rivers";
import { resolveMapDetailLevel, type MapViewLevel } from "./map-detail-levels";

export function boundsOverlap(a: MapBounds, b: MapBounds) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
export function showTangDetail(properties: TangDetailProperties, zoom: number, mode: "cities" | "nature" | "both", level: MapViewLevel) {
  if (zoom < properties.minZoom) return false;
  if (properties.kind !== "settlement") return mode !== "cities";
  return mode !== "nature" && resolveMapDetailLevel(level, zoom).showCities;
}
export function isModernYellowRiver(properties: TangDetailProperties) {
  const tags = properties.tags ?? {};
  const names = [properties.name, properties.nameEn, tags.name, tags["name:zh"], tags["name:en"], tags.alt_name, tags["alt_name:zh"]];
  return properties.modernReferenceOnly && names.some(value => value?.split(";").some(name => /^(黄河|黃河|yellowriver|huanghe)$/i.test(name.replace(/\s+/g, ""))));
}

export function replaceModernYellowGeometry(feature: TangDetailCollection["features"][number], replacing: boolean, associatedWaterIds: ReadonlySet<string>) {
  if (!replacing || !isModernYellowRiver(feature.properties) && !associatedWaterIds.has(feature.properties.id)) return feature;
  const geometry = feature.geometry;
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    const lines = (geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates).flatMap(line => lineOutsideBounds(line, [lowerYellowRiverMask]));
    if (!lines.length) return undefined;
    const coordinates = lines.flat();
    return { ...feature, properties: { ...feature.properties,
      labelCoordinates: coordinates[Math.floor(coordinates.length / 2)] as [number, number],
      bounds: [Math.min(...coordinates.map(p => p[0])), Math.min(...coordinates.map(p => p[1])), Math.max(...coordinates.map(p => p[0])), Math.max(...coordinates.map(p => p[1]))] as MapBounds,
    }, geometry: { type: "MultiLineString" as const, coordinates: lines } };
  }
  return boundsOverlap(feature.properties.bounds, lowerYellowRiverMask) ? undefined : feature;
}
