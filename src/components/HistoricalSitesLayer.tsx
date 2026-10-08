import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import { Landmark, X } from "lucide-react";
import { boundarySearchKey } from "../../shared/boundary-search";
import { canInteract, type MapInteractionMode } from "../../shared/map-interactions";
import { placeTypeLabel, placeTypeShortLabels } from "../../shared/place-types";
import { isHistoricalSitesData, siteIsVisible, sitesForPeriod, type HistoricalSite, type HistoricalSitesData } from "../../shared/historical-sites";
import "../historical-sites.css";

export default function HistoricalSitesLayer({ map, ready, periodId, year, mode, zoom, controlsContainer, resetKey, onChoose, onFocus }: {
  map: MapInstance | null; ready: boolean; periodId: string; year: number; mode: MapInteractionMode; zoom: number;
  controlsContainer: HTMLElement | null; resetKey: string;
  onChoose: () => void; onFocus: (points: [number, number][], maxZoom?: number) => void;
}) {
  const [data, setData] = useState<HistoricalSitesData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<HistoricalSite>();
  const [collapsed, setCollapsed] = useState(false);
  const choose = useRef(onChoose); choose.current = onChoose;
  const focus = useRef(onFocus); focus.current = onFocus;
  const interactive = canInteract(mode, "cities");
  useEffect(() => { setSelected(undefined); }, [resetKey]);
  useEffect(() => { setType("all"); setQuery(""); }, [periodId]);
  useEffect(() => { if (!interactive) setSelected(undefined); }, [interactive]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(undefined);
    fetch("/data/historical-sites.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(value => { if (!isHistoricalSitesData(value)) throw Error(); if (!controller.signal.aborted) setData(value); }).catch(reason => { if (reason.name !== "AbortError") setError("史迹地点暂时无法加载。"); });
    return () => controller.abort();
  }, [attempt]);
  const sites = useMemo(() => sitesForPeriod(data?.sites ?? [], periodId, year), [data, periodId, year]);
  const results = useMemo(() => sites.filter(site => (type === "all" || site.type === type) && boundarySearchKey(`${site.name} ${site.summary}`).includes(boundarySearchKey(query))), [sites, type, query]);
  const sourceById = useMemo(() => new Map(data?.sources.map(source => [source.id, source])), [data]);
  function select(site: HistoricalSite, locate = false) {
    choose.current(); setSelected(site); setCollapsed(false);
    if (locate) focus.current([site.coordinates], 11);
  }
  useEffect(() => {
    if (!map || !ready) return;
    const markers: Marker[] = [];
    for (const site of sites) {
      if (!siteIsVisible(site, zoom, selected?.id)) continue;
      const button = document.createElement("button");
      button.className = `historical-site-marker site-type-${site.type}${site.id === selected?.id ? " is-selected" : ""}${site.accuracy === "disputed-location" ? " is-disputed" : ""}`;
      button.disabled = !interactive;
      button.tabIndex = interactive ? 0 : -1;
      button.style.pointerEvents = interactive ? "auto" : "none";
      button.setAttribute("aria-hidden", String(!interactive));
      button.setAttribute("aria-label", `查看${site.name}，${placeTypeLabel(site.type)}，${site.accuracy === "disputed-location" ? "地望存疑" : "现代遗址参照"}`);
      const icon = document.createElement("span"); icon.className = "historical-site-symbol"; icon.textContent = placeTypeShortLabels[site.type];
      const label = document.createElement("span"); label.className = "historical-site-label"; label.textContent = site.name; label.hidden = !interactive;
      button.append(icon, label);
      button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); select(site); });
      markers.push(new Marker({ element: button, anchor: "left" }).setLngLat(site.coordinates).addTo(map));
    }
    return () => markers.forEach(marker => marker.remove());
  }, [map, ready, sites, zoom, interactive, selected?.id]);
  return <>
    {interactive && controlsContainer && createPortal(<section className="nature-explorer historical-sites-explorer" aria-label="史迹与交通地点">
      <h3><Landmark size={14} />史迹与交通地点 <small>{sites.length}</small></h3>
      <p>陵墓、寺庙、关隘、战场与交通遗存按缩放逐级出现。点位为现代遗址参照；存疑战场单独标记。</p>
      <input aria-label="搜索史迹地点" placeholder="名称、内容…" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="筛选史迹类型" value={type} onChange={event => setType(event.target.value)}>
        <option value="all">全部类型</option>{Array.from(new Set(sites.map(site => site.type))).map(value => <option key={value} value={value}>{placeTypeLabel(value)}</option>)}
      </select>
      <div className="nature-search-results">{results.map(site => <button type="button" key={site.id} onClick={() => select(site, true)}><strong>{site.name}</strong><span>{placeTypeLabel(site.type)} · {site.accuracy === "disputed-location" ? "地望存疑" : "现代遗址参照"}{site.beginYear === undefined ? " · 本朝史迹参考" : ""}</span></button>)}</div>
      {data && !results.length && <p>本时期暂未收录匹配地点；未落点不代表不存在。</p>}
      <details><summary>地点覆盖与缺口</summary><p>{data?.note}</p><p>本层已收录{data?.sites.length ?? 0}处具体地点、{data ? new Set(data.sites.map(site => site.type)).size : 0}种类型。朝代关联提供相关历史背景，不表示该地点在朝代内每一年都已存在。可在详情查看纪年与未决问题。</p>{data?.gaps.map(gap => <p key={gap.type}>{placeTypeLabel(gap.type)}：{gap.note}</p>)}</details>
      {error && <p role="status">{error}<button onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    </section>, controlsContainer)}
    {interactive && selected && <section className="nature-detail historical-site-detail" aria-label="史迹地点详情">
      <header><button className="nature-detail-title" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Landmark size={15} /><strong>{selected.name}</strong><span>{collapsed ? "展开" : "收起"}</span></button><button aria-label="关闭史迹地点详情" onClick={() => setSelected(undefined)}><X size={16} /></button></header>
      {!collapsed && <div className="nature-detail-body"><span className="nature-kind">{placeTypeLabel(selected.type)} · {selected.accuracy === "disputed-location" ? "地望存疑" : "现代遗址参照"}</span>
        <p>{selected.summary}</p><p className="nature-detail-note">{selected.locationNote}</p>
        <p className="nature-detail-note">{selected.beginYearNote ?? "本朝史迹参考：尚未取得足以确定始建年的资料，本条不表示此物在所选年份已经存在。"}</p>
        <details><summary>资料依据与未决问题</summary>{selected.evidence.map((evidence, index) => <blockquote key={index}>{evidence.quote}</blockquote>)}{selected.unresolved.map(note => <p key={note}>{note}</p>)}</details>
        <div className="nature-detail-actions"><button onClick={() => focus.current([selected.coordinates], 11)}>定位与放大</button>{selected.sourceIds.map(id => <a key={id} href={sourceById.get(id)?.url} target="_blank" rel="noreferrer">资料固定版本 ↗</a>)}</div>
      </div>}
    </section>}
  </>;
}
