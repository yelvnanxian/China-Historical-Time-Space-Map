export interface ModernRegionCorrespondence {
  historicalName: string;
  simplifiedName: string;
  modernNames: string[];
  method: "representative-point";
  note: string;
  sourceIds: string[];
}

export interface ModernCorrespondenceData {
  version: string;
  sources: { id: string; title: string; url: string; note: string }[];
  entries: Record<string, ModernRegionCorrespondence>;
}
