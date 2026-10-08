import type { BoundaryDataset } from "./boundaries";
import type { HistoricalEvent } from "./types";

export function boundaryDatasetAtYear(datasets: readonly BoundaryDataset[], periodId: string, year: number) {
  return datasets.filter(dataset => dataset.periodId === periodId)
    .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || a.year - b.year)[0];
}

export function eventIncludesYear(event: HistoricalEvent, year: number) {
  return event.year <= year && year <= (event.endYear ?? event.year);
}
