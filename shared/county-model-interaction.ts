import type { TangCountyBoundaryDiagnostic, TangCountyModelCandidate, TangCountySettlementDiagnostic } from "./tang-county-diagnostics";

/** A boundary-only navigation request cannot carry an unresolved homonym.
 * Show a comparison only when it preserves the current source point's identity. */
export function canOpenCountyModel(settlement: TangCountySettlementDiagnostic, candidate: TangCountyModelCandidate, boundary: TangCountyBoundaryDiagnostic | undefined): boolean {
  if (!boundary?.sourcePoints.some(point => point.id === settlement.sourcePoint.id)) return false;
  if (settlement.status === "matched") return candidate.containsPoint && boundary.status === "matched";
  return settlement.status === "outside" && boundary.status === "outside";
}
