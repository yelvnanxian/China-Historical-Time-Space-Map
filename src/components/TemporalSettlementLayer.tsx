import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { MapPin, Search, X } from "lucide-react";
import type { TemporalSettlementsCollection, TemporalSettlementsManifest } from "../../shared/temporal-settlements";
import { searchTemporalSettlements, temporalSettlementInView, temporalSettlementActive, temporalSettlementLink, temporalTangSettlementKey, temporalSettlementYearLabel, type TemporalSettlementViewport, type TemporalSettlementLevel } from "../../shared/temporal-settlements";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import type { TangBoundaryCrosswalk } from "../../shared/tang-boundary-crosswalk";
import type { TangCountyDiagnostics } from "../../shared/tang-county-diagnostics";
import { canOpenCountyModel } from "../../shared/county-model-interaction";
import TangJurisdictionInfo from "./TangJurisdictionInfo";
import CountyGeometryNotice from "./CountyGeometryNotice";
import "../map-detail.css";

const empty: TemporalSettlementsCollection = { type: "FeatureCollection", features: [] };
type Settlement = TemporalSettlementsCollection["features"][number];
const layers = ["temporal-settlement-points", "temporal-settlement-hit", "temporal-settlement-selected"];

export default function TemporalSettlementLayer({ map, ready, periodId, year, zoom, mode, modernNames, controlsContainer, resetKey, onChoose, onFocus, onBoundaryRequest, onPlaceSelect }: {
  map: MapInstance | null; ready: boolean; periodId: string; year: number; zoom: number; mode: MapInteractionMode; modernNames: boolean;
  controlsContainer: HTMLElement | null; resetKey: string;
  onChoose: () => void; onFocus: (points: [number, number][], maxZoom?: number) => void;
  onBoundaryRequest: (id: string) => void; onPlaceSelect: (id: string) => void;
}) {
  const validYear = Number.isInteger(year) && year !== 0;
  const yearLabel = temporalSettlementYearLabel(year);
  const interactive = canInteract(mode, "cities");
  const [manifest, setManifest] = useState<TemporalSettlementsManifest>();
  const [data, setData] = useState<TemporalSettlementsCollection>(empty);
  const [loadedPeriodId, setLoadedPeriodId] = useState("");
  const pack = manifest?.packages.find(item => item.periodId === periodId);
  const enabled = !!pack && validYear && pack.startYear <= year && year <= pack.endYear;
  const cache = useRef(new Map<string, TemporalSettlementsCollection>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<TemporalSettlementLevel>("all");
  const [viewport, setViewport] = useState<TemporalSettlementViewport>();
  const [selected, setSelected] = useState<Settlement>();
  const [collapsed, setCollapsed] = useState(false);
  const [tangCrosswalk, setTangCrosswalk] = useState<TangBoundaryCrosswalk>();
  const [tangDiagnostics, setTangDiagnostics] = useState<TangCountyDiagnostics>();
  const [tangError, setTangError] = useState("");
  const choose = useRef(onChoose); choose.current = onChoose;
  const focus = useRef(onFocus); focus.current = onFocus;
  const focusedLabel = useRef<string | undefined>(undefined);
  useEffect(() => { setSelected(undefined); }, [resetKey, periodId, year]);
  useEffect(() => { if (!interactive) setSelected(undefined); }, [interactive]);
  useEffect(() => { setQuery(""); setLevel("all"); }, [periodId]);
  useEffect(() => {
    if (year !== 755 || tangCrosswalk && tangDiagnostics) return;
    const abort = new AbortController();
    setTangError("");
    Promise.all(["/data/tang-boundary-crosswalk.json", "/data/tang-county-diagnostics.json"].map(async url => {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw Error();
      return response.json();
    })).then(([crosswalk, diagnostics]) => {
      if (crosswalk.boundaryYear !== 741 || !crosswalk.settlements || diagnostics.sourceYear !== 755 || diagnostics.boundaryYear !== 741 || !diagnostics.bySettlement) throw Error();
      if (!abort.signal.aborted) { setTangCrosswalk(crosswalk); setTangDiagnostics(diagnostics); }
    }).catch(() => { if (!abort.signal.aborted) setTangError("755年治所与741年参考范围的既有核查资料未能加载，可重试。"); });
    return () => abort.abort();
  }, [year, tangCrosswalk, tangDiagnostics, attempt]);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    fetch("/data/temporal-settlements/manifest.json", { signal: abort.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then((index: TemporalSettlementsManifest) => {
        if (index.kind !== "chgis-temporal-settlements" || !Array.isArray(index.packages)) throw Error();
        if (!abort.signal.aborted) setManifest(index);
      }).catch(cause => { if (!abort.signal.aborted) setError("历史时序治所目录未能加载，请重试。"); });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => {
    setSelected(undefined); setData(empty); setLoadedPeriodId("");
    if (!pack) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    (async () => {
      if (!pack.url.startsWith("/data/temporal-settlements/")) throw Error();
      let collection = cache.current.get(pack.periodId);
      if (!collection) {
        const response = await fetch(pack.url, { signal: abort.signal });
        if (!response.ok) throw Error();
        const bytes = new Uint8Array(await response.arrayBuffer());
        collection = bytes[0] === 0x1f && bytes[1] === 0x8b
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
          : JSON.parse(new TextDecoder().decode(bytes));
        if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || collection.features.length !== pack.featureCount || collection.features.some(f => f.geometry.type !== "Point" || !Number.isInteger(f.properties.beginYear) || !Number.isInteger(f.properties.endYear) || f.properties.beginYear > f.properties.endYear)) throw Error();
        if (abort.signal.aborted) return;
        cache.current.set(pack.periodId, collection);
        if (cache.current.size > 2) cache.current.delete(cache.current.keys().next().value!);
      }
      if (!abort.signal.aborted) { setData(collection); setLoadedPeriodId(pack.periodId); setLoading(false); }
    })().catch(() => { if (!abort.signal.aborted) { setLoading(false); setError("本时期历史治所资料未能加载，请重试。"); } });
    return () => abort.abort();
  }, [pack, attempt]);
  useEffect(() => {
    if (!map || !ready) return;
    const update = () => { const b = map.getBounds(); setViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
    map.on("moveend", update); map.on("resize", update); update();
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [map, ready]);
  // Source membership changes at these two thresholds, not every animation frame.
  const visibleZoom = zoom >= 8 ? 8 : zoom >= 6 ? 6 : 0;
  const currentFeatures = useMemo(() => enabled && loadedPeriodId === periodId ? data.features.filter(f => temporalSettlementActive(f.properties, year)) : [], [data, enabled, loadedPeriodId, periodId, year]);
  const displayed = useMemo(() => currentFeatures.filter(f => visibleZoom >= f.properties.minZoom), [currentFeatures, visibleZoom]);
  // Selection and source geometry are gated synchronously on the browsing year;
  // clearing React state in an effect alone would leave one stale render.
  const currentSelected = enabled && loadedPeriodId === periodId && selected && temporalSettlementActive(selected.properties, year) ? selected : undefined;
  const mapData = useMemo(() => ({ type: "FeatureCollection" as const, features: displayed.map(f => ({ ...f, properties: { id: f.properties.id, level: f.properties.level } })) }), [displayed]);
  const results = useMemo(() => searchTemporalSettlements(currentFeatures, year, query, level, viewport), [currentFeatures, year, query, level, viewport]);
  const inViewCount = displayed.filter(f => temporalSettlementInView(f.geometry.coordinates, viewport)).length;
  const byId = useMemo(() => new Map(displayed.map(f => [f.properties.id, f])), [displayed]);
  function select(feature: Settlement, locate = false) {
    choose.current(); setSelected(feature); setCollapsed(false);
    if (locate) focus.current([feature.geometry.coordinates as [number, number]], 10);
  }
  useEffect(() => {
    if (!map || !ready) return;
    map.addSource("temporal-settlements", { type: "geojson", data: empty });
    map.addSource("temporal-settlement-selection", { type: "geojson", data: empty });
    map.addLayer({ id: layers[0], type: "circle", source: "temporal-settlements", paint: { "circle-color": "#89674b", "circle-radius": ["match", ["get", "level"], "prefecture", 4, 2.8], "circle-stroke-color": "#fff9e9", "circle-stroke-width": 1 } }, "route-line");
    map.addLayer({ id: layers[1], type: "circle", source: "temporal-settlements", paint: { "circle-radius": 6, "circle-opacity": 0 } }, "route-line");
    map.addLayer({ id: layers[2], type: "circle", source: "temporal-settlement-selection", paint: { "circle-radius": 7, "circle-color": "#b5784d", "circle-stroke-color": "#fff3d2", "circle-stroke-width": 2 } }, "route-line");
    const mapError = (event: unknown) => {
      if (["temporal-settlements", "temporal-settlement-selection"].includes((event as { sourceId?: string })?.sourceId ?? "")) setError("历史治所暂时未能绘制，可重试加载。");
    };
    map.on("error", mapError);
    return () => {
      map.off("error", mapError);
      if (!map.getStyle()) return;
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["temporal-settlements", "temporal-settlement-selection"]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready]);
  useEffect(() => {
    if (!map || !ready || !map.getSource("temporal-settlements")) return;
    (map.getSource("temporal-settlements") as GeoJSONSource).setData(mapData);
  }, [map, ready, mapData]);
  useEffect(() => {
    if (!map || !ready || !map.getSource("temporal-settlements")) return;
    map.setLayoutProperty(layers[1], "visibility", enabled && interactive ? "visible" : "none");
    map.setPaintProperty(layers[0], "circle-opacity", interactive ? .85 : .3);
    map.setPaintProperty(layers[0], "circle-stroke-opacity", interactive ? 1 : .3);
    (map.getSource("temporal-settlement-selection") as GeoJSONSource).setData({ type: "FeatureCollection", features: enabled && interactive && currentSelected ? [{ ...currentSelected, properties: { id: currentSelected.properties.id } }] : [] });
  }, [map, ready, enabled, interactive, currentSelected]);
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
      const candidates = displayed.filter(f => bounds.contains(f.geometry.coordinates as [number, number])).sort((a, b) => Number(b.properties.id === currentSelected?.properties.id) - Number(a.properties.id === currentSelected?.properties.id) || a.properties.minZoom - b.properties.minZoom);
      for (const feature of candidates) {
        if (markers.length >= 100) break;
        const p = feature.properties, point = map.project(feature.geometry.coordinates as [number, number]);
        const width = Math.min(210, (modernNames ? Math.max(p.name.length + 3, p.presentLocation.length) : p.name.length + 3) * 12 + 16);
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - (modernNames ? 42 : 24), bottom: rect.top + point.y - 5 };
        if (p.id !== currentSelected?.properties.id && occupied.some(other => box.left < other.right + 4 && box.right > other.left - 4 && box.top < other.bottom + 4 && box.bottom > other.top - 4)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.className = `tang-detail-label detail-settlement song-settlement-label${p.id === currentSelected?.properties.id ? " is-selected" : ""}`;
        element.dataset.temporalSettlementId = p.id;
        element.textContent = `${p.name} · 治所`;
        element.setAttribute("aria-label", `查看${p.name} · ${yearLabel}治所资料 · ${p.presentLocation || p.sourceRecordId}`);
        if (modernNames && p.presentLocation) { const current = document.createElement("small"); current.textContent = `今录 · ${p.presentLocation}`; element.append(current); }
        element.addEventListener("click", event => { event.stopPropagation(); select(feature); });
        markers.push(new Marker({ element, anchor: "bottom", offset: [0, -5] }).setLngLat(feature.geometry.coordinates as [number, number]).addTo(map));
        if (focusedLabel.current === p.id) element.focus({ preventScroll: true });
      }
    };
    const frame = requestAnimationFrame(render);
    map.on("moveend", render); map.on("resize", render);
    return () => {
      focusedLabel.current = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.temporalSettlementId : undefined;
      cancelAnimationFrame(frame); map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove());
    };
  }, [map, ready, enabled, interactive, displayed, currentSelected?.properties.id, modernNames]);
  const p = currentSelected?.properties;
  const documented = p ? temporalSettlementLink(p, year) : undefined;
  const sameNames = p ? currentFeatures.filter(f => f.properties.name === p.name && f.properties.subtype === p.subtype && f.properties.level === p.level && f.properties.id !== p.id).length : 0;
  const legacyTangId = p ? temporalTangSettlementKey(p, year) : undefined;
  const tangLink = legacyTangId ? tangCrosswalk?.settlements[legacyTangId] : undefined;
  const rawTangCounty = legacyTangId ? tangDiagnostics?.bySettlement[legacyTangId] : undefined;
  const tangCounty = rawTangCounty && currentSelected && rawTangCounty.sourcePoint.coordinates.every((value, index) => value === currentSelected.geometry.coordinates[index]) ? rawTangCounty : undefined;
  const tangCountyModels = tangCounty?.candidates.filter(candidate => canOpenCountyModel(tangCounty, candidate, tangDiagnostics?.byBoundary[candidate.boundaryId])) ?? [];
  return <>
    {periodId !== "unassigned" && periodId !== "empty" && interactive && controlsContainer && createPortal(<section className="nature-explorer song-settlement-explorer" aria-label="当前年份治所资料">
      <h3><MapPin size={14} />同期治所 · {yearLabel}</h3>
      <p>{manifest ? `${yearLabel}符合来源区间 ${currentFeatures.length.toLocaleString()} 条 · 当前视野显示 ${inViewCount} 条` : "加载同期治所资料…"}</p>
      <div className="nature-search"><Search size={13} /><input aria-label="搜索当前年份治所" placeholder="古名、今录位置或源编号…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <select aria-label="筛选历史治所源层级" value={level} onChange={event => setLevel(event.target.value as TemporalSettlementLevel)}><option value="all">全部源层级</option><option value="prefecture">府州级源记录</option><option value="county">县级源记录</option></select>
      <p className="song-settlement-search-note">{query.trim() ? `全资料匹配 ${results.length} 条${results.length > 40 ? "，先显示40条，请补充地点名缩小范围" : ""}。` : "输入名称检索当前年份的全部地区；留空列出当前视野内记录。"}同名记录按位置与源编号区分。</p>
      <div className="nature-search-results">{results.slice(0, query.trim() ? 40 : 10).map(feature => <button key={feature.properties.id} onClick={() => select(feature, true)}><strong>{feature.properties.name}</strong><span>{feature.properties.subtype} · {feature.properties.presentLocation || "今录位置待核"}<small>源编号 {feature.properties.sourceRecordId}</small></span></button>)}</div>
      {!loading && loadedPeriodId === periodId && !results.length && <p>当前年份未找到匹配记录，可换用地名、移动地图或调整年份；未收录不代表当时不存在城镇。</p>}
      <details className="detail-coverage"><summary>治所年代、覆盖与来源</summary>
        <p>府州级点6级起、县级点8级起逐级显示；标签避让不会删掉原点。图中的位置来自时序治所记录，区别于行政模型的排字锚点。</p>
        <p>{manifest?.dateNote}</p><p>{manifest?.polityNote}</p><p>{manifest?.coverageNote}</p>
        <p>755年另保留唐代既有核查入口，跳转的是741年参考模型；不把它当作755年精确辖界。</p>
        {manifest && <p>全源收录{manifest.uniqueFeatureCount}条有效区间；隔离{manifest.withheldCount}条来源冲突记录。当前时期分包{pack?.featureCount ?? 0}条。年代与坐标字段一致也不等于古址已经考定。</p>}
        {manifest?.sources.map(source => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>)}
      </details>
      {!loading && manifest && !enabled && <p role="status">当前年份不在所选时期的资料包范围内。</p>}
      {(!manifest && !error || loading) && <p role="status">正在加载本时期治所…</p>}{error && <p role="status">{error}<button onClick={() => { cache.current.clear(); setAttempt(value => value + 1); }}>重试</button></p>}
    </section>, controlsContainer)}
    {enabled && interactive && p && currentSelected && <section className="nature-detail song-settlement-card" aria-label="当前年份治所详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><strong>{p.name}</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭治所详情" onClick={() => setSelected(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">{yearLabel}时序候选 · {p.subtype}</span>
        <p>今录位置 · {p.presentLocation || "来源未提供"}</p><p>{documented?.polityNote ?? p.polityNote}</p>
        <p>来源存续年：{temporalSettlementYearLabel(p.beginYear)}—{temporalSettlementYearLabel(p.endYear)}。{p.dateCaution}</p>
        {sameNames > 0 && <p>当前年份还有{sameNames}条同名同类型来源记录，可能为异地同名或时序重叠，保留独立记录供核查。</p>}
        {documented?.boundaryId ? <><button className="detail-focus-button" onClick={() => onBoundaryRequest(documented?.boundaryId!)}>查看{documented?.boundaryName}参考范围{documented?.boundaryPointStatus === "outside" ? "（点面存疑）" : ""}</button><p>{documented?.boundaryNote}</p></> : <p className="nature-detail-note">此治所尚未建立可靠的同期同级辖区关联；不使用最近的面或上级范围代替。</p>}
        {year === 755 && <>
          <p className="nature-detail-note">以下沿用755年治所的既有核查，范围来自741年近似模型。查看范围会切换至模型年份，不表示755年边界已经核定。</p>
          <TangJurisdictionInfo name={p.name} link={tangLink} loading={!tangCrosswalk && !tangError} onView={onBoundaryRequest} />
          {tangCounty && <><CountyGeometryNotice diagnostic={tangCounty} />{tangCountyModels.map(candidate => <button key={candidate.boundaryId} className="detail-focus-button" onClick={() => onBoundaryRequest(candidate.boundaryId)}>查看{candidate.name} · 741年{tangCounty.status === "outside" ? "存疑模型与治所" : "县级参考范围"}</button>)}</>}
          {tangError && <p role="status">{tangError}<button onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
        </>}
        <details><summary>定位与定年依据</summary><p>{p.geometryNote}</p><p>起年规则：{p.beginRule}；讫年规则：{p.endRule}。源分组为{p.level === "prefecture" ? "府州级" : "县级"}，具体行政类型按“{p.subtype}”原记录理解。</p></details>
        <details><summary>查看原始记录 · {p.sourceRecordId}</summary><pre>{JSON.stringify(p.sourceRecord, null, 2)}</pre></details>
        <div className="nature-detail-actions"><button onClick={() => focus.current([currentSelected.geometry.coordinates as [number, number]], 10.5)}>定位与放大</button><a href={p.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a></div>
        {documented?.catalogPlaceId && <button className="detail-focus-button" onClick={() => { setSelected(undefined); onPlaceSelect(documented?.catalogPlaceId!); }}>查看城池史料与大事记</button>}
      </div>}
    </section>}
  </>;
}
