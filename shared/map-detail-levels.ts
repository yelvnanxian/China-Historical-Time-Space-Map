import type { BoundaryLevel } from "./boundaries";

/** A preset controls both administrative polygons and the separate city markers. */
export type MapViewLevel = "auto" | BoundaryLevel | "cities";

export const mapViewLevelOptions: { value: MapViewLevel; label: string }[] = [
  { value: "auto", label: "随缩放自动" },
  { value: "country", label: "只看国家 / 诸部" },
  { value: "province", label: "只看省 / 道" },
  { value: "prefecture", label: "只看府 / 州" },
  { value: "county", label: "县域与城池" },
  { value: "cities", label: "只看城池" },
];

export const mapDetailZoomThresholds = { province: 4, prefecture: 5.4, county: 6.6 } as const;
export const administrativeLevelOrder: BoundaryLevel[] = ["country", "province", "prefecture", "county"];

export function automaticBoundaryLevel(zoom: number): BoundaryLevel {
  const scale = Number.isFinite(zoom) ? zoom : 0;
  if (scale >= mapDetailZoomThresholds.county) return "county";
  if (scale >= mapDetailZoomThresholds.prefecture) return "prefecture";
  if (scale >= mapDetailZoomThresholds.province) return "province";
  return "country";
}

/** Manual presets never silently reveal a different administrative level. */
export function resolveMapDetailLevel(viewLevel: MapViewLevel, zoom: number, availableLevels: readonly BoundaryLevel[] = administrativeLevelOrder, options: { primaryCountryCoverage?: boolean } = {}) {
  const requestedLevel = viewLevel === "cities" ? null : viewLevel === "auto" ? automaticBoundaryLevel(zoom) : viewLevel;
  let activeLevel: BoundaryLevel | null = requestedLevel;
  if (activeLevel && !availableLevels.includes(activeLevel)) {
    const index = administrativeLevelOrder.indexOf(activeLevel);
    activeLevel = viewLevel === "auto"
      ? [...administrativeLevelOrder.slice(0, index).reverse(), ...administrativeLevelOrder.slice(index + 1)].find(level => availableLevels.includes(level)) ?? null
      : null;
  }
  const countryContext = viewLevel === "auto" && requestedLevel === "country" && options.primaryCountryCoverage === false && availableLevels.includes("province");
  if (countryContext) activeLevel = "province";
  const visibleLevels: BoundaryLevel[] = countryContext && availableLevels.includes("country") ? ["country", "province"] : activeLevel ? [activeLevel] : [];
  return {
    requestedLevel,
    activeLevel,
    visibleLevels,
    interactiveLevels: [activeLevel, ...visibleLevels].filter((level, index, array): level is BoundaryLevel => level !== null && array.indexOf(level) === index),
    showCities: viewLevel === "cities" || viewLevel === "county" || viewLevel === "auto" && (requestedLevel === "prefecture" || requestedLevel === "county"),
    isFallback: requestedLevel !== activeLevel,
  };
}

/** A search explicitly selects that record's level, so fitting its extent cannot hide it. */
export function viewLevelForBoundarySelection(level: BoundaryLevel): MapViewLevel {
  return level;
}
