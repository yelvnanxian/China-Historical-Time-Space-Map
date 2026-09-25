import type { HistoricalContextEvidence, HistoricalContextSource } from "./historical-context";
import type { Place } from "./types";
import { boundarySearchKey } from "./boundary-search";
import type { HistoricalResearchEntry } from "./historical-research";

export interface CityPeriodProfile {
  id: string;
  placeId: string;
  periodId: string;
  summary: string;
  region?: string;
  namingNote?: string;
  politicalContext?: string;
  sourceIds: string[];
  evidence: HistoricalContextEvidence[];
  historicalResearch?: HistoricalResearchEntry[];
}

/** Search contemporary names, modern references and aliases within the selected period. */
export function filterCityProfiles(profiles: CityPeriodProfile[], places: Place[], periodId: string, query = "", region = "") {
  const byId = new Map(places.map(place => [place.id, place]));
  const terms = boundarySearchKey(query).split(/\s+/).filter(Boolean);
  return profiles.filter(profile => {
    const place = byId.get(profile.placeId);
    if (profile.periodId !== periodId || !place?.periodIds.includes(periodId) || (region && profile.region !== region)) return false;
    const key = boundarySearchKey([place.nameByPeriod?.[periodId], place.name, place.modernName, ...place.aliases, profile.namingNote].filter(Boolean).join(" "));
    return terms.every(term => key.includes(term));
  });
}

export interface CityPeriodProfilesData {
  version: string;
  sources: HistoricalContextSource[];
  profiles: CityPeriodProfile[];
}
