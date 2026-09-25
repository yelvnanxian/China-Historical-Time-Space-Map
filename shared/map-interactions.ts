import type { PhysicalFeatureCollection } from "./physical-geography";

export type MapInteractionMode = "cities" | "mountains" | "rivers" | "all";
export type MapTargetCategory = Exclude<MapInteractionMode, "all">;
export const mapInteractionOptions: { value: MapInteractionMode; label: string }[] = [
  { value: "cities", label: "城池" }, { value: "mountains", label: "山川" },
  { value: "rivers", label: "河流" }, { value: "all", label: "全部" },
];
export function canInteract(mode: MapInteractionMode, category: MapTargetCategory) { return mode === "all" || mode === category; }
export function categoryForKind(kind: string): MapTargetCategory {
  return kind === "settlement" ? "cities" : ["mountain", "plateau", "peak", "saddle", "ridge", "arete", "cliff"].includes(kind) ? "mountains" : "rivers";
}

// Only real water geometry is a surface target. Mountain naming extents must
// never enter the render source, including transparent hit or selection layers.
export const physicalHitLayers = ["physical-river-hit", "physical-lake-fill"];
export function naturalSurfaceSelectionEnabled(mode: MapInteractionMode): boolean {
  return canInteract(mode, "rivers");
}
export function physicalWaterGeometry(collection: PhysicalFeatureCollection): PhysicalFeatureCollection {
  return { type: "FeatureCollection", features: collection.features.filter(feature =>
    feature.properties.kind === "river" || feature.properties.kind === "lake") };
}

export function isOptionalPhysicalLayerError(event: unknown): boolean {
  const sourceId = (event as { sourceId?: string } | null)?.sourceId;
  return sourceId?.startsWith("mountain-shape-") === true || ["mountain-shapes", "physical-interactive", "mountain-directions", "tang-detail", "tang-detail-selected", "mountain-detail", "mountain-detail-selected", "historical-river", "historical-river-compare"].includes(sourceId ?? "");
}
