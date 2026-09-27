import type { FeatureCollection, Point } from "geojson";

/** Original CHGIS time-series seat points, not Hartwell polygon label points. */
export interface SongSettlementProperties {
  id: string;
  name: string;
  sourceName: string;
  level: "county" | "prefecture";
  /** Actual source administrative type; source file level is only a grouping. */
  subtype: string;
  year: 1200;
  sourceId: string;
  sourceRecordId: string;
  sourceRecordIndex: number;
  sourceUrl: string;
  beginYear: number;
  endYear: number;
  beginRule: string;
  endRule: string;
  beginRuleCode: string;
  endRuleCode: string;
  /** The intervals qualify these as candidates, not year-exact archaeological facts. */
  dateStatus: "specified-endpoints" | "broad-endpoints" | "incomplete-date-rules";
  dateCaution: string;
  presentLocation: string;
  geometryNote: string;
  coordinateStatus: "source-fields-consistent";
  originalCoordinates: [number, number];
  fieldCoordinates: [number, number];
  minZoom: number;
  sourceRecord: Record<string, string | number | null>;
  polityLabel?: "南宋" | "金";
  polityNote: string;
  /** Only individually reviewed documentary identities can populate these fields. */
  boundaryId?: string;
  boundaryName?: string;
  boundaryNote?: string;
  boundaryLinkBasis?: "reviewed-source-record-and-documentary-identity";
  boundaryPointStatus?: "inside" | "outside";
  researchEntryId?: string;
  catalogPlaceId?: string;
  /** Same text is never grounds to merge different source records. */
  sameNameRecordIds?: string[];
  sameNameNote?: string;
}

export type SongSettlementsCollection = FeatureCollection<Point, SongSettlementProperties>;

export interface SongSettlementSource {
  id: string;
  title: string;
  url: string;
  snapshotPath: string;
  snapshotSha256: string;
  metadataPath: string;
  metadataSha256: string;
  license: string;
  attribution: string;
  note: string;
}

export interface SongSettlementsManifest {
  version: string;
  periodId: "song";
  year: 1200;
  url: string;
  featureCount: number;
  countsByLevel: { county: number; prefecture: number };
  countsBySubtype: Record<string, number>;
  countsByDateStatus: Record<SongSettlementProperties["dateStatus"], number>;
  boundaryLinkedCount: number;
  withheldCount: number;
  eligibleSourceCount: number;
  sameNameGroupCount: number;
  note: string;
  dateNote: string;
  coverageNote: string;
  polityNote: string;
  sources: SongSettlementSource[];
  inputHashes: Record<string, string>;
}
