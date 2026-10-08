import type { TemporalSettlementProperties } from "./temporal-settlements";

/**
 * Early dynasties otherwise look empty at the automatic country/province view:
 * their representative city cards are sparse, while CHGIS does contain dated
 * prefecture seats. Show those source points one level earlier as context.
 *
 * This only changes the display threshold. The source record's minZoom and
 * geometry are preserved, and county seats keep the normal detailed threshold.
 */
const earlyPeriodIds = new Set(["qin", "han", "sanguo", "jin", "nanbei", "sui"]);

export const isEarlySettlementPeriod = (periodId: string): boolean => earlyPeriodIds.has(periodId);

export function temporalSettlementDisplayZoom(
  properties: Pick<TemporalSettlementProperties, "level" | "minZoom">,
  periodId: string,
): number {
  if (isEarlySettlementPeriod(periodId) && properties.level === "prefecture") return 4;
  return properties.minZoom;
}
