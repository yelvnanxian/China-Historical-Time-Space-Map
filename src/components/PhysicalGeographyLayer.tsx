import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { ExternalLink, LocateFixed, Mountain, Search, Waves, X } from "lucide-react";
import type { PhysicalFeatureCollection, PhysicalGroup, PhysicalInteractionIndex, PhysicalKind } from "../../shared/physical-geography";
import { physicalKindNames } from "../../shared/physical-geography";
import { boundarySearchKey } from "../../shared/boundary-search";
import { naturalSurfaceSelectionEnabled, physicalHitLayers, physicalWaterGeometry } from "../../shared/map-interactions";
import type { MountainDirectionCollection } from "../../shared/mountain-directions";
import { localizePhysicalGroup, type LocalizedPhysicalGroup } from "../../shared/place-name-localization";

const sourceId = "physical-interactive";
const directionSourceId = "mountain-directions";
const emptyDirections: MountainDirectionCollection = { type: "FeatureCollection", features: [] };
const layerIds = ["physical-lake-fill", "physical-lake-line", "physical-river-line", "physical-river-hit", "physical-selected-fill", "physical-selected-line", "physical-hover-line", "mountain-selected-halo", "mountain-selected-line"];
const empty: PhysicalFeatureCollection = { type: "FeatureCollection", features: [] };
const kindRank: Record<PhysicalKind, number> = { river: 0, lake: 1, mountain: 2, plateau: 3, sea: 4 };

export default function PhysicalGeographyLayer({ map, ready, visible, mode, controlsContainer, onFocus, onChoose, resetKey }: {
  map: MapInstance | null; ready: boolean; visible: boolean; mode: "cities" | "nature" | "both";
  resetKey: string; controlsContainer: HTMLElement | null; onFocus: (points: [number, number][]) => void; onChoose: () => void;
}) {
  const [data, setData] = useState<PhysicalFeatureCollection>(empty);
  const [directions, setDirections] = useState<MountainDirectionCollection>(emptyDirections);
  const [directionError, setDirectionError] = useState("");
  const [groups, setGroups] = useState<LocalizedPhysicalGroup[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [hoverId, setHoverId] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PhysicalKind | "all">("all");
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const chooseCallback = useRef(onChoose);
  chooseCallback.current = onChoose;
  const selectedDirection = directions.features.find(feature => feature.properties.groupId === selectedId);
  const directionLabels = useMemo(() => new Map(directions.features.map(feature => [feature.properties.groupId, feature.properties.labelCoordinates])), [directions]);
  const selected = groups.find(group => group.groupId === selectedId);
  const hover = groups.find(group => group.groupId === hoverId);
  const searchIndex = useMemo(() => groups.map(group => ({ group, key: boundarySearchKey([group.name, group.nameEn, ...group.aliases].join(" ")) })), [groups]);
  const results = useMemo(() => {
    const key = boundarySearchKey(query);
    return searchIndex.filter(item => (kind === "all" || item.group.kind === kind) && (!key || item.key.includes(key)))
      .sort((a, b) => Number(/\p{Script=Han}/u.test(b.group.name)) - Number(/\p{Script=Han}/u.test(a.group.name)) || a.group.minZoom - b.group.minZoom || kindRank[a.group.kind] - kindRank[b.group.kind]).slice(0, 24).map(item => item.group);
  }, [searchIndex, query, kind]);

  useEffect(() => { setSelectedId(""); setHoverId(""); }, [resetKey]);

  useEffect(() => {
    const abort = new AbortController();
    Promise.all(["/data/physical-interactive.geojson", "/data/physical-interactions.json"].map(url => fetch(url, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error("山川河流资料暂时无法加载，请刷新重试。");
      return response.json();
    }))).then(([collection, index]) => {
      setData(collection as PhysicalFeatureCollection); setGroups((index as PhysicalInteractionIndex).groups.map(localizePhysicalGroup)); setLoaded(true);
    }).catch(error => { if (error.name !== "AbortError") setError("山川河流资料暂时无法加载，请刷新重试。"); });
    fetch("/data/mountain-directions.geojson", { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error("山系走向暂时未能加载，名称定位和河湖仍可使用。");
      return response.json();
    }).then(collection => {
      if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) throw new Error("Invalid direction data");
      setDirections(collection);
    }).catch(error => { if (error.name !== "AbortError") setDirectionError("山系走向暂时未能加载，名称定位和河湖仍可使用。"); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!ready || !map) return;
    map.addSource(sourceId, { type: "geojson", data: empty, tolerance: 0.1 });
    map.addSource(directionSourceId, { type: "geojson", data: emptyDirections, tolerance: 0 });
    const add: MapInstance["addLayer"] = (layer, before) => map.addLayer(layer, before ?? "route-line");
    add({ id: "physical-lake-fill", source: sourceId, type: "fill", filter: ["==", ["get", "kind"], "lake"], paint: { "fill-color": "#83b7c4", "fill-opacity": 0.78 } });
    add({ id: "physical-lake-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "lake"], paint: { "line-color": "#578f9d", "line-width": 1 } });
    add({ id: "physical-river-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#468d9f", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 5, 2, 9, 3.5] } });
    add({ id: "physical-river-hit", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#468d9f", "line-opacity": 0.01, "line-width": 14 } });
    add({ id: "physical-selected-fill", source: sourceId, type: "fill", filter: ["==", ["get", "groupId"], ""], paint: { "fill-color": "#3b94a5", "fill-opacity": 0.3 } });
    add({ id: "physical-selected-line", source: sourceId, type: "line", filter: ["==", ["get", "groupId"], ""], paint: { "line-color": "#236d74", "line-width": 3.5, "line-opacity": 0.95 } });
    add({ id: "physical-hover-line", source: sourceId, type: "line", filter: ["==", ["get", "groupId"], ""], paint: { "line-color": "#347b75", "line-width": 2, "line-opacity": 0.75 } });
    add({ id: "mountain-selected-halo", source: directionSourceId, type: "line", filter: ["==", ["get", "groupId"], ""], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fcf4d5", "line-width": 9, "line-opacity": 0.85, "line-blur": 2 } });
    add({ id: "mountain-selected-line", source: directionSourceId, type: "line", filter: ["==", ["get", "groupId"], ""], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#76633c", "line-width": 3.5, "line-opacity": 0.95 } });
    const onError = (event: unknown) => {
      const failedSource = (event as { sourceId?: string })?.sourceId;
      if (failedSource === sourceId) setError("山川图层暂时无法绘制，请刷新重试。");
      if (failedSource === directionSourceId) setDirectionError("山系走向暂时无法绘制，名称定位和河湖仍可使用。");
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
      if (!map.getStyle()) return;
      for (const id of [...layerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (map.getSource(directionSourceId)) map.removeSource(directionSourceId);
    };
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    (map.getSource(sourceId) as GeoJSONSource).setData(physicalWaterGeometry(data));
  }, [map, ready, data]);
  useEffect(() => {
    if (!ready || !map?.getSource(directionSourceId)) return;
    (map.getSource(directionSourceId) as GeoJSONSource).setData(directions);
  }, [map, ready, directions]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    for (const id of layerIds) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    setHoverId("");
    if (!visible) { setSelectedId(""); setHoverId(""); }
  }, [map, ready, visible, mode]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    map.setFilter("physical-selected-fill", ["all", ["!=", ["get", "kind"], "river"], ["==", ["get", "groupId"], selectedId]]);
    map.setFilter("physical-selected-line", ["==", ["get", "groupId"], selectedId]);
    map.setFilter("physical-hover-line", ["==", ["get", "groupId"], hoverId]);
    for (const id of ["mountain-selected-halo", "mountain-selected-line"]) map.setFilter(id, ["==", ["get", "groupId"], selectedId]);
  }, [map, ready, selectedId, hoverId]);

  function select(groupId: string) { setSelectedId(groupId); setDetailCollapsed(false); chooseCallback.current(); }
  useEffect(() => {
    if (!map || !ready || !visible) return;
    function find(event: MapMouseEvent) {
      if (!naturalSurfaceSelectionEnabled(mode)) return undefined;
      const features = map!.queryRenderedFeatures(event.point, { layers: physicalHitLayers.filter(id => !!map!.getLayer(id)) });
      return features.sort((a, b) => kindRank[a.properties.kind as PhysicalKind] - kindRank[b.properties.kind as PhysicalKind])[0];
    }
    const click = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement)?.closest?.(".nature-label,.place-marker,.geography-reference-marker")) return;
      const feature = find(event);
      if (feature) select(feature.properties.groupId);
      else { setSelectedId(""); setHoverId(""); }
    };
    const move = (event: MapMouseEvent) => { const feature = find(event); setHoverId(feature?.properties.groupId ?? ""); map.getCanvas().style.cursor = feature ? "pointer" : ""; };
    const leave = () => { setHoverId(""); map.getCanvas().style.cursor = ""; };
    map.on("click", click); map.on("mousemove", move); map.getCanvas().addEventListener("mouseleave", leave);
    return () => { map.off("click", click); map.off("mousemove", move); map.getCanvas().removeEventListener("mouseleave", leave); map.getCanvas().style.cursor = ""; };
  }, [map, ready, visible, mode]);

  useEffect(() => {
    if (!map || !ready || !visible) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds(); const zoom = map.getZoom(); const rect = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label")].filter(el => el.style.display !== "none").map(el => el.getBoundingClientRect());
      const locatedGroups = groups.map(group => ({ ...group, labelCoordinates: directionLabels.get(group.groupId) ?? group.labelCoordinates }));
      const candidates = locatedGroups.filter(group => bounds.contains(group.labelCoordinates) && (group.groupId === selectedId || zoom >= group.minZoom) && !/^(未命名|未定名)/.test(group.name))
        .sort((a, b) => Number(b.groupId === selectedId) - Number(a.groupId === selectedId) || a.minZoom - b.minZoom).slice(0, 140);
      for (const group of candidates) {
        const point = map.project(group.labelCoordinates); const width = Math.min(200, group.name.length * 12 + 20);
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - 12, bottom: rect.top + point.y + 12 };
        if (group.groupId !== selectedId && occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5 && box.top < other.bottom + 5 && box.bottom > other.top - 5)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.className = `nature-label nature-${group.kind} ${group.groupId === selectedId ? "is-selected" : ""}`;
        element.textContent = `${group.kind === "mountain" || group.kind === "plateau" ? "△ " : ""}${group.name}`;
        element.setAttribute("aria-label", `查看${group.name}${group.kind === "mountain" ? "走向示意" : group.kind === "river" ? "河道" : group.kind === "lake" ? "水面" : "资料"}`);
        element.setAttribute("aria-pressed", String(group.groupId === selectedId));
        element.addEventListener("click", event => { event.stopPropagation(); select(group.groupId); });
        markers.push(new Marker({ element }).setLngLat(group.labelCoordinates).addTo(map));
      }
    };
    map.on("moveend", render); map.on("resize", render); render();
    return () => { map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, visible, groups, selectedId, mode, directionLabels]);

  function focus(group: PhysicalGroup) {
    select(group.groupId);
    if (group.kind === "sea" || group.kind === "plateau") onFocus([group.labelCoordinates]);
    else onFocus([[group.bounds[0], group.bounds[1]], [group.bounds[2], group.bounds[3]]]);
  }
  return <>
    {controlsContainer && createPortal(<section className="nature-explorer" aria-label="查找山川河流">
      <h3><Waves size={14} />查找山川河流</h3>
      {!visible ? <p>切换到“山川河流”或“同时显示”即可查看山川名称与河湖。</p> : <>
        <div className="nature-search"><Search size={13} /><input aria-label="搜索山川河流" value={query} onChange={event => setQuery(event.target.value)} placeholder="黄河、秦岭、青海湖…" /></div>
        <select aria-label="筛选自然地理类型" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="all">全部自然地理</option>{Object.entries(physicalKindNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <div className="nature-search-results">{results.map(group => <button key={group.groupId} onClick={() => focus(group)}><strong>{group.name}</strong><span>{physicalKindNames[group.kind]}</span></button>)}</div>
        {!loaded && !error && <p role="status">山川资料加载中…</p>}{loaded && !results.length && <p>没有匹配结果，试试其他名称。</p>}
      </>}{error && <p role="status">{error}</p>}{directionError && <p role="status">{directionError}</p>}
    </section>, controlsContainer)}
    {visible && selected && <section className={`nature-detail ${detailCollapsed ? "is-collapsed" : ""}`} aria-label="山川河流详情">
      <header><button className="nature-detail-title" aria-expanded={!detailCollapsed} onClick={() => setDetailCollapsed(value => !value)}>{selected.kind === "mountain" || selected.kind === "plateau" ? <Mountain size={16} /> : <Waves size={16} />}<strong>{selected.name}</strong><span>{detailCollapsed ? "展开" : "收起"}</span></button><button aria-label="关闭山川河流详情" onClick={() => setSelectedId("")}><X size={16} /></button></header>
      {!detailCollapsed && <div className="nature-detail-body"><span className="nature-kind">{physicalKindNames[selected.kind]} · 现代自然地理</span>
        {selected.nameStatus === "unresolved" && <p className="nature-detail-note">中文名称待核定，可展开来源原文核查。</p>}
        <details><summary>查看名称来源</summary><p>原文名称 · {selected.originalName}</p>
          {selected.nameCorrectionNote && <p>{selected.nameCorrectionNote}</p>}
          {selected.nameSourceUrl && <a href={selected.nameSourceUrl} target="_blank" rel="noreferrer">名称核查来源 ↗</a>}
        </details>
        {selected.kind === "mountain" ? <>
          <p>{selectedDirection ? "沿高亮线查看这条山系的大致延伸方向。" : "此山系暂仅提供名称定位，可结合山影与立体地形观察。"}</p>
          <p className="nature-detail-note">{selectedDirection?.properties.geometryNote || directionError || "未收录可用的走向线。"} 走向示意不表示实测山脊、山体边界或登山路线。</p>
        </> : selected.kind === "plateau" || selected.kind === "sea" ? <p>此处提供{physicalKindNames[selected.kind]}名称与位置参考，可结合地形观察。没有绘制概括范围色块。</p> : <>
          <p>{selected.geometryNote}</p><p className="nature-detail-note">已高亮本资料收录的{selected.kind === "river" ? "河道线位，线宽不代表真实河宽" : "湖泊水面"}。现代河湖不随朝代复原。</p>
        </>}
        <div className="nature-detail-actions"><button onClick={() => focus(selected)}><LocateFixed size={13} />{selected.kind === "river" || selected.kind === "mountain" ? "查看完整走向" : "定位此处"}</button><a href={selectedDirection?.properties.sourceUrl || selected.sourceUrl} target="_blank" rel="noreferrer">资料来源<ExternalLink size={12} /></a></div>
      </div>}
    </section>}
    {visible && hover && !selected && <div className="nature-hover" aria-hidden="true">{hover.name} · 点击查看{hover.kind === "river" ? "河道" : "湖面"}</div>}
    {visible && error && <div className="nature-load-error" role="status">{error}</div>}
  </>;
}
