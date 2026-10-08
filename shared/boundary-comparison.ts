import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BoundaryDataset, BoundaryLevel, BoundarySelection } from "./boundaries";
import { getBoundaryDisplayLabel } from "./boundary-labels";
import type { ModernCorrespondenceData } from "./modern-correspondence";
import type { TangBoundaryCrosswalk } from "./tang-boundary-crosswalk";
import type { SongBoundaryResearchDocument } from "./song-boundary-research";
import type { MingBoundaryResearchDocument } from "./ming-boundary-research";
import { chinesePlaceName } from "./place-name-localization";

export const comparisonCityYears = [741, 1200, 1391] as const;
export type ComparisonCityYear = typeof comparisonCityYears[number];
export type ComparisonSide = 0 | 1;
export interface ComparisonRegionProperties extends BoundarySelection {
  sourceCode?: string;
  sourceName?: string;
  labelCoordinates?: [number, number];
  displayName?: string;
  modernLabel?: string;
  color?: string;
}
export type ComparisonRegion = Feature<Polygon | MultiPolygon, ComparisonRegionProperties>;
export type ComparisonRegions = FeatureCollection<Polygon | MultiPolygon, ComparisonRegionProperties>;
export interface ComparisonCityLink { boundaryId: string; name: string; note: string; level: BoundaryLevel; polity?: string }
export interface ComparisonCityRecord { year: ComparisonCityYear; links: ComparisonCityLink[]; missingReason: string }
export interface ComparisonDocuments {
  tang?: TangBoundaryCrosswalk;
  song?: SongBoundaryResearchDocument;
  ming?: MingBoundaryResearchDocument;
}

export interface ComparisonCamera { center: [number, number]; zoom: number; bearing: number; pitch: number }
interface ComparisonCameraMap {
  getCenter(): { toArray(): number[] };
  getZoom(): number;
  jumpTo(view: ComparisonCamera): unknown;
}

/** Map move events are synchronous inside jumpTo; suppress feedback and retain the last view across unmounts. */
export function createComparisonCameraSync(initial: ComparisonCamera) {
  const maps: [ComparisonCameraMap | null, ComparisonCameraMap | null] = [null, null];
  let view: ComparisonCamera = { ...initial, center: [...initial.center] };
  let syncing = false;
  function apply(map: ComparisonCameraMap) {
    syncing = true;
    try { map.jumpTo({ ...view, center: [...view.center] }); } finally { syncing = false; }
  }
  return {
    attach(side: ComparisonSide, map: ComparisonCameraMap | null) {
      maps[side] = map;
      if (map) apply(map);
    },
    move(side: ComparisonSide) {
      const source = maps[side];
      if (!source || syncing) return;
      view = { center: source.getCenter().toArray() as [number, number], zoom: source.getZoom(), bearing: 0, pitch: 0 };
      const other = maps[side === 0 ? 1 : 0];
      if (other) apply(other);
    },
  };
}

export function comparisonYearLabel(year: number): string {
  return ({ 741: "唐 · 741年", 1080: "北宋、辽同期 · 1080年", 1200: "南宋、金同期 · 1200年", 1290: "元 · 1290年", 1391: "明 · 1391年", 1820: "清 · 1820年", 1911: "清末 · 1911年" } as Record<number, string>)[year] ?? `${year}年`;
}

/** Selecting the opposite year swaps panes, so the pair always remains distinct. */
export function selectComparisonYear(pair: readonly [number, number], side: ComparisonSide, year: number): [number, number] {
  const other = side === 0 ? 1 : 0;
  const next: [number, number] = [...pair];
  if (next[other] === year) next[other] = next[side];
  next[side] = year;
  return next;
}

export function initialComparisonYears(initialYear: number, years: readonly number[]): [number, number] {
  const ordered = [...new Set(years)].sort((a, b) => a - b);
  const first = [...ordered].sort((a, b) => Math.abs(a - initialYear) - Math.abs(b - initialYear) || a - b)[0] ?? 741;
  return [first, ordered.find(year => year > first) ?? ordered.filter(year => year < first).at(-1) ?? first];
}

/** Exact catalog associations only. No aliases, suffix stripping, containment or nearest feature. */
export function comparisonCityRecord(placeId: string, year: ComparisonCityYear, docs: ComparisonDocuments): ComparisonCityRecord {
  const result: ComparisonCityRecord = { year, links: [], missingReason: "此城市尚无经过核对的同期辖区关联，地图留空。" };
  if (year === 741) {
    const record = docs.tang?.places[placeId];
    if (record?.boundaryYear === 741 && record.boundaryId.startsWith("hartwell-741-")) result.links.push({ boundaryId: record.boundaryId, name: chinesePlaceName(record.boundaryName, "关联行政区"), note: record.note, level: "prefecture" });
  } else if (year === 1200) {
    for (const record of Object.values(docs.song?.byBoundary ?? {})) {
      if (record.catalogPlaceId !== placeId || record.modelYear !== 1200 || !record.boundaryId.startsWith("hartwell-1200-")) continue;
      result.links.push({ boundaryId: record.boundaryId, name: chinesePlaceName(record.displayCorrection?.name ?? record.researchName, "关联行政区"), note: record.yearNotice, level: record.modelLevel, polity: record.polityLabel });
    }
    result.missingReason = docs.song?.unlinkedEntries.find(record => record.catalogPlaceId === placeId)?.reason ?? result.missingReason;
  } else {
    // This exact ID relation is the existing MingJurisdictionInfo contract.
    // Do not map e.g. guiyang to guiyang-boundary, or match researchName.
    for (const record of Object.values(docs.ming?.byBoundary ?? {})) {
      if (record.researchEntryId !== `ming-geography-${placeId}` || record.modelYear !== 1391 || !record.boundaryId.startsWith("hartwell-1391-")) continue;
      result.links.push({ boundaryId: record.boundaryId, name: chinesePlaceName(record.researchName, "关联行政区"), note: record.yearNotice, level: record.modelLevel });
    }
    result.missingReason = docs.ming?.unlinkedEntries.find(record => record.researchEntryId === `ming-geography-${placeId}`)?.reason ?? result.missingReason;
  }
  return result;
}

/** Adds presentation labels while retaining the original feature geometry object. */
export function localizeComparisonRegions(regions: ComparisonRegions, modern?: ModernCorrespondenceData, song?: SongBoundaryResearchDocument): ComparisonRegions {
  return { ...regions, features: regions.features.map(feature => {
    const p = feature.properties;
    const match = modern?.entries[p.id];
    const label = getBoundaryDisplayLabel(p, match?.simplifiedName);
    const correction = song?.byBoundary[p.id]?.displayCorrection;
    return { ...feature, properties: { ...p,
      displayName: chinesePlaceName(correction?.name ?? label.name, "未定名行政区"),
      modernLabel: (match?.modernNames ?? []).map(name => chinesePlaceName(name, "现代对应待核")).join("、"),
      nameCorrectionNote: correction?.note ?? label.nameCorrectionNote,
    } };
  }) };
}

/** Layer choice follows explicit linked IDs; missing IDs never select another polygon. */
export function comparisonLinkLayers(dataset: BoundaryDataset, links: readonly ComparisonCityLink[]): BoundaryLevel[] {
  return [...new Set(links.filter(link => link.boundaryId.startsWith(`${dataset.id}-`)).map(link => link.level))];
}

export function comparisonGeometryBounds(features: readonly ComparisonRegion[]): [[number, number], [number, number]] | undefined {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const feature of features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (const point of ring) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
      west = Math.min(west, point[0]); east = Math.max(east, point[0]); south = Math.min(south, point[1]); north = Math.max(north, point[1]);
    }
  }
  return west <= east && south <= north ? [[west, south], [east, north]] : undefined;
}
