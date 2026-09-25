import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type FilterSpecification, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { MapPin, Search, X } from "lucide-react";
import type { Feature, Geometry } from "geojson";
import { tangDetailKindNames, type TangDetailCollection, type TangDetailManifest, type TangDetailProperties } from "../../shared/tang-detail";
import { boundsOverlap, canSelectTangDetail, replaceModernYellowGeometry, showTangDetail, waterDetailReplacements, waterDisplayClass } from "../../shared/tang-detail-display";
import type { MapBounds, WaterDetailReplacement } from "../../shared/historical-rivers";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import { localizePhysicalGroup } from "../../shared/place-name-localization";
import type { PhysicalGroup, PhysicalInteractionIndex } from "../../shared/physical-geography";
import { boundarySearchKey } from "../../shared/boundary-search";
import type { Place } from "../../shared/types";
import "../map-detail.css";
import type { TangBoundaryCrosswalk } from "../../shared/tang-boundary-crosswalk";
import TangJurisdictionInfo from "./TangJurisdictionInfo";
import { localizeTangDetailFeature } from "../../shared/tang-detail-names";
import type { TangCountyDiagnostics } from "../../shared/tang-county-diagnostics";
import CountyGeometryNotice from "./CountyGeometryNotice";
import { canOpenCountyModel } from "../../shared/county-model-interaction";

const empty: TangDetailCollection = { type: "FeatureCollection", features: [] };
const layerIds = ["tang-detail-water", "tang-detail-water-edge", "tang-detail-rivers", "tang-detail-hit", "tang-detail-peaks", "tang-detail-towns", "tang-detail-selected-line", "tang-detail-selected-water", "tang-detail-selected-point", "tang-detail-underground", "tang-detail-water-edge-seasonal"];
type DetailFeature = Feature<Geometry, TangDetailProperties>;

async function fetchCollection(url: string, signal: AbortSignal): Promise<TangDetailCollection> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error();
  const localize = (data: TangDetailCollection): TangDetailCollection => ({ ...data, features: data.features.map(localizeTangDetailFeature) });
  if (!url.endsWith(".gz")) return response.json().then(localize);
  // Static hosts differ: Vite advertises gzip and the browser decodes it first;
  // a plain file host may return compressed bytes without Content-Encoding.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return localize(JSON.parse(new TextDecoder().decode(bytes)));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json().then(localize);
}

export default function TangDetailLayer({ map, ready, enabled, mode, zoom, modernNames, controlsContainer, resetKey, replaceYellowLower, places, onPlaceSelect, onFocus, onChoose, onCoverageChange, tangBoundaries, onBoundaryRequest, mountainFeatureIds, crosswalkLoading, countyDiagnostics, countyDiagnosticsError }: {
  map: MapInstance | null; ready: boolean; enabled: boolean; mode: MapInteractionMode; zoom: number; modernNames: boolean;
  controlsContainer: HTMLElement | null; resetKey: string; replaceYellowLower: boolean; places: Place[];
  onPlaceSelect: (id: string) => void; onFocus: (points: [number, number][], maxZoom?: number) => void; onChoose: () => void;
  onCoverageChange: (replacements: WaterDetailReplacement[]) => void;
  tangBoundaries: TangBoundaryCrosswalk | null; onBoundaryRequest: (id: string, quiet?: boolean, focus?: boolean) => void;
  mountainFeatureIds: string[]; crosswalkLoading: boolean;
  countyDiagnostics?: TangCountyDiagnostics;
  countyDiagnosticsError?: string;
}) {
  const [manifest, setManifest] = useState<TangDetailManifest>();
  const [historical, setHistorical] = useState<TangDetailCollection>(empty);
  const [regions, setRegions] = useState<Record<string, TangDetailCollection>>({});
  const [yellowWaterIds, setYellowWaterIds] = useState<Set<string>>(new Set());
  const [contextGroups, setContextGroups] = useState<PhysicalGroup[]>([]);
  const [viewportTick, setViewportTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchKind, setSearchKind] = useState("all");
  const [selected, setSelected] = useState<DetailFeature>();
  const [collapsed, setCollapsed] = useState(false);
  const choose = useRef(onChoose); choose.current = onChoose;
  const boundaryChoose = useRef(onBoundaryRequest); boundaryChoose.current = onBoundaryRequest;
  const focusedJurisdiction = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (selected?.properties.kind !== "settlement") { focusedJurisdiction.current = undefined; return; }
    if (!enabled || !canInteract(mode, "cities")) return;
    const link = tangBoundaries?.settlements[selected.properties.id];
    if (link) {
      const key = `${selected.properties.id}:${link.boundaryId}`;
      const fit = selected.properties.level === "prefecture" && focusedJurisdiction.current !== key;
      focusedJurisdiction.current = key;
      boundaryChoose.current(link.boundaryId, true, fit);
    }
  }, [selected, tangBoundaries, enabled, mode]);
  useEffect(() => { setSelected(undefined); }, [resetKey, enabled]);
  useEffect(() => { if (selected && !canSelectTangDetail(selected.properties, mode)) setSelected(undefined); }, [mode, selected]);
  useEffect(() => { setSearchKind("all"); }, [mode]);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/data/physical-interactions.json", { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then((index: PhysicalInteractionIndex) => setContextGroups(index.groups.map(localizePhysicalGroup)))
      .catch(() => { /* Without a confirmed name match, retain the overview. */ });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setError("");
    fetch("/data/tang-detail/manifest.json", { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(async (index: TangDetailManifest) => {
        setManifest(index);
        const response = await fetch(index.historical.url, { signal: abort.signal });
        if (!response.ok) throw Error();
        const collection = await response.json();
        if (collection.type !== "FeatureCollection" || collection.features.length !== index.historical.featureCount) throw Error();
        setHistorical(collection);
      }).catch(e => { if (e.name !== "AbortError") setError("唐代细节资料未能加载，请重试。"); });
    return () => abort.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    fetch("/data/tang-detail/yellow-river-water-associations.json", { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(data => setYellowWaterIds(new Set(data.associations.map((item: { waterId: string }) => item.waterId))))
      .catch(e => { if (e.name !== "AbortError") setError("黄河现代水面关联资料未能加载，水面遮蔽可能不完整，请重试。"); });
    return () => abort.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!map || !ready) return;
    const update = () => setViewportTick(value => value + 1);
    map.on("moveend", update); map.on("resize", update); update();
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [map, ready]);
  const needed = useMemo(() => {
    if (!enabled || !map || !ready) return [];
    const b = map.getBounds();
    const bounds: MapBounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    return manifest?.modernRegions.filter(region => zoom >= region.minZoom && boundsOverlap(bounds, region.bounds)) ?? [];
  }, [map, ready, enabled, zoom, viewportTick, manifest]);
  const neededKey = needed.map(region => region.id).join(",");
  useEffect(() => {
    setRegions(previous => {
      const keep = new Set(needed.map(region => region.id));
      const cached = Object.keys(previous).filter(id => !keep.has(id)).slice(-12);
      const retained = Object.entries(previous).filter(([id]) => keep.has(id) || cached.includes(id));
      return retained.length === Object.keys(previous).length ? previous : Object.fromEntries(retained);
    });
  }, [neededKey]);
  useEffect(() => {
    const pending = needed.filter(region => !regions[region.id]);
    if (!pending.length) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    // Bound concurrent JSON decoding; large water-detail cells are requested only in view.
    let index = 0;
    const worker = async () => {
      while (index < pending.length && !abort.signal.aborted) {
        const region = pending[index++];
        const collection = await fetchCollection(region.url, abort.signal);
        if (collection.type !== "FeatureCollection" || collection.features.length !== region.featureCount) throw Error();
        if (!abort.signal.aborted) setRegions(previous => ({ ...previous, [region.id]: collection }));
      }
    };
    Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker)).then(() => { if (!abort.signal.aborted) setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError("部分河湖细节未能加载，未覆盖处仍保留概览底图。请重试。"); setLoading(false); } });
    return () => abort.abort();
  }, [neededKey, attempt]);
  const loadedRegions = useMemo(() => needed.filter(region => regions[region.id]), [needed, regions]);
  const mountainIds = useMemo(() => new Set(mountainFeatureIds), [mountainFeatureIds]);
  const activeFeatures = useMemo(() => {
    if (!enabled) return [];
    const unique = new Map<string, DetailFeature>();
    for (const feature of [...historical.features, ...loadedRegions.flatMap(region => regions[region.id].features)]) {
      if (feature.properties.kind === "peak" && mountainIds.has(feature.properties.id)) continue;
      if (!showTangDetail(feature.properties, zoom, "all")) continue;
      const displayed = replaceModernYellowGeometry(feature, replaceYellowLower, yellowWaterIds);
      if (displayed) {
        const styled = { ...displayed, properties: { ...displayed.properties, waterDisplayClass: waterDisplayClass(displayed.properties) } };
        unique.set(feature.properties.id, styled);
      }
    }
    return [...unique.values()];
  }, [enabled, historical, loadedRegions, regions, zoom, replaceYellowLower, yellowWaterIds, mountainIds]);
  const replacementKey = useMemo(() => JSON.stringify(waterDetailReplacements(activeFeatures, contextGroups)), [activeFeatures, contextGroups]);
  useEffect(() => { onCoverageChange(JSON.parse(replacementKey)); }, [replacementKey, onCoverageChange]);
  const selectable = useMemo(() => new Map(activeFeatures.map(feature => [feature.properties.id, feature])), [activeFeatures]);
  const searchResults = useMemo(() => {
    const key = boundarySearchKey(query);
    const merged = new Map([...historical.features, ...loadedRegions.flatMap(region => regions[region.id].features)].flatMap(feature => {
      const displayed = replaceModernYellowGeometry(feature, replaceYellowLower, yellowWaterIds);
      return displayed ? [[displayed.properties.id, displayed] as const] : [];
    }));
    return [...merged.values()].filter(({ properties: p }) => canSelectTangDetail(p, mode) && !(p.kind === "peak" && mountainIds.has(p.id)) && (searchKind === "all" || (searchKind === "settlement" ? p.kind === "settlement" : p.kind !== "settlement")) && !/^未命名|^未定名/.test(p.name) && (!key || boundarySearchKey(`${p.name} ${p.nameEn} ${p.presentLocation ?? ""}`).includes(key)))
      .sort((a, b) => Number(b.properties.kind === "settlement") - Number(a.properties.kind === "settlement") || a.properties.minZoom - b.properties.minZoom)
      .slice(0, key ? 40 : 8);
  }, [historical, loadedRegions, regions, query, searchKind, mode, replaceYellowLower, yellowWaterIds, mountainIds]);
  useEffect(() => {
    if (selected && !replaceModernYellowGeometry(selected, replaceYellowLower, yellowWaterIds)) setSelected(undefined);
  }, [replaceYellowLower, yellowWaterIds, selected]);

  useEffect(() => {
    if (!ready || !map) return;
    map.addSource("tang-detail", { type: "geojson", data: empty, tolerance: 0, buffer: 64 });
    map.addSource("tang-detail-selected", { type: "geojson", data: empty, tolerance: 0 });
    const add: MapInstance["addLayer"] = (layer) => map.addLayer(layer, map.getLayer("historical-river-halo") ? "historical-river-halo" : "route-line");
    const water: FilterSpecification = ["==", ["geometry-type"], "Polygon"];
    add({ id: layerIds[0], type: "fill", source: "tang-detail", filter: water, paint: { "fill-color": ["match", ["get", "waterDisplayClass"], "underground", "#999080", "#88bdc9"], "fill-opacity": ["match", ["get", "waterDisplayClass"], "surface", .85, .2] } });
    add({ id: layerIds[1], type: "line", source: "tang-detail", filter: ["all", water, ["==", ["get", "waterDisplayClass"], "surface"]], paint: { "line-color": "#639eaf", "line-width": .7 } });
    add({ id: "tang-detail-water-edge-seasonal", type: "line", source: "tang-detail", filter: ["all", water, ["!=", ["get", "waterDisplayClass"], "surface"]], paint: { "line-color": ["match", ["get", "waterDisplayClass"], "underground", "#8b8472", "#639eaf"], "line-width": 1, "line-dasharray": [2, 2] } });
    add({ id: layerIds[2], type: "line", source: "tang-detail", filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "waterDisplayClass"], "surface"]], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#5898af", "line-width": ["match", ["get", "kind"], "river", 2.2, "stream", 1.2, .9], "line-opacity": .85 } });
    add({ id: "tang-detail-underground", type: "line", source: "tang-detail", filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "waterDisplayClass"], "surface"]], paint: { "line-color": ["match", ["get", "waterDisplayClass"], "underground", "#8b8472", "#6293a7"], "line-width": 1.2, "line-dasharray": [2, 2] } });
    add({ id: layerIds[3], type: "line", source: "tang-detail", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-width": 10, "line-opacity": 0 } });
    add({ id: layerIds[4], type: "circle", source: "tang-detail", filter: ["all", ["==", ["geometry-type"], "Point"], ["!=", ["get", "kind"], "settlement"]], paint: { "circle-color": "#788653", "circle-radius": 2.5, "circle-stroke-color": "#fbf4de", "circle-stroke-width": 1 } });
    add({ id: layerIds[5], type: "circle", source: "tang-detail", filter: ["==", ["get", "kind"], "settlement"], paint: { "circle-color": "#866749", "circle-radius": ["match", ["get", "level"], "prefecture", 4, 3], "circle-stroke-color": "#fff8e2", "circle-stroke-width": 1.3 } });
    add({ id: layerIds[6], type: "line", source: "tang-detail-selected", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#216378", "line-width": 4 } });
    add({ id: layerIds[7], type: "fill", source: "tang-detail-selected", filter: ["==", ["get", "id"], ""], paint: { "fill-color": "#2c869d", "fill-opacity": .4 } });
    add({ id: layerIds[8], type: "circle", source: "tang-detail-selected", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": 7, "circle-color": "#b2724b", "circle-stroke-width": 2, "circle-stroke-color": "#fff6d7" } });
    return () => {
      if (!map.getStyle()) return;
      layerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource("tang-detail")) map.removeSource("tang-detail");
      if (map.getSource("tang-detail-selected")) map.removeSource("tang-detail-selected");
    };
  }, [map, ready]);
  useEffect(() => {
    if (!ready || !map?.getSource("tang-detail")) return;
    (map.getSource("tang-detail") as GeoJSONSource).setData({ type: "FeatureCollection", features: activeFeatures });
  }, [map, ready, activeFeatures]);
  useEffect(() => {
    if (!ready || !map?.getSource("tang-detail")) return;
    const displayedSelection = selected && replaceModernYellowGeometry(selected, replaceYellowLower, yellowWaterIds);
    const selectedWaterClass = selected ? waterDisplayClass(selected.properties) : "surface";
    map.setPaintProperty(layerIds[6], "line-dasharray", selectedWaterClass === "surface" ? undefined : [2, 2]);
    map.setPaintProperty(layerIds[6], "line-color", selectedWaterClass === "underground" ? "#716957" : "#216378");
    map.setPaintProperty(layerIds[7], "fill-opacity", selectedWaterClass === "surface" ? .4 : .18);
    (map.getSource("tang-detail-selected") as GeoJSONSource).setData({ type: "FeatureCollection", features: displayedSelection ? [displayedSelection] : [] });
    [layerIds[6], layerIds[7], layerIds[8]].forEach(id => map.setFilter(id, ["all", ["==", ["get", "id"], selected?.properties.id ?? ""], ["==", ["geometry-type"], id === layerIds[8] ? "Point" : id === layerIds[7] ? "Polygon" : selected?.geometry.type === "Polygon" || selected?.geometry.type === "MultiPolygon" ? "Polygon" : "LineString"]]));
  }, [map, ready, selected, replaceYellowLower, yellowWaterIds]);
  function select(feature: DetailFeature) {
    setSelected({ ...feature }); setCollapsed(false); choose.current();

  }
  useEffect(() => {
    if (!map || !ready || !enabled) return;
    const click = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement)?.closest?.("button")) return;
      const hit = findNaturalMapHit(map, event.point, mode);
      if (!hit || !["tang-detail-water", "tang-detail-hit", "tang-detail-peaks", "tang-detail-towns"].includes(hit.layer.id)) return;
      const feature = hit && selectable.get(hit.properties.id);
      if (feature && canSelectTangDetail(feature.properties, mode)) { event.originalEvent.preventDefault(); select(feature); }
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, enabled, selectable, mode]);
  useEffect(() => {
    if (!map || !ready || !enabled) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds(), rect = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label,.boundary-region-label,.nature-label")].filter(el => el.offsetWidth && el.style.display !== "none").map(el => el.getBoundingClientRect());
      const candidates = activeFeatures.filter(feature => canSelectTangDetail(feature.properties, mode) && bounds.contains(feature.properties.labelCoordinates) && !/^未命名|^未定名/.test(feature.properties.name))
        .sort((a, b) => Number(b.properties.id === selected?.properties.id) - Number(a.properties.id === selected?.properties.id) || a.properties.minZoom - b.properties.minZoom);
      const labeled = new Set<string>();
      for (const feature of candidates) {
        if (markers.length >= 160) break;
        const p = feature.properties, point = map.project(p.labelCoordinates);
        const conflictingCounty = countyDiagnostics?.bySettlement[p.id]?.status === "outside";
        const width = Math.min(250, (modernNames && p.kind === "settlement" ? Math.max(p.name.length, (p.presentLocation?.length ?? 0) + 2) : p.name.length + (conflictingCounty ? 3 : 0)) * 12 + 20);
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - 12, bottom: rect.top + point.y + (modernNames && p.kind === "settlement" ? 26 : 12) };
        const uniqueKey = `${p.kind}:${p.name}`;
        if (p.id !== selected?.properties.id && (labeled.has(uniqueKey) || occupied.some(other => box.left < other.right + 4 && box.right > other.left - 4 && box.top < other.bottom + 4 && box.bottom > other.top - 4))) continue;
        occupied.push(box as DOMRect); labeled.add(uniqueKey);
        const element = document.createElement("button");
        element.className = `tang-detail-label detail-${p.kind} ${p.id === selected?.properties.id ? "is-selected" : ""}`;
        element.textContent = `${p.kind === "peak" || p.kind === "saddle" ? "△ " : ""}${p.name}${conflictingCounty ? " · 治所" : ""}`;
        element.setAttribute("aria-label", `查看${p.name} · ${p.modernReferenceOnly ? "现代地理参照" : "唐代治所记录"}`);
        if (modernNames && p.kind === "settlement" && p.presentLocation) { const small = document.createElement("small"); small.textContent = p.presentLocation; element.append(small); }
        element.addEventListener("click", event => { event.stopPropagation(); select(feature); });
        markers.push(new Marker({ element, anchor: "bottom" }).setLngLat(p.labelCoordinates).addTo(map));
      }
    };
    const frame = requestAnimationFrame(render);
    map.on("moveend", render); map.on("resize", render);
    return () => { cancelAnimationFrame(frame); map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, enabled, activeFeatures, selected?.properties.id, modernNames, mode, countyDiagnostics]);

  function focus(feature: DetailFeature) {
    const p = feature.properties;
    const jurisdiction = p.kind === "settlement" && p.level === "prefecture" ? tangBoundaries?.settlements[p.id] : undefined;
    if (jurisdiction) {
      // The selection effect frames the jurisdiction once, after clearing old targets.
      focusedJurisdiction.current = undefined;
      select({ ...feature });
    } else {
      onFocus(feature.geometry.type === "Point" ? [p.labelCoordinates] : [[p.bounds[0], p.bounds[1]], [p.bounds[2], p.bounds[3]]], Math.max(10.5, p.minZoom + .5));
      select(feature);
    }
  }
  const selectedProperties = selected?.properties;
  const selectedCounty = selectedProperties ? countyDiagnostics?.bySettlement[selectedProperties.id] : undefined;
  const countyModels = selectedCounty?.candidates.filter(candidate => canOpenCountyModel(selectedCounty, candidate, countyDiagnostics?.byBoundary[candidate.boundaryId])) ?? [];
  const relatedPlace = selectedProperties?.kind === "settlement" ? places.find(place => [place.name, place.nameByPeriod?.tang, ...place.aliases].includes(selectedProperties.name) && Math.hypot(place.coordinates[0] - selectedProperties.labelCoordinates[0], place.coordinates[1] - selectedProperties.labelCoordinates[1]) < .4) : undefined;
  return <>
    {enabled && controlsContainer && createPortal(<section className="nature-explorer tang-detail-explorer" aria-label="唐代城镇与精细地理"><h3><MapPin size={14} />唐代城镇与精细地理</h3>
      <p>{manifest ? `${manifest.historical.featureCount} 条历史治所记录 · 地图放大后逐级显示` : "加载历史治所…"}</p>
      <div className="nature-search"><Search size={13} /><input aria-label="搜索唐代城镇及细节地物" placeholder="县名、州名、现代地区…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <select aria-label="细节资料类型" value={searchKind} onChange={e => setSearchKind(e.target.value)}><option value="all">当前可点城镇与地物</option>{canInteract(mode, "cities") && <option value="settlement">唐代历史治所</option>}{mode !== "cities" && <option value="nature">视野中的现代地物</option>}</select>
      <div className="nature-search-results">{searchResults.map(feature => <button key={feature.properties.id} onClick={() => focus(feature)}><strong>{feature.properties.name}</strong><span>{feature.properties.kind === "settlement" ? `${feature.properties.subtype} · ${feature.properties.presentLocation || "位置待核"}` : tangDetailKindNames[feature.properties.kind]}</span></button>)}</div>
      {query && !searchResults.length && <p>暂无匹配记录。自然地物请先放大到细节区域后搜索。</p>}
      <details className="detail-coverage"><summary>细节区域与来源</summary><p>治所使用755年记录，行政面为741年参照。水系、湖岸和山峰来自现代 OSM，不能据此确认其唐代状态。</p>
        {tangBoundaries?.coverage && <p>755年治所中，州郡府级已关联{tangBoundaries.coverage.byLevel.prefecture.matched} / {tangBoundaries.coverage.byLevel.prefecture.total}条；{tangBoundaries.coverage.byLevel.prefecture.unmatched}条仍缺可靠辖区。县治按已核对隶属关联州郡。未关联对象在详情说明原因。</p>}
        <div className="detail-region-shortcuts">{manifest?.modernCoverageRegions.map(region => <button key={region.id} onClick={() => onFocus([[(region.bounds[0] + region.bounds[2]) / 2, (region.bounds[1] + region.bounds[3]) / 2]], 9)}>{region.name}</button>)}</div>
        <p>放大至8级加载主要河湖；10级起加载局部支流、山峰，12级可见更小水面。无名称地物保留形状，不杜撰地名。未覆盖地区仍是概览数据。</p>
      </details>
      {loading && <p role="status">正在加载视野内的河湖细节…</p>}{error && <p role="status">{error}<button onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    </section>, controlsContainer)}
    {enabled && selectedProperties && <section className="nature-detail tang-detail-card" aria-label="唐代城镇与地物详情"><header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><strong>{selectedProperties.name}</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭地物详情" onClick={() => setSelected(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">{tangDetailKindNames[selectedProperties.kind]} · {selectedProperties.modernReferenceOnly ? "现代参照" : "唐代 · 755年记录"}</span>
        {selectedProperties.kind === "settlement" && <><p>{selectedProperties.subtype} · {selectedProperties.presentLocation || "来源未提供现代位置描述"}</p><p>资料存续年：{selectedProperties.beginYear}—{selectedProperties.endYear}年。{String(selectedProperties.sourceRecord?.BEG_RULE) === "4" && String(selectedProperties.sourceRecord?.END_RULE) === "4" ? "起讫年据来源记录。" : "包含较宽的定年范围，详情以原始记录为准。"}</p></>}
        {selectedCounty && <><CountyGeometryNotice diagnostic={selectedCounty} />{countyModels.map(candidate => <button key={candidate.boundaryId} className="detail-focus-button" onClick={() => onBoundaryRequest(candidate.boundaryId)}>查看{candidate.name}{selectedCounty.status === "outside" ? "存疑模型与治所" : "县级参考范围"}</button>)}</>}
        {selectedProperties.level === "county" && countyDiagnosticsError && <p role="status" className="nature-detail-note">{countyDiagnosticsError}</p>}
        {selectedProperties.kind === "settlement" && <TangJurisdictionInfo loading={crosswalkLoading} name={selectedProperties.name} link={tangBoundaries?.settlements[selectedProperties.id]} missingReason={tangBoundaries?.unmatchedSettlements?.[selectedProperties.id]?.reason} onView={id => onBoundaryRequest(id)} />}
        {selectedProperties.tags?.ele && <p>来源标注高程：{selectedProperties.tags.ele}米</p>}
        <p>{selectedProperties.geometryNote}</p>
        {selectedProperties.modernReferenceOnly && <p className="nature-detail-note">本条为现代测绘参照；线是河道中心线，水面多边形才表示来源记录的水域范围。不是唐代河岸复原。</p>}
        {waterDisplayClass(selectedProperties) === "underground" && <p className="nature-detail-note">来源标记为地下、隧洞、涵洞或有覆盖的水道，地图用灰色虚线显示；有覆盖不一定在地下，也不表示露天明流；未据此推定唐代年代。</p>}
        {waterDisplayClass(selectedProperties) === "seasonal" && <p className="nature-detail-note">来源标记为季节性、间歇性或停用水道，虚线不表示常年流水，详见原始标签。</p>}
        <details><summary>查看原始记录</summary><pre>{JSON.stringify(selectedProperties.sourceRecord ?? selectedProperties.tags, null, 2)}</pre></details>
        <div className="nature-detail-actions"><button onClick={() => focus(selected!)}>定位与放大</button><a href={selectedProperties.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a></div>
        {relatedPlace && <button className="detail-focus-button" onClick={() => { setSelected(undefined); onPlaceSelect(relatedPlace.id); }}>查看城池档案与大事记</button>}
      </div>}
    </section>}
  </>;
}
