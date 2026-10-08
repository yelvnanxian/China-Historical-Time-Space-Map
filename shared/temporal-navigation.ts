import type { BoundaryManifest } from "./boundaries";
import type { HistoricalContextData } from "./historical-context";
import type { Catalog, Period } from "./types";

export type YearStopKind = "event" | "chronicle" | "boundary" | "seat" | "reference";
export interface YearStop {
  year: number;
  kinds: YearStopKind[];
  eventCount: number;
  chronicleCount: number;
}
export const yearStopKindLabels: Record<YearStopKind, string> = {
  event: "历史事件", chronicle: "城池大事记", boundary: "边界截面", seat: "治所截面", reference: "默认入口",
};

/** Broad enough for all dated records; no year zero in this calendar convention. */
export function validExplorationYear(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value !== 0 && value >= -9999 && value <= 9999;
}

/** Resolve only covered years. A gap must never silently become a nearby dynasty. */
export function periodForYear(year: number, periods: readonly Period[], options: {
  preferredPeriodId?: string; entryId?: string; periodIds?: readonly string[];
} = {}): Period | undefined {
  if (!validExplorationYear(year)) return undefined;
  const candidates = periods.filter(period => period.startYear <= year && year <= period.endYear);
  const fromRecord = candidates.find(period => options.entryId?.startsWith(`${period.id}-timeline-`));
  return fromRecord
    ?? candidates.find(period => options.periodIds?.includes(period.id) && period.id === options.preferredPeriodId)
    ?? candidates.find(period => options.periodIds?.includes(period.id))
    ?? candidates.find(period => period.id === options.preferredPeriodId)
    ?? [...candidates].sort((a, b) => b.startYear - a.startYear || a.id.localeCompare(b.id))[0];
}

/** Aggregate evidence dates across all cities, not only the selected city's file. */
export function availableYearStops(catalog: Catalog, context?: HistoricalContextData | null, manifest?: BoundaryManifest | null, periodId?: string): YearStop[] {
  const period = periodId ? catalog.periods.find(item => item.id === periodId) : undefined;
  if (periodId && !period) return [];
  const years = new Map<number, YearStop>();
  function add(year: number, kind: YearStopKind) {
    if (!validExplorationYear(year) || period && (year < period.startYear || year > period.endYear)) return;
    const stop = years.get(year) ?? { year, kinds: [], eventCount: 0, chronicleCount: 0 };
    if (!stop.kinds.includes(kind)) stop.kinds.push(kind);
    if (kind === "event") stop.eventCount++;
    if (kind === "chronicle") stop.chronicleCount++;
    years.set(year, stop);
  }
  for (const event of catalog.events) add(event.year, "event");
  for (const timeline of context?.cityTimelines ?? []) for (const entry of timeline.entries) add(entry.year, "chronicle");
  for (const dataset of manifest?.datasets ?? []) if (!periodId || dataset.periodId === periodId) add(dataset.year, "boundary");
  for (const item of catalog.periods) if (!periodId || item.id === periodId) add(item.year, "reference");
  for (const [id, year] of [["tang", 755], ["song", 1200]] as const) {
    if ((!periodId || periodId === id) && catalog.periods.some(item => item.id === id)) add(year, "seat");
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}

/** Chronological axes omit zero, keeping the span from 1 BCE to 1 CE one year. */
export const yearAxisValue = (year: number): number => year > 0 ? year - 1 : year;
export const yearFromAxisValue = (value: number): number => value >= 0 ? value + 1 : value;
export function nearestYearStop(year: number, stops: readonly YearStop[]): YearStop | undefined {
  if (!Number.isFinite(year)) return undefined;
  return stops.filter(stop => validExplorationYear(stop.year)).reduce<YearStop | undefined>((best, stop) => {
    const distance = Math.abs(yearAxisValue(stop.year) - yearAxisValue(year));
    const bestDistance = best ? Math.abs(yearAxisValue(best.year) - yearAxisValue(year)) : Infinity;
    return distance < bestDistance || distance === bestDistance && stop.year < best!.year ? stop : best;
  }, undefined);
}
export const formatNavigationYear = (year: number): string => year < 0 ? `前${Math.abs(year)}年` : `${year}年`;
