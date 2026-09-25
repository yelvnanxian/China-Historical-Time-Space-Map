import type { MultiPolygon, Polygon, Position } from "geojson";

export interface TangBoundaryEvidence {
  sourceId: string;
  recordIds: string[];
  summary: string;
}

export interface TangBoundaryLink {
  boundaryId: string;
  boundaryName: string;
  boundaryYear: 741;
  entityName: string;
  entityYear: number | null;
  relation: "same-name-in-model" | "documented-rename" | "source-county-parent" | "catalog-name-in-model" | "documented-model-name-chain";
  countyBoundaryId?: string;
  note: string;
  evidence: TangBoundaryEvidence[];
  /** Source names may come from a different year than the model's nominal 741. */
  nameChain?: TangBoundaryNameStep[];
  modelNameAnchor?: TangBoundaryNameStep & { match: "full-name" | "administrative-stem" };
}

export interface TangBoundaryNameStep {
  sourceRecordId: string;
  name: string;
  beginYear: number;
  endYear: number;
  beginChange: string;
  endChange: string;
  coordinates: [number, number];
}

export interface TangBoundaryCoverageCount { total: number; matched: number; unmatched: number }
export interface TangBoundaryMissingLink {
  entityName: string;
  entityYear: 755;
  level: "county" | "prefecture";
  reasonCode: "no-named-model" | "outside-named-model" | "ambiguous-named-model" | "unresolved-source-parent";
  reason: string;
  candidateBoundaryIds: string[];
}

export interface TangBoundaryCrosswalk {
  version: string;
  boundaryDatasetId: string;
  boundaryYear: 741;
  settlements: Record<string, TangBoundaryLink>;
  places: Record<string, TangBoundaryLink>;
  sources: { id: string; title: string; url: string; path: string; sha256: string }[];
  notes: string[];
  /** Counts use the published 755 snapshot, excluding auxiliary 741 record IDs. */
  coverage?: TangBoundaryCoverageCount & {
    year: 755;
    byLevel: Record<"county" | "prefecture", TangBoundaryCoverageCount>;
    auxiliarySettlementLinks: number;
  };
  unmatchedSettlements?: Record<string, TangBoundaryMissingLink>;
}

/** Containment confirms a named record against the source model; it never picks a nearest polygon. */
export function boundaryContainsPoint(geometry: Polygon | MultiPolygon, point: Position): boolean {
  function inRing(ring: Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
      if (Math.abs(cross) < 1e-10 && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])) return true;
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(rings[0]) && !rings.slice(1).some(inRing));
}
