export interface HistoricalContextSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  note: string;
  snapshotPath: string;
  snapshotSha256: string;
}

export interface HistoricalContextEvidence {
  sourceId: string;
  quote: string;
  supports: string;
}

export type HistoricalGeographyKind = "river-change" | "flood" | "canal" | "water-management" | "lake-change";

export interface HistoricalGeographyEntry {
  id: string;
  title: string;
  year: number;
  dateLabel: string;
  summary: string;
  impact: string;
  affectedPlaceIds: string[];
  referenceCoordinates: [number, number];
  referencePlaceId: string;
  locationRole: "event-area" | "affected-area" | "regional-reference";
  coordinateNote: string;
  kind: HistoricalGeographyKind;
  sourceIds: string[];
  evidence: HistoricalContextEvidence[];
}

export interface CityTimelineEntry {
  id: string;
  year: number;
  dateLabel: string;
  title: string;
  summary: string;
  sourceIds: string[];
  relatedEventId?: string;
  evidence: HistoricalContextEvidence[];
}

export interface CityTimeline {
  placeId: string;
  entries: CityTimelineEntry[];
}

export interface HistoricalContextData {
  version: string;
  generatedAt: string;
  notes: string[];
  sources: HistoricalContextSource[];
  geographyEntries: HistoricalGeographyEntry[];
  cityTimelines: CityTimeline[];
}
