export const TERRAIN_SOURCE_ID = "modern-terrain-dem";

/** Optional elevation failures belong to the terrain control, not the base map. */
export function isTerrainError(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const details = event as { sourceId?: unknown; error?: unknown };
  if (typeof details.sourceId === "string" && details.sourceId.startsWith("modern-terrain-")) return true;
  if (!details.error || typeof details.error !== "object") return false;
  const error = details.error as { message?: unknown; url?: unknown };
  const description = `${typeof error.message === "string" ? error.message : ""} ${typeof error.url === "string" ? error.url : ""}`;
  return /modern-terrain-|\/data\/terrain\//.test(description);
}
