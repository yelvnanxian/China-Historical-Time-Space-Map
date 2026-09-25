import type { FeatureCollection, LineString, Point } from "geojson";

export type MountainDetailKind = "ridge" | "arete" | "cliff" | "peak";
export type MountainDetailBounds = [number, number, number, number];
export const mountainDetailKindNames: Record<MountainDetailKind, string> = {
  ridge: "山脊", arete: "刃脊", cliff: "陡崖", peak: "山峰",
};
export const mountainDetailHitLayerIds = ["mountain-detail-line-hit", "mountain-detail-point-hit"] as const;

export interface MountainDetailProperties {
  id: string;
  name: string;
  originalName: string;
  hasChineseName: boolean;
  kind: MountainDetailKind;
  osmType: "node" | "way";
  osmId: number;
  osmVersion: number;
  sourceId: string;
  sourceUrl: string;
  modernReferenceOnly: true;
  geometryNote: string;
  bounds: MountainDetailBounds;
  labelCoordinates: [number, number];
  minZoom: number;
  /** Haversine sum of the source polyline; horizontal map length, not terrain length. */
  mappedLengthKm?: number;
  /** Only numeric metre tags; other raw elevation values remain in tags. */
  elevationMetres?: number;
  tags: Record<string, string>;
}
export type MountainDetailCollection = FeatureCollection<LineString | Point, MountainDetailProperties>;
export interface MountainDetailSource {
  id: string;
  regionId: string;
  title: string;
  url: string;
  retrievedAt: string;
  bounds: MountainDetailBounds;
  snapshotPath: string;
  snapshotSha256: string;
  uncompressedSnapshotSha256: string;
  queryPath: string;
  querySha256: string;
  osmBaseTimestamp: string;
  elementCount: number;
  license: string;
  attribution: string;
  modernReferenceOnly: true;
  note: string;
}
export interface MountainDetailManifest {
  version: string;
  acquisition: { complete: boolean; missingTiles: string[] };
  featureCount: number;
  namedChineseCount: number;
  countsByKind: Record<MountainDetailKind, number>;
  geometryNote: string;
  regions: {
    id: string;
    name: string;
    bounds: MountainDetailBounds;
    featureCount: number;
    countsByKind: Partial<Record<MountainDetailKind, number>>;
  }[];
  packs: {
    id: string;
    regionId: string;
    url: string;
    bounds: MountainDetailBounds;
    featureCount: number;
    minZoom: number;
  }[];
  sources: MountainDetailSource[];
}
