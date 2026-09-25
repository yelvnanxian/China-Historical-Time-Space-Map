/**
 * Evidence-backed historical research attached to a map record.
 *
 * The shape is deliberately dynasty-neutral.  Tang county diagnostics use
 * the same fields, and Ming (or later) datasets can reuse the notice without
 * importing Tang-specific geometry types.
 */
export interface HistoricalResearchEvidence {
  sourceId: string;
  sourceTitle: string;
  /** Fixed-version URL or archive link for the cited edition. */
  sourceUrl: string;
  sourceKind?: string;
  /** Verbatim source text; UI must not paraphrase this field. */
  quote: string;
  locator: string;
}

export interface HistoricalResearchFinding {
  /** A stable topic key supplied by the dataset; unknown keys are rendered as-is. */
  topic: string;
  statement: string;
  evidence: HistoricalResearchEvidence[];
}

export interface HistoricalResearchEntry {
  id: string;
  title: string;
  summary: string;
  /** Dataset-specific correspondence conclusion, e.g. same-unit or unresolved. */
  correspondence: string;
  findings: HistoricalResearchFinding[];
  unresolved: string[];
}
