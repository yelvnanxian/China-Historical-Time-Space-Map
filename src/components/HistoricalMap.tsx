import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  Layers2,
  LocateFixed,
  Minus,
  Plus,
  X,
} from "lucide-react";
import "../map-layers.css";
import type { HistoricalEvent, Period, Place } from "../../shared/types";
import HistoricalBoundaryLayer from "./HistoricalBoundaryLayer";
import TerrainLayer, { isTerrainError } from "./TerrainLayer";
import PhysicalGeographyLayer from "./PhysicalGeographyLayer";
import "../map-workspace.css";
import type { HistoricalGeographyEntry } from "../../shared/historical-context";

type Props = {
  period: Period;
  places: Place[];
  selectedPlace: Place | undefined;
  selectedEvent: HistoricalEvent | undefined;
  onPlaceSelect: (id: string) => void;
  modernNames: boolean;
  routeVisible: boolean;
  focusRequest: number;
  displayMode: "cities" | "nature" | "both";
  detailsOpen?: boolean;
  onBoundaryStatusChange: (status: string) => void;
  geographySelection: HistoricalGeographyEntry | null;
  onGeographyOpen: () => void;
  onGeographyClear: () => void;
  onNaturalSelect: () => void;
};

const emptyCollection = { type: "FeatureCollection" as const, features: [] };
const initialView = {
  center: [106.5, 34.5] as [number, number],
  zoom: 3.4,
  bearing: 0,
  pitch: 0,
};
maplibregl.setWorkerUrl(workerUrl);

export default function HistoricalMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const displayedPeriod = useRef(props.period.id);
  const firstFocus = useRef(true);
  const fittedPoints = useRef<[number, number][] | null>(null);
  const fittedMaxZoom = useRef(5.2);
  const refitOnResize = useRef<() => void>(() => {});
  const displayedPlaces = useRef(
    props.places.map((place) => place.id).join(","),
  );
  const callback = useRef(props.onPlaceSelect);
  callback.current = props.onPlaceSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [layerPanel, setLayerPanel] = useState(false);
  const [boundaryStatus, setBoundaryStatus] = useState("历史边界加载中…");
  const [toolsContainer, setToolsContainer] = useState<HTMLDivElement | null>(null);
  const [boundariesEnabled, setBoundariesEnabled] = useState(true);
  const motionDuration = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLayerPanel(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    props.onBoundaryStatusChange(boundaryStatus);
  }, [boundaryStatus, props.onBoundaryStatusChange]);
  function fitCoordinates(
    points: [number, number][],
    duration = motionDuration(),
    maxZoom = 5.2,
  ) {
    const instance = map.current;
    if (!instance || !points.length) return;
    fittedPoints.current = points;
    fittedMaxZoom.current = maxZoom;
    const small = instance.getContainer().clientWidth < 600;
    const drawerWidth = props.detailsOpen && !small ? 360 : 0;
    if (points.length === 1) {
      instance.flyTo({
        center: points[0],
        zoom: Math.min(maxZoom, 7),
        offset: [-drawerWidth / 2, small ? 35 : 0],
        padding: 0,
        duration,
      });
      return;
    }
    const bounds = points.reduce(
      (box, point) => box.extend(point),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    instance.fitBounds(bounds, {
      padding: {
        top: small ? 150 : 75,
        bottom: 55,
        left: small ? 35 : 80,
        right: small ? 50 : 80 + drawerWidth,
      },
      maxZoom,
      duration,
    });
  }
  refitOnResize.current = () => {
    if (fittedPoints.current) fitCoordinates(fittedPoints.current, 0, fittedMaxZoom.current);
  };

  function resetView() {
    fitCoordinates(props.places.map((place) => place.coordinates));
  }

  useEffect(() => {
    if (!container.current) return;
    let instance: MapInstance;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        ...initialView,
        minZoom: 2.4,
        maxZoom: 10,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        style: {
          version: 8,
          sources: {
            land: { type: "geojson", data: "/data/land.geojson" },
            rivers: { type: "geojson", data: emptyCollection },
            lakes: { type: "geojson", data: emptyCollection },
            route: { type: "geojson", data: emptyCollection },
            graticule: {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [
                  ...[80, 90, 100, 110, 120, 130, 140].map((lon) => ({
                    type: "Feature" as const,
                    properties: {},
                    geometry: {
                      type: "LineString" as const,
                      coordinates: [
                        [lon, 5],
                        [lon, 60],
                      ],
                    },
                  })),
                  ...[10, 20, 30, 40, 50, 60].map((lat) => ({
                    type: "Feature" as const,
                    properties: {},
                    geometry: {
                      type: "LineString" as const,
                      coordinates: [
                        [65, lat],
                        [150, lat],
                      ],
                    },
                  })),
                ],
              },
            },
          },
          layers: [
            {
              id: "water",
              type: "background",
              paint: { "background-color": "#dce6e3" },
            },
            {
              id: "land-fill",
              type: "fill",
              source: "land",
              paint: { "fill-color": "#eae7db" },
            },
            {
              id: "land-line",
              type: "line",
              source: "land",
              paint: { "line-color": "#bfc9bb", "line-width": 1 },
            },
            {
              id: "graticule",
              type: "line",
              source: "graticule",
              paint: {
                "line-color": "#7a9080",
                "line-opacity": 0.1,
                "line-width": 0.6,
              },
            },
            {
              id: "lakes-fill",
              type: "fill",
              source: "lakes",
              paint: { "fill-color": "#a9cacf", "fill-opacity": 0.85 },
            },
            {
              id: "lakes-outline",
              type: "line",
              source: "lakes",
              paint: { "line-color": "#719da7", "line-width": 0.7 },
            },
            {
              id: "rivers",
              type: "line",
              source: "rivers",
              paint: {
                "line-color": "#719fa8",
                "line-opacity": 0.8,
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  2,
                  0.6,
                  6,
                  2,
                ],
              },
            },
            {
              id: "route-line",
              type: "line",
              source: "route",
              paint: {
                "line-color": "#ad5944",
                "line-width": 3,
                "line-dasharray": [2, 2],
              },
            },
          ],
        },
      });
    } catch {
      setError(
        "当前浏览器无法启用地图图形渲染。请开启硬件加速，或使用新版 Chrome / Edge 浏览。",
      );
      return;
    }
    map.current = instance;
    // Keep automatic framing responsive until the reader moves the map.
    instance.on("movestart", (event) => {
      if (event.originalEvent) fittedPoints.current = null;
    });
    instance.on("load", () => setReady(true));
    instance.on("error", (event) => {
      if (isTerrainError(event) || (event as { sourceId?: string }).sourceId === "physical-interactive") return;
      const message = event.error?.message || "";
      if (/worker/i.test(message))
        setError("地图渲染资源暂时无法加载，请刷新页面重试。");
      else if (/fetch|load|network/i.test(message))
        setError("自然地理底图暂时无法加载，请刷新页面重试。");
      else setError("地图暂时无法绘制，请刷新页面重试。");
    });
    instance.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }),
      "bottom-left",
    );
    const observer = new ResizeObserver(() => {
      instance.resize();
      refitOnResize.current();
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const markers: maplibregl.Marker[] = [];
    const placeLabels: {
      button: HTMLButtonElement;
      label: HTMLSpanElement;
      priority: number;
      minZoom?: number;
      physical?: boolean;
    }[] = [];
    if (props.displayMode !== "nature")
      props.places.forEach((place) => {
        const button = document.createElement("button");
        const isCapital =
          (place.typeByPeriod?.[props.period.id] ?? place.type) === "capital";
        const isSelected = props.selectedPlace?.id === place.id;
        const isRelated = !!props.selectedEvent?.placeIds.includes(place.id);
        button.className = `place-marker ${isCapital ? "capital" : ""} ${isSelected ? "selected" : ""} ${isRelated ? "event-related" : ""}`;
        button.style.zIndex = isSelected ? "2" : isCapital ? "1" : "0";
        const title = place.nameByPeriod?.[props.period.id] || place.name;
        button.title = props.modernNames
          ? `${title} · 今 ${place.modernName}（地区对应）`
          : `查看${title}的历史档案`;
        button.setAttribute(
          "aria-label",
          props.modernNames
            ? `查看${title}的古今对照，今${place.modernName}`
            : `查看${title}的历史档案`,
        );
        const dot = document.createElement("span");
        dot.className = "marker-dot";
        const label = document.createElement("span");
        label.className = "marker-label";
        label.textContent = title;
        if (props.modernNames) {
          label.classList.add("name-comparison");
          const modern = document.createElement("small");
          modern.textContent = `今 · ${place.modernName}`;
          label.append(modern);
        }
        button.append(dot, label);
        placeLabels.push({
          button,
          label,
          priority: isSelected ? 3 : isRelated ? 2 : isCapital ? 1 : 0,
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          callback.current(place.id);
        });
        markers.push(
          new maplibregl.Marker({ element: button, anchor: "left" })
            .setLngLat(place.coordinates)
            .addTo(instance),
        );
      });
    placeLabels.sort((a, b) => b.priority - a.priority);
    let collisionFrame: number | undefined;
    const updateLabelVisibility = () => {
      collisionFrame = undefined;
      // Restore all labels before measuring, then hide collisions in one frame.
      // Collapsed labels leave only their clickable dot, title and accessible name.
      placeLabels.forEach(({ label }) => {
        label.style.display = "";
      });
      const bounds = instance.getContainer().getBoundingClientRect();
      const measured = placeLabels.map((item) => ({
        ...item,
        box: item.label.getBoundingClientRect(),
      }));
      const occupied: DOMRect[] = [];
      const gap = 5;
      measured.forEach(
        ({ button, label, priority, box, minZoom, physical }) => {
          const inView =
            box.right > bounds.left &&
            box.left < bounds.right &&
            box.bottom > bounds.top &&
            box.top < bounds.bottom;
          const collision = occupied.some(
            (other) =>
              box.left < other.right + gap &&
              box.right > other.left - gap &&
              box.top < other.bottom + gap &&
              box.bottom > other.top - gap,
          );
          const visible =
            inView && !collision && instance.getZoom() >= (minZoom ?? 0);
          if (visible) occupied.push(box);
          else label.style.display = "none";
          if (physical) {
            button.style.pointerEvents = visible ? "auto" : "none";
            button.tabIndex = visible ? 0 : -1;
            button.setAttribute("aria-hidden", String(!visible));
          }
          // A nearby dot-only button must not intercept clicks on visible text.
          // Apply the selected priority inline to override the selected CSS rule.
          button.style.setProperty(
            "z-index",
            String(priority === 3 ? 30 : visible ? 20 + priority : 0),
            "important",
          );
        },
      );
    };
    const scheduleCollision = () => {
      if (collisionFrame === undefined)
        collisionFrame = requestAnimationFrame(updateLabelVisibility);
    };
    instance.on("move", scheduleCollision);
    instance.on("resize", scheduleCollision);
    scheduleCollision();
    return () => {
      instance.off("move", scheduleCollision);
      instance.off("resize", scheduleCollision);
      if (collisionFrame !== undefined) cancelAnimationFrame(collisionFrame);
      markers.forEach((marker) => marker.remove());
    };
  }, [
    ready,
    props.places,
    props.selectedPlace,
    props.selectedEvent,
    props.period.id,
    props.modernNames,
    props.displayMode,
  ]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const route = props.displayMode !== "nature" && props.routeVisible ? props.selectedEvent?.route : undefined;
    (map.current.getSource("route") as GeoJSONSource).setData(
      route?.length
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: route },
              },
            ],
          }
        : emptyCollection,
    );
  }, [ready, props.selectedEvent, props.routeVisible, props.displayMode]);

  useEffect(() => {
    const changed = displayedPeriod.current !== props.period.id;
    displayedPeriod.current = props.period.id;
    if (ready && changed) {
      fitCoordinates(props.places.map(place => place.coordinates));
    }
  }, [ready, props.period.id]);

  useEffect(() => {
    if (!ready) return;
    const placeIds = props.places.map((place) => place.id).join(",");
    const changedScope = displayedPlaces.current !== placeIds;
    displayedPlaces.current = placeIds;
    if (changedScope && !firstFocus.current) {
      fitCoordinates(props.places.map((place) => place.coordinates));
      return;
    }
    if (
      firstFocus.current &&
      !props.focusRequest
    ) {
      firstFocus.current = false;
      fitCoordinates(
        props.places.map((place) => place.coordinates),
        0,
      );
      return;
    }
    firstFocus.current = false;
    if (props.selectedEvent) {
      const points = props.selectedEvent.placeIds.flatMap((id) => {
        const place = props.places.find((item) => item.id === id);
        return place ? [place.coordinates] : [];
      });
      fitCoordinates(points);
    } else if (props.focusRequest && props.selectedPlace) {
      fitCoordinates([props.selectedPlace.coordinates]);
    }
  }, [
    ready,
    props.focusRequest,
    props.selectedEvent?.id,
    props.places,
  ]);

  const shownYear = props.period.year;

  const openGeography = useRef(props.onGeographyOpen);
  openGeography.current = props.onGeographyOpen;
  useEffect(() => {
    if (!ready || !map.current || !props.geographySelection || props.displayMode === "cities") return;
    const entry = props.geographySelection;
    const element = document.createElement("button");
    element.className = "geography-reference-marker";
    element.textContent = `◎ ${entry.title} · 参考点`;
    element.setAttribute("aria-label", `查看历史地理：${entry.title}`);
    element.addEventListener("click", event => { event.stopPropagation(); openGeography.current(); });
    const marker = new maplibregl.Marker({ element }).setLngLat(entry.referenceCoordinates).addTo(map.current);
    fitCoordinates([entry.referenceCoordinates], motionDuration(), 6.2);
    return () => { marker.remove(); };
  }, [ready, props.geographySelection, props.displayMode]);

  return (
    <div className={`map-surface ${props.geographySelection ? "has-geography-reference" : ""}`}>
      <div
        ref={container}
        className="map-canvas"
        style={{ isolation: "isolate" }}
        aria-label="可缩放和平移的中国历史地图"
      />
      <div className="map-paper-overlay" />
      <div className="map-toolbar">
        <button
          aria-label="放大地图"
          title="放大"
          onClick={() => {
            fittedPoints.current = null;
            map.current?.zoomIn();
          }}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="缩小地图"
          title="缩小"
          onClick={() => {
            fittedPoints.current = null;
            map.current?.zoomOut();
          }}
        >
          <Minus size={18} />
        </button>
        <span className="toolbar-rule" />
        <button aria-label="复位地图视野" title="复位视野" onClick={resetView}>
          <LocateFixed size={18} />
        </button>
        <button
          aria-label="地图工具"
          title="地图工具"
          aria-expanded={layerPanel}
          className={layerPanel ? "active" : ""}
          onClick={() => setLayerPanel((value) => !value)}
        >
          <Layers2 size={18} />
        </button>
      </div>
      <div className="map-tool-panel" hidden={!layerPanel} aria-label="地图工具" role="region">
        <header><strong>地图工具</strong><button aria-label="收起地图工具" onClick={() => setLayerPanel(false)}><X size={17} /></button></header>
        <div className="map-tool-scroll">
          <p className="map-tool-period">{props.period.label} · {shownYear < 0 ? `前${Math.abs(shownYear)}` : shownYear}年 <small>{boundaryStatus}</small></p>
          <div ref={setToolsContainer} />
          <TerrainLayer map={map.current} ready={ready} compact enabled={props.displayMode !== "cities"} onExplore={() => { fittedPoints.current = null; setLayerPanel(false); }} />
          <div hidden={props.displayMode === "nature"}>
          <label className="boundary-master-toggle"><input type="checkbox" checked={boundariesEnabled} onChange={event => setBoundariesEnabled(event.target.checked)} />显示行政边界与地名</label>
          <HistoricalBoundaryLayer map={map.current} ready={ready} periodId={props.period.id} currentYear={shownYear} onStatusChange={setBoundaryStatus}
            onRegionFocus={points => { fitCoordinates(points, motionDuration(), 8); }} modernNames={props.modernNames}
            enabled={boundariesEnabled && props.displayMode !== "nature"} embedded onSelection={() => setLayerPanel(true)} />
          </div>
          <p className="map-tool-note">城池以点标识；山系显示概括范围，河流显示线位，湖泊显示水面。自然地理采用现代资料。</p>
        </div>
      </div>
      <PhysicalGeographyLayer map={map.current} ready={ready} visible={props.displayMode !== "cities"} mode={props.displayMode}
        controlsContainer={toolsContainer} onFocus={points => fitCoordinates(points, motionDuration(), 7)} onChoose={() => { setLayerPanel(false); props.onNaturalSelect(); }} />
      {props.geographySelection && props.displayMode !== "cities" && <div className="geography-reference-note"><button onClick={props.onGeographyOpen}>{props.geographySelection.dateLabel} · {props.geographySelection.title}<small>历史地理参考点 · 独立于当前朝代与边界年份</small></button><button aria-label="清除历史地理参考点" onClick={props.onGeographyClear}><X size={15} /></button></div>}
      <div className="map-credit">
        自然地理背景为现代简化数据 · Natural Earth
      </div>
      {error && (
        <div className="map-error" role="alert">
          <strong>地图加载提示</strong>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </div>
      )}
    </div>
  );
}
