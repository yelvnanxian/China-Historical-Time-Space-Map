import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { MapPin, Search, X } from "lucide-react";
import type { SongSettlementsCollection, SongSettlementsManifest } from "../../shared/song-settlements";
import { searchSongSettlements, settlementInView, showSongSettlement, type SettlementViewport, type SongSettlementLevel } from "../../shared/song-settlement-display";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import "../map-detail.css";

const empty: SongSettlementsCollection = { type: "FeatureCollection", features: [] };
type Settlement = SongSettlementsCollection["features"][number];
const layers = ["song-settlement-points", "song-settlement-hit", "song-settlement-selected"];

export default function SongSettlementLayer({ map, ready, periodId, zoom, mode, modernNames, controlsContainer, resetKey, onChoose, onFocus, onBoundaryRequest, onPlaceSelect }: {
  map: MapInstance | null; ready: boolean; periodId: string; zoom: number; mode: MapInteractionMode; modernNames: boolean;
  controlsContainer: HTMLElement | null; resetKey: string;
  onChoose: () => void; onFocus: (points: [number, number][], maxZoom?: number) => void;
  onBoundaryRequest: (id: string) => void; onPlaceSelect: (id: string) => void;
}) {
  const enabled = periodId === "song";
  const interactive = canInteract(mode, "cities");
  const [manifest, setManifest] = useState<SongSettlementsManifest>();
  const [data, setData] = useState<SongSettlementsCollection>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<SongSettlementLevel>("all");
  const [viewport, setViewport] = useState<SettlementViewport>();
  const [selected, setSelected] = useState<Settlement>();
  const [collapsed, setCollapsed] = useState(false);
  const choose = useRef(onChoose); choose.current = onChoose;
  const focus = useRef(onFocus); focus.current = onFocus;
  const focusedLabel = useRef<string | undefined>(undefined);
  useEffect(() => { setSelected(undefined); }, [resetKey, enabled]);
  useEffect(() => { if (!interactive) setSelected(undefined); }, [interactive]);
  useEffect(() => { setQuery(""); setLevel("all"); }, [periodId]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setLoading(true); setError("");
    (async () => {
      const response = await fetch("/data/song-settlements/manifest.json", { signal: abort.signal });
      if (!response.ok) throw Error();
      const index: SongSettlementsManifest = await response.json();
      if (index.periodId !== "song" || index.year !== 1200 || !index.url.startsWith("/data/song-settlements/")) throw Error();
      const records = await fetch(index.url, { signal: abort.signal });
      if (!records.ok) throw Error();
      const collection: SongSettlementsCollection = await records.json();
      if (collection.type !== "FeatureCollection" || collection.features.length !== index.featureCount || collection.features.some(f => f.geometry.type !== "Point" || f.properties.year !== 1200)) throw Error();
      if (!abort.signal.aborted) { setManifest(index); setData(collection); setLoading(false); }
    })().catch(cause => { if (cause.name !== "AbortError") { setLoading(false); setError("宋代同期治所资料未能加载，请重试。"); } });
    return () => abort.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!map || !ready) return;
    const update = () => { const b = map.getBounds(); setViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
    map.on("moveend", update); map.on("resize", update); update();
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [map, ready]);
  // Source membership changes at these two thresholds, not every animation frame.
  const visibleZoom = zoom >= 8 ? 8 : zoom >= 6 ? 6 : 0;
  const displayed = useMemo(() => enabled ? data.features.filter(f => showSongSettlement(f.properties, visibleZoom, periodId)) : [], [data, enabled, visibleZoom, periodId]);
  const mapData = useMemo(() => ({ type: "FeatureCollection" as const, features: displayed.map(f => ({ ...f, properties: { id: f.properties.id, level: f.properties.level } })) }), [displayed]);
  const results = useMemo(() => searchSongSettlements(data.features, query, level, viewport), [data, query, level, viewport]);
  const inViewCount = displayed.filter(f => settlementInView(f.geometry.coordinates, viewport)).length;
  const byId = useMemo(() => new Map(displayed.map(f => [f.properties.id, f])), [displayed]);
  function select(feature: Settlement, locate = false) {
    choose.current(); setSelected(feature); setCollapsed(false);
    if (locate) focus.current([feature.geometry.coordinates as [number, number]], 10);
  }
  useEffect(() => {
    if (!map || !ready) return;
    map.addSource("song-settlements", { type: "geojson", data: empty });
    map.addSource("song-settlement-selection", { type: "geojson", data: empty });
    map.addLayer({ id: layers[0], type: "circle", source: "song-settlements", paint: { "circle-color": "#89674b", "circle-radius": ["match", ["get", "level"], "prefecture", 4, 2.8], "circle-stroke-color": "#fff9e9", "circle-stroke-width": 1 } }, "route-line");
    map.addLayer({ id: layers[1], type: "circle", source: "song-settlements", paint: { "circle-radius": 6, "circle-opacity": 0 } }, "route-line");
    map.addLayer({ id: layers[2], type: "circle", source: "song-settlement-selection", paint: { "circle-radius": 7, "circle-color": "#b5784d", "circle-stroke-color": "#fff3d2", "circle-stroke-width": 2 } }, "route-line");
    const mapError = (event: unknown) => {
      if (["song-settlements", "song-settlement-selection"].includes((event as { sourceId?: string })?.sourceId ?? "")) setError("宋代治所暂时未能绘制，可重试加载。");
    };
    map.on("error", mapError);
    return () => {
      map.off("error", mapError);
      if (!map.getStyle()) return;
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["song-settlements", "song-settlement-selection"]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready]);
  useEffect(() => {
    if (!map || !ready || !map.getSource("song-settlements")) return;
    (map.getSource("song-settlements") as GeoJSONSource).setData(mapData);
  }, [map, ready, mapData]);
  useEffect(() => {
    if (!map || !ready || !map.getSource("song-settlements")) return;
    map.setLayoutProperty(layers[1], "visibility", enabled && interactive ? "visible" : "none");
    map.setPaintProperty(layers[0], "circle-opacity", interactive ? .85 : .3);
    map.setPaintProperty(layers[0], "circle-stroke-opacity", interactive ? 1 : .3);
    (map.getSource("song-settlement-selection") as GeoJSONSource).setData({ type: "FeatureCollection", features: enabled && interactive && selected ? [{ ...selected, properties: { id: selected.properties.id } }] : [] });
  }, [map, ready, enabled, interactive, selected]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    const click = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement)?.closest?.("button")) return;
      const hit = findNaturalMapHit(map, event.point, mode);
      if (hit?.layer.id !== layers[1]) return;
      const feature = byId.get(hit.properties.id);
      if (feature) { event.originalEvent.preventDefault(); select(feature); }
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, enabled, interactive, byId, mode]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds(), rect = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label,.boundary-region-label,.nature-label,.tang-detail-label")].filter(el => el.offsetWidth && el.style.display !== "none").map(el => el.getBoundingClientRect());
      const candidates = displayed.filter(f => bounds.contains(f.geometry.coordinates as [number, number])).sort((a, b) => Number(b.properties.id === selected?.properties.id) - Number(a.properties.id === selected?.properties.id) || a.properties.minZoom - b.properties.minZoom);
      for (const feature of candidates) {
        if (markers.length >= 100) break;
        const p = feature.properties, point = map.project(feature.geometry.coordinates as [number, number]);
        const width = Math.min(210, (modernNames ? Math.max(p.name.length + 3, p.presentLocation.length) : p.name.length + 3) * 12 + 16);
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - (modernNames ? 42 : 24), bottom: rect.top + point.y - 5 };
        if (p.id !== selected?.properties.id && occupied.some(other => box.left < other.right + 4 && box.right > other.left - 4 && box.top < other.bottom + 4 && box.bottom > other.top - 4)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.className = `tang-detail-label detail-settlement song-settlement-label${p.id === selected?.properties.id ? " is-selected" : ""}`;
        element.dataset.songSettlementId = p.id;
        element.textContent = `${p.name} · 治所`;
        element.setAttribute("aria-label", `查看${p.name} · 1200年治所资料 · ${p.presentLocation || p.sourceRecordId}`);
        if (modernNames && p.presentLocation) { const current = document.createElement("small"); current.textContent = `今录 · ${p.presentLocation}`; element.append(current); }
        element.addEventListener("click", event => { event.stopPropagation(); select(feature); });
        markers.push(new Marker({ element, anchor: "bottom", offset: [0, -5] }).setLngLat(feature.geometry.coordinates as [number, number]).addTo(map));
        if (focusedLabel.current === p.id) element.focus({ preventScroll: true });
      }
    };
    const frame = requestAnimationFrame(render);
    map.on("moveend", render); map.on("resize", render);
    return () => {
      focusedLabel.current = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.songSettlementId : undefined;
      cancelAnimationFrame(frame); map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove());
    };
  }, [map, ready, enabled, interactive, displayed, selected?.properties.id, modernNames]);
  const p = selected?.properties;
  return <>
    {enabled && interactive && controlsContainer && createPortal(<section className="nature-explorer song-settlement-explorer" aria-label="宋代同期城镇资料">
      <h3><MapPin size={14} />宋代同期城镇 · 1200年</h3>
      <p>{manifest ? `${manifest.featureCount.toLocaleString()} 条府州、县级时序点 · 当前视野显示 ${inViewCount} 条` : "加载同期治所资料…"}</p>
      <div className="nature-search"><Search size={13} /><input aria-label="搜索宋代同期城镇" placeholder="古名、今录位置或源编号…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <select aria-label="筛选宋代治所源层级" value={level} onChange={event => setLevel(event.target.value as SongSettlementLevel)}><option value="all">全部源层级</option><option value="prefecture">府州级源记录</option><option value="county">县级源记录</option></select>
      <p className="song-settlement-search-note">{query.trim() ? `全资料匹配 ${results.length} 条${results.length > 40 ? "，先显示40条，请补充地点名缩小范围" : ""}。` : "输入名称检索全部地区；留空列出当前视野内记录。"}同名记录按位置与源编号区分。</p>
      <div className="nature-search-results">{results.slice(0, query.trim() ? 40 : 10).map(feature => <button key={feature.properties.id} onClick={() => select(feature, true)}><strong>{feature.properties.name}</strong><span>{feature.properties.subtype} · {feature.properties.presentLocation || "今录位置待核"}<small>源编号 {feature.properties.sourceRecordId}</small></span></button>)}</div>
      {!loading && data.features.length > 0 && !results.length && <p>未找到匹配记录，可换用今录地名或移动地图；未收录不代表当时不存在城镇。</p>}
      <details className="detail-coverage"><summary>治所年代、覆盖与来源</summary>
        <p>府州级点6级起、县级点8级起逐级显示；标签避让不会删掉原点。图中的位置来自时序治所记录，区别于行政模型的排字锚点。</p>
        <p>{manifest?.dateNote}</p><p>{manifest?.polityNote}</p><p>{manifest?.coverageNote}</p>
        {manifest && <p>源时序候选{manifest.eligibleSourceCount}条；隔离{manifest.withheldCount}条来源冲突记录。年代与坐标字段一致也不等于古址已经考定。</p>}
        {manifest?.sources.map(source => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>)}
      </details>
      {loading && <p role="status">正在加载宋代同期治所…</p>}{error && <p role="status">{error}<button onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    </section>, controlsContainer)}
    {enabled && interactive && p && selected && <section className="nature-detail song-settlement-card" aria-label="宋代同期治所详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><strong>{p.name}</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭宋代治所详情" onClick={() => setSelected(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">1200年时序候选 · {p.subtype}</span>
        <p>今录位置 · {p.presentLocation || "来源未提供"}</p><p>{p.polityNote}</p>
        <p>来源存续年：{p.beginYear}—{p.endYear}年。{p.dateCaution}</p>
        {p.sameNameNote && <p>{p.sameNameNote}</p>}
        {p.boundaryId ? <><button className="detail-focus-button" onClick={() => onBoundaryRequest(p.boundaryId!)}>查看{p.boundaryName}参考范围{p.boundaryPointStatus === "outside" ? "（点面存疑）" : ""}</button><p>{p.boundaryNote}</p></> : <p className="nature-detail-note">此治所尚未建立可靠的同期同级辖区关联；不使用最近的面或上级范围代替。</p>}
        <details><summary>定位与定年依据</summary><p>{p.geometryNote}</p><p>起年规则：{p.beginRule}；讫年规则：{p.endRule}。源分组为{p.level === "prefecture" ? "府州级" : "县级"}，具体行政类型按“{p.subtype}”原记录理解。</p></details>
        <details><summary>查看原始记录 · {p.sourceRecordId}</summary><pre>{JSON.stringify(p.sourceRecord, null, 2)}</pre></details>
        <div className="nature-detail-actions"><button onClick={() => focus.current([selected.geometry.coordinates as [number, number]], 10.5)}>定位与放大</button><a href={p.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a></div>
        {p.catalogPlaceId && <button className="detail-focus-button" onClick={() => { setSelected(undefined); onPlaceSelect(p.catalogPlaceId!); }}>查看城池史料与大事记</button>}
      </div>}
    </section>}
  </>;
}
