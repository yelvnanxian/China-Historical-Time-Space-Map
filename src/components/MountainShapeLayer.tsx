import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import { Mountain, Search, X } from "lucide-react";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { findNaturalMapHit } from "../../shared/map-hit-test";
import { boundarySearchKey } from "../../shared/boundary-search";
import type { MountainShapeArea, MountainShapesManifest } from "../../shared/mountain-shapes";
import "../mountain-shapes.css";

type Contours = FeatureCollection<LineString, { id: string; areaId: string; elevation: number; index: boolean }>;
const empty: Contours = { type: "FeatureCollection", features: [] };
const regionNames: Record<string, string> = { qinling: "秦岭", taihang: "太行", qilian: "祁连", tianshan: "天山", "west-sichuan": "川西" };
const lineLayers = ["mountain-shape-contours", "mountain-shape-contour-hit", "mountain-shape-selected"];
const overlap = (a: number[], b: number[]) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
async function loadContours(url: string, signal: AbortSignal): Promise<Contours> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error("等高线未能加载");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b
    ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
    : JSON.parse(new TextDecoder().decode(bytes));
}

export default function MountainShapeLayer({ map, ready, enabled, mode, controlsContainer, resetKey, onChoose, onFocus }: {
  map: MapInstance | null; ready: boolean; enabled: boolean; mode: MapInteractionMode;
  controlsContainer: HTMLElement | null; resetKey: string; onChoose: () => void;
  onFocus: (points: [number, number][], maxZoom?: number) => void;
}) {
  const [manifest, setManifest] = useState<MountainShapesManifest>();
  const [packs, setPacks] = useState<Record<string, Contours>>({});
  const [tick, setTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ areaId: string; contourId?: string; elevation?: number }>();
  const [collapsed, setCollapsed] = useState(false);
  const choose = useRef(onChoose); choose.current = onChoose;
  const interactive = canInteract(mode, "mountains");
  const shadeIds = useRef(new Set<string>());
  const failedShadeIds = useRef(new Set<string>());
  useEffect(() => { setSelection(undefined); }, [resetKey, enabled]);
  useEffect(() => { if (!interactive) setSelection(undefined); }, [interactive]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setError("");
    fetch("/data/mountain-shapes/manifest.json", { signal: abort.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(setManifest).catch(e => { if (e.name !== "AbortError") setError("山地近览资料未能加载，请重试。"); });
    return () => abort.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!map || !ready) return;
    const update = () => setTick(value => value + 1);
    map.on("moveend", update); map.on("resize", update); update();
    return () => { map.off("moveend", update); map.off("resize", update); };
  }, [map, ready]);
  const zoom = map && ready ? map.getZoom() : 0;
  const needed = useMemo(() => {
    if (!map || !ready || !enabled || !manifest) return [];
    const b = map.getBounds();
    return manifest.areas.filter(area => zoom >= area.minZoom && overlap(area.bounds, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]));
  }, [map, ready, enabled, manifest, tick, zoom]);
  const neededKey = needed.map(area => area.id).join(",");
  useEffect(() => {
    const pending = needed.filter(area => !packs[area.id]);
    if (!pending.length) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    let index = 0;
    async function worker() {
      while (index < pending.length && !abort.signal.aborted) {
        const area = pending[index++];
        const data = await loadContours(area.contoursUrl, abort.signal);
        if (data.type !== "FeatureCollection" || data.features.length !== area.featureCount) throw Error();
        if (!abort.signal.aborted) setPacks(previous => ({ ...previous, [area.id]: data }));
      }
    }
    Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker))
      .then(() => { if (!abort.signal.aborted) setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError("部分地形细节未能加载，已保留原山影。可重试。"); setLoading(false); } });
    return () => abort.abort();
  }, [neededKey, attempt]);
  const features = useMemo(() => needed.flatMap(area => packs[area.id]?.features ?? []).filter(feature => zoom >= 10.5 || feature.properties.index || feature.properties.id === selection?.contourId), [needed, packs, zoom, selection?.contourId]);
  const selectedArea = manifest?.areas.find(area => area.id === selection?.areaId);
  const areas = useMemo(() => {
    const key = boundarySearchKey(query);
    return manifest?.areas.filter(area => !key || boundarySearchKey(`${area.name} ${area.sourcePeak.name} ${regionNames[area.regionId] ?? ""} ${Object.values(area.sourcePeak.tags).join(" ")}`).includes(key)) ?? [];
  }, [manifest, query]);

  useEffect(() => {
    if (!map || !ready) return;
    map.addSource("mountain-shapes", { type: "geojson", data: empty, tolerance: 0 });
    const before = map.getLayer("mountain-detail-lines") ? "mountain-detail-lines" : "route-line";
    map.addLayer({ id: lineLayers[0], type: "line", source: "mountain-shapes", layout: { "line-join": "round" }, paint: {
      "line-color": "#a18b64", "line-width": ["case", ["get", "index"], 1.05, .5],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, .25, 10, .65, 13, .75],
    } }, before);
    map.addLayer({ id: lineLayers[1], type: "line", source: "mountain-shapes", paint: { "line-width": 6, "line-opacity": 0 } }, before);
    map.addLayer({ id: lineLayers[2], type: "line", source: "mountain-shapes", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#b16c3c", "line-width": 2.5 } }, before);
    const onError = (event: unknown) => {
      const sourceId = (event as { sourceId?: string })?.sourceId;
      if (sourceId?.startsWith("mountain-shape-image-")) {
        failedShadeIds.current.add(sourceId.slice("mountain-shape-image-".length));
        setError("局部地形影像未能加载，等高线与原山影仍可参考。");
      } else if (sourceId === "mountain-shapes") setError("等高线暂时未能绘制，可重试加载。");
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
      if (!map.getStyle()) return;
      for (const id of [...lineLayers, ...[...shadeIds.current].map(id => `mountain-shape-shade-${id}`)]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("mountain-shapes")) map.removeSource("mountain-shapes");
      for (const id of shadeIds.current) if (map.getSource(`mountain-shape-image-${id}`)) map.removeSource(`mountain-shape-image-${id}`);
      shadeIds.current.clear(); failedShadeIds.current.clear();
    };
  }, [map, ready]);
  useEffect(() => {
    if (!map || !ready || !map.getSource("mountain-shapes")) return;
    (map.getSource("mountain-shapes") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    map.setFilter(lineLayers[2], ["==", ["get", "id"], interactive ? selection?.contourId ?? "" : ""]);
    map.setLayoutProperty(lineLayers[1], "visibility", enabled && interactive ? "visible" : "none");
    const active = new Set(needed.map(area => area.id));
    for (const id of [...shadeIds.current]) if (!active.has(id)) {
      if (map.getLayer(`mountain-shape-shade-${id}`)) map.removeLayer(`mountain-shape-shade-${id}`);
      if (map.getSource(`mountain-shape-image-${id}`)) map.removeSource(`mountain-shape-image-${id}`);
      shadeIds.current.delete(id);
    }
    for (const area of needed) if (!shadeIds.current.has(area.id)) {
      map.addSource(`mountain-shape-image-${area.id}`, { type: "image", url: area.shadeUrl, coordinates: area.imageCoordinates });
      map.addLayer({ id: `mountain-shape-shade-${area.id}`, type: "raster", source: `mountain-shape-image-${area.id}`, paint: { "raster-opacity": .9, "raster-fade-duration": 200 } }, map.getLayer("graticule") ? "graticule" : lineLayers[0]);
      shadeIds.current.add(area.id);
    }
  }, [map, ready, enabled, interactive, needed, features, selection, attempt]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    const click = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement)?.closest?.("button")) return;
      const hit = findNaturalMapHit(map, event.point, mode);
      if (hit?.layer.id !== lineLayers[1]) return;
      choose.current(); setCollapsed(false);
      setSelection({ areaId: hit.properties.areaId, contourId: hit.properties.id, elevation: Number(hit.properties.elevation) });
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready, enabled, interactive, mode]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive) return;
    let markers: Marker[] = [];
    const render = () => {
      markers.forEach(marker => marker.remove()); markers = [];
      const b = map.getBounds(), container = map.getContainer(), rect = container.getBoundingClientRect();
      const occupied = [...container.querySelectorAll<HTMLElement>(".nature-label,.tang-detail-label,.marker-label,.boundary-region-label")].filter(el => el.offsetWidth).map(el => el.getBoundingClientRect());
      for (const feature of features.filter(feature => feature.properties.index)) {
        if (markers.length >= 24) break;
        const point = feature.geometry.coordinates[Math.floor(feature.geometry.coordinates.length / 2)] as [number, number];
        if (!b.contains(point)) continue;
        const pixel = map.project(point), box = { left: rect.left + pixel.x - 25, right: rect.left + pixel.x + 25, top: rect.top + pixel.y - 10, bottom: rect.top + pixel.y + 10 };
        if (occupied.some(other => box.left < other.right + 28 && box.right > other.left - 28 && box.top < other.bottom + 16 && box.bottom > other.top - 16)) continue;
        const el = document.createElement("button"); el.className = "mountain-contour-label";
        el.textContent = `${feature.properties.elevation}米`;
        el.setAttribute("aria-label", `查看${feature.properties.elevation}米现代等高线`);
        el.addEventListener("click", event => { event.stopPropagation(); choose.current(); setCollapsed(false); setSelection({ areaId: feature.properties.areaId, contourId: feature.properties.id, elevation: feature.properties.elevation }); });
        occupied.push(box as DOMRect); markers.push(new Marker({ element: el }).setLngLat(point).addTo(map));
      }
    };
    const frame = requestAnimationFrame(render);
    map.on("moveend", render); map.on("resize", render);
    return () => { cancelAnimationFrame(frame); map.off("moveend", render); map.off("resize", render); markers.forEach(marker => marker.remove()); };
  }, [map, ready, enabled, interactive, features]);
  useEffect(() => {
    if (!map || !ready || !enabled || !interactive || !selectedArea) return;
    const element = document.createElement("button");
    element.className = "nature-label mountain-shape-peak-label";
    element.textContent = `△ ${selectedArea.sourcePeak.name}`;
    element.setAttribute("aria-label", `查看${selectedArea.sourcePeak.name}周边地势详情`);
    element.addEventListener("click", event => { event.stopPropagation(); setCollapsed(false); });
    const marker = new Marker({ element, anchor: "bottom" }).setLngLat(selectedArea.sourcePeak.coordinates).addTo(map);
    return () => { marker.remove(); };
  }, [map, ready, enabled, interactive, selectedArea]);
  function retry() {
    if (map && ready && map.getStyle()) for (const id of failedShadeIds.current) {
      if (map.getLayer(`mountain-shape-shade-${id}`)) map.removeLayer(`mountain-shape-shade-${id}`);
      if (map.getSource(`mountain-shape-image-${id}`)) map.removeSource(`mountain-shape-image-${id}`);
      shadeIds.current.delete(id);
    }
    failedShadeIds.current.clear(); setAttempt(value => value + 1);
  }
  function inspect(area: MountainShapeArea) {
    choose.current(); setCollapsed(false); setSelection({ areaId: area.id });
    onFocus([area.center], 11);
  }
  return <>
    {enabled && interactive && controlsContainer && createPortal(<section className="nature-explorer mountain-shape-explorer" aria-label="山地形态近览">
      <h3><Mountain size={14} />山地近览 · 看山形</h3>
      <p>放大后看等高线、山谷和坡面细节。线越密，地势越陡；线上的数字是现代海拔，棕色山脊线另有来源。</p>
      <div className="nature-search"><Search size={13} /><input aria-label="搜索山地近览" placeholder="拔仙台、华山、天山…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="mountain-shape-shortcuts">{areas.map(area => <button key={area.id} onClick={() => inspect(area)}>{area.name}</button>)}</div>
      {query && !areas.length && <p>此山尚未收录精细高程近览，可使用已有山脊与峰点资料。</p>}
      <p className="nature-detail-note">近览只覆盖上列采集地点周边，等高线不是山脉边界，现代高程不代表所选朝代的地貌复原。</p>
      {loading && <p role="status">正在加载等高线…</p>}{error && <p role="status">{error}<button onClick={retry}>重试</button></p>}
    </section>, controlsContainer)}
    {enabled && interactive && selectedArea && <section className="nature-detail mountain-shape-card" aria-label="山地形态详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Mountain size={15} /><strong>{selectedArea.name}周边</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭山地形态详情" onClick={() => setSelection(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body">
        <span className="nature-kind">{selection?.elevation !== undefined ? `${selection.elevation}米等高线` : "山坡与谷地近览"} · 现代地形</span>
        <p>每条细线连接相同高程的位置，相邻等高线相差{selectedArea.contourInterval}米；粗线间隔{selectedArea.indexInterval}米。阴影随坡向和坡度变化，帮助观察山体起伏。</p>
        <p className="nature-detail-note">资料为峰顶附近的高程取样范围，不表示这座山的边界。棕色山脊线来自OSM独立记录，不把等高线当作山脊。</p>
        <div className="nature-detail-actions"><button onClick={() => inspect(selectedArea)}>近览山形</button><a href={selectedArea.sourcePeak.sourceUrl} target="_blank" rel="noreferrer">峰点来源 ↗</a></div>
        <details><summary>高程与绘制来源</summary><p>Mapzen / Tilezen 真实现代高程，取样瓦片级别{selectedArea.demZoom}；由原始DEM计算等高线和山影。地面像素约{selectedArea.pixelSizeMeters.toFixed(0)}米，放大不会提高原始分辨率。</p><p>{selectedArea.note.replaceAll("唐代", "所选朝代")}</p><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">高程来源 ↗</a></details>
      </div>}
    </section>}
  </>;
}
