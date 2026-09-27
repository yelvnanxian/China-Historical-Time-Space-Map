import { boundarySearchKey } from "./boundary-search";
import type { SongSettlementsCollection, SongSettlementProperties } from "./song-settlements";

export type SongSettlementLevel = "all" | SongSettlementProperties["level"];
export type SettlementViewport = [number, number, number, number];

export function settlementInView(coordinates: number[], bounds?: SettlementViewport) {
  if (!bounds) return true;
  const [west, south, east, north] = bounds;
  const longitudeInside = west <= east ? coordinates[0] >= west && coordinates[0] <= east : coordinates[0] >= west || coordinates[0] <= east;
  return longitudeInside && coordinates[1] >= south && coordinates[1] <= north;
}

/** Search keeps source identities separate even when their normalized names match. */
export function searchSongSettlements(features: SongSettlementsCollection["features"], query: string, level: SongSettlementLevel = "all", bounds?: SettlementViewport) {
  const key = boundarySearchKey(query);
  return features.filter(feature => {
    const p = feature.properties;
    if (level !== "all" && p.level !== level) return false;
    return key ? boundarySearchKey(`${p.name} ${p.sourceName} ${p.presentLocation} ${p.sourceRecordId} ${p.polityLabel ?? ""}`).includes(key) : settlementInView(feature.geometry.coordinates, bounds);
  }).sort((a, b) => {
    const exact = (p: SongSettlementProperties) => key && [p.name, p.sourceName, p.sourceRecordId].some(name => boundarySearchKey(name) === key) ? 1 : 0;
    return exact(b.properties) - exact(a.properties) || a.properties.minZoom - b.properties.minZoom || a.properties.id.localeCompare(b.properties.id);
  });
}

export function showSongSettlement(properties: SongSettlementProperties, zoom: number, periodId: string) {
  return periodId === "song" && properties.year === 1200 && Number.isFinite(zoom) && zoom >= properties.minZoom;
}
