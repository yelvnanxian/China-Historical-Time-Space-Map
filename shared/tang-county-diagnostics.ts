/** Point/model agreement is a source diagnostic, never proof of a historical boundary. */
export type TangCountyDiagnosticStatus = "matched" | "outside" | "ambiguous" | "no-evidence";

export interface TangCountyHistoricalContext {
  summary: string;
  quote: string;
  sourceTitle: string;
  sourceUrl: string;
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
  basis: "source-name" | "documented-county-link" | "reviewed-source-hierarchy";
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
  sources: { id: string; title: string; url: string; path: string; sha256: string }[];
  notes: string[];
}
