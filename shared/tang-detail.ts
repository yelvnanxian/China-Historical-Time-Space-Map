import type { FeatureCollection, Geometry } from "geojson";

export type TangDetailBounds = [number, number, number, number];
export type TangDetailKind = "settlement" | "river" | "stream" | "canal" | "water" | "peak" | "saddle";

export interface TangDetailProperties {
  id: string;
  name: string;
  nameEn: string;
  kind: TangDetailKind;
  subtype: string;
  sourceId: string;
  sourceDataset: string;
  sourceUrl: string;
  modernReferenceOnly: boolean;
  geometryNote: string;
  minZoom: number;
  bounds: TangDetailBounds;
  labelCoordinates: [number, number];
  year?: number;
  level?: "county" | "prefecture";
  sourceRecordId?: string;
  beginYear?: number;
  endYear?: number;
  beginRule?: string;
  endRule?: string;
  presentLocation?: string;
  /** Original source fields; historical source characters remain untouched. */
  sourceRecord?: Record<string, string | number | null>;
  osmType?: "node" | "way" | "relation";
  osmId?: number;
  tags?: Record<string, string>;
}

export type TangDetailCollection = FeatureCollection<Geometry, TangDetailProperties>;

export interface TangDetailSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  snapshotPath: string;
  snapshotSha256: string;
  license: string;
  attribution: string;
  note: string;
}

export interface TangDetailRegion {
  id: string;
  name: string;
  bounds: TangDetailBounds;
  url: string;
  featureCount: number;
  countsByKind: Partial<Record<TangDetailKind, number>>;
  minZoom: number;
  sourceId: string;
  regionId: string;
}

export interface TangDetailManifest {
  version: string;
  historical: {
    year: number;
    url: string;
    featureCount: number;
    countyCount: number;
    prefectureCount: number;
    withheldCount: number;
    note: string;
  };
  modernRegions: TangDetailRegion[];
  /** Original query boxes; package bounds alone are not coverage claims. */
  modernCoverageRegions: {
    id: string;
    name: string;
    bounds: TangDetailBounds;
    /** Every intersecting zoom-8 pack, including objects deduplicated into another region. */
    packageIds: string[];
    minZoom: 8;
  }[];
  sources: TangDetailSource[];
}

export const tangDetailKindNames: Record<TangDetailKind, string> = {
  settlement: "历史治所", river: "河流", stream: "溪流", canal: "运河与水渠", water: "水面", peak: "山峰", saddle: "山口",
};
