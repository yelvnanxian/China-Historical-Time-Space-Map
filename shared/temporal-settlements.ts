import type { FeatureCollection, Point } from "geojson";
import { boundarySearchKey } from "./boundary-search";

export interface TemporalSettlementLink {
  year: 1200;
  boundaryId: string;
  boundaryName: string;
  boundaryNote: string;
  boundaryPointStatus: "inside" | "outside";
  catalogPlaceId: string;
  researchEntryId: string;
  polityLabel: string;
  polityNote: string;
}
export interface TemporalSettlementProperties {
  /** Includes layer and source row index: SYS_ID is not globally unique. */
  id: string;
  name: string;
  sourceName: string;
  level: "county" | "prefecture";
  subtype: string;
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
  dateStatus: "specified-endpoints" | "broad-endpoints" | "incomplete-date-rules";
  dateCaution: string;
  presentLocation: string;
  geometryNote: string;
  originalCoordinates: [number, number];
  fieldCoordinates: [number, number];
  minZoom: number;
  sourceRecord: Record<string, string | number | null>;
  polityNote: string;
  /** Facts checked for 1200 only, never inherited by other browsing years. */
  documented1200?: TemporalSettlementLink;
}
export type TemporalSettlementsCollection = FeatureCollection<Point, TemporalSettlementProperties>;
export interface TemporalSettlementPackage {
  periodId: string;
  periodName: string;
  startYear: number;
  endYear: number;
  representativeYear: number;
  url: string;
  featureCount: number;
  countsByLevel: { county: number; prefecture: number };
  representativeYearCount: number;
  withheldIntersectingCount: number;
  compressedBytes: number;
  expandedBytes: number;
  sha256: string;
}
export interface TemporalSettlementsManifest {
  version: string;
  kind: "chgis-temporal-settlements";
  packages: TemporalSettlementPackage[];
  uniqueFeatureCount: number;
  sourceRecordCount: number;
  withheldCount: number;
  sources: { id: string; title: string; url: string; snapshotPath: string; snapshotSha256: string; metadataPath: string; metadataSha256: string; attribution: string; license: string }[];
  inputHashes: Record<string, string>;
  dateNote: string;
  coverageNote: string;
  polityNote: string;
}
export type TemporalSettlementLevel = "all" | TemporalSettlementProperties["level"];
export type TemporalSettlementViewport = [number, number, number, number];

export function temporalSettlementActive(p: TemporalSettlementProperties, year: number): boolean {
  return Number.isInteger(year) && year !== 0 && p.beginYear <= year && year <= p.endYear;
}
export function temporalSettlementYearLabel(year: number): string {
  return year < 0 ? `前${Math.abs(year)}年` : `${year}年`;
}
export function temporalSettlementLink(p: TemporalSettlementProperties, year: number): TemporalSettlementLink | undefined {
  return year === 1200 && temporalSettlementActive(p, year) ? p.documented1200 : undefined;
}
/** Existing Tang diagnostics are a 755 seat / 741 model comparison only. */
export function temporalTangSettlementKey(p: TemporalSettlementProperties, year: number): string | undefined {
  return year === 755 && temporalSettlementActive(p, year) ? `chgis-${p.level}-${p.sourceRecordId}` : undefined;
}
export function temporalSettlementInView(coordinates: number[], bounds?: TemporalSettlementViewport): boolean {
  if (!bounds) return true;
  const [west, south, east, north] = bounds;
  return (west <= east ? coordinates[0] >= west && coordinates[0] <= east : coordinates[0] >= west || coordinates[0] <= east) && coordinates[1] >= south && coordinates[1] <= north;
}
/** Search filters time first; neither a name match nor a viewport can revive an expired record. */
export function searchTemporalSettlements(features: TemporalSettlementsCollection["features"], year: number, query: string, level: TemporalSettlementLevel = "all", bounds?: TemporalSettlementViewport) {
  const key = boundarySearchKey(query);
  return features.filter(feature => {
    const p = feature.properties;
    if (!temporalSettlementActive(p, year) || level !== "all" && p.level !== level) return false;
    return key ? boundarySearchKey(`${p.name} ${p.sourceName} ${p.presentLocation} ${p.sourceRecordId} ${temporalSettlementLink(p, year)?.polityLabel ?? ""}`).includes(key) : temporalSettlementInView(feature.geometry.coordinates, bounds);
  }).sort((a, b) => {
    const exact = (p: TemporalSettlementProperties) => key && [p.name, p.sourceName, p.sourceRecordId].some(name => boundarySearchKey(name) === key) ? 1 : 0;
    return exact(b.properties) - exact(a.properties) || a.properties.minZoom - b.properties.minZoom || a.properties.id.localeCompare(b.properties.id);
  });
}
