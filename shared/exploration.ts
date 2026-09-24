import type { Catalog } from "./types";

export interface ExplorationState {
  periodId: string;
  topicId: string | null;
  placeId: string | null;
  eventId: string | null;
  detailsView: "place" | "events";
  modernNames: boolean;
  routeVisible: boolean;
}

const safeId = (value: unknown): string | null =>
  typeof value === "string" &&
  value.length <= 120 &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)
    ? value
    : null;

/** Resolve inconsistent links into one view; event identity takes precedence. */
export function normalizeExploration(
  input: Partial<ExplorationState>,
  catalog: Catalog,
): ExplorationState {
  const defaultPeriod =
    catalog.periods.find((period) => period.id === "tang") ??
    catalog.periods[0];
  let period =
    catalog.periods.find((item) => item.id === safeId(input.periodId)) ??
    defaultPeriod;
  let topic =
    input.topicId === undefined
      ? catalog.topics?.find(
          (item) => item.id === "anshi" && item.periodId === period?.id,
        )
      : catalog.topics?.find((item) => item.id === safeId(input.topicId));
  let event = catalog.events.find((item) => item.id === safeId(input.eventId));
  let place = catalog.places.find((item) => item.id === safeId(input.placeId));

  if (topic)
    period =
      catalog.periods.find((item) => item.id === topic!.periodId) ?? period;
  // Undefined allows a landing-page default. Explicit null always closes detail.
  if (!event && input.eventId === undefined && !place && topic) {
    event = catalog.events.find((item) => item.id === topic!.eventIds[0]);
  }
  if (event) {
    if (topic && !topic.eventIds.includes(event.id)) topic = undefined;
    if (!event.periodIds.includes(period?.id ?? "")) {
      period =
        catalog.periods.find((item) => event!.periodIds.includes(item.id)) ??
        period;
    }
    if (
      !place ||
      !event.placeIds.includes(place.id) ||
      !place.periodIds.includes(period?.id ?? "")
    ) {
      place = catalog.places.find(
        (item) =>
          event!.placeIds.includes(item.id) &&
          item.periodIds.includes(period?.id ?? ""),
      );
    }
  } else if (place) {
    if (topic && !topic.placeIds.includes(place.id)) topic = undefined;
    if (!place.periodIds.includes(period?.id ?? "")) {
      period =
        catalog.periods.find((item) => place!.periodIds.includes(item.id)) ??
        period;
    }
  }
  if (!place && period) {
    const available = catalog.places.filter(
      (item) =>
        item.periodIds.includes(period!.id) &&
        (!topic || topic.placeIds.includes(item.id)),
    );
    place =
      available.find((item) => item.id === "changan") ??
      available.find(
        (item) => (item.typeByPeriod?.[period!.id] ?? item.type) === "capital",
      ) ??
      available[0];
  }
  return {
    periodId: period?.id ?? "",
    topicId: topic?.id ?? null,
    placeId: place?.id ?? null,
    eventId: event?.id ?? null,
    detailsView: event || input.detailsView === "events" ? "events" : "place",
    modernNames: input.modernNames === true,
    routeVisible: input.routeVisible !== false,
  };
}

/** Accept window.location.search; unknown, duplicated and oversized ids are discarded. */
export function parseExploration(
  search: string,
  catalog: Catalog,
): ExplorationState {
  const parameters = new URLSearchParams(
    typeof search === "string" && search.length <= 8192 ? search : "",
  );
  const id = (key: string) =>
    parameters.getAll(key).length === 1 ? safeId(parameters.get(key)) : null;
  const hasView = ["period", "topic", "place", "event", "view"].some((key) =>
    parameters.has(key),
  );
  const input: Partial<ExplorationState> = {
    detailsView:
      parameters.getAll("view").length === 1 &&
      parameters.get("view") === "events"
        ? "events"
        : "place",
    modernNames:
      parameters.getAll("modern").length === 1 &&
      parameters.get("modern") === "1",
    routeVisible: !(
      parameters.getAll("route").length === 1 && parameters.get("route") === "0"
    ),
  };
  if (hasView) {
    input.periodId = id("period") ?? undefined;
    input.topicId = id("topic");
    input.placeId = id("place");
    // Only a topic-only link opens its first event. Explicit views must survive
    // refresh even when a hand-written link does not name a selected place.
    input.eventId =
      parameters.has("event") || parameters.has("place") || parameters.has("view") || !input.topicId
        ? id("event")
        : undefined;
  }
  return normalizeExploration(input, catalog);
}

/** Stable, relative URL state. The period is always explicit to preserve topic exits. */
export function serializeExploration(state: ExplorationState): string {
  const parameters = new URLSearchParams();
  if (safeId(state.periodId)) parameters.set("period", state.periodId);
  if (safeId(state.topicId)) parameters.set("topic", state.topicId!);
  if (safeId(state.placeId)) parameters.set("place", state.placeId!);
  if (safeId(state.eventId)) parameters.set("event", state.eventId!);
  else if (state.topicId && !state.placeId) parameters.set("event", "");
  if (!state.eventId && state.detailsView === "events")
    parameters.set("view", "events");
  if (state.modernNames) parameters.set("modern", "1");
  if (!state.routeVisible) parameters.set("route", "0");
  const query = parameters.toString();
  return query ? `?${query}` : "";
}
