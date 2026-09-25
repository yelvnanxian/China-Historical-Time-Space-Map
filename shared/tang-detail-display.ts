import type { TangDetailCollection, TangDetailProperties } from "./tang-detail";
import { lineOutsideBounds, lowerYellowRiverMask, type MapBounds } from "./historical-rivers";
import { resolveMapDetailLevel, type MapViewLevel } from "./map-detail-levels";
import { canInteract, categoryForKind, type MapInteractionMode } from "./map-interactions";
import type { PhysicalGroup } from "./physical-geography";
import type { WaterDetailReplacement } from "./historical-rivers";

export function boundsOverlap(a: MapBounds, b: MapBounds) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
export function showTangDetail(properties: TangDetailProperties, zoom: number, _mode: MapInteractionMode, level: MapViewLevel = "auto") {
  if (zoom < properties.minZoom) return false;
  if (properties.kind !== "settlement") return true;
  return resolveMapDetailLevel(level, zoom).showCities;
}
export function canSelectTangDetail(properties: TangDetailProperties, mode: MapInteractionMode) { return canInteract(mode, categoryForKind(properties.kind)); }
export function waterDisplayClass(properties: TangDetailProperties) {
  const tags = properties.tags ?? {};
  if (tags.location === "underground" || tags.canal === "qanat" || ["yes", "culvert", "flooded", "building_passage", "covered", "pipe", "passage"].includes(tags.tunnel ?? "") || tags.covered === "yes") return "underground";
  if (Boolean(tags.intermittent && tags.intermittent !== "no") || Boolean(tags.seasonal && tags.seasonal !== "no") || tags.status === "abandoned" || tags.disused === "yes" || tags.abandoned === "yes") return "seasonal";
  return "surface";
}

/** A query's bounding box is not proof that every river has replacement data. */
export function waterDetailReplacements(features: TangDetailCollection["features"], groups: readonly PhysicalGroup[]): WaterDetailReplacement[] {
  const names = new Map<string, PhysicalGroup[]>();
  for (const group of groups) {
    if (group.kind !== "river" || group.groupId === "river-huanghe") continue;
    for (const name of new Set([group.name, ...group.aliases])) {
      if (!/\p{Script=Han}/u.test(name) || /未命名|未定名/.test(name)) continue;
      names.set(name.trim(), [...names.get(name.trim()) ?? [], group]);
    }
  }
  const result = new Map<string, WaterDetailReplacement>();
  for (const feature of features) {
    const p = feature.properties;
    if (p.kind !== "river" || waterDisplayClass(p) !== "surface" || !["LineString", "MultiLineString"].includes(feature.geometry.type)) continue;
    for (const group of names.get(p.name.trim()) ?? []) {
      if (!boundsOverlap(group.bounds, p.bounds)) continue;
      const item = { groupId: group.groupId, bounds: p.bounds };
      result.set(`${group.groupId}:${p.bounds.join(",")}`, item);
    }
  }
  return [...result.values()];
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
