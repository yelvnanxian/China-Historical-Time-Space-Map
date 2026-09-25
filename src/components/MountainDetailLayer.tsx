import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import type { Feature, LineString, Point } from "geojson";
import { Mountain, Search, X } from "lucide-react";
import { boundarySearchKey } from "../../shared/boundary-search";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import { mountainDetailHitLayerIds, mountainDetailKindNames, type MountainDetailBounds, type MountainDetailCollection, type MountainDetailManifest, type MountainDetailProperties } from "../../shared/mountain-detail";
import { mountainSelectionFocus, nearbyMountainRidges } from "../../shared/mountain-detail-interaction";
import "../mountain-detail.css";

type MountainFeature = Feature<LineString | Point, MountainDetailProperties>;
const empty: MountainDetailCollection = { type: "FeatureCollection", features: [] };
const layers = ["mountain-detail-lines", "mountain-detail-cliffs", "mountain-detail-peaks", ...mountainDetailHitLayerIds, "mountain-detail-selected-line", "mountain-detail-selected-point"];
const overlaps = (a: MountainDetailBounds, b: MountainDetailBounds) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

async function fetchCollection(url: string, signal: AbortSignal): Promise<MountainDetailCollection> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

export default function MountainDetailLayer({ map, ready, enabled, mode, controlsContainer, onChoose, onFocus, resetKey, onLoadedFeatureIds }: {
  map: MapInstance | null;
  ready: boolean;
  enabled: boolean;
  mode: MapInteractionMode;
  controlsContainer: HTMLElement | null;
  onChoose: () => void;
  onFocus: (points: [number, number][], maxZoom?: number) => void;
  resetKey: string;
  onLoadedFeatureIds?: (ids: string[]) => void;
}) {
  const [manifest, setManifest] = useState<MountainDetailManifest>();
  const [packs, setPacks] = useState<Record<string, MountainDetailCollection>>({});
  const [viewportTick, setViewportTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MountainFeature>();
  const [collapsed, setCollapsed] = useState(false);
  const choose = useRef(onChoose); choose.current = onChoose;
  const focusMap = useRef(onFocus); focusMap.current = onFocus;
  const reportLoaded = useRef(onLoadedFeatureIds); reportLoaded.current = onLoadedFeatureIds;
  const interactive = canInteract(mode, "mountains");

  useEffect(() => { setSelected(undefined); }, [resetKey, enabled]);
  useEffect(() => { if (!interactive) setSelected(undefined); }, [interactive]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setError("");
    fetch("/data/mountain-detail/manifest.json", { signal: abort.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(setManifest).catch(error => { if (error.name !== "AbortError") setError("山地资料未能加载，请重试。"); });
    return () => abort.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!map || !ready) return;
    const update = () => setViewportTick(value => value + 1);
    map.on("moveend", update); map.on("resize", update); update();
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [map, ready]);
  const zoom = map && ready ? map.getZoom() : 0;
  const needed = useMemo(() => {
    if (!enabled || !map || !ready) return [];
    const b = map.getBounds();
    const bounds: MountainDetailBounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    return manifest?.packs.filter(pack => zoom >= pack.minZoom && overlaps(bounds, pack.bounds)) ?? [];
  }, [enabled, map, ready, manifest, viewportTick, zoom]);
  const neededKey = needed.map(pack => pack.id).join(",");
  useEffect(() => {
    const pending = needed.filter(pack => !packs[pack.id]);
    if (!pending.length) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    let index = 0;
    const worker = async () => {
      while (index < pending.length && !abort.signal.aborted) {
        const pack = pending[index++];
        const collection = await fetchCollection(pack.url, abort.signal);
        if (collection.type !== "FeatureCollection" || collection.features.length !== pack.featureCount) throw Error();
        if (!abort.signal.aborted) setPacks(previous => ({ ...previous, [pack.id]: collection }));
      }
    };
    Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker))
      .then(() => { if (!abort.signal.aborted) setLoading(false); })
      .catch(error => { if (error.name !== "AbortError") { setError("部分山脊资料未能加载，请重试。"); setLoading(false); } });
    return () => abort.abort();
  }, [neededKey, attempt]);
  const loadedFeatures = useMemo(() => needed.flatMap(pack => packs[pack.id]?.features ?? []), [needed, packs]);
  const loadedIdsKey = useMemo(() => JSON.stringify(enabled ? loadedFeatures.map(feature => feature.properties.id).sort() : []), [enabled, loadedFeatures]);
  useEffect(() => { reportLoaded.current?.(JSON.parse(loadedIdsKey)); }, [loadedIdsKey]);
  useEffect(() => () => { reportLoaded.current?.([]); }, []);
  const activeFeatures = useMemo(() => enabled ? loadedFeatures.filter(feature => zoom >= feature.properties.minZoom) : [], [enabled, loadedFeatures, zoom]);
  const nearbyRidges = useMemo(() => nearbyMountainRidges(selected, Object.values(packs).flatMap(pack => pack.features)), [selected, packs]);
  const selectable = useMemo(() => new Map(activeFeatures.map(feature => [feature.properties.id, feature])), [activeFeatures]);
  const results = useMemo(() => {
    const key = boundarySearchKey(query);
    return loadedFeatures.filter(({ properties: p }) => key ? boundarySearchKey(`${p.name} ${p.originalName} ${Object.entries(p.tags).filter(([name]) => name.startsWith("name")).map(([, value]) => value).join(" ")} ${p.osmId}`).includes(key) : p.hasChineseName)
      .sort((a, b) => Number(b.properties.hasChineseName) - Number(a.properties.hasChineseName) || a.properties.minZoom - b.properties.minZoom)
      .slice(0, key ? 30 : 6);
  }, [loadedFeatures, query]);

  useEffect(() => {
    if (!map || !ready) return;
    map.addSource("mountain-detail", { type: "geojson", data: empty, tolerance: 0 });
    map.addSource("mountain-detail-selected", { type: "geojson", data: empty, tolerance: 0 });
    const before = map.getLayer("route-line") ? "route-line" : undefined;
    map.addLayer({ id: layers[0], type: "line", source: "mountain-detail", filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "cliff"]], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#7d7658", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 11, 2], "line-opacity": .85 } }, before);
    map.addLayer({ id: layers[1], type: "line", source: "mountain-detail", filter: ["==", ["get", "kind"], "cliff"], paint: { "line-color": "#a08a70", "line-width": 1.3, "line-dasharray": [2, 1.5], "line-opacity": .8 } }, before);
    map.addLayer({ id: layers[2], type: "circle", source: "mountain-detail", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 3.5, "circle-color": "#766b49", "circle-stroke-color": "#fffae5", "circle-stroke-width": 1 } }, before);
    map.addLayer({ id: mountainDetailHitLayerIds[0], type: "line", source: "mountain-detail", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-width": 12, "line-opacity": 0 } }, before);
    map.addLayer({ id: mountainDetailHitLayerIds[1], type: "circle", source: "mountain-detail", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 9, "circle-opacity": 0 } }, before);
    map.addLayer({ id: layers[5], type: "line", source: "mountain-detail-selected", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#a85435", "line-width": 4 } }, before);
    map.addLayer({ id: layers[6], type: "circle", source: "mountain-detail-selected", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": "#a85435", "circle-stroke-color": "#fff9e7", "circle-stroke-width": 2 } }, before);
    return () => {
      if (!map.getStyle()) return;
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["mountain-detail", "mountain-detail-selected"]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready]);
  useEffect(() => {
    if (!ready || !map?.getSource("mountain-detail")) return;
    (map.getSource("mountain-detail") as GeoJSONSource).setData({ type: "FeatureCollection", features: activeFeatures });
    for (const id of mountainDetailHitLayerIds) map.setLayoutProperty(id, "visibility", interactive && enabled ? "visible" : "none");
    (map.getSource("mountain-detail-selected") as GeoJSONSource).setData({ type: "FeatureCollection", features: enabled && interactive && selected ? [selected] : [] });
  }, [map, ready, enabled, interactive, activeFeatures, selected]);

  function select(feature: MountainFeature, explicitFocus = false) {
    choose.current(); setSelected(feature); setCollapsed(false);
    const focus = mountainSelectionFocus(feature, map?.getZoom() ?? zoom, explicitFocus);
    if (focus) focusMap.current(focus.points, focus.maxZoom);
  }
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    const click = (event: MapMouseEvent) => {
      const hit = findNaturalMapHit(map, event.point, mode);
      if (!hit || !mountainDetailHitLayerIds.some(id => id === hit.layer.id)) return;
      const feature = selectable.get(String(hit.properties?.id));
      if (!feature) return;
      event.originalEvent.preventDefault();
      select(feature);
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, enabled, interactive, mode, selectable]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds();
      const container = map.getContainer(), rect = container.getBoundingClientRect();
      const occupied = [...container.querySelectorAll<HTMLElement>(".nature-label,.tang-detail-label,.marker-label,.boundary-region-label")]
        .filter(element => element.offsetWidth && element.style.display !== "none")
        .map(element => { const box = element.getBoundingClientRect(); return { x: (box.left + box.right) / 2 - rect.left, y: (box.top + box.bottom) / 2 - rect.top, width: box.width }; });
      const candidates = activeFeatures.filter(feature => bounds.contains(feature.properties.labelCoordinates) && (feature.properties.hasChineseName || feature.properties.id === selected?.properties.id))
        .sort((a, b) => Number(b.properties.id === selected?.properties.id) - Number(a.properties.id === selected?.properties.id) || a.properties.minZoom - b.properties.minZoom);
      const labeled = new Set<string>();
      for (const feature of candidates) {
        if (markers.length >= 80) break;
        const p = feature.properties, point = map.project(p.labelCoordinates), width = Math.min(240, p.name.length * 12 + 25);
        if (p.id !== selected?.properties.id && (labeled.has(p.name) || occupied.some(box => Math.abs(box.y - point.y) < 25 && Math.abs(box.x - point.x) < (box.width + width) / 2 + 5))) continue;
        labeled.add(p.name); occupied.push({ x: point.x, y: point.y, width });
        const element = document.createElement("button");
        element.className = `mountain-detail-label nature-label${p.id === selected?.properties.id ? " is-selected" : ""}`;
        element.textContent = `${p.kind === "peak" ? "△ " : ""}${p.name}`;
        element.setAttribute("aria-label", `查看${p.name}，现代${mountainDetailKindNames[p.kind]}记录`);
        element.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); select(feature); });
        markers.push(new Marker({ element, anchor: "bottom" }).setLngLat(p.labelCoordinates).addTo(map));
      }
    };
    const frame = requestAnimationFrame(render);
    map.on("moveend", render); map.on("resize", render);
    return () => { cancelAnimationFrame(frame); map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, enabled, interactive, activeFeatures, selected?.properties.id]);

  function focus(feature: MountainFeature) {
    select(feature, true);
  }
  const p = selected?.properties;
  return <>
    {enabled && interactive && controlsContainer && createPortal(<section className="nature-explorer mountain-detail-explorer" aria-label="山脊与山峰资料">
      <h3><Mountain size={14} />山脊与山峰</h3>
      <p>棕色线是现代 OSM 山脊、刃脊或陡崖记录，可直接点线查看。放大后逐级显示，线的宽度不代表山体范围。</p>
      {manifest && !manifest.acquisition.complete && <p role="status">部分采集区资料尚未取得，当前仅显示已核验的记录。</p>}
      <div className="nature-search"><Search size={13} /><input aria-label="搜索已加载的山脊与山峰" placeholder="山名、原名或OSM编号…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="nature-search-results">{results.map(feature => <button key={feature.properties.id} onClick={() => focus(feature)}><strong>{feature.properties.name}</strong><span>{mountainDetailKindNames[feature.properties.kind]}{feature.properties.elevationMetres !== undefined ? ` · ${feature.properties.elevationMetres}米` : ""}</span></button>)}</div>
      {query && !results.length && <p>当前已加载区域暂无匹配。可先选下方地区并放大；未收录不表示没有这座山。</p>}
      <details className="mountain-detail-coverage"><summary>采集地区与资料区别</summary>
        <div className="mountain-region-shortcuts">{manifest?.regions.map(region => <button key={region.id} onClick={() => onFocus([[(region.bounds[0] + region.bounds[2]) / 2, (region.bounds[1] + region.bounds[3]) / 2]], 8)}>{region.name}</button>)}</div>
        <p>{manifest ? `已收录${manifest.countsByKind.ridge}条山脊、${manifest.countsByKind.arete}条刃脊、${manifest.countsByKind.cliff}条陡崖与${manifest.countsByKind.peak}个命名山峰。` : "正在读取资料清单。"}这是有缺口的现代记录，不能认为已连续描出整条山脉。</p>
        <p>原“秦岭”等山系名称对应的走向示意是从命名范围推导的制图参考；本层仅画来源中实际存在的线。二者都不提供所选朝代的山体边界或历史地貌复原。</p>
      </details>
      {loading && <p role="status">正在加载视野内的山地记录…</p>}
      {error && <p role="status">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    </section>, controlsContainer)}
    {enabled && interactive && p && <section className="nature-detail mountain-detail-card" aria-label="山脊与山峰详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Mountain size={15} /><strong>{p.name}</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭山地详情" onClick={() => setSelected(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">{mountainDetailKindNames[p.kind]} · 现代参照</span>
        {p.kind === "peak" && <p className="mountain-peak-guide">符号定位峰顶；有覆盖时，等高线表示周边现代地势，棕色线表示已收录的山脊。等高线和山脊资料仍有缺口。</p>}
        <p>{p.geometryNote.replaceAll("唐代", "所选朝代")}</p>
        {!p.hasChineseName && <p>来源{p.originalName ? "尚无已核对的中文名称，原名保留在记录中" : "没有名称"}；不据位置为其补造山名。</p>}
        {p.elevationMetres !== undefined ? <p>来源标注高程：{p.elevationMetres}米。未经本项目独立测量核验。</p> : p.tags.ele && <p>来源高程原值：{p.tags.ele}。未换算未明确的单位。</p>}
        {p.mappedLengthKm !== undefined && <p>本条图上线长约{p.mappedLengthKm.toFixed(p.mappedLengthKm < 10 ? 2 : 1)}千米，按来源顶点计算水平距离；不是地表步行距离或整条山脉长度。</p>}
        {p.kind === "peak" && <section className="mountain-nearby-ridges" aria-label="附近已收录山脊">
          <h4>附近已收录山脊</h4>
          {nearbyRidges.length ? <>
            <p>10千米内，按峰顶到来源线的最近水平距离排序；邻近关系不代表属于同一山系。</p>
            <ul>{nearbyRidges.map(({ feature, distanceKm }) => <li key={feature.properties.id}><button type="button" onClick={() => focus(feature)}><strong>{feature.properties.name}</strong><span>距峰顶约{distanceKm.toFixed(1)}千米</span></button></li>)}</ul>
          </> : <p>当前已加载资料中，10千米内尚无山脊线；未收录不表示当地没有山脊。</p>}
        </section>}
        <p className="nature-detail-note">OSM {p.osmType}/{p.osmId} · 版本{p.osmVersion}。© OpenStreetMap contributors，ODbL 1.0。</p>
        <details><summary>查看原始记录</summary><pre>{JSON.stringify(p.tags, null, 2)}</pre></details>
        <div className="nature-detail-actions"><button onClick={() => focus(selected!)}>{p.kind === "peak" ? "近览周边地势" : "查看完整来源线"}</button><a href={p.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a></div>
      </div>}
    </section>}
  </>;
}
