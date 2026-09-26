import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { ChevronDown, ExternalLink, LocateFixed, Mountain, Search, Waves, X } from "lucide-react";
import type { PhysicalFeatureCollection, PhysicalGroup, PhysicalInteractionIndex, PhysicalKind } from "../../shared/physical-geography";
import { physicalKindNames } from "../../shared/physical-geography";
import { boundarySearchKey } from "../../shared/boundary-search";
import { canInteract, categoryForKind, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import type { MountainDirectionCollection } from "../../shared/mountain-directions";
import { localizePhysicalGroup, type LocalizedPhysicalGroup } from "../../shared/place-name-localization";
import { contextWaterGeometry, type WaterDetailReplacement } from "../../shared/historical-rivers";
import { majorMountainRegionIds, mountainRegionFeatures, mountainRegionHitLayer, mountainRegionLabelMinZoom, mountainRegionShortcuts, mountainRegionSourceId, visibleMountainRegionLabelPoint } from "../../shared/mountain-regions";
import "../mountain-regions.css";

const sourceId = "physical-interactive";
const directionSourceId = "mountain-directions";
const emptyDirections: MountainDirectionCollection = { type: "FeatureCollection", features: [] };
const layerIds = ["physical-lake-fill", "physical-lake-line", "physical-river-line", "physical-river-hit", "physical-selected-fill", "physical-selected-line", "physical-hover-line", "mountain-selected-halo", "mountain-selected-line"];
const regionLayerIds = ["mountain-region-major-fill", "mountain-region-major-pattern", "mountain-region-local-fill", "mountain-region-local-pattern", "mountain-region-selected-fill", "mountain-region-selected-pattern", "mountain-region-soft-edge", "mountain-region-hover", mountainRegionHitLayer];
const regionPatternId = "mountain-region-pattern";
const empty: PhysicalFeatureCollection = { type: "FeatureCollection", features: [] };
const kindRank: Record<PhysicalKind, number> = { river: 0, lake: 1, mountain: 2, plateau: 3, sea: 4 };

export default function PhysicalGeographyLayer({ map, ready, visible, mode, controlsContainer, onFocus, onChoose, resetKey, replaceYellowLower, waterReplacements }: {
  map: MapInstance | null; ready: boolean; visible: boolean; mode: MapInteractionMode;
  resetKey: string; controlsContainer: HTMLElement | null; onFocus: (points: [number, number][]) => void; onChoose: () => void;
  replaceYellowLower: boolean; waterReplacements: WaterDetailReplacement[];
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
  const [regionEntryOpen, setRegionEntryOpen] = useState(mode === "mountains");
  const regionFeatures = useMemo(() => mountainRegionFeatures(data), [data]);
  const regionByGroup = useMemo(() => new Map(regionFeatures.map(feature => [feature.properties.groupId, feature])), [regionFeatures]);
  const displayedWater = useMemo(() => contextWaterGeometry(data, replaceYellowLower, [], waterReplacements), [data, replaceYellowLower, waterReplacements]);
  const retainedYellowCoordinates = useMemo(() => displayedWater.features.filter(feature => feature.properties.groupId === "river-huanghe").flatMap(feature => feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates.flat() : []), [displayedWater]);
  const chooseCallback = useRef(onChoose);
  chooseCallback.current = onChoose;
  const focusCallback = useRef(onFocus); focusCallback.current = onFocus;
  const selectedDirection = directions.features.find(feature => feature.properties.groupId === selectedId);
  const directionLabels = useMemo(() => new Map(directions.features.map(feature => [feature.properties.groupId, feature.properties.labelCoordinates])), [directions]);
  const selected = groups.find(group => group.groupId === selectedId);
  const hover = groups.find(group => group.groupId === hoverId);
  const searchIndex = useMemo(() => groups.map(group => ({ group, key: boundarySearchKey([group.name, group.nameEn, ...group.aliases].join(" ")) })), [groups]);
  const results = useMemo(() => {
    const key = boundarySearchKey(query);
    return searchIndex.filter(item => canInteract(mode, categoryForKind(item.group.kind)) && (kind === "all" || item.group.kind === kind) && (!key || item.key.includes(key)))
      .sort((a, b) => Number(/\p{Script=Han}/u.test(b.group.name)) - Number(/\p{Script=Han}/u.test(a.group.name)) || a.group.minZoom - b.group.minZoom || kindRank[a.group.kind] - kindRank[b.group.kind]).slice(0, 24).map(item => item.group);
  }, [searchIndex, query, kind, mode]);
  useEffect(() => {
    if (selected && !canInteract(mode, categoryForKind(selected.kind))) setSelectedId("");
    if (kind !== "all" && !canInteract(mode, categoryForKind(kind))) setKind("all");
  }, [mode, selected, kind]);

  useEffect(() => { setSelectedId(""); setHoverId(""); }, [resetKey]);
  useEffect(() => { setRegionEntryOpen(mode === "mountains"); }, [mode]);

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
    map.addSource(mountainRegionSourceId, { type: "geojson", data: empty, tolerance: 0 });
    // An atlas-style texture is clipped by the untouched naming polygons.
    // Its transparent background preserves terrain beneath the distribution.
    const tile = document.createElement("canvas"); tile.width = 64; tile.height = 64;
    const context = tile.getContext("2d");
    if (context && !map.hasImage(regionPatternId)) {
      context.strokeStyle = "rgba(83,105,66,.75)"; context.lineWidth = 1;
      for (const [x, y] of [[16, 16], [48, 48]]) {
        context.beginPath(); context.moveTo(x - 5, y + 3); context.lineTo(x, y - 4); context.lineTo(x + 5, y + 3); context.moveTo(x, y - 4); context.lineTo(x + 1, y + 1); context.stroke();
      }
      map.addImage(regionPatternId, context.getImageData(0, 0, tile.width, tile.height));
    }
    const add: MapInstance["addLayer"] = (layer, before) => map.addLayer(layer, before ?? "route-line");
    for (const major of [true, false]) {
      const suffix = major ? "major" : "local";
      const filter = [major ? "in" : "!in", "groupId", ...majorMountainRegionIds] as import("maplibre-gl").FilterSpecification;
      add({ id: `mountain-region-${suffix}-fill`, source: mountainRegionSourceId, type: "fill", minzoom: major ? 2.4 : 4.5, filter,
        paint: { "fill-color": "#809464", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2.4, .10, 5, .14, 8, .09, 11, .065] } }, "lakes-fill");
      if (map.hasImage(regionPatternId)) add({ id: `mountain-region-${suffix}-pattern`, source: mountainRegionSourceId, type: "fill", minzoom: major ? 2.4 : 4.5, filter,
        paint: { "fill-pattern": regionPatternId, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2.4, .22, 5, .34, 8, .23, 11, .15] } }, "lakes-fill");
    }
    add({ id: "mountain-region-selected-fill", source: mountainRegionSourceId, type: "fill", filter: ["==", "groupId", ""], paint: { "fill-color": "#819160", "fill-opacity": .16 } }, "lakes-fill");
    if (map.hasImage(regionPatternId)) add({ id: "mountain-region-selected-pattern", source: mountainRegionSourceId, type: "fill", filter: ["==", "groupId", ""], paint: { "fill-pattern": regionPatternId, "fill-opacity": .68 } }, "lakes-fill");
    add({ id: "mountain-region-soft-edge", source: mountainRegionSourceId, type: "line", filter: ["==", "groupId", ""], layout: { "line-join": "round" }, paint: { "line-color": "#7a8d5f", "line-width": 7, "line-blur": 5, "line-opacity": .46 } }, "lakes-fill");
    add({ id: "mountain-region-hover", source: mountainRegionSourceId, type: "fill", filter: ["==", "groupId", ""], paint: { "fill-color": "#809464", "fill-opacity": .09 } }, "lakes-fill");
    add({ id: mountainRegionHitLayer, source: mountainRegionSourceId, type: "fill", paint: { "fill-opacity": 0 } }, "lakes-fill");
    add({ id: "physical-lake-fill", source: sourceId, type: "fill", filter: ["==", ["get", "kind"], "lake"], paint: { "fill-color": "#83b7c4", "fill-opacity": 0.78 } });
    add({ id: "physical-lake-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "lake"], paint: { "line-color": "#578f9d", "line-width": 1 } });
    add({ id: "physical-river-line", source: sourceId, type: "line", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#468d9f", "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, .85, 11, .5, 14, .35], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 5, 2, 9, 1.5, 14, 1] } });
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
      if (failedSource === mountainRegionSourceId) setError("山系概略分布暂时无法绘制，名称与来源仍可查看。");
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
      if (!map.getStyle()) return;
      for (const id of [...layerIds, ...regionLayerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (map.getSource(directionSourceId)) map.removeSource(directionSourceId);
      if (map.getSource(mountainRegionSourceId)) map.removeSource(mountainRegionSourceId);
      if (map.hasImage(regionPatternId)) map.removeImage(regionPatternId);
    };
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    (map.getSource(sourceId) as GeoJSONSource).setData(displayedWater);
  }, [map, ready, displayedWater]);
  useEffect(() => {
    if (!ready || !map?.getSource(directionSourceId)) return;
    (map.getSource(directionSourceId) as GeoJSONSource).setData(directions);
  }, [map, ready, directions]);
  useEffect(() => {
    if (!ready || !map?.getSource(mountainRegionSourceId)) return;
    (map.getSource(mountainRegionSourceId) as GeoJSONSource).setData({ type: "FeatureCollection", features: regionFeatures });
  }, [map, ready, regionFeatures]);
  useEffect(() => {
    if (!ready || !map?.getLayer(mountainRegionHitLayer)) return;
    const update = () => map.setFilter(mountainRegionHitLayer, map.getZoom() < 4.5 ? ["in", "groupId", ...majorMountainRegionIds] : ["has", "groupId"]);
    map.on("zoomend", update); update();
    return () => { map.off("zoomend", update); };
  }, [map, ready]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    for (const id of layerIds) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    for (const id of regionLayerIds) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible && (id !== mountainRegionHitLayer || mode === "mountains") ? "visible" : "none");
    setHoverId("");
    if (!visible) { setSelectedId(""); setHoverId(""); }
  }, [map, ready, visible, mode]);
  useEffect(() => {
    if (!ready || !map?.getSource(sourceId)) return;
    map.setFilter("physical-selected-fill", ["all", ["!=", ["get", "kind"], "river"], ["==", ["get", "groupId"], selectedId]]);
    map.setFilter("physical-selected-line", ["==", ["get", "groupId"], selectedId]);
    map.setFilter("physical-hover-line", ["==", ["get", "groupId"], hoverId]);
    for (const id of ["mountain-selected-halo", "mountain-selected-line"]) map.setFilter(id, ["==", ["get", "groupId"], selectedId]);
    for (const id of ["mountain-region-selected-fill", "mountain-region-selected-pattern", "mountain-region-soft-edge"]) if (map.getLayer(id)) map.setFilter(id, ["==", "groupId", selectedId]);
    map.setFilter("mountain-region-hover", ["==", "groupId", hoverId !== selectedId ? hoverId : ""]);
  }, [map, ready, selectedId, hoverId]);

  function select(groupId: string) { setSelectedId(groupId); setDetailCollapsed(false); setRegionEntryOpen(false); chooseCallback.current(); }
  useEffect(() => {
    if (!map || !ready || !visible) return;
    function physicalHit(feature: ReturnType<typeof findNaturalMapHit>) {
      return feature && ["physical-river-hit", "physical-lake-fill", "mountain-selected-line", mountainRegionHitLayer].includes(feature.layer.id) ? feature : undefined;
    }
    const click = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement)?.closest?.(".nature-label,.place-marker,.geography-reference-marker")) return;
      const feature = physicalHit(findNaturalMapHit(map, event.point, mode));
      if (feature) {
        event.originalEvent.preventDefault();
        const region = feature.layer.id === mountainRegionHitLayer && groups.find(group => group.groupId === feature.properties.groupId);
        if (region) focus(region); else select(feature.properties.groupId);
      }
    };
    const move = (event: MapMouseEvent) => {
      const hit = findNaturalMapHit(map, event.point, mode);
      setHoverId(physicalHit(hit)?.properties.groupId ?? "");
      // This is the sole canvas cursor listener; detailed layers own their hits too.
      map.getCanvas().style.cursor = hit ? "pointer" : "";
    };
    const leave = () => { setHoverId(""); map.getCanvas().style.cursor = ""; };
    map.on("click", click); map.on("mousemove", move); map.getCanvas().addEventListener("mouseleave", leave);
    return () => { map.off("click", click); map.off("mousemove", move); map.getCanvas().removeEventListener("mouseleave", leave); map.getCanvas().style.cursor = ""; };
  }, [map, ready, visible, mode, groups]);

  useEffect(() => {
    if (!map || !ready || !visible) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const bounds = map.getBounds(); const zoom = map.getZoom(); const rect = map.getContainer().getBoundingClientRect();
      const occupied = [...map.getContainer().querySelectorAll<HTMLElement>(".marker-label")].filter(el => el.style.display !== "none").map(el => el.getBoundingClientRect());
      const insetX = (bounds.getEast() - bounds.getWest()) * .06, insetY = (bounds.getNorth() - bounds.getSouth()) * .08;
      const labelViewport: [number, number, number, number] = [bounds.getWest() + insetX, bounds.getSouth() + insetY, bounds.getEast() - insetX, bounds.getNorth() - insetY];
      const locatedGroups = groups.flatMap(group => {
        let coordinates = replaceYellowLower && group.groupId === "river-huanghe" && retainedYellowCoordinates.length ? retainedYellowCoordinates[Math.floor(retainedYellowCoordinates.length / 2)] as [number, number] : directionLabels.get(group.groupId) ?? group.labelCoordinates;
        if (group.kind === "mountain") {
          const region = regionByGroup.get(group.groupId);
          const inside = region && visibleMountainRegionLabelPoint(region.geometry, labelViewport, coordinates);
          if (!inside) return [];
          coordinates = inside;
        }
        return [{ ...group, name: replaceYellowLower && group.groupId === "river-huanghe" ? "黄河上游（现代参照）" : group.name, labelCoordinates: coordinates,
          displayMinZoom: group.kind === "mountain" ? mountainRegionLabelMinZoom(group.groupId, group.minZoom) : group.minZoom }];
      });
      const candidates = locatedGroups.filter(group => canInteract(mode, categoryForKind(group.kind)) && bounds.contains(group.labelCoordinates) && (group.groupId === selectedId || zoom >= group.displayMinZoom) && !/^(未命名|未定名)/.test(group.name))
        .sort((a, b) => Number(b.groupId === selectedId) - Number(a.groupId === selectedId) || a.displayMinZoom - b.displayMinZoom).slice(0, 140);
      for (const group of candidates) {
        const point = map.project(group.labelCoordinates); const width = Math.min(200, group.name.length * 12 + (group.kind === "mountain" ? 28 : 20));
        const labelHalfHeight = group.kind === "mountain" ? 23 : 12;
        const box = { left: rect.left + point.x - width / 2, right: rect.left + point.x + width / 2, top: rect.top + point.y - labelHalfHeight, bottom: rect.top + point.y + labelHalfHeight };
        if (group.groupId !== selectedId && occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5 && box.top < other.bottom + 5 && box.bottom > other.top - 5)) continue;
        occupied.push(box as DOMRect);
        const element = document.createElement("button");
        element.className = `nature-label nature-${group.kind} ${group.groupId === selectedId ? "is-selected" : ""}`;
        element.textContent = `${group.kind === "plateau" ? "△ " : ""}${group.name}`;
        if (group.kind === "mountain") { const caption = document.createElement("small"); caption.textContent = "概略分布"; element.append(caption); }
        element.setAttribute("aria-label", `查看${group.name}${group.kind === "mountain" ? "完整概略分布" : group.kind === "river" ? "河道" : group.kind === "lake" ? "水面" : "资料"}`);
        element.setAttribute("aria-pressed", String(group.groupId === selectedId));
        element.addEventListener("click", event => { event.stopPropagation(); if (group.kind === "mountain") focus(group); else select(group.groupId); });
        markers.push(new Marker({ element }).setLngLat(group.labelCoordinates).addTo(map));
      }
    };
    map.on("moveend", render); map.on("resize", render); render();
    return () => { map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, visible, groups, selectedId, mode, directionLabels, replaceYellowLower, retainedYellowCoordinates, regionByGroup]);

  function focus(group: PhysicalGroup) {
    select(group.groupId);
    if (group.groupId === "river-huanghe" && replaceYellowLower && retainedYellowCoordinates.length) focusCallback.current(retainedYellowCoordinates as [number, number][]);
    else if (group.kind === "sea" || group.kind === "plateau") focusCallback.current([group.labelCoordinates]);
    else focusCallback.current([[group.bounds[0], group.bounds[1]], [group.bounds[2], group.bounds[3]]]);
  }
  return <>
    {visible && canInteract(mode, "mountains") && <section className={`mountain-region-entry${regionEntryOpen ? " is-open" : ""}`} aria-label="山系概略分布入口">
      <button className="mountain-region-entry-toggle" type="button" aria-expanded={regionEntryOpen} onClick={() => setRegionEntryOpen(value => !value)}><Mountain size={15} /><span>山系概略分布</span><ChevronDown size={14} /></button>
      {regionEntryOpen && <div className="mountain-region-entry-body"><p>{mode === "mountains" ? "点山系名称或淡纹理区域，查看整片分布。" : "点击山系名称查看整片分布。"}</p>
        <div className="mountain-region-shortcuts">{mountainRegionShortcuts.map(item => {
          const group = groups.find(group => group.groupId === item.id);
          return group ? <button type="button" key={item.id} aria-pressed={selectedId === item.id} onClick={() => focus(group)}>{item.label}</button> : null;
        })}</div><small>地图概括范围 · 不是精确山脚界线</small></div>}
    </section>}
    {controlsContainer && createPortal(<section className="nature-explorer" aria-label="查找山川河流">
      <h3><Waves size={14} />查找山川河流</h3>
      {!visible || mode === "cities" ? <p>当前只点选城池。地图河湖与地形仍保留，切换“山川”“河流”或“全部”可查名称与资料。</p> : <>
        <div className="nature-search"><Search size={13} /><input aria-label="搜索山川河流" value={query} onChange={event => setQuery(event.target.value)} placeholder="黄河、秦岭、青海湖…" /></div>
        <select aria-label="筛选自然地理类型" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="all">当前可点自然地理</option>{Object.entries(physicalKindNames).filter(([id]) => canInteract(mode, categoryForKind(id))).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <div className="nature-search-results">{results.map(group => <button key={group.groupId} onClick={() => focus(group)}><strong>{group.name}</strong><span>{physicalKindNames[group.kind]}</span></button>)}</div>
        {!loaded && !error && <p role="status">山川资料加载中…</p>}{loaded && !results.length && <p>没有匹配结果，试试其他名称。</p>}
      </>}{error && <p role="status">{error}</p>}{directionError && <p role="status">{directionError}</p>}
    </section>, controlsContainer)}
    {visible && selected && <section className={`nature-detail ${detailCollapsed ? "is-collapsed" : ""}`} aria-label="山川河流详情">
      <header><button className="nature-detail-title" aria-expanded={!detailCollapsed} onClick={() => setDetailCollapsed(value => !value)}>{selected.kind === "mountain" || selected.kind === "plateau" ? <Mountain size={16} /> : <Waves size={16} />}<strong>{selected.name}</strong><span>{detailCollapsed ? "展开" : "收起"}</span></button><button aria-label="关闭山川河流详情" onClick={() => setSelectedId("")}><X size={16} /></button></header>
      {!detailCollapsed && <div className="nature-detail-body"><span className="nature-kind">{selected.kind === "mountain" ? "山地概略分布" : physicalKindNames[selected.kind]} · 现代自然地理</span>
        {selected.nameStatus === "unresolved" && <p className="nature-detail-note">中文名称待核定，可展开来源原文核查。</p>}
        <details><summary>查看名称来源</summary><p>原文名称 · {selected.originalName}</p>
          {selected.nameCorrectionNote && <p>{selected.nameCorrectionNote}</p>}
          {selected.nameSourceUrl && <a href={selected.nameSourceUrl} target="_blank" rel="noreferrer">名称核查来源 ↗</a>}
        </details>
        {selected.kind === "mountain" ? <>
          <p>加深的山地图案表示这片山地在来源地图中的概略分布，可结合下方地形观察。{selectedDirection ? "棕色高亮线辅助显示大致延伸方向。" : "此来源未提供可用的走向示意线。"}</p>
          <p className="nature-detail-note">{selected.geometryNote}图案内并非处处是山，柔和轮廓不是精确山脚界线；走向示意也不表示实测山脊或登山路线。</p>
          {selectedDirection && <details><summary>查看走向示意依据</summary><p>{selectedDirection.properties.geometryNote}</p></details>}
        </> : selected.kind === "plateau" || selected.kind === "sea" ? <p>此处提供{physicalKindNames[selected.kind]}名称与位置参考，可结合地形观察。没有绘制概括范围色块。</p> : <>
          <p>{selected.geometryNote}</p><p className="nature-detail-note">已高亮本资料收录的{selected.kind === "river" ? "河道线位，线宽不代表真实河宽" : "湖泊水面"}。{selected.groupId === "river-huanghe" && replaceYellowLower ? "这里仅高亮现代上游参照，下游请点“黄河历史河道”标签核查。" : "现代参照不表示唐代河湖状态。"}{waterReplacements.length > 0 && "仅已匹配到同名详细地物的河段会替换概览线；淡线仍为概览参照。"}</p>
        </>}
        <div className="nature-detail-actions"><button onClick={() => focus(selected)}><LocateFixed size={13} />{selected.kind === "mountain" ? "查看整片山系" : selected.kind === "river" ? "查看完整走向" : "定位此处"}</button><a href={selectedDirection?.properties.sourceUrl || selected.sourceUrl} target="_blank" rel="noreferrer">资料来源<ExternalLink size={12} /></a></div>
      </div>}
    </section>}
    {visible && hover && !selected && <div className="nature-hover" aria-hidden="true">{hover.name} · 点击查看{hover.kind === "mountain" ? "整片概略分布" : hover.kind === "river" ? "河道" : "湖面"}</div>}
    {visible && error && <div className="nature-load-error" role="status">{error}</div>}
  </>;
}
