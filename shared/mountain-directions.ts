import type { FeatureCollection, LineString, MultiLineString } from "geojson";

/** Cartographic direction inferred from a naming polygon, never a surveyed ridge. */
export interface MountainDirectionProperties {
  id: string;
  groupId: string;
  name: string;
  kind: "mountain";
  labelCoordinates: [number, number];
  bounds: [number, number, number, number];
  geometryNote: string;
  method: string;
  sourceUrl: string;
  sourceDataset: string;
  sourcePolygonId: string;
  sourceFeatureIndices: number[];
  schematic: true;
  minZoom: number;
}

export type MountainDirectionCollection = FeatureCollection<LineString | MultiLineString, MountainDirectionProperties>;

export interface MountainDirectionAvailability {
  groupId: string;
  name: string;
  status: "available" | "label-only";
  reason: string;
}
