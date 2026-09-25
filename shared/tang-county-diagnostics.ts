/** Point/model agreement is a source diagnostic, never proof of a historical boundary. */
export type TangCountyDiagnosticStatus = "matched" | "outside" | "ambiguous" | "no-evidence";

export interface TangCountyHistoricalContext {
  summary: string;
  quote: string;
  sourceTitle: string;
  sourceUrl: string;
}

export interface TangCountyResearchEvidence {
  sourceId: string;
  sourceTitle: string;
  /** Preserve the cited edition or fixed-version URL supplied by the research. */
  sourceUrl: string;
  sourceKind: string;
  /** Verbatim source text; presentation must not simplify or paraphrase it. */
  quote: string;
  locator: string;
}

export interface TangCountyResearchFinding {
  topic: "identity" | "administration" | "establishment" | "seat" | "chronology";
  statement: string;
  evidence: TangCountyResearchEvidence[];
}

export interface TangCountyResearch {
  id: string;
  title: string;
  summary: string;
  correspondence: "same-unit" | "different-unit" | "unresolved";
  findings: TangCountyResearchFinding[];
  unresolved: string[];
}

export interface TangCountySourcePoint {
  id: string;
  sourceRecordId: string;
  name: string;
  year: 755;
  coordinates: [number, number];
  presentLocation: string;
  beginYear: number;
  endYear: number;
  sourceUrl: string;
  sameRecordIn741: boolean;
  matchedBoundaryIds: string[];
  /** A verified county model from the separate parent-prefecture crosswalk. */
  linkedCountyBoundaryId?: string;
}

export interface TangCountyModelCandidate {
  boundaryId: string;
  name: string;
  sourceName: string;
  year: 741;
  containsPoint: boolean;
  /** Approximate metric distance to the model, zero inside; never a matching rule. */
  distanceKm: number;
  basis: "source-name" | "documented-county-link" | "reviewed-source-hierarchy" | "documented-research";
}

export interface TangCountySettlementDiagnostic {
  status: TangCountyDiagnosticStatus;
  name: string;
  year: 755;
  reason: string;
  sourcePoint: TangCountySourcePoint;
  candidateBoundaryIds: string[];
  excludedHomonymBoundaryIds: string[];
  candidates: TangCountyModelCandidate[];
  minDistanceKm: number | null;
  historicalContext?: TangCountyHistoricalContext;
  historicalResearch?: TangCountyResearch[];
}

export interface TangCountyBoundaryPoint extends TangCountySourcePoint {
  insideBoundary: boolean;
  distanceKm: number;
  linkedOtherBoundaryIds: string[];
}

export interface TangCountyBoundaryDiagnostic {
  status: TangCountyDiagnosticStatus;
  boundaryId: string;
  name: string;
  sourceName: string;
  year: 741;
  reason: string;
  /** Relevant source candidates, excluding homonyms already matched elsewhere. */
  sourcePoints: TangCountyBoundaryPoint[];
  excludedHomonyms: TangCountyBoundaryPoint[];
  minDistanceKm: number | null;
  historicalContext?: TangCountyHistoricalContext;
  historicalResearch?: TangCountyResearch[];
}

export interface TangCountyDiagnostics {
  version: string;
  sourceYear: 755;
  boundaryYear: 741;
  bySettlement: Record<string, TangCountySettlementDiagnostic>;
  byBoundary: Record<string, TangCountyBoundaryDiagnostic>;
  statistics: {
    sourceCountyPoints: number;
    countyModels: number;
    settlementsByStatus: Record<TangCountyDiagnosticStatus, number>;
    boundariesByStatus: Record<TangCountyDiagnosticStatus, number>;
    outsideInBoth741And755: number;
  };
  researchCoverage?: {
    entries: number;
    sources: number;
    settlements: number;
    boundaries: number;
    excludedPairs: number;
    documentedLinks: number;
  };
  sources: { id: string; title: string; url: string; path: string; sha256: string }[];
  notes: string[];
}
