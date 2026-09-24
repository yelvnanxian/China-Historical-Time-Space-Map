import type { HistoricalContextEvidence, HistoricalContextSource } from "./historical-context";

export interface CityPeriodProfile {
  id: string;
  placeId: string;
  periodId: string;
  summary: string;
  sourceIds: string[];
  evidence: HistoricalContextEvidence[];
}

export interface CityPeriodProfilesData {
  version: string;
  sources: HistoricalContextSource[];
  profiles: CityPeriodProfile[];
}
