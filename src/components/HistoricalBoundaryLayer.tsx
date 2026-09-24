import { useEffect, useMemo, useState } from "react";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BoundaryDataset, BoundaryLevel, BoundaryManifest, BoundarySelection } from "../../shared/boundaries";
import BoundaryControls from "./BoundaryControls";
import type { ModernCorrespondenceData } from "../../shared/modern-correspondence";
import { getBoundaryDisplayLabel } from "../../shared/boundary-labels";

type RegionProperties = BoundarySelection & { color?: string; labelCoordinates?: [number, number]; sourceHierarchy?: { polity?: string } };
type Regions = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;
const empty: Regions = { type: "FeatureCollection", features: [] };
const levels: BoundaryLevel[] = ["country", "province", "prefecture", "county"];
const colors = { country: "#8a5742", province: "#83658d", prefecture: "#527767", county: "#a58957" };

export default function HistoricalBoundaryLayer({ map, ready, periodId, currentYear, onStatusChange, onRegionFocus, modernNames, enabled = true, embedded = false, onSelection, resetKey }: {
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
}) {
  const [manifest, setManifest] = useState<BoundaryManifest | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [regions, setRegions] = useState<Regions>(empty);
  const [visibleLevels, setVisibleLevels] = useState<BoundaryLevel[]>(levels);
  const [selection, setSelection] = useState<BoundarySelection | null>(null);
  useEffect(() => { setSelection(null); }, [resetKey]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [manifestError, setManifestError] = useState("");
  const error = manifestError || dataError;
  const [correspondences, setCorrespondences] = useState<ModernCorrespondenceData | null>(null);
  const [correspondenceError, setCorrespondenceError] = useState("");
  const datasets = useMemo(() => manifest?.datasets.filter(item => item.periodId === periodId) ?? [], [manifest, periodId]);
  const dataset: BoundaryDataset | undefined = datasets.find(item => item.id === datasetId)
    ?? [...datasets].sort((a, b) => Math.abs(a.year - currentYear) - Math.abs(b.year - currentYear))[0];

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

  const displayRegions = useMemo<Regions>(() => ({ ...regions, features: regions.features.map(feature => {
    const match = correspondences?.entries[feature.properties.id];
    return { ...feature, properties: { ...feature.properties, ...getBoundaryDisplayLabel(feature.properties, match?.simplifiedName), modernNames: match?.modernNames ?? [],
      correspondenceNote: match?.note ?? "现代地区对应尚未收录。", correspondenceSourceIds: match?.sourceIds ?? [] } };
  }) }), [regions, correspondences]);

  useEffect(() => {
    setSelection(current => {
      if (!current) return current;
      const latest = displayRegions.features.find(feature => feature.properties.id === current.id)?.properties;
      return latest ? { ...latest, polity: latest.sourceHierarchy?.polity } : null;
    });
  }, [displayRegions]);

  useEffect(() => {
    setRegions(empty);
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
      if (!abort.signal.aborted) setRegions({ type: "FeatureCollection", features: batches.flat() });
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
    for (const level of levels) {
      map.addLayer({ id: `boundary-${level}-fill`, type: "fill", source: "historical-boundaries", filter: ["==", ["get", "level"], level],
        paint: { "fill-color": ["coalesce", ["get", "color"], colors[level]], "fill-opacity": level === "province" ? 0.13 : 0.025 } }, "lakes-fill");
    }
    for (const level of [...levels].reverse()) {
      map.addLayer({ id: `boundary-${level}-line`, type: "line", source: "historical-boundaries", filter: ["==", ["get", "level"], level],
        minzoom: level === "county" ? 4.5 : 0,
        paint: { "line-color": colors[level], "line-opacity": level === "county" ? 0.65 : 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, level === "country" ? 1.8 : level === "province" ? 1.2 : 0.4, 7, level === "country" ? 3.8 : level === "province" ? 2.6 : level === "prefecture" ? 1.5 : 0.8] } }, "route-line");
    }
    map.addLayer({ id: "boundary-selected-fill", type: "fill", source: "historical-boundaries", filter: ["==", ["get", "id"], ""], paint: { "fill-color": "#be8052", "fill-opacity": 0.22 } }, "route-line");
    map.addLayer({ id: "boundary-selected-line", type: "line", source: "historical-boundaries", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#914a32", "line-width": 2.5 } }, "route-line");
    return () => {
      if (!map.getStyle()) return;
      for (const id of ["boundary-selected-fill", "boundary-selected-line", ...levels.flatMap(level => [`boundary-${level}-fill`, `boundary-${level}-line`])]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource("historical-boundaries")) map.removeSource("historical-boundaries");
    };
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    (map.getSource("historical-boundaries") as GeoJSONSource).setData(regions);
  }, [map, ready, regions]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    for (const level of levels) for (const kind of ["fill", "line"]) {
      map.setLayoutProperty(`boundary-${level}-${kind}`, "visibility", enabled && visibleLevels.includes(level) ? "visible" : "none");
    }
    setSelection(current => current && (!enabled || !visibleLevels.includes(current.level)) ? null : current);
    for (const kind of ["fill", "line"]) map.setLayoutProperty(`boundary-selected-${kind}`, "visibility", enabled ? "visible" : "none");
  }, [map, ready, visibleLevels, enabled]);

  useEffect(() => {
    if (!ready || !map?.getSource("historical-boundaries")) return;
    for (const kind of ["fill", "line"]) map.setFilter(`boundary-selected-${kind}`, ["==", ["get", "id"], selection?.id ?? ""]);
  }, [map, ready, selection]);

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    const click = (event: MapMouseEvent) => {
      // DOM labels handle their own selection; the canvas always selects the
      // most detailed visible administrative area, even over a river or lake.
      if ((event.originalEvent.target as HTMLElement)?.closest?.(".nature-label,.place-marker,.geography-reference-marker")) return;
      // Prefer the most detailed visible level at this zoom.
      const layers = [...levels].reverse().filter(level => visibleLevels.includes(level) && (level !== "county" || map.getZoom() >= 4.5)).map(level => `boundary-${level}-fill`);
      if (!layers.length) return;
      const found = map.queryRenderedFeatures(event.point, { layers });
      const feature = layers.flatMap(layer => found.filter(item => item.layer.id === layer))[0];
      const props = feature?.properties;
      const original = displayRegions.features.find(item => item.properties.id === props?.id)?.properties;
      setSelection(original ? { ...original, polity: original.sourceHierarchy?.polity } : null);
      if (original) onSelection?.();
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, visibleLevels, displayRegions, enabled, onSelection]);

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    let markers: Marker[] = [];
    let frame: number | undefined;
    const renderLabels = () => {
      markers.forEach(marker => marker.remove());
      markers = [];
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const container = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label")].filter(el => el.style.display !== "none").map(el => el.getBoundingClientRect());
      const candidates = displayRegions.features.filter(({ properties: p }) => p.labelCoordinates && visibleLevels.includes(p.level) && bounds.contains(p.labelCoordinates) && zoom >= (p.level === "county" ? 6.4 : p.level === "prefecture" ? 4.4 : 0))
        .sort((a, b) => levels.indexOf(a.properties.level) - levels.indexOf(b.properties.level)).slice(0, 250);
      for (const { properties: p } of candidates) {
        const point = map.project(p.labelCoordinates!);
        const modern = modernNames && p.modernNames?.length ? `今参考 · ${p.modernNames.join(" / ")}` : "";
        const modernLabel = modern.length > 20 ? `${modern.slice(0, 19)}…` : modern;
        const width = Math.max(30, p.name.length * (p.level === "province" ? 14 : 12), modernLabel.length * 9);
        const left = container.left + point.x - width / 2;
        const top = container.top + point.y - 9;
        const box = { left, top, right: left + width, bottom: top + (modernLabel ? 34 : 18) };
        if (occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5 && box.top < other.bottom + 5 && box.bottom > other.top - 5)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("span");
        element.className = `boundary-region-label boundary-region-${p.level}`;
        element.textContent = p.name;
        if (modernLabel) { const current = document.createElement("small"); current.textContent = modernLabel; element.append(current); }
        element.setAttribute("aria-hidden", "true");
        element.style.pointerEvents = "none";
        markers.push(new Marker({ element }).setLngLat(p.labelCoordinates!).addTo(map));
      }
    };
    const schedule = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = requestAnimationFrame(renderLabels); };
    map.on("moveend", schedule);
    map.on("resize", schedule);
    schedule();
    return () => { map.off("moveend", schedule); map.off("resize", schedule); if (frame !== undefined) cancelAnimationFrame(frame); markers.forEach(marker => marker.remove()); };
  }, [map, ready, displayRegions, visibleLevels, modernNames, enabled]);

  const regionOptions = useMemo(() => displayRegions.features.map(feature => feature.properties), [displayRegions]);
  function focusRegion(id: string) {
    const feature = displayRegions.features.find(item => item.properties.id === id);
    if (!feature || !map || !enabled) return;
    if (!visibleLevels.includes(feature.properties.level)) setVisibleLevels(current => [...current, feature.properties.level]);
    setSelection({ ...feature.properties, polity: feature.properties.sourceHierarchy?.polity });
    onSelection?.();
    const coordinates = feature.geometry.type === "Polygon" ? feature.geometry.coordinates.flat() : feature.geometry.coordinates.flat(2);
    onRegionFocus(coordinates.map(point => [point[0], point[1]]));
  }
  return <BoundaryControls embedded={embedded} enabled={enabled} datasets={datasets} selectedDataset={dataset} onDatasetChange={setDatasetId}
    visibleLevels={visibleLevels} onLevelToggle={level => setVisibleLevels(current => current.includes(level) ? current.filter(item => item !== level) : [...current, level])}
    selection={selection} onSelectionClose={() => setSelection(null)} currentYear={currentYear} loading={loading || !manifest && !error} error={error}
    regionOptions={regionOptions} onRegionSelect={focusRegion} correspondenceSources={correspondences?.sources ?? []} correspondenceError={correspondenceError} />;
}
