import { useEffect, useId, useRef, useState } from "react";
import type { Map as MapInstance, MapSourceDataEvent } from "maplibre-gl";
import { ChevronDown, ExternalLink, Info, Layers2, LoaderCircle, Mountain, RotateCcw } from "lucide-react";
import { isTerrainError, TERRAIN_SOURCE_ID } from "../../shared/terrain";
import "../terrain.css";

export { isTerrainError, TERRAIN_SOURCE_ID } from "../../shared/terrain";
const HILLSHADE_SOURCE_ID = "modern-terrain-shading";
const HILLSHADE_LAYER_ID = "modern-terrain-hillshade";
const COVERAGE = [55, -5, 155, 65] as [number, number, number, number];

export default function TerrainLayer({ map, ready, onExplore, compact = false, enabled = true }: { map: MapInstance | null; ready: boolean; onExplore?: () => void; compact?: boolean; enabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const [threeDimensional, setThreeDimensional] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState(false);
  const [outsideCoverage, setOutsideCoverage] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const previousMode = useRef(false);

  useEffect(() => {
    if (!map || !ready) return;
    const ownedSources: string[] = [];
    let ownsLayer = false;
    let disposed = false;
    setLoaded(false);
    setFailure(false);
    function fail() {
      if (disposed) return;
      setFailure(true);
      setThreeDimensional(false);
    }
    function onError(event: unknown) {
      if (isTerrainError(event)) fail();
    }
    function onSourceData(event: MapSourceDataEvent) {
      if (event.sourceId.startsWith("modern-terrain-") && event.sourceDataType === "content") setLoaded(true);
    }
    function checkCoverage() {
      if (!map) return;
      const center = map.getCenter();
      const longitude = ((center.lng + 180) % 360 + 360) % 360 - 180;
      setOutsideCoverage(longitude < COVERAGE[0] || longitude > COVERAGE[2] || center.lat < COVERAGE[1] || center.lat > COVERAGE[3]);
    }
    map.on("error", onError);
    map.on("sourcedata", onSourceData);
    map.on("moveend", checkCoverage);
    checkCoverage();
    try {
      // Independent sources let MapLibre select appropriate terrain/shading tile levels.
      for (const id of [TERRAIN_SOURCE_ID, HILLSHADE_SOURCE_ID]) if (!map.getSource(id)) {
        map.addSource(id, {
          type: "raster-dem",
          tiles: [`${window.location.origin}/data/terrain/{z}/{x}/{y}.png`],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 6,
          bounds: COVERAGE,
          encoding: "terrarium",
          attribution: 'Modern terrain: Mapzen / Tilezen, USGS, NOAA. <a href="/data/terrain/attribution.md" target="_blank">All data providers</a>',
        });
        ownedSources.push(id);
      }
      if (!map.getLayer(HILLSHADE_LAYER_ID)) {
        map.addLayer({
          id: HILLSHADE_LAYER_ID,
          type: "hillshade",
          source: HILLSHADE_SOURCE_ID,
          paint: {
            "hillshade-illumination-direction": 315,
            "hillshade-illumination-anchor": "map",
            "hillshade-exaggeration": 0.72,
            "hillshade-shadow-color": "#5d6950",
            "hillshade-highlight-color": "#fff9e9",
            "hillshade-accent-color": "#7b8060",
          },
        }, map.getLayer("graticule") ? "graticule" : undefined);
        ownsLayer = true;
      }
      setInitialized(true);
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      map.off("error", onError);
      map.off("sourcedata", onSourceData);
      map.off("moveend", checkCoverage);
      setInitialized(false);
      previousMode.current = false;
      // The parent may remove its Map before child effect cleanup runs.
      try {
        if (!map.getStyle()) return;
        if (map.getTerrain()?.source === TERRAIN_SOURCE_ID) {
          map.setTerrain(null);
          map.setPitch(0);
        }
        if (ownsLayer && map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
        for (const id of ownedSources) if (map.getSource(id)) map.removeSource(id);
      } catch {
        // A removed map has no remaining terrain resources to release.
      }
    };
  }, [map, ready, attempt]);

  useEffect(() => {
    if (!map || !ready || !initialized || !map.getSource(TERRAIN_SOURCE_ID)) return;
    const terrainEnabled = enabled && threeDimensional && !failure;
    try {
      if (map.getLayer(HILLSHADE_LAYER_ID))
        map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", enabled && shadows && !failure ? "visible" : "none");
      if (terrainEnabled) map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.5 });
      else if (map.getTerrain()?.source === TERRAIN_SOURCE_ID) map.setTerrain(null);
      if (previousMode.current !== terrainEnabled) {
        map.easeTo({ pitch: terrainEnabled ? 55 : 0, ...(terrainEnabled ? {} : { bearing: 0 }), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
        previousMode.current = terrainEnabled;
      }
    } catch {
      setFailure(true);
      setThreeDimensional(false);
    }
  }, [map, ready, initialized, threeDimensional, shadows, failure, enabled]);

  function exploreMountains() {
    if (!map || failure || !ready || !enabled) return;
    setThreeDimensional(true);
    onExplore?.();
    // An explicit scenic shortcut gives coarse continental terrain a useful viewing scale.
    map.flyTo({
      center: [100.8, 29.5],
      zoom: 6.4,
      pitch: 55,
      bearing: -12,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1100,
    });
  }

  return (
    <section className={`terrain-controls ${compact ? "is-compact" : expanded ? "is-expanded" : "is-collapsed"} ${threeDimensional ? "is-3d" : ""}`} aria-label="现代地形显示" hidden={!enabled}>
      {!compact && (
        <button type="button" className="terrain-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((value) => !value)} title={failure ? "地形不可用，展开查看" : "山川地形设置"}>
          <Mountain size={14} aria-hidden="true" />
          <span>山川地形</span>
          {failure && <i className="terrain-failure-dot" aria-label="地形加载失败" />}
          <ChevronDown size={12} className="terrain-toggle-chevron" aria-hidden="true" />
        </button>
      )}
      <div id={bodyId} className="terrain-body" hidden={!compact && !expanded}>
      {compact && <div className="terrain-heading"><Mountain size={13} aria-hidden="true" /><strong>山川地形</strong></div>}
      <div className="terrain-mode" role="group" aria-label="地形视角">
        <button type="button" aria-pressed={!threeDimensional} onClick={() => setThreeDimensional(false)}><Layers2 size={12} />平面</button>
        <button type="button" aria-pressed={threeDimensional} disabled={!ready || !initialized || failure} onClick={() => setThreeDimensional(true)}><Mountain size={12} />立体</button>
      </div>
      <div className="terrain-options">
        <label><input type="checkbox" checked={shadows} disabled={failure} onChange={(event) => setShadows(event.target.checked)} />山影</label>
        <span>现代高程参考</span>
      </div>
      {threeDimensional && !failure && <button type="button" className="terrain-explore" onClick={exploreMountains}>近览横断山脉<Mountain size={11} /></button>}
      {failure ? (
        <p className="terrain-status is-error" role="status">地形加载失败，已降级平面<button type="button" onClick={() => setAttempt((value) => value + 1)} aria-label="重新加载地形" title="重试"><RotateCcw size={12} /></button></p>
      ) : outsideCoverage ? (
        <p className="terrain-status">当前视野超出地形覆盖范围</p>
      ) : !loaded && shadows ? (
        <p className="terrain-status"><LoaderCircle size={11} className="terrain-loading" />加载地形…</p>
      ) : null}
      <details className="terrain-info">
        <summary><Info size={11} aria-hidden="true" /><span>地形数据来源</span><ChevronDown size={11} aria-hidden="true" /></summary>
        <div className="terrain-source-note">
          <strong>真实现代高程</strong>
          <p>Mapzen / Tilezen 高程，源自 USGS、NOAA 等公开资料。覆盖中国及周边；山影由真实高差计算，立体高度夸张 1.5 倍。</p>
          <p>仅作现代自然地形参考，不代表历史河道、海岸或地貌。当前资料适合区域观察，放大不会增加原始精度。</p>
          <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">数据来源<ExternalLink size={11} /></a>
          <a href="/data/terrain/attribution.md" target="_blank" rel="noreferrer">完整来源署名<ExternalLink size={11} /></a>
        </div>
      </details>
      </div>
    </section>
  );
}
