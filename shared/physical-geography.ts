import type { Feature, FeatureCollection, LineString, MultiLineString, Polygon, MultiPolygon } from "geojson";

export type PhysicalKind = "river" | "lake" | "mountain" | "sea" | "plateau";
export type PhysicalBounds = [number, number, number, number];
export type PhysicalCoordinate = [number, number];

export interface PhysicalFeatureProperties {
  id: string;
  groupId: string;
  name: string;
  nameEn: string;
  kind: PhysicalKind;
  sourceDataset: string;
  sourceUrl: string;
  sourceFeatureIndices: number[];
  sourceId: number | string;
  sourceName: string | null;
  nameOrigin: string;
  geometryNote: string;
  bounds: PhysicalBounds;
  labelCoordinates: PhysicalCoordinate;
  minZoom: number;
  /** Natural Earth's modern, cartographically generalized context. */
  modernBackgroundOnly: true;
}

export type PhysicalGeometry = LineString | MultiLineString | Polygon | MultiPolygon;
export type PhysicalFeature = Feature<PhysicalGeometry, PhysicalFeatureProperties>;
export type PhysicalFeatureCollection = FeatureCollection<PhysicalGeometry, PhysicalFeatureProperties>;

/** One searchable item; every associated feature highlights together. */
export interface PhysicalGroup {
  id: string;
  groupId: string;
  name: string;
  nameEn: string;
  kind: PhysicalKind;
  featureIds: string[];
  bounds: PhysicalBounds;
  labelCoordinates: PhysicalCoordinate;
  minZoom: number;
  sourceDataset: string;
  sourceUrl: string;
  geometryNote: string;
  aliases: string[];
}

export interface PhysicalInteractionIndex {
  version: string;
  geometryUrl: string;
  sourceManifestUrl: string;
  groups: PhysicalGroup[];
}

export const physicalKindNames: Record<PhysicalKind, string> = {
  river: "河流", lake: "湖泊", mountain: "山系", sea: "海域", plateau: "高原",
};
