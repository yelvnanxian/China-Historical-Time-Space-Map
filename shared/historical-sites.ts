import type { Coordinates, PlaceType } from "./types";
export type HistoricalSiteType = Exclude<PlaceType, "city" | "capital" | "unknown">;
export interface HistoricalSite {
  id: string;
  name: string;
  type: HistoricalSiteType;
  coordinates: Coordinates;
  /** Editorial reading contexts, not a claim of uninterrupted occupation. */
  periodIds: string[];
  summary: string;
  beginYear?: number;
  beginYearNote?: string;
  evidence: { quote: string; sourceId: string }[];
  sourceIds: string[];
  coordinateSourceId: string;
  accuracy: "modern-site-reference" | "disputed-location";
  locationNote: string;
  unresolved: string[];
  minZoom: number;
}
export interface HistoricalSiteSource {
  id: string;
  title: string;
  url: string;
  revisionId: number;
  retrievedAt: string;
  snapshotPath: string;
  snapshotSha256: string;
  pageId: number;
}
export interface HistoricalSitesData {
  version: string;
  note: string;
  sites: HistoricalSite[];
  sources: HistoricalSiteSource[];
  gaps: { type: HistoricalSiteType; note: string }[];
}
export function sitesForPeriod(sites: HistoricalSite[], periodId: string, year?: number): HistoricalSite[] {
  return sites.filter(site => site.periodIds.includes(periodId) && (year === undefined || site.beginYear === undefined || year >= site.beginYear));
}

export function isHistoricalSitesData(value: unknown): value is HistoricalSitesData {
  if (!value || typeof value !== "object") return false;
  const data = value as HistoricalSitesData;
  const types = new Set(["pass", "battlefield", "tomb", "temple", "port", "ferry", "post", "site"]);
  if (!Array.isArray(data.sites) || !Array.isArray(data.sources) || !Array.isArray(data.gaps) || typeof data.note !== "string") return false;
  if (!data.sources.every(source => source && typeof source.id === "string" && typeof source.url === "string") ||
      !data.sites.every(site => site && typeof site.id === "string") ||
      !data.gaps.every(gap => gap && types.has(gap.type) && typeof gap.note === "string")) return false;
  const sourceIds = new Set(data.sources.map(source => source.id));
  return new Set(data.sites.map(site => site.id)).size === data.sites.length && data.sites.every(site =>
    typeof site.id === "string" && typeof site.name === "string" && types.has(site.type) &&
    Array.isArray(site.coordinates) && site.coordinates.length === 2 && site.coordinates.every(Number.isFinite) && Math.abs(site.coordinates[0]) <= 180 && Math.abs(site.coordinates[1]) <= 90 &&
    Array.isArray(site.periodIds) && typeof site.summary === "string" && typeof site.locationNote === "string" && Array.isArray(site.unresolved) &&
    (site.beginYear === undefined || Number.isInteger(site.beginYear) && site.beginYear !== 0 && typeof site.beginYearNote === "string") &&
    Number.isFinite(site.minZoom) && Array.isArray(site.sourceIds) && site.sourceIds.every(id => sourceIds.has(id)) && sourceIds.has(site.coordinateSourceId) &&
    Array.isArray(site.evidence) && site.evidence.every(item => item && typeof item.quote === "string" && sourceIds.has(item.sourceId)));
}
export function siteIsVisible(site: HistoricalSite, zoom: number, selectedId?: string): boolean {
  return site.id === selectedId || zoom >= site.minZoom;
}
