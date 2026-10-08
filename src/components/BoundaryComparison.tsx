import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import { ArrowLeftRight, ChevronDown, Expand, LocateFixed, Minus, Plus, X } from "lucide-react";
import type { Place } from "../../shared/types";
import { boundaryCountryCoverage, boundaryLevelName, type BoundaryDataset, type BoundaryManifest } from "../../shared/boundaries";
import { resolveMapDetailLevel } from "../../shared/map-detail-levels";
import type { ModernCorrespondenceData } from "../../shared/modern-correspondence";
import type { TangBoundaryCrosswalk } from "../../shared/tang-boundary-crosswalk";
import type { SongBoundaryResearchDocument } from "../../shared/song-boundary-research";
import type { MingBoundaryResearchDocument } from "../../shared/ming-boundary-research";
import {
  comparisonCityRecord, comparisonCityYears, comparisonGeometryBounds, comparisonLinkLayers,
  comparisonYearLabel, createComparisonCameraSync, initialComparisonYears, localizeComparisonRegions, selectComparisonYear,
  type ComparisonCityRecord, type ComparisonRegion, type ComparisonRegions, type ComparisonSide,
} from "../../shared/boundary-comparison";
import "../boundary-comparison.css";

maplibregl.setWorkerUrl(workerUrl);
const EMPTY: ComparisonRegions = { type: "FeatureCollection", features: [] };
const DEFAULT_CAMERA = { center: [106.5, 34.5] as [number, number], zoom: 3.4, bearing: 0, pitch: 0 };
const ALL_YEARS = [741, 1080, 1200, 1290, 1391, 1820, 1911];
const levels = ["country", "province", "prefecture", "county"] as const;
const regionLayers = levels.map(level => `comparison-${level}-fill`);

type Props = { open: boolean; onClose: () => void; place?: Place; initialYear: number };
type Resource<T> = { data?: T; loading: boolean; error: string; retry: () => void };
type TargetReport = { token: string; ready: boolean; features: ComparisonRegion[] };

/** Cache only completed responses within this open comparison. Abort every superseded request. */
function useResource<T>(url: string, active: boolean, validate: (data: T) => boolean): Resource<T> {
  const cache = useRef<T | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState("");
  const retry = useCallback(() => { cache.current = undefined; setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (!active) { setLoading(false); return; }
    if (cache.current) { setData(cache.current); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error("资料暂时无法加载");
      const result = await response.json() as T;
      if (!validate(result)) throw Error("资料格式不完整");
      if (!controller.signal.aborted) { cache.current = result; setData(result); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "资料暂时无法加载");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, active, attempt, validate]);
  return { data, loading, error, retry };
}

const validManifest = (data: BoundaryManifest) => Array.isArray(data?.datasets) && data.datasets.every(dataset => Number.isFinite(dataset.year) && Array.isArray(dataset.layers));
const validLand = (data: FeatureCollection) => data?.type === "FeatureCollection" && Array.isArray(data.features);
const validModern = (data: ModernCorrespondenceData) => !!data?.entries;
const validTang = (data: TangBoundaryCrosswalk) => data?.boundaryYear === 741 && !!data.places;
const validSong = (data: SongBoundaryResearchDocument) => data?.boundaryYear === 1200 && !!data.byBoundary && Array.isArray(data.unlinkedEntries);
const validMing = (data: MingBoundaryResearchDocument) => data?.boundaryYear === 1391 && !!data.byBoundary && Array.isArray(data.unlinkedEntries);

export default function BoundaryComparison(props: Props) {
  return props.open ? <ComparisonSession {...props} /> : null;
}

function ComparisonSession({ onClose, place, initialYear }: Props) {
  const [mode, setMode] = useState<"region" | "city">(place ? "city" : "region");
  const [collapsed, setCollapsed] = useState(false);
  const [years, setYears] = useState<[number, number]>(() => initialComparisonYears(initialYear, place ? comparisonCityYears : ALL_YEARS));
  const [fitRequest, setFitRequest] = useState(0);
  const [mapsRevision, setMapsRevision] = useState(0);
  const [targets, setTargets] = useState<(TargetReport | undefined)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const dialogTitle = useId();
  const maps = useRef<[MapInstance | null, MapInstance | null]>([null, null]);
  const cameraSync = useRef<ReturnType<typeof createComparisonCameraSync> | null>(null);
  if (!cameraSync.current) cameraSync.current = createComparisonCameraSync({ ...DEFAULT_CAMERA, ...(place ? { center: place.coordinates, zoom: 6 } : {}) });
  const fitted = useRef("");
  const geometryCache = useRef(new Map<string, ComparisonRegions>());
  const active = !collapsed;
  const manifest = useResource("/data/boundaries/manifest.json", active, validManifest);
  const land = useResource("/data/land.geojson", active, validLand);
  const modern = useResource("/data/modern-correspondence.json", active, validModern);
  const tang = useResource("/data/tang-boundary-crosswalk.json", active && !!place, validTang);
  const song = useResource("/data/song-boundary-research.json", active, validSong);
  const ming = useResource("/data/ming-boundary-research.json", active && !!place, validMing);
  const cards = useMemo(() => comparisonCityYears.map(year => comparisonCityRecord(place?.id ?? "", year, { tang: tang.data, song: song.data, ming: ming.data })), [place?.id, tang.data, song.data, ming.data]);
  const resources = [tang, song, ming];
  const availableDatasets = useMemo(() => [...manifest.data?.datasets ?? []].sort((a, b) => a.year - b.year), [manifest.data]);
  const optionYears = mode === "city" ? comparisonCityYears : availableDatasets.length ? availableDatasets.map(dataset => dataset.year) : ALL_YEARS;

  useEffect(() => {
    if (!place && mode === "city") setMode("region");
  }, [place, mode]);
  useEffect(() => {
    if (collapsed) return;
    const element = dialog.current;
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (priorFocus?.isConnected) priorFocus.focus();
    };
  }, [collapsed]);

  const registerMap = useCallback((side: ComparisonSide, map: MapInstance | null) => {
    maps.current[side] = map;
    cameraSync.current!.attach(side, map);
    setMapsRevision(value => value + 1);
  }, []);
  const syncView = useCallback((side: ComparisonSide) => { cameraSync.current!.move(side); }, []);
  const reportTargets = useCallback((side: ComparisonSide, report: TargetReport) => {
    setTargets(previous => { const next = [...previous]; next[side] = report; return next; });
  }, []);
  const token = (year: number) => `${mode}:${place?.id ?? ""}:${year}`;
  useEffect(() => {
    if (collapsed || mode !== "city" || !maps.current[0] || !maps.current[1]) return;
    if (years.some((year, side) => !targets[side]?.ready || targets[side]?.token !== `city:${place?.id ?? ""}:${year}`)) return;
    // Recreating WebGL maps after collapse or context recovery restores the
    // user's camera; it must not be interpreted as a new request to fit bounds.
    const key = `${place?.id}:${years.join(":")}:${fitRequest}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const bounds = comparisonGeometryBounds(targets.flatMap(target => target?.features ?? []));
    if (bounds) maps.current[0].fitBounds(bounds, { padding: 45, maxZoom: 8, duration: 0 });
    else if (place) maps.current[0].jumpTo({ center: place.coordinates, zoom: 6 });
  }, [collapsed, mode, targets, years, place, fitRequest, mapsRevision]);

  function changeMode(next: "region" | "city") {
    if (next === "city" && mode !== "city") setFitRequest(value => value + 1);
    setMode(next);
    if (next === "city") setYears(current => {
      const pair = initialComparisonYears(current[0], comparisonCityYears);
      return comparisonCityYears.includes(current[1] as typeof comparisonCityYears[number]) && current[1] !== pair[0] ? [pair[0], current[1]] : pair;
    });
  }
  function locate() {
    if (mode === "city") setFitRequest(value => value + 1);
    else maps.current[0]?.jumpTo(place ? { center: place.coordinates, zoom: 6 } : DEFAULT_CAMERA);
  }
  function chooseYear(side: ComparisonSide, year: number) { setYears(current => selectComparisonYear(current, side, year)); }

  if (collapsed) return <aside className="boundary-comparison-minimized" aria-label="已收起的边界对比">
    <span>{place && mode === "city" ? `${place.modernName || place.name} · ` : ""}边界对比</span>
    <button type="button" onClick={() => setCollapsed(false)}><Expand size={16} />展开</button>
    <button type="button" aria-label="关闭边界对比" onClick={onClose}><X size={18} /></button>
  </aside>;

  return <dialog ref={dialog} className="boundary-comparison-dialog" aria-labelledby={dialogTitle} onCancel={event => { event.preventDefault(); closeRef.current(); }}>
    <header className="boundary-comparison-header">
      <div><p className="boundary-comparison-eyebrow">沿着同一处山河，看行政建置变迁</p><h2 id={dialogTitle}>{mode === "city" && place ? `${place.modernName || place.name} · 同城辖区` : "不同时期的行政边界"}</h2></div>
      <div className="boundary-comparison-actions"><button type="button" onClick={() => setCollapsed(true)}><ChevronDown size={17} />收起</button><button type="button" aria-label="关闭边界对比" onClick={onClose} autoFocus><X size={21} /></button></div>
    </header>
    <div className="boundary-comparison-toolbar">
      <div className="boundary-comparison-modes" role="group" aria-label="对比方式"><button type="button" aria-pressed={mode === "region"} onClick={() => changeMode("region")}>整个区域</button>{place && <button type="button" aria-pressed={mode === "city"} onClick={() => changeMode("city")}>同城辖区</button>}</div>
      <span className="boundary-comparison-sync"><ArrowLeftRight size={15} />拖动、缩放同步</span>
      <button type="button" onClick={locate}><LocateFixed size={16} />{mode === "city" ? "适配两侧辖区" : place ? "返回本城" : "全国视野"}</button>
    </div>
    {mode === "city" && <div className="boundary-comparison-cards" aria-label="唐宋明三朝辖区">
      {cards.map((card, index) => <article key={card.year} className={`boundary-comparison-card ${years.includes(card.year) ? "is-active" : ""}`}>
        <strong>{comparisonYearLabel(card.year)}</strong>
        <p>{resources[index].error ? "关联资料加载失败" : !resources[index].data ? "关联资料加载中…" : card.links.length ? card.links.map(link => `${link.polity ? `${link.polity} · ` : ""}${link.name}`).join("、") : "暂无核定关联"}</p>
        {resources[index].error && <button type="button" onClick={resources[index].retry}>重试关联资料</button>}
        <div><button type="button" aria-pressed={years[0] === card.year} onClick={() => chooseYear(0, card.year)}>左图{years[0] === card.year ? " · 当前" : ""}</button><button type="button" aria-pressed={years[1] === card.year} onClick={() => chooseYear(1, card.year)}>右图{years[1] === card.year ? " · 当前" : ""}</button></div>
      </article>)}
    </div>}
    <p className="boundary-comparison-notice">显示各年来源原始轮廓；关联辖区不等于城墙范围。{mode === "city" ? "仅使用已有城市关联，缺少资料的一侧留空。" : "层级随缩放切换；近似模型不代表精确历史疆界。"}</p>
    {manifest.error ? <div className="boundary-comparison-error" role="alert">边界目录加载失败。<button type="button" onClick={manifest.retry}>重试目录</button></div> : !manifest.data ? <p className="boundary-comparison-loading" role="status">正在读取边界资料目录…</p> : <div className="boundary-comparison-panes">
      {([0, 1] as const).map(side => {
        const cityCard = cards.find(card => card.year === years[side]);
        const cityResource = resources[cards.findIndex(card => card.year === years[side])];
        return <ComparisonPane key={side} side={side} dataset={availableDatasets.find(dataset => dataset.year === years[side])} year={years[side]}
          optionYears={optionYears} onYear={year => chooseYear(side, year)} city={mode === "city" ? cityCard : undefined}
          cityReady={mode !== "city" || !!cityResource?.data} cityError={mode === "city" ? cityResource?.error : undefined} retryCity={cityResource?.retry}
          token={token(years[side])} onTargets={reportTargets} place={mode === "city" ? place : undefined}
          land={land.data} modern={modern.data} song={song.data} cache={geometryCache.current} onMap={registerMap} onMove={syncView} />;
      })}
    </div>}
    <footer className="boundary-comparison-footer"><span>土地底图仅供定位 · 城市点为目录参考位置</span>
      {land.error && <button type="button" onClick={land.retry}>土地底图加载失败，重试</button>}
      {modern.error && <button type="button" onClick={modern.retry}>古今名称对照加载失败，重试</button>}
      {song.error && mode === "region" && <button type="button" onClick={song.retry}>宋代名称核查加载失败，重试</button>}
    </footer>
  </dialog>;
}

function ComparisonPane({ side, dataset, year, optionYears, onYear, city, cityReady, cityError, retryCity, token, onTargets, place, land, modern, song, cache, onMap, onMove }: {
  side: ComparisonSide; dataset?: BoundaryDataset; year: number; optionYears: readonly number[]; onYear: (year: number) => void;
  city?: ComparisonCityRecord; cityReady: boolean; cityError?: string; retryCity?: () => void; token: string;
  onTargets: (side: ComparisonSide, report: TargetReport) => void; place?: Place; land?: FeatureCollection;
  modern?: ModernCorrespondenceData; song?: SongBoundaryResearchDocument; cache: Map<string, ComparisonRegions>;
  onMap: (side: ComparisonSide, map: MapInstance | null) => void; onMove: (side: ComparisonSide) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapAttempt, setMapAttempt] = useState(0);
  const [dataAttempt, setDataAttempt] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_CAMERA.zoom);
  const [viewport, setViewport] = useState(0);
  const [result, setResult] = useState<{ key: string; data: ComparisonRegions; error: string; ready: boolean }>({ key: "", data: EMPTY, error: "", ready: false });
  const [pickedId, setPickedId] = useState("");
  const detail = resolveMapDetailLevel("auto", zoom, dataset?.layers.filter(layer => layer.featureCount > 0).map(layer => layer.level) ?? [], { primaryCountryCoverage: !boundaryCountryCoverage(dataset).incomplete });
  const wantedLevels = city ? dataset ? comparisonLinkLayers(dataset, city.links) : [] : detail.visibleLevels;
  const levelKey = wantedLevels.join("|");
  const requestKey = `${token}:${dataset?.id ?? ""}:${levelKey}:${cityReady}`;
  const regions = result.key === requestKey ? result.data : EMPTY;
  const loaded = result.key === requestKey && result.ready;
  const error = result.key === requestKey ? result.error : "";
  const labels = useMemo(() => localizeComparisonRegions(regions, modern, song), [regions, modern, song]);
  const selected = useMemo(() => city ? labels.features.filter(feature => city.links.some(link => link.boundaryId === feature.properties.id)) : labels.features.filter(feature => feature.properties.id === pickedId), [labels, city, pickedId]);
  const selectedIds = selected.map(feature => feature.properties.id);
  const renderData = useMemo(() => city ? { ...labels, features: selected } : labels, [city, labels, selected]);
  const selectId = useId();

  useEffect(() => {
    const abort = new AbortController();
    setPickedId("");
    setResult({ key: requestKey, data: EMPTY, error: "", ready: false });
    if (!dataset || !cityReady) return () => abort.abort();
    const layers = dataset.layers.filter(layer => wantedLevels.includes(layer.level) && layer.featureCount > 0);
    Promise.all(layers.map(async layer => {
      const cached = cache.get(layer.url);
      if (cached) return cached;
      const response = await fetch(layer.url, { signal: abort.signal });
      if (!response.ok) throw Error(`${boundaryLevelName(layer.level, dataset.periodId)}资料加载失败`);
      const data = await response.json() as ComparisonRegions;
      if (!validLand(data) || data.features.some(feature => !feature.properties?.id || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type))) throw Error("边界文件格式不完整");
      if (!abort.signal.aborted) cache.set(layer.url, data);
      return data;
    })).then(batches => {
      if (!abort.signal.aborted) setResult({ key: requestKey, data: { type: "FeatureCollection", features: batches.flatMap(data => data.features) }, error: "", ready: true });
    }).catch(cause => {
      if (!abort.signal.aborted) {
        setResult({ key: requestKey, data: EMPTY, error: cause instanceof Error ? cause.message : "边界资料加载失败", ready: false });
        abort.abort();
      }
    });
    return () => abort.abort();
    // The serialized levels cover zoom changes without re-fetching on every move.
  }, [dataset, requestKey, levelKey, dataAttempt, cache]);

  useEffect(() => { onTargets(side, { token, ready: loaded, features: selected }); }, [side, token, loaded, selected, onTargets]);

  useEffect(() => {
    if (!container.current) return;
    let map: MapInstance;
    let disposed = false;
    setMapReady(false); setMapError("");
    try {
      map = new maplibregl.Map({ container: container.current, ...DEFAULT_CAMERA, minZoom: 2, maxZoom: 11,
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        style: { version: 8, sources: { land: { type: "geojson", data: EMPTY } }, layers: [
          { id: "comparison-background", type: "background", paint: { "background-color": "#dce7e6" } },
          { id: "comparison-land-fill", type: "fill", source: "land", paint: { "fill-color": "#efeee5" } },
          { id: "comparison-land-line", type: "line", source: "land", paint: { "line-color": "#b7c5be", "line-width": 0.8 } },
        ] },
      });
    } catch { setMapError("浏览器暂时无法创建地图，请重试或启用硬件加速。"); return; }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.getCanvas().setAttribute("aria-label", `${side === 0 ? "左" : "右"}侧历史地图，可用方向键平移、加减键缩放`);
    const moved = () => { if (!disposed) { setZoom(map.getZoom()); onMove(side); } };
    const moveEnd = () => { if (!disposed) setViewport(value => value + 1); };
    const contextLost = () => { if (!disposed) setMapError("地图绘图上下文已中断，请重新加载地图。"); };
    const renderError = () => { if (!disposed) setMapError("地图绘制暂时失败，请重新加载地图。"); };
    map.getCanvas().addEventListener("webglcontextlost", contextLost);
    map.on("move", moved); map.on("moveend", moveEnd);
    map.on("error", renderError);
    const loadedMap = () => {
      if (disposed) return;
      map.addSource("comparison-regions", { type: "geojson", data: EMPTY, tolerance: 0 });
      for (const level of levels) {
        map.addLayer({ id: `comparison-${level}-fill`, type: "fill", source: "comparison-regions", filter: ["==", ["get", "level"], level], paint: { "fill-color": side === 0 ? "#77968c" : "#a28a6d", "fill-opacity": 0.16 } });
        map.addLayer({ id: `comparison-${level}-line`, type: "line", source: "comparison-regions", filter: ["==", ["get", "level"], level], paint: { "line-color": side === 0 ? "#567b70" : "#907149", "line-width": level === "country" ? 1.8 : level === "province" ? 1.2 : 0.8, "line-opacity": 0.8 } });
      }
      map.addLayer({ id: "comparison-selected-fill", type: "fill", source: "comparison-regions", filter: ["==", ["get", "id"], ""], paint: { "fill-color": side === 0 ? "#407d70" : "#b38142", "fill-opacity": 0.27 } });
      map.addLayer({ id: "comparison-selected-line", type: "line", source: "comparison-regions", filter: ["==", ["get", "id"], ""], paint: { "line-color": side === 0 ? "#235f53" : "#8c571f", "line-width": 2.5 } });
      map.on("click", event => {
        const hit = map.queryRenderedFeatures(event.point, { layers: regionLayers })[0];
        setPickedId(typeof hit?.properties.id === "string" ? hit.properties.id : "");
      });
      setMapReady(true);
      onMap(side, map);
      setZoom(map.getZoom());
    };
    map.on("load", loadedMap);
    const observer = new ResizeObserver(() => { if (!disposed) map.resize(); }); observer.observe(container.current);
    return () => {
      disposed = true;
      observer.disconnect(); onMap(side, null); map.getCanvas().removeEventListener("webglcontextlost", contextLost);
      map.off("move", moved); map.off("moveend", moveEnd); map.off("load", loadedMap); map.off("error", renderError); map.remove(); mapRef.current = null;
    };
  }, [side, mapAttempt, onMap, onMove]);

  useEffect(() => { if (mapReady && land) (mapRef.current?.getSource("land") as GeoJSONSource | undefined)?.setData(land); }, [mapReady, land]);
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    (map.getSource("comparison-regions") as GeoJSONSource).setData(renderData);
    const ids = selectedIds.length ? selectedIds : [""];
    for (const kind of ["fill", "line"]) map.setFilter(`comparison-selected-${kind}`, ["in", ["get", "id"], ["literal", ids]]);
  }, [mapReady, renderData, selectedIds.join("|")]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const bounds = map.getBounds();
    const candidates = renderData.features.filter(feature => feature.properties.labelCoordinates && bounds.contains(feature.properties.labelCoordinates));
    const markers = candidates.slice(0, city ? 20 : 45).map(feature => {
      const element = document.createElement("span"); element.className = "boundary-comparison-map-label";
      element.textContent = feature.properties.displayName ?? "未定名行政区";
      element.setAttribute("aria-hidden", "true");
      return new maplibregl.Marker({ element }).setLngLat(feature.properties.labelCoordinates!).addTo(map);
    });
    if (place) {
      const element = document.createElement("span"); element.className = "boundary-comparison-city-point";
      element.title = `${place.name} · 目录参考点`;
      markers.push(new maplibregl.Marker({ element }).setLngLat(place.coordinates).addTo(map));
    }
    return () => { for (const marker of markers) marker.remove(); };
  }, [mapReady, renderData, viewport, city, place]);

  const missingGeometry = city && loaded && city.links.length > selected.length;
  return <section className={`boundary-comparison-pane is-${side === 0 ? "left" : "right"}`} aria-label={`${side === 0 ? "左" : "右"}图 ${comparisonYearLabel(year)}`}>
    <div className="boundary-comparison-pane-heading"><label htmlFor={selectId}>{side === 0 ? "左图" : "右图"}</label><select id={selectId} value={year} onChange={event => onYear(Number(event.target.value))}>{optionYears.map(option => <option key={option} value={option}>{comparisonYearLabel(option)}</option>)}</select>
      <span className="boundary-comparison-source-type">{dataset?.accuracy === "approximate-model" ? "近似行政模型" : dataset ? "历史 GIS 边界" : "资料未接入"}</span>
    </div>
    <div className="boundary-comparison-map-wrap"><div className="boundary-comparison-map" ref={container} />
      {!mapError && <div className="boundary-comparison-zoom" role="group" aria-label={`${side === 0 ? "左" : "右"}图缩放`}><button type="button" aria-label="放大" onClick={() => mapRef.current?.zoomIn({ duration: 0 })}><Plus size={18} /></button><button type="button" aria-label="缩小" onClick={() => mapRef.current?.zoomOut({ duration: 0 })}><Minus size={18} /></button></div>}
      {mapError ? <div className="boundary-comparison-map-message" role="alert"><p>{mapError}</p><button type="button" onClick={() => setMapAttempt(value => value + 1)}>重新加载地图</button></div>
        : !dataset ? <div className="boundary-comparison-map-message">此年份没有已接入边界。</div>
        : cityError ? <div className="boundary-comparison-map-message" role="alert"><p>城市关联加载失败。</p><button type="button" onClick={retryCity}>重试关联</button></div>
        : error ? <div className="boundary-comparison-map-message" role="alert"><p>{error}</p><button type="button" onClick={() => setDataAttempt(value => value + 1)}>重试边界</button></div>
        : !loaded || !mapReady ? <div className="boundary-comparison-map-loading" role="status">{!cityReady ? "正在核对城市关联…" : !mapReady ? "正在准备地图…" : "正在读取边界…"}</div>
        : city && !city.links.length ? <div className="boundary-comparison-map-message"><strong>暂无关联辖区</strong><p>{city.missingReason}</p></div>
        : missingGeometry ? <div className="boundary-comparison-map-message" role="alert">关联记录的原始几何缺失，已留空；未以邻近区域代替。</div> : null}
      {loaded && !city && <span className="boundary-comparison-level">{detail.activeLevel ? boundaryLevelName(detail.activeLevel, dataset?.periodId) : "暂无层级资料"} · 随缩放切换</span>}
    </div>
    <div className="boundary-comparison-pane-caption">
      {city ? <>{city.links.map(link => <div key={link.boundaryId}><strong>{link.polity ? `${link.polity} · ` : ""}{link.name}</strong><details><summary>关联与年代说明</summary><p>{link.note}</p></details></div>)}</> : selected[0] ? <p role="status"><strong>{selected[0].properties.displayName}</strong>{selected[0].properties.modernLabel ? ` · 今 ${selected[0].properties.modernLabel}` : ""}{selected[0].properties.nameCorrectionNote ? `。${selected[0].properties.nameCorrectionNote}` : ""}</p> : <p>点击区域查看名称；两图始终使用相同中心与比例尺。</p>}
      {dataset && <details className="boundary-comparison-source"><summary>{dataset.year}年 · {dataset.accuracy === "approximate-model" ? "Hartwell 参考模型" : "CHGIS 历史地理资料"}</summary><p>{dataset.note}</p><p>{boundaryCountryCoverage(dataset).note}</p><a href={dataset.sourceUrl} target="_blank" rel="noreferrer">查看边界来源</a></details>}
    </div>
  </section>;
}
