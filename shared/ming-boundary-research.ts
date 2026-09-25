import type { HistoricalResearchEntry } from "./historical-research";

/** Documentary identity links only. A link does not validate the model's geometry. */
export interface MingBoundaryResearchRecord {
  boundaryId: string;
  /** Original model text, retained even when it is anachronistic. */
  sourceName: string;
  modelYear: 1391;
  modelLevel: "prefecture" | "county";
  sourceAdminType: "Fu" | "Xian";
  researchName: string;
  researchEntryId: string;
  linkBasis: "source-name-and-hierarchy";
  yearNotice: string;
  historicalResearch: HistoricalResearchEntry[];
}

export interface MingUnlinkedResearchRecord {
  researchEntryId: string;
  name: string;
  reason: string;
  yearNotice: string;
  historicalResearch: HistoricalResearchEntry[];
}

export interface MingBoundaryResearchDocument {
  version: string;
  periodId: "ming";
  boundaryYear: 1391;
  byBoundary: Record<string, MingBoundaryResearchRecord>;
  unlinkedEntries: MingUnlinkedResearchRecord[];
  sources: { id: string; title: string; url: string; snapshotPath: string; snapshotSha256: string }[];
  inputHashes: Record<string, string>;
  statistics: { researchEntries: number; linkedEntries: number; linkedBoundaries: number; unlinkedEntries: number; sourceVolumes: number };
  notes: string[];
}

export function getMingBoundaryResearch(document: MingBoundaryResearchDocument | null | undefined, boundaryId: string | undefined): MingBoundaryResearchRecord | undefined {
  return boundaryId ? document?.byBoundary[boundaryId] : undefined;
}
