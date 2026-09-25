import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BoundaryDataset, BoundaryLevel, BoundaryManifest, BoundarySelection } from "../../shared/boundaries";
import { boundaryCountryCoverage, boundaryLevelName } from "../../shared/boundaries";
import { resolveMapDetailLevel } from "../../shared/map-detail-levels";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import { resolveBoundarySelectionRequest, type BoundaryRequestState, type BoundarySelectionRequest } from "../../shared/boundary-selection";
import BoundaryControls from "./BoundaryControls";
import type { ModernCorrespondenceData } from "../../shared/modern-correspondence";
import { getBoundaryDisplayLabel } from "../../shared/boundary-labels";
import { chinesePlaceName, localizedAdminType, localizedPolity } from "../../shared/place-name-localization";
import type { TangCountyDiagnostics } from "../../shared/tang-county-diagnostics";

type RegionProperties = BoundarySelection & { color?: string; labelCoordinates?: [number, number]; sourceHierarchy?: { polity?: string } };
type Regions = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;
const empty: Regions = { type: "FeatureCollection", features: [] };
const levels: BoundaryLevel[] = ["country", "province", "prefecture", "county"];
const colors = { country: "#8a5742", province: "#83658d", prefecture: "#527767", county: "#a58957" };

export default function HistoricalBoundaryLayer({ map, ready, periodId, currentYear, onStatusChange, onRegionFocus, modernNames, enabled = true, embedded = false, onSelection, resetKey, onOpenAtlas, interactionMode = "all", selectionRequest, onRegionSelect, countyDiagnostics, countyDiagnosticsError }: {
  map: MapInstance | null;
  ready: boolean;
  periodId: string;
  currentYear: number;
  onStatusChange: (status: string) => void;
  onRegionFocus: (coordinates: [number, number][]) => void;
  modernNames: boolean;
  enabled?: boolean;
  embedded?: boolean;
  onSelection?: () => void;
  resetKey?: string;
  onOpenAtlas?: () => void;
  interactionMode?: "cities" | "mountains" | "rivers" | "all";
  selectionRequest?: BoundarySelectionRequest;
  onRegionSelect?: (selection: BoundarySelection) => void;
  countyDiagnostics?: TangCountyDiagnostics;
  countyDiagnosticsError?: string;
}) {
  const [manifest, setManifest] = useState<BoundaryManifest | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [regions, setRegions] = useState<Regions>(empty);
  const [loadedDatasetId, setLoadedDatasetId] = useState<string>();
  const [zoom, setZoom] = useState(map?.getZoom() ?? 3);
  const interactive = interactionMode === "cities" || interactionMode === "all";
  const [selection, setSelection] = useState<BoundarySelection | null>(null);
  const selectionCallback = useRef(onSelection);
  selectionCallback.current = onSelection;
  const regionCallback = useRef(onRegionSelect); regionCallback.current = onRegionSelect;
  const focusCallback = useRef(onRegionFocus); focusCallback.current = onRegionFocus;
  const requestState = useRef<BoundaryRequestState | undefined>(undefined);
  const focusedLabelId = useRef<string | undefined>(undefined);
  useEffect(() => { setSelection(null); }, [resetKey]);
  // Hiding the overlay must not discard a completed quiet selection: reopening
  // restores its highlight without replaying the request or moving the camera.
  useEffect(() => { if (!interactive) setSelection(null); }, [interactive]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [manifestError, setManifestError] = useState("");
  const error = manifestError || dataError;
  const [correspondences, setCorrespondences] = useState<ModernCorrespondenceData | null>(null);
  const [correspondenceError, setCorrespondenceError] = useState("");
  const datasets = useMemo(() => manifest?.datasets.filter(item => item.periodId === periodId) ?? [], [manifest, periodId]);
  const dataset: BoundaryDataset | undefined = datasets.find(item => item.id === datasetId)
    ?? [...datasets].sort((a, b) => Math.abs(a.year - currentYear) - Math.abs(b.year - currentYear))[0];
  const availableLevels = useMemo(() => levels.filter(level => dataset?.layers.some(layer => layer.level === level && layer.featureCount > 0)), [dataset]);
  const detail = useMemo(() => resolveMapDetailLevel("auto", zoom, availableLevels, { primaryCountryCoverage: !boundaryCountryCoverage(dataset).incomplete }), [zoom, availableLevels, dataset]);
  const visibleLevelKey = detail.visibleLevels.join("|");
  const visibleLevels = useMemo(() => visibleLevelKey ? visibleLevelKey.split("|") as BoundaryLevel[] : [], [visibleLevelKey]);

  useEffect(() => {
    if (!map || !ready) return;
    const update = () => setZoom(map.getZoom());
    map.on("zoom", update);
    update();
    return () => { map.off("zoom", update); };
  }, [map, ready]);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/data/boundaries/manifest.json", { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error("边界资料目录加载失败"); return response.json(); })
      .then(setManifest)
      .catch(error => { if (error.name !== "AbortError") setManifestError(error.message); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/modern-correspondence.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("区域古今对照暂时无法加载"); return response.json(); })
      .then(setCorrespondences)
      .catch(error => { if (error.name !== "AbortError") setCorrespondenceError(error.message); });
    return () => controller.abort();
  }, []);

  const renderedRegions = useMemo<Regions>(() => ({ ...regions, features: regions.features.map(feature => ({
    ...feature, properties: { ...feature.properties, geometryStatus: countyDiagnostics?.byBoundary[feature.properties.id]?.status },
  })) }), [regions, countyDiagnostics]);
  const displayRegions = useMemo<Regions>(() => ({ ...renderedRegions, features: renderedRegions.features.map(feature => {
    const match = correspondences?.entries[feature.properties.id];
    return { ...feature, properties: { ...feature.properties, ...getBoundaryDisplayLabel(feature.properties, match?.simplifiedName),
      polity: localizedPolity(feature.properties.sourceHierarchy?.polity), originalPolity: feature.properties.sourceHierarchy?.polity,
      sourceAdminType: localizedAdminType(feature.properties.sourceAdminType), originalAdminType: feature.properties.sourceAdminType,
      modernNames: (match?.modernNames ?? []).map(name => chinesePlaceName(name, "现代地区名称待核定")),
      correspondenceNote: match?.note ?? "现代地区对应尚未收录。", correspondenceSourceIds: match?.sourceIds ?? [] } };
  }) }), [renderedRegions, correspondences]);
  const selectedDiagnostic = selection ? countyDiagnostics?.byBoundary[selection.id] : undefined;

  useEffect(() => {
    setSelection(current => {
      if (!current) return current;
      const latest = displayRegions.features.find(feature => feature.properties.id === current.id)?.properties;
      return latest ?? null;
    });
  }, [displayRegions]);

  useEffect(() => {
    setRegions(empty);
    setLoadedDatasetId(undefined);
    setSelection(null);
    setDataError("");
    if (!dataset) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true);
    Promise.all(dataset.layers.map(async layer => {
      const response = await fetch(layer.url, { signal: abort.signal });
      if (!response.ok) throw new Error(`${layer.label}加载失败，请刷新重试`);
      const data: Regions = await response.json();
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("边界文件格式错误");
      return data.features;
    })).then(batches => {
      if (!abort.signal.aborted) {
        setRegions({ type: "FeatureCollection", features: batches.flat() });
        setLoadedDatasetId(dataset.id);
      }
    }).catch(error => {
      if (error.name !== "AbortError") setDataError(error.message);
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [dataset?.id]);

  useEffect(() => {
    onStatusChange(error ? "历史边界加载失败" : !manifest || loading ? "历史边界加载中…" : !dataset ? "本时期尚无已接入边界" : `${dataset.year} 年${dataset.accuracy === "approximate-model" ? "近似行政模型" : "历史行政边界"}`);
  }, [dataset, manifest, loading, error, onStatusChange]);

  useEffect(() => {
    if (!map || !ready) return;
    map.addSource("historical-boundaries", { type: "geojson", data: empty, tolerance: 0.15 });
    map.addSource("boundary-diagnostic-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    for (const level of levels) {
      map.addLayer({ id: `boundary-${level}-fill`, type: "fill", source: "historical-boundaries", filter: ["==", ["get", "level"], level],
        paint: { "fill-color": ["coalesce", ["get", "color"], colors[level]], "fill-opacity": ["case", ["==", ["get", "geometryStatus"], "outside"], 0, level === "province" ? 0.13 : 0.065] } }, "lakes-fill");
    }
    for (const level of [...levels].reverse()) {
      map.addLayer({ id: `boundary-${level}-line`, type: "line", source: "historical-boundaries", filter: ["all", ["==", ["get", "level"], level], ["!=", ["get", "geometryStatus"], "outside"]],
        paint: { "line-color": colors[level], "line-opacity": level === "county" ? 0.65 : 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, level === "country" ? 1.8 : level === "province" ? 1.2 : 0.4, 7, level === "country" ? 3.8 : level === "province" ? 2.6 : level === "prefecture" ? 1.5 : 0.8] } }, "route-line");
    }
    map.addLayer({ id: "boundary-county-conflict-line", type: "line", source: "historical-boundaries", filter: ["==", ["get", "geometryStatus"], "outside"], paint: { "line-color": "#a08b76", "line-opacity": 0.65, "line-width": 1, "line-dasharray": [3, 3] } }, "route-line");
    map.addLayer({ id: "boundary-selected-fill", type: "fill", source: "historical-boundaries", filter: ["==", ["get", "id"], ""], paint: { "fill-color": "#bc7044", "fill-opacity": 0.3 } }, "route-line");
    map.addLayer({ id: "boundary-selected-line", type: "line", source: "historical-boundaries", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#7a3526", "line-width": 3.5 } }, "route-line");
    map.addLayer({ id: "boundary-selected-conflict", type: "line", source: "historical-boundaries", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#9a6c3d", "line-width": 2.8, "line-dasharray": [3, 2] } }, "route-line");
    map.addLayer({ id: "boundary-diagnostic-points", type: "circle", source: "boundary-diagnostic-points", paint: { "circle-radius": 10, "circle-color": "#f9f6e9", "circle-opacity": 0.15, "circle-stroke-width": 2.5, "circle-stroke-color": "#9b5738" } }, "route-line");
    return () => {
      if (!map.getStyle()) return;
      for (const id of ["boundary-diagnostic-points", "boundary-selected-conflict", "boundary-county-conflict-line", "boundary-selected-fill", "boundary-selected-line", ...levels.flatMap(level => [`boundary-${level}-fill`, `boundary-${level}-line`])]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource("historical-boundaries")) map.removeSource("historical-boundaries");
      if (map.getSource("boundary-diagnostic-points")) map.removeSource("boundary-diagnostic-points");
    };
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    (map.getSource("historical-boundaries") as GeoJSONSource).setData(renderedRegions);
  }, [map, ready, renderedRegions]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    for (const level of levels) for (const kind of ["fill", "line"]) {
      map.setLayoutProperty(`boundary-${level}-${kind}`, "visibility", enabled && visibleLevels.includes(level) ? "visible" : "none");
    }
    for (const kind of ["fill", "line"]) map.setLayoutProperty(`boundary-selected-${kind}`, "visibility", enabled && interactive && selection ? "visible" : "none");
    map.setLayoutProperty("boundary-county-conflict-line", "visibility", enabled && visibleLevels.includes("county") ? "visible" : "none");
    for (const id of ["boundary-selected-conflict", "boundary-diagnostic-points"]) map.setLayoutProperty(id, "visibility", enabled && interactive && selection ? "visible" : "none");
  }, [map, ready, visibleLevels, enabled, interactive, selection]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    for (const kind of ["fill", "line"]) map.setFilter(`boundary-selected-${kind}`, ["all", ["==", ["get", "id"], selection?.id ?? ""], ["!=", ["get", "geometryStatus"], "outside"]]);
    map.setFilter("boundary-selected-conflict", ["all", ["==", ["get", "id"], selection?.id ?? ""], ["==", ["get", "geometryStatus"], "outside"]]);
  }, [map, ready, selection]);

  useEffect(() => {
    if (!ready || !map?.getSource("boundary-diagnostic-points")) return;
    (map.getSource("boundary-diagnostic-points") as GeoJSONSource).setData({ type: "FeatureCollection", features: selectedDiagnostic?.status === "outside" ? selectedDiagnostic.sourcePoints.map(point => ({ type: "Feature", properties: { id: point.id }, geometry: { type: "Point", coordinates: point.coordinates } })) : [] });
  }, [map, ready, selectedDiagnostic]);

  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    const click = (event: MapMouseEvent) => {
      // A named button or the highest-priority specific feature owns this click,
      // regardless of which map listener was registered first.
      if (event.originalEvent.defaultPrevented) return;
      if ((event.originalEvent.target as HTMLElement)?.closest?.(".nature-label,.place-marker,.geography-reference-marker,.boundary-region-label,.tang-detail-label,.historical-river-label")) return;
      if (findNaturalMapHit(map, event.point, interactionMode)) return;
      const orderedLevels = [detail.activeLevel, ...visibleLevels].filter((level, index, array): level is BoundaryLevel => level !== null && array.indexOf(level) === index);
      const layers = orderedLevels.map(level => `boundary-${level}-fill`);
      if (!layers.length) return;
      const found = map.queryRenderedFeatures(event.point, { layers });
      const feature = layers.flatMap(layer => found.filter(item => item.layer.id === layer))[0];
      const props = feature?.properties;
      const original = displayRegions.features.find(item => item.properties.id === props?.id)?.properties;
      setSelection(original ?? null);
      if (original) { selectionCallback.current?.(); regionCallback.current?.(original); }
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, visibleLevels, detail.activeLevel, displayRegions, enabled, interactive, interactionMode]);

  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    let markers: Marker[] = [];
    let frame: number | undefined;
    const renderLabels = () => {
      const focusedId = (document.activeElement instanceof HTMLElement ? document.activeElement.dataset.boundaryId : undefined) ?? focusedLabelId.current;
      focusedLabelId.current = undefined;
      markers.forEach(marker => marker.remove());
      markers = [];
      const bounds = map.getBounds();
      const container = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label")].filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0).map(el => el.getBoundingClientRect());
      const candidates = displayRegions.features.filter(({ properties: p }) => p.labelCoordinates && visibleLevels.includes(p.level) && bounds.contains(p.labelCoordinates))
        .sort((a, b) => Number(b.properties.id === focusedId || b.properties.id === selection?.id) - Number(a.properties.id === focusedId || a.properties.id === selection?.id) || levels.indexOf(a.properties.level) - levels.indexOf(b.properties.level)).slice(0, 250);
      for (const { properties: p } of candidates) {
        const point = map.project(p.labelCoordinates!);
        const modern = modernNames && p.modernNames?.length ? `今参考 · ${p.modernNames.join(" / ")}` : "";
        const modernLabel = modern.length > 20 ? `${modern.slice(0, 19)}…` : modern;
        const width = Math.max(44, p.name.length * (p.level === "province" ? 14 : 12) + 16, modernLabel.length * 9 + 16);
        const left = container.left + point.x - width / 2;
        const top = container.top + point.y - 20;
        const box = { left, top, right: left + width, bottom: top + (modernLabel ? 50 : 40) };
        if (p.id !== selection?.id && p.id !== focusedId && occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5 && box.top < other.bottom + 5 && box.bottom > other.top - 5)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.type = "button";
        element.className = `boundary-region-label boundary-region-${p.level}${p.id === selection?.id ? " is-selected" : ""}${p.geometryStatus === "outside" ? " is-conflicted" : ""}`;
        element.dataset.boundaryId = p.id;
        element.setAttribute("aria-label", `查看${p.name}的${p.geometryStatus === "outside" ? "存疑模型范围" : `${boundaryLevelName(p.level, periodId)}范围`}${modern ? `，${modern}` : ""}`);
        element.setAttribute("aria-pressed", String(p.id === selection?.id));
        element.textContent = p.name;
        if (p.geometryStatus === "outside") { const note = document.createElement("small"); note.className = "county-model-label-note"; note.textContent = "模型范围存疑"; element.append(note); }
        if (modernLabel) { const current = document.createElement("small"); current.textContent = modernLabel; element.append(current); }
        element.addEventListener("pointerdown", event => event.stopPropagation());
        element.addEventListener("click", event => {
          event.stopPropagation();
          setSelection(p);
          selectionCallback.current?.();
          regionCallback.current?.(p);
        });
        markers.push(new Marker({ element }).setLngLat(p.labelCoordinates!).addTo(map));
        if (p.id === focusedId) element.focus({ preventScroll: true });
      }
    };
    const schedule = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = requestAnimationFrame(renderLabels); };
    map.on("moveend", schedule);
    map.on("resize", schedule);
    schedule();
    return () => {
      focusedLabelId.current = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.boundaryId : undefined;
      map.off("moveend", schedule); map.off("resize", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
      markers.forEach(marker => marker.remove());
    };
  }, [map, ready, displayRegions, visibleLevels, modernNames, enabled, interactive, selection?.id, periodId]);

  const regionOptions = useMemo(() => displayRegions.features.map(feature => feature.properties), [displayRegions]);
  const focusRegion = useCallback((id: string, options: { focus?: boolean; quiet?: boolean } = {}) => {
    const feature = displayRegions.features.find(item => item.properties.id === id);
    if (!feature || !map || !ready || !enabled || !interactive || loadedDatasetId !== dataset?.id) return false;
    setSelection(feature.properties);
    if (!options.quiet) { selectionCallback.current?.(); regionCallback.current?.(feature.properties); }
    if (options.focus !== false) {
      const coordinates = feature.geometry.type === "Polygon" ? feature.geometry.coordinates.flat() : feature.geometry.coordinates.flat(2);
      const sourcePoints = countyDiagnostics?.byBoundary[id]?.status === "outside" ? countyDiagnostics.byBoundary[id].sourcePoints.map(point => point.coordinates) : [];
      focusCallback.current([...coordinates.map(point => [point[0], point[1]] as [number, number]), ...sourcePoints]);
    }
    return true;
  }, [displayRegions, map, ready, enabled, interactive, loadedDatasetId, dataset?.id, countyDiagnostics]);
  useEffect(() => {
    const result = resolveBoundarySelectionRequest(requestState.current, {
      request: selectionRequest, resetKey, datasetId: dataset?.id,
      dataReady: !!map && ready && !!dataset && loadedDatasetId === dataset.id,
      interactive: enabled && interactive,
      targetExists: !!selectionRequest && displayRegions.features.some(feature => feature.properties.id === selectionRequest.id),
    });
    requestState.current = result.state;
    if (result.clearSelection) setSelection(null);
    if (result.apply) focusRegion(result.apply.id, result.apply);
  }, [selectionRequest, resetKey, dataset?.id, loadedDatasetId, map, ready, enabled, interactive, displayRegions, focusRegion]);
  return <BoundaryControls embedded={embedded} enabled={enabled} datasets={datasets} selectedDataset={dataset} onDatasetChange={setDatasetId}
    visibleLevels={visibleLevels} interactive={interactive} activeLevel={detail.activeLevel} zoom={zoom} onOpenAtlas={onOpenAtlas}
    selection={selection} onSelectionClose={() => setSelection(null)} currentYear={currentYear} loading={loading || !manifest && !error} error={error}
    countyDiagnostic={selectedDiagnostic} countyDiagnosticsError={periodId === "tang" ? countyDiagnosticsError : undefined}
    regionOptions={regionOptions} onRegionSelect={focusRegion} correspondenceSources={correspondences?.sources ?? []} correspondenceError={correspondenceError} />;
}
