import type { PlaceType } from "./types";

/**
 * Controlled vocabulary for non-city historical locations.  A record should
 * use `unknown` when the source does not establish its function; the map must
 * never infer a site type from its name or coordinates.
 */
export const placeTypeLabels: Record<PlaceType, string> = {
  capital: "都城",
  city: "城邑",
  pass: "关隘",
  battlefield: "战场",
  tomb: "陵墓",
  temple: "寺庙",
  port: "港口",
  ferry: "渡口",
  post: "驿站",
  site: "古迹",
  unknown: "地点",
};

export const placeTypeShortLabels: Record<PlaceType, string> = {
  capital: "都",
  city: "城",
  pass: "关",
  battlefield: "战",
  tomb: "陵",
  temple: "寺",
  port: "港",
  ferry: "渡",
  post: "驿",
  site: "迹",
  unknown: "点",
};

export function placeTypeLabel(type: PlaceType | undefined): string {
  return placeTypeLabels[type ?? "unknown"];
}
