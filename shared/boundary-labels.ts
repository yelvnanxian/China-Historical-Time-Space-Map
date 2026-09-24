import correctionsDocument from "./boundary-name-corrections.json";
import { simplifiedChinese } from "./boundary-search";
import { historicalNameTranslations, isChineseDisplayName } from "./place-name-localization";

export interface BoundaryLabelInput {
  id?: string;
  name?: unknown;
  recordId?: string | number;
  sourceId?: string;
  sourceCode?: string;
  year?: number;
  sourceName?: unknown;
  NAME_CH?: unknown;
  NAME_FT?: unknown;
  NAME_PY?: unknown;
}

export interface BoundaryDisplayLabel {
  name: string;
  originalName: string;
  nameStatus: "source" | "source-field" | "source-recovered" | "translated" | "unresolved" | "unnamed";
  nameCorrectionNote?: string;
  nameSourceUrl?: string;
}

interface NameCorrection {
  expectedOriginalName: string;
  expectedSourceId: string;
  expectedSourceCode: string;
  expectedYear: number;
  traditionalName: string;
  simplifiedName: string;
  note: string;
  sourceUrl: string;
}

const corrections: Record<string, NameCorrection> = correctionsDocument.entries;

/** Detect name placeholders only; administrative codes such as LEVEL1_H="00" are valid metadata. */
export function isPlaceholderBoundaryName(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  const name = String(value).normalize("NFKC").trim();
  // "Nan" is the valid pinyin of 南 in the source data; do not match it as NaN.
  return !name || name === "NA" || name === "NaN" ||
    /^(?:[+-]?\d+(?:[.,]\d+)?|n[/.\s]+a\.?|null|none|undefined|unknown|[-_?？]+)$/i.test(name);
}

/**
 * Resolve display text without changing source data. Verified corrections take
 * precedence over cached modern-correspondence names, which may retain "00".
 */
export function getBoundaryDisplayLabel(
  region: BoundaryLabelInput,
  cachedSimplifiedName?: string,
): BoundaryDisplayLabel {
  const originalName = region.name === null || region.name === undefined ? "" : String(region.name);
  const correction = region.id ? corrections[region.id] : undefined;
  if (
    correction &&
    originalName.normalize("NFKC").trim() === correction.expectedOriginalName &&
    (region.sourceId === undefined || region.sourceId === correction.expectedSourceId) &&
    (region.sourceCode === undefined || region.sourceCode === correction.expectedSourceCode) &&
    (region.year === undefined || region.year === correction.expectedYear)
  ) {
    return {
      name: correction.simplifiedName,
      originalName,
      nameStatus: "source-recovered",
      nameCorrectionNote: correction.note,
      nameSourceUrl: correction.sourceUrl,
    };
  }

  const translation = region.id ? historicalNameTranslations[region.id] : undefined;
  if (translation && originalName === translation.expectedName &&
    (region.sourceId === undefined || region.sourceId === translation.expectedSourceId) &&
    (region.sourceCode === undefined || region.sourceCode === translation.expectedSourceCode) &&
    (region.year === undefined || region.year === translation.expectedYear)) {
    return { name: simplifiedChinese(translation.displayName), originalName,
      nameStatus: translation.method === "unresolved" ? "unresolved" : "translated",
      nameCorrectionNote: translation.note, nameSourceUrl: translation.sourceUrl };
  }

  if (!isPlaceholderBoundaryName(originalName) && isChineseDisplayName(originalName)) {
    return {
      name: cachedSimplifiedName && isChineseDisplayName(cachedSimplifiedName)
        ? simplifiedChinese(cachedSimplifiedName.trim())
        : simplifiedChinese(originalName.trim()),
      originalName,
      nameStatus: "source",
    };
  }

  // These are names of the feature itself. Never promote a parent/hierarchy
  // field or a modern place name into a missing historical feature name.
  const sourceFields = ["sourceName", "NAME_CH", "NAME_FT", "NAME_PY"] as const;
  for (const field of sourceFields) {
    if (!isPlaceholderBoundaryName(region[field]) && isChineseDisplayName(String(region[field]))) {
      return {
        name: simplifiedChinese(String(region[field]).trim()),
        originalName,
        nameStatus: "source-field",
        nameCorrectionNote: `名称字段为空或占位，采用本区域原始字段 ${field} 中的名称。`,
      };
    }
  }

  const identifier = region.recordId === undefined ? "" : String(region.recordId).trim();
  if (!isPlaceholderBoundaryName(originalName)) {
    const numericId = /^\d+$/.test(identifier) ? identifier : "";
    return { name: `未定名行政区${numericId ? `（源编号${numericId}）` : ""}`, originalName,
      nameStatus: "unresolved", nameCorrectionNote: "尚未核定中文名称，原文保留供核查。" };
  }
  return {
    name: `来源未命名区域${identifier ? ` · ${identifier}` : ""}`,
    originalName,
    nameStatus: "unnamed",
    nameCorrectionNote: "原始名称为空或占位，暂未找到足够的来源证据恢复名称。",
  };
}

export function boundaryDisplayName(region: BoundaryLabelInput, cachedSimplifiedName?: string): string {
  return getBoundaryDisplayLabel(region, cachedSimplifiedName).name;
}
