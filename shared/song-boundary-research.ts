import type { HistoricalResearchEntry } from "./historical-research";

/** Documentary identity only: neither a city footprint nor a verified border. */
export interface SongBoundaryResearchRecord {
  boundaryId: string;
  catalogPlaceId: string;
  sourceName: string;
  sourceDisplayName: string;
  sourceHierarchy: { polity: string; province: string; prefecture: string; dependentPrefecture: string };
  modelYear: 1200;
  modelLevel: "prefecture" | "county";
  sourceAdminType: string;
  researchName: string;
  researchEntryId: string;
  polityLabel: "南宋" | "金";
  linkBasis: "source-name-and-hierarchy" | "documented-rename" | "documented-source-conflict";
  yearNotice: string;
  catalogPointComparison: { coordinates: [number, number]; status: "inside" | "outside"; note: string };
  /** Correct display only when the attached quotation resolves a source conflict. */
  displayCorrection?: { name: string; note: string; sourceUrl: string };
  historicalResearch: HistoricalResearchEntry[];
}

export interface SongUnlinkedResearchRecord {
  catalogPlaceId: string;
  researchEntryId: string;
  name: string;
  reason: string;
  yearNotice: string;
  historicalResearch: HistoricalResearchEntry[];
}

export interface SongBoundaryResearchDocument {
  version: string;
  periodId: "song";
  boundaryYear: 1200;
  byBoundary: Record<string, SongBoundaryResearchRecord>;
  unlinkedEntries: SongUnlinkedResearchRecord[];
  sources: { id: string; title: string; url: string; snapshotPath: string; snapshotSha256: string }[];
  inputHashes: Record<string, string>;
  statistics: { researchEntries: number; linkedEntries: number; linkedBoundaries: number; unlinkedEntries: number; sourceVolumes: number };
  notes: string[];
}

export function getSongBoundaryResearch(document: SongBoundaryResearchDocument | null | undefined, boundaryId: string | undefined): SongBoundaryResearchRecord | undefined {
  return boundaryId ? document?.byBoundary[boundaryId] : undefined;
}

export function songBoundaryPeriodNotice(year: number): string {
  return year === 1080
    ? "当前为1080年北宋、辽及周边参考模型；城市详情以1200年南宋、金并立为入口，两者的政权、名称与辖域不能混用。"
    : "当前为1200年南宋、金及周边参考模型。北方金朝、西夏、大理与南宋并立，不将这些区域标作南宋辖地；源国家层未提供宋、金完整国界。";
}
