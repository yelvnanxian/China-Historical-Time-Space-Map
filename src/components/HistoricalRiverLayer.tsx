import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type GeoJSONSource, type Map as MapInstance, type MapMouseEvent } from "maplibre-gl";
import { Waves, X } from "lucide-react";
import { riverEpochAtYear, type RiverCollection, type RiverManifest } from "../../shared/historical-rivers";

const empty: RiverCollection = { type: "FeatureCollection", features: [] };
const layers = ["historical-river-halo", "historical-river-line", "historical-river-hit", "historical-river-comparison"];

export default function HistoricalRiverLayer({ map, ready, visible, mode, year, periodLabel, controlsContainer, resetKey, referenceYear, referenceRequest, onCoverageChange, onChoose, onFocus }: {
  map: MapInstance | null; ready: boolean; visible: boolean; mode: "cities" | "nature" | "both"; year: number; periodLabel: string;
  controlsContainer: HTMLElement | null; resetKey: string; referenceYear?: number; referenceRequest?: object;
  onCoverageChange: (replace: boolean) => void; onChoose: () => void; onFocus: (points: [number, number][]) => void;
}) {
  const [manifest, setManifest] = useState<RiverManifest>();
  const [data, setData] = useState<Record<string, RiverCollection>>({});
  const [selection, setSelection] = useState("period");
  const [comparison, setComparison] = useState("");
  const [detail, setDetail] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const choose = useRef(onChoose); choose.current = onChoose;
  const epoch = selection === "period" ? riverEpochAtYear(manifest?.epochs ?? [], year)
    : selection === "reference" ? riverEpochAtYear(manifest?.epochs ?? [], referenceYear ?? NaN)
    : manifest?.epochs.find(item => item.id === selection);
  const selectedData = epoch ? data[epoch.id] : undefined;
  const compareEpoch = manifest?.epochs.find(item => item.id === comparison && item.id !== epoch?.id);
  const comparisonData = compareEpoch ? data[compareEpoch.id] : undefined;
  const replacing = !!selectedData && visible;
  const status = epoch && selectedData ? `黄河 · ${epoch.label}` : selection === "modern" ? "黄河 · 现代参照" : "本年黄河复原未收录 · 现代参照";
  useEffect(() => { setDetail(false); }, [resetKey]);
  useEffect(() => { setSelection("period"); setComparison(""); }, [year]);
  useEffect(() => {
    if (referenceYear !== undefined) { setSelection("reference"); setDetail(true); setCollapsed(false); choose.current(); }
    else setSelection(value => value === "reference" ? "period" : value);
  }, [referenceYear, referenceRequest]);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/data/historical-rivers/manifest.json", { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(setManifest).catch(e => { if (e.name !== "AbortError") setError("历史河道资料未能加载，当前显示现代参照。"); });
    return () => abort.abort();
  }, []);
  const needed = useMemo(() => [epoch?.id, compareEpoch?.id].filter(Boolean).join(","), [epoch?.id, compareEpoch?.id]);
  useEffect(() => {
    if (!manifest) return;
    const abort = new AbortController();
    setError("");
    Promise.allSettled(needed.split(",").filter(id => id && !data[id]).map(async id => {
      const item = manifest.epochs.find(value => value.id === id)!;
      const response = await fetch(item.url, { signal: abort.signal });
      if (!response.ok) throw Error();
      const collection = await response.json() as RiverCollection;
      if (collection.type !== "FeatureCollection" || collection.features.length !== item.featureCount) throw Error();
      if (!abort.signal.aborted) setData(previous => ({ ...previous, [id]: collection }));
    })).then(results => {
      if (!abort.signal.aborted && results.some(result => result.status === "rejected")) setError("部分历史河道未能加载，请切换年代重试；成功加载的河道仍会显示。");
    });
    return () => abort.abort();
  }, [manifest, needed]);
  useEffect(() => { onCoverageChange(replacing); }, [replacing, onCoverageChange]);

  useEffect(() => {
    if (!ready || !map) return;
    map.addSource("historical-river", { type: "geojson", data: empty, tolerance: 0 });
    map.addSource("historical-river-compare", { type: "geojson", data: empty, tolerance: 0 });
    map.addLayer({ id: layers[0], type: "line", source: "historical-river", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fdf4ce", "line-width": 7, "line-opacity": .9 } }, "route-line");
    map.addLayer({ id: layers[1], type: "line", source: "historical-river", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#206a83", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.4, 9, 4] } }, "route-line");
    map.addLayer({ id: layers[2], type: "line", source: "historical-river", paint: { "line-width": 16, "line-opacity": 0 } }, "route-line");
    map.addLayer({ id: layers[3], type: "line", source: "historical-river-compare", layout: { "line-join": "round" }, paint: { "line-color": "#b56b4c", "line-width": 3, "line-dasharray": [3, 2] } }, "route-line");
    return () => {
      if (!map.getStyle()) return;
      layers.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      ["historical-river", "historical-river-compare"].forEach(id => { if (map.getSource(id)) map.removeSource(id); });
    };
  }, [ready, map]);
  useEffect(() => {
    if (!ready || !map?.getSource("historical-river")) return;
    (map.getSource("historical-river") as GeoJSONSource).setData(visible ? selectedData ?? empty : empty);
    (map.getSource("historical-river-compare") as GeoJSONSource).setData(visible ? comparisonData ?? empty : empty);
  }, [map, ready, visible, selectedData, comparisonData]);
  function openDetail() { setDetail(true); setCollapsed(false); choose.current(); }
  useEffect(() => {
    if (!map || !ready || !visible || !epoch || !selectedData) return;
    const element = document.createElement("button");
    element.className = "historical-river-label nature-label";
    element.textContent = `黄河 · ${epoch.label}`;
    element.setAttribute("aria-label", `查看黄河历史河道 ${epoch.label}`);
    element.addEventListener("click", e => { e.stopPropagation(); openDetail(); });
    const marker = new Marker({ element }).setLngLat(epoch.labelCoordinates).addTo(map);
    const click = (event: MapMouseEvent) => { if (mode === "nature" && map.queryRenderedFeatures(event.point, { layers: ["historical-river-hit"] }).length) openDetail(); };
    map.on("click", click);
    return () => { marker.remove(); map.off("click", click); };
  }, [map, ready, visible, mode, epoch, selectedData]);
  return <>
    {controlsContainer && createPortal(<section className="nature-explorer river-history-controls" aria-label="历史河道切换">
      <h3><Waves size={14} />黄河改道</h3>
      <label>地图河道<select aria-label="黄河河道年代" value={selection} onChange={event => { setSelection(event.target.value); setDetail(false); }}>
        <option value="period">随朝代 · {periodLabel} {year}年</option>
        {referenceYear !== undefined && <option value="reference">历史地理事件 · {referenceYear}年</option>}
        {manifest?.epochs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        <option value="modern">只看现代河道参照</option>
      </select></label>
      <label>叠加对比<select aria-label="对比另一时期黄河" value={comparison} onChange={event => setComparison(event.target.value)}><option value="">不叠加</option>{manifest?.epochs.filter(item => item.id !== epoch?.id).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p><i className="river-key" />蓝色实线：{status}{compareEpoch && <><br /><i className="river-key compare" />棕色虚线：{compareEpoch.label}（对比）</>}</p>
      {epoch && <button className="detail-focus-button" onClick={() => { onFocus([[epoch.bounds[0], epoch.bounds[1]], [epoch.bounds[2], epoch.bounds[3]]]); openDetail(); }}>查看这段河道</button>}
      <p>唐代使用11—1048年图集河道；替换现代黄河下游。其他河湖仍为现代参照。</p>{error && <p role="status">{error}</p>}
    </section>, controlsContainer)}
    {visible && detail && <section className="nature-detail river-history-detail" aria-label="历史河道详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Waves size={15} /><strong>黄河历史流向</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭历史河道详情" onClick={() => setDetail(false)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">{status}</span>
        <p>{epoch?.geometryNote ?? "此年尚无可用历史向量，本图保留现代参照。可在地图工具中查看已收录的时期。"}</p>
        {epoch && <p>来源：WorldMap / {epoch.sourceOwner}。{epoch.id === "yellow-11-1048" && "原说明依据《黄河流域地图集》。"}</p>}
        {comparisonData && <p>棕色虚线仅用于对比 {compareEpoch?.label}，不表示两条河道在当前年份同时存在。</p>}
        <p className="nature-detail-note">{manifest?.precisionNote} 黄河上游保留现代参照，两种资料接边不代表已复原衔接河段。</p>
        {epoch && <a href={epoch.sourceUrl} target="_blank" rel="noreferrer">核查河道原始资料 ↗</a>}
      </div>}
    </section>}
  </>;
}
