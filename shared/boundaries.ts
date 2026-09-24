export type BoundaryLevel = "country" | "province" | "prefecture" | "county";

export interface BoundaryLayer {
  id: string;
  level: BoundaryLevel;
  label: string;
  url: string;
  featureCount: number;
  warning?: string;
}

export interface BoundaryDataset {
  id: string;
  title: string;
  year: number;
  periodId: string;
  sourceName: string;
  sourceUrl: string;
  accuracy: "historical-gis" | "approximate-model";
  note: string;
  coverage: string;
  layers: BoundaryLayer[];
}

export interface BoundaryManifest {
  version: string;
  datasets: BoundaryDataset[];
}

export interface BoundarySelection {
  id: string;
  name: string;
  level: BoundaryLevel;
  year: number;
  sourceId: string;
  recordId?: string;
  polity?: string;
  sourceAdminType?: string;
  originalPolity?: string;
  originalAdminType?: string;
  originalName?: string;
  modernNames?: string[];
  correspondenceNote?: string;
  correspondenceSourceIds?: string[];
  nameCorrectionNote?: string;
  nameSourceUrl?: string;
  nameStatus?: "source" | "source-field" | "source-recovered" | "translated" | "unresolved" | "unnamed";
}

export const boundaryLevelNames: Record<BoundaryLevel, string> = {
  country: "政权 / 诸部",
  province: "省 / 路 / 道",
  prefecture: "府 / 州",
  county: "县级行政区",
};
