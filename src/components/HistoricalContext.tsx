import { useEffect, useRef, useState } from "react";
import { BookOpen, MapPin, Waves, X } from "lucide-react";
import type { HistoricalContextData, HistoricalContextEvidence, HistoricalContextSource, HistoricalGeographyEntry, HistoricalGeographyKind } from "../../shared/historical-context";
import "../historical-context.css";

const kindNames: Record<HistoricalGeographyKind, string> = {
  "river-change": "河流改道", flood: "洪水灾害", canal: "运河开凿", "water-management": "水利治理", "lake-change": "湖泊变迁",
};

export function ContextEvidence({ evidence, sources }: { evidence: HistoricalContextEvidence[]; sources: HistoricalContextSource[] }) {
  return <details className="context-evidence"><summary><BookOpen size={12} /> 原文摘录与来源 · {evidence.length}</summary>
    {evidence.map((item, index) => {
      const source = sources.find(source => source.id === item.sourceId);
      return <div key={`${item.sourceId}-${index}`}><blockquote>{item.quote}</blockquote><p>{item.supports}</p>
        {source && <><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><p>{source.note}</p></>}
      </div>;
    })}
  </details>;
}

export function CityChronicle({ placeId, data, error }: { placeId: string; data: HistoricalContextData | null; error: string }) {
  const timeline = data?.cityTimelines.find(item => item.placeId === placeId);
  return <section className="city-chronicle detail-section" aria-label="历代大事记">
    <h3><span />历代大事记<small>{timeline ? `${timeline.entries.length} 条记录` : "持续补充"}</small></h3>
    <p className="chronicle-intro">跨越当前时期，查看这座城的关键转折。精选节点持续补充，古今城址未必相同。</p>
    {!data ? <p className="quiet-text" role="status">{error || "大事记加载中…"}</p> : !timeline ? <p className="quiet-text">此地的历代大事记尚待补充，可先查看下方已收录的相关事件。</p> :
      <ol className="chronicle-list">{timeline.entries.map(entry => <li key={entry.id}>
        <time>{entry.dateLabel}</time><h4>{entry.title}</h4><p>{entry.summary}</p>
        <ContextEvidence evidence={entry.evidence} sources={data.sources} />
      </li>)}</ol>}
  </section>;
}

export function HistoricalGeography({ data, error, selected, openRequest, onLocate }: {
  data: HistoricalContextData | null; error: string; selected: HistoricalGeographyEntry | null;
  openRequest: number; onLocate: (entry: HistoricalGeographyEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<HistoricalGeographyKind | "all">("all");
  const [activeId, setActiveId] = useState("");
  const entries = data?.geographyEntries.filter(entry => kind === "all" || entry.kind === kind) ?? [];
  const active = entries.find(entry => entry.id === activeId) ?? entries[0];
  function open() {
    if (selected) { setKind("all"); setActiveId(selected.id); }
    dialog.current?.showModal();
  }
  useEffect(() => { if (openRequest) open(); }, [openRequest]);
  return <>
    <button className="geography-launch" onClick={open}><Waves size={14} />历史地理<span>河道 · 水利</span></button>
    <dialog ref={dialog} className="geography-dialog" aria-labelledby="geography-title" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="geography-dialog-inner">
        <header><div><span className="section-kicker">LANDSCAPES THROUGH TIME</span><h2 id="geography-title">河流会改道，山河有往事。</h2></div><button aria-label="关闭历史地理" onClick={() => dialog.current?.close()}><X size={21} /></button></header>
        <p className="geography-intro">回看河道、洪水与水利变迁。此处列出跨时期事件，定位显示参考点，底图河湖仍为现代数据。条目采用有出处的概述，展开可核查原文和资料性质。</p>
        {!data ? <p role="status">{error || "历史地理资料加载中…"}</p> : <>
          <div className="geography-filters" aria-label="历史地理类型">{["all", ...Object.keys(kindNames).filter(value => data.geographyEntries.some(entry => entry.kind === value))].map(value => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value as typeof kind)}>{value === "all" ? `全部 ${data.geographyEntries.length}` : kindNames[value as HistoricalGeographyKind]}</button>)}</div>
          <div className="geography-content">
            <label className="geography-mobile-picker">选择历史地理事件<select value={active?.id ?? ""} onChange={event => setActiveId(event.target.value)}>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.dateLabel} · {entry.title}</option>)}</select></label>
            <nav aria-label="历史地理事件">{entries.map(entry => <button key={entry.id} className={active?.id === entry.id ? "selected" : ""} aria-pressed={active?.id === entry.id} onClick={() => setActiveId(entry.id)}><time>{entry.dateLabel}</time><strong>{entry.title}</strong><span>{kindNames[entry.kind]}</span></button>)}{!entries.length && <p>此类资料尚待补充。</p>}</nav>
            {active && <article key={active.id}><span className="geography-kind">{kindNames[active.kind]} · {active.dateLabel}</span><h3>{active.title}</h3><p>{active.summary}</p><h4>对山河与城邑的影响</h4><p>{active.impact}</p>
              <div className="geography-location"><MapPin size={16} /><p>{active.coordinateNote}</p></div>
              <button className="geography-locate" onClick={() => { onLocate(active); dialog.current?.close(); }}><MapPin size={14} />在地图上查看参考点</button>
              <ContextEvidence evidence={active.evidence} sources={data.sources} />
            </article>}
          </div>
        </>}
      </div>
    </dialog>
  </>;
}
