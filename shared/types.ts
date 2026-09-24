export type Coordinates = [number, number];
export interface HistoricalTime {
  /** For traditional-chinese, an annal-year index, not a converted Gregorian event year. */
  year: number;
  precision: "year" | "month" | "day";
  calendar: "traditional-chinese" | "common-era-year";
  original: string;
  month?: number;
  dayLabel?: string;
  certainty: "recorded" | "approximate";
}
export interface Evidence {
  id: string;
  sourceId: string;
  locator: string;
  supports: string;
  quote?: string;
  status: "checked" | "pending";
  checkedAt?: string;
  note?: string;
}
export interface Topic {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  periodId: string;
  startYear: number;
  endYear: number;
  placeIds: string[];
  eventIds: string[];
}
export interface Period {
  id: string;
  label: string;
  name: string;
  year: number;
  startYear: number;
  endYear: number;
  subtitle: string;
  description: string;
  color: string;
  regimeIds: string[];
}
export interface Regime {
  id: string;
  name: string;
  periodId: string;
  color: string;
  labelPosition: Coordinates;
  geometry: { type: "Polygon"; coordinates: Coordinates[][] };
  description: string;
  sourceIds: string[];
  certainty: "schematic";
}
export interface Place {
  id: string;
  name: string;
  modernName: string;
  coordinates: Coordinates;
  type: "capital" | "city" | "pass";
  summary: string;
  aliases: string[];
  periodIds: string[];
  sourceIds: string[];
  nameByPeriod?: Record<string, string>;
  typeByPeriod?: Record<string, "capital" | "city" | "pass">;
  evidence?: Evidence[];
  location?: {
    accuracy: "approximate" | "uncertain" | "precise";
    note: string;
    sourceIds: string[];
  };
}
export interface HistoricalEvent {
  id: string;
  title: string;
  /** Annal-year index when time.calendar is traditional-chinese; otherwise common-era year. */
  year: number;
  endYear?: number;
  dateLabel: string;
  summary: string;
  category: string;
  placeIds: string[];
  personNames: string[];
  sourceIds: string[];
  periodIds: string[];
  route?: Coordinates[];
  time?: HistoricalTime;
  evidence?: Evidence[];
}
export interface Source {
  id: string;
  title: string;
  author: string;
  locator: string;
  note: string;
  url: string;
  verification: "reference" | "verified";
  retrievedAt?: string;
  edition?: string;
  license?: string;
  revisionId?: string;
  snapshotPath?: string;
}
export interface Catalog {
  periods: Period[];
  regimes: Regime[];
  places: Place[];
  events: HistoricalEvent[];
  sources: Source[];
  topics?: Topic[];
  metadata: {
    title: string;
    version: string;
    dataNotice: string;
    geographicNotice: string;
  };
}
export interface SearchResult {
  type: "place" | "event" | "period";
  id: string;
  title: string;
  subtitle: string;
  periodId?: string;
  matchedHistoricalName?: string;
}
