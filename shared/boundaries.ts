import type { TangCountyDiagnosticStatus } from "./tang-county-diagnostics";

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
  /** Source agreement only; even matched does not establish a verified boundary. */
  geometryStatus?: TangCountyDiagnosticStatus;
}

export const boundaryLevelNames: Record<BoundaryLevel, string> = {
  country: "政权 / 诸部",
  province: "省 / 路 / 道",
  prefecture: "府 / 州 / 郡",
  county: "县级行政区",
};

export function boundaryLevelName(level: BoundaryLevel, periodId?: string): string {
  if (periodId === "tang") {
    if (level === "province") return "道（监察区）";
    if (level === "prefecture") return "州 / 郡 / 府";
  }
  return boundaryLevelNames[level];
}

export function boundaryCountryCoverage(dataset: BoundaryDataset | undefined): { count: number; incomplete: boolean; note: string } {
  const count = dataset?.layers.filter(layer => layer.level === "country").reduce((sum, layer) => sum + layer.featureCount, 0) ?? 0;
  if (!dataset) return { count, incomplete: true, note: "本时期尚未接入国家边界资料，可查阅历史原图。" };
  if (dataset.id.startsWith("hartwell-")) return {
    count, incomplete: true,
    note: dataset.periodId === "tang"
      ? `此源国家层仅有 ${count} 条周边独立政权 / 诸部记录，未提供唐朝完整国界。各道范围不能拼作唐朝国界。`
      : `此源国家层仅有 ${count} 条独立政权 / 诸部记录，不含本朝完整国界。`,
  };
  return { count, incomplete: !count, note: count ? dataset.coverage : "这份资料未收录国家层边界；可查阅历史原图。" };
}
