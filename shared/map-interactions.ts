import type { PhysicalFeatureCollection } from "./physical-geography";

export type MapDisplayMode = "cities" | "nature" | "both";

// Only real water geometry is a surface target. Mountain naming extents must
// never enter the render source, including transparent hit or selection layers.
export const physicalHitLayers = ["physical-river-hit", "physical-lake-fill"];
export function naturalSurfaceSelectionEnabled(mode: MapDisplayMode): boolean {
  return mode === "nature";
}
export function physicalWaterGeometry(collection: PhysicalFeatureCollection): PhysicalFeatureCollection {
  return { type: "FeatureCollection", features: collection.features.filter(feature =>
    feature.properties.kind === "river" || feature.properties.kind === "lake") };
}

export function isOptionalPhysicalLayerError(event: unknown): boolean {
  const sourceId = (event as { sourceId?: string } | null)?.sourceId;
  return sourceId === "physical-interactive" || sourceId === "mountain-directions";
}
