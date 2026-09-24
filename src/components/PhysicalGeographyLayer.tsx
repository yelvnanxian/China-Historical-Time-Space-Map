import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { ExternalLink, LocateFixed, Mountain, Search, Waves, X } from "lucide-react";
import type { PhysicalFeatureCollection, PhysicalGroup, PhysicalInteractionIndex, PhysicalKind } from "../../shared/physical-geography";
import { physicalKindNames } from "../../shared/physical-geography";
import { boundarySearchKey } from "../../shared/boundary-search";
import { physicalHitLayers } from "../../shared/map-interactions";

const sourceId = "physical-interactive";
const layerIds = ["physical-sea-fill", "physical-mountain-fill", "physical-mountain-outline", "physical-lake-fill", "physical-lake-line", "physical-river-line", "physical-river-hit", "physical-selected-fill", "physical-selected-line", "physical-hover-line"];
const empty: PhysicalFeatureCollection = { type: "FeatureCollection", features: [] };
const kindRank: Record<PhysicalKind, number> = { river: 0, lake: 1, mountain: 2, plateau: 3, sea: 4 };

export default function PhysicalGeographyLayer({ map, ready, visible, mode, controlsContainer, onFocus, onChoose }: {
  map: MapInstance | null; ready: boolean; visible: boolean; mode: "cities" | "nature" | "both";
  controlsContainer: HTMLElement | null; onFocus: (points: [number, number][]) => void; onChoose: () => void;
}) {
  const [data, setData] = useState<PhysicalFeatureCollection>(empty);
  const [groups, setGroups] = useState<PhysicalGroup[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [hoverId, setHoverId] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PhysicalKind | "all">("all");
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const chooseCallback = useRef(onChoose);
  chooseCallback.current = onChoose;
  const selected = groups.find(group => group.groupId === selectedId);
  const hover = groups.find(group => group.groupId === hoverId);
  const searchIndex = useMemo(() => groups.map(group => ({ group, key: boundarySearchKey([group.name, group.nameEn, ...group.aliases].join(" ")) })), [groups]);
  const results = useMemo(() => {
    const key = boundarySearchKey(query);
    return searchIndex.filter(item => (kind === "all" || item.group.kind === kind) && (!key || item.key.includes(key)))
      .sort((a, b) => Number(/\p{Script=Han}/u.test(b.group.name)) - Number(/\p{Script=Han}/u.test(a.group.name)) || a.group.minZoom - b.group.minZoom || kindRank[a.group.kind] - kindRank[b.group.kind]).slice(0, 24).map(item => item.group);
  }, [searchIndex, query, kind]);

  useEffect(() => {
    const abort = new AbortController();
    Promise.all(["/data/physical-interactive.geojson", "/data/physical-interactions.json"].map(url => fetch(url, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error("山川河流资料暂时无法加载，请刷新重试。");
      return response.json();
    }))).then(([collection, index]) => {
      setData(collection as PhysicalFeatureCollection); setGroups((index as PhysicalInteractionIndex).groups); setLoaded(true);
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!ready || !map) return;
    map.addSource(sourceId, { type: "geojson", data: empty, tolerance: 0.1 });
    const add: MapInstance["addLayer"] = (layer, before) => map.addLayer(layer, before ?? "route-line");
    add({ id: "physical-sea-fill", source: sourceId, type: "fill", filter: ["==", ["get", "kind"], "sea"], paint: { "fill-color": "#8dbfc2", "fill-opacity": 0.14 } });
    add({ id: "physical-mountain-fill", source: sourceId, type: "fill", filter: ["in", ["get", "kind"], ["literal", ["mountain", "plateau"]]], paint: { "fill-color": ["match", ["get", "kind"], "plateau", "#b79d63", "#73985b"], "fill-opacity": 0.18 } });
    add({ id: "physical-mountain-outline", source: sourceId, type: "line", filter: ["in", ["get", "kind"], ["literal", ["mountain", "plateau"]]], paint: { "line-color": "#758e57", "line-opacity": 0.55, "line-width": 1.1, "line-dasharray": [3, 2] } });
    add({ id: "physical-lake-fill", source: sourceId, type: "fill", filter: ["==", ["get", "kind"], "lake"], paint: { "fill-color": "#83b7c4", "fill-opacity": 0.78 } });
    add({ id: "physical-lake-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "lake"], paint: { "line-color": "#578f9d", "line-width": 1 } });
    add({ id: "physical-river-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#468d9f", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 5, 2, 9, 3.5] } });
    add({ id: "physical-river-hit", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#468d9f", "line-opacity": 0.01, "line-width": 14 } });
    add({ id: "physical-selected-fill", source: sourceId, type: "fill", filter: ["==", ["get", "groupId"], ""], paint: { "fill-color": ["match", ["get", "kind"], "mountain", "#6e934c", "plateau", "#b79147", "#3b94a5"], "fill-opacity": 0.3 } });
    add({ id: "physical-selected-line", source: sourceId, type: "line", filter: ["==", ["get", "groupId"], ""], paint: { "line-color": "#236d74", "line-width": 3.5, "line-opacity": 0.95 } });
    add({ id: "physical-hover-line", source: sourceId, type: "line", filter: ["==", ["get", "groupId"], ""], paint: { "line-color": "#347b75", "line-width": 2, "line-opacity": 0.75 } });
    const onError = (event: unknown) => { if ((event as { sourceId?: string })?.sourceId === sourceId) setError("山川图层暂时无法绘制，请刷新重试。"); };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
      if (!map.getStyle()) return;
      for (const id of [...layerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    (map.getSource(sourceId) as GeoJSONSource).setData(data);
  }, [map, ready, data]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    for (const id of layerIds) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    map.setPaintProperty("physical-mountain-fill", "fill-opacity", mode === "nature" ? 0.25 : 0.14);
    if (!visible) { setSelectedId(""); setHoverId(""); }
  }, [map, ready, visible, mode]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    map.setFilter("physical-selected-fill", ["all", ["!=", ["get", "kind"], "river"], ["==", ["get", "groupId"], selectedId]]);
    map.setFilter("physical-selected-line", ["==", ["get", "groupId"], selectedId]);
    map.setFilter("physical-hover-line", ["==", ["get", "groupId"], hoverId]);
  }, [map, ready, selectedId, hoverId]);

  function select(groupId: string) { setSelectedId(groupId); setDetailCollapsed(false); chooseCallback.current(); }
  useEffect(() => {
    if (!map || !ready || !visible) return;
    function find(event: MapMouseEvent) {
      const features = map!.queryRenderedFeatures(event.point, { layers: physicalHitLayers.filter(id => !!map!.getLayer(id)) });
      return features.sort((a, b) => kindRank[a.properties.kind as PhysicalKind] - kindRank[b.properties.kind as PhysicalKind])[0];
    }
    const click = (event: MapMouseEvent) => { const feature = find(event); if (feature) select(feature.properties.groupId); };
    const move = (event: MapMouseEvent) => { const feature = find(event); setHoverId(feature?.properties.groupId ?? ""); map.getCanvas().style.cursor = feature ? "pointer" : ""; };
    const leave = () => { setHoverId(""); map.getCanvas().style.cursor = ""; };
    map.on("click", click); map.on("mousemove", move); map.getCanvas().addEventListener("mouseleave", leave);
    return () => { map.off("click", click); map.off("mousemove", move); map.getCanvas().removeEventListener("mouseleave", leave); map.getCanvas().style.cursor = ""; };
  }, [map, ready, visible]);

  useEffect(() => {
    if (!map || !ready || !visible) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds(); const zoom = map.getZoom(); const rect = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label,.boundary-region-label")].filter(el => el.style.display !== "none").map(el => el.getBoundingClientRect());
      const candidates = groups.filter(group => bounds.contains(group.labelCoordinates) && (group.groupId === selectedId || zoom >= Math.max(group.minZoom, /\p{Script=Han}/u.test(group.name) ? 0 : 5.5)) && !group.name.startsWith("未命名"))
        .sort((a, b) => Number(b.groupId === selectedId) - Number(a.groupId === selectedId) || a.minZoom - b.minZoom).slice(0, 140);
      for (const group of candidates) {
        const point = map.project(group.labelCoordinates); const width = Math.min(200, group.name.length * 12 + 20);
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - 12, bottom: rect.top + point.y + 12 };
        if (group.groupId !== selectedId && occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5 && box.top < other.bottom + 5 && box.bottom > other.top - 5)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.className = `nature-label nature-${group.kind} ${group.groupId === selectedId ? "is-selected" : ""}`;
        element.textContent = `${group.kind === "mountain" || group.kind === "plateau" ? "△ " : ""}${group.name}`;
        element.setAttribute("aria-label", `查看${group.name}的${physicalKindNames[group.kind]}范围`);
        element.addEventListener("click", event => { event.stopPropagation(); select(group.groupId); });
        markers.push(new Marker({ element }).setLngLat(group.labelCoordinates).addTo(map));
      }
    };
    map.on("moveend", render); map.on("resize", render); render();
    return () => { map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, visible, groups, selectedId, mode]);

  function focus(group: PhysicalGroup) {
    select(group.groupId);
    onFocus([[group.bounds[0], group.bounds[1]], [group.bounds[2], group.bounds[3]]]);
  }
  return <>
    {controlsContainer && createPortal(<section className="nature-explorer" aria-label="查找山川河流">
      <h3><Waves size={14} />查找山川河流</h3>
      {!visible ? <p>切换到“山川河流”或“同时显示”即可查看自然范围。</p> : <>
        <div className="nature-search"><Search size={13} /><input aria-label="搜索山川河流" value={query} onChange={event => setQuery(event.target.value)} placeholder="黄河、秦岭、青海湖…" /></div>
        <select aria-label="筛选自然地理类型" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="all">全部自然地理</option>{Object.entries(physicalKindNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <div className="nature-search-results">{results.map(group => <button key={group.groupId} onClick={() => focus(group)}><strong>{group.name}</strong><span>{physicalKindNames[group.kind]}</span></button>)}</div>
        {!loaded && !error && <p role="status">山川资料加载中…</p>}{loaded && !results.length && <p>没有匹配结果，试试其他名称。</p>}
      </>}{error && <p role="status">{error}</p>}
    </section>, controlsContainer)}
    {visible && selected && <section className={`nature-detail ${detailCollapsed ? "is-collapsed" : ""}`} aria-label="山川河流详情">
      <header><button className="nature-detail-title" aria-expanded={!detailCollapsed} onClick={() => setDetailCollapsed(value => !value)}>{selected.kind === "mountain" || selected.kind === "plateau" ? <Mountain size={16} /> : <Waves size={16} />}<strong>{selected.name}</strong><span>{detailCollapsed ? "展开" : "收起"}</span></button><button aria-label="关闭山川河流详情" onClick={() => setSelectedId("")}><X size={16} /></button></header>
      {!detailCollapsed && <div className="nature-detail-body"><span className="nature-kind">{physicalKindNames[selected.kind]} · 现代自然地理</span>
        <p>{selected.geometryNote}</p><p className="nature-detail-note">已高亮本资料收录的{selected.kind === "river" ? "河道线位，线宽仅便于选择，不代表真实河宽" : selected.kind === "lake" ? "湖泊水面" : "地理概括范围，不是测绘分界"}。自然范围不随朝代复原。</p>
        <div className="nature-detail-actions"><button onClick={() => focus(selected)}><LocateFixed size={13} />查看完整范围</button><a href={selected.sourceUrl} target="_blank" rel="noreferrer">资料来源<ExternalLink size={12} /></a></div>
      </div>}
    </section>}
    {visible && hover && !selected && <div className="nature-hover" aria-hidden="true">{hover.name} · 点击查看{physicalKindNames[hover.kind]}范围</div>}
    {visible && error && <div className="nature-load-error" role="status">{error}</div>}
  </>;
}
