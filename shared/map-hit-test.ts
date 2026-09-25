import type { Map as MapInstance, MapGeoJSONFeature, PointLike } from "maplibre-gl";
import { canInteract, type MapInteractionMode, type MapTargetCategory } from "./map-interactions";

/** Every canvas listener asks this same arbiter, independent of listener order. */
const targets: { layer: string; category: MapTargetCategory }[] = [
  { layer: "historical-river-hit", category: "rivers" },
  { layer: "mountain-detail-line-hit", category: "mountains" },
  { layer: "mountain-detail-point-hit", category: "mountains" },
  { layer: "tang-detail-water", category: "rivers" },
  { layer: "tang-detail-hit", category: "rivers" },
  { layer: "tang-detail-peaks", category: "mountains" },
  { layer: "tang-detail-towns", category: "cities" },
  { layer: "mountain-shape-contour-hit", category: "mountains" },
  { layer: "mountain-selected-line", category: "mountains" },
  { layer: "physical-river-hit", category: "rivers" },
  { layer: "physical-lake-fill", category: "rivers" },
];
export const naturalMapHitLayers = targets.map(target => target.layer);
export function chooseNaturalMapHit(features: readonly MapGeoJSONFeature[], mode: MapInteractionMode) {
  for (const target of targets) {
    if (!canInteract(mode, target.category)) continue;
    const feature = features.find(item => item.layer.id === target.layer);
    if (feature) return feature;
  }
  return undefined;
}
export function findNaturalMapHit(map: MapInstance, point: PointLike, mode: MapInteractionMode) {
  const layers = targets.filter(target => canInteract(mode, target.category) && map.getLayer(target.layer)).map(target => target.layer);
  return layers.length ? chooseNaturalMapHit(map.queryRenderedFeatures(point, { layers }), mode) : undefined;
}
