import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Landmark, MapPin, Search, X } from "lucide-react";
import { filterCityProfiles, type CityPeriodProfilesData } from "../../shared/city-profiles";
import type { Period, Place } from "../../shared/types";
import { ContextEvidence } from "./HistoricalContext";
import HistoricalResearchNotice from "./HistoricalResearchNotice";
import { boundarySearchKey } from "../../shared/boundary-search";
import { formatNavigationYear } from "../../shared/temporal-navigation";
import "../city-period-highlights.css";

type DataProps = { data: CityPeriodProfilesData | null; error: string; onRetry: () => void };

export default function CityPeriodHighlights({ period, currentYear, places, data, error, onRetry, onSelect }: DataProps & {
  period: Period; currentYear?: number; places: Place[]; onSelect: (placeId: string) => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const profiles = filterCityProfiles(data?.profiles ?? [], places, period.id);
  const filtered = filterCityProfiles(profiles, places, period.id, query, region);
  const regions = [...new Set(profiles.map(item => item.region).filter((value): value is string => Boolean(value)))];
  const placesById = new Map(places.map(place => [place.id, place]));
  useEffect(() => { if (disclosure.current) disclosure.current.open = false; setQuery(""); setRegion(""); }, [period.id]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!disclosure.current?.contains(event.target as Node) && disclosure.current) disclosure.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && disclosure.current?.open) { disclosure.current.open = false; summary.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={disclosure} className="period-city-menu" data-tour="period-cities">
    <summary ref={summary}><Landmark size={14} /><span>本朝名城</span><ChevronDown size={11} /></summary>
    <section className="period-city-panel" aria-labelledby={titleId}>
      <header><div><span>从一座城读懂这个时代</span><h3 id={titleId}>{period.label} · 本朝名城</h3></div><button type="button" aria-label="收起本朝名城" onClick={() => { if (disclosure.current) disclosure.current.open = false; summary.current?.focus(); }}><X size={17} /></button></header>
      <p className="period-city-intro">{profiles.length ? `精选 ${profiles.length} 座有本期档案的城池，点击定位并查看出处。` : "这里整理各朝代的代表城池看点。"}{period.id === "song" ? `档案以1200年为整理参考；当前所选年份为${formatNavigationYear(currentYear ?? period.year)}。档案包括南宋及同期金、西夏、大理等地区，不表示各城都属宋，也不代表所选年份的政区归属。另述北宋、南宋沿革。` : "按朝代整理，不限于地图代表年。"}</p>
      {profiles.length > 3 && <div className="period-city-filters">
        <label className="period-city-search"><Search size={14} /><input ref={searchInput} aria-label="搜索本朝名城" placeholder="输入古名、今名或别名" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空名城搜索" onClick={() => { setQuery(""); searchInput.current?.focus(); }}><X size={14} /></button>}</label>
        {regions.length > 1 && <label className="period-city-region">地域<select aria-label="筛选名城地域" value={region} onChange={event => setRegion(event.target.value)}><option value="">全部地域 · {profiles.length}</option>{regions.map(name => <option key={name} value={name}>{name} · {profiles.filter(item => item.region === name).length}</option>)}</select></label>}
        <p className="period-city-count" role="status">显示 {filtered.length} / {profiles.length} 座{(query || region) && <button type="button" onClick={() => { setQuery(""); setRegion(""); searchInput.current?.focus(); }}>重置筛选</button>}</p>
      </div>}
      <div className="period-city-list">
        {error ? <p className="period-city-status" role="status">{error}<button type="button" onClick={onRetry}>重新加载</button></p> : !data ? <p className="period-city-status" role="status">本朝看点加载中…</p> : !profiles.length ? <p className="period-city-status">这个时期的专门看点尚待补充，仍可点击地图中的已收录地点。</p> : !filtered.length ? <p className="period-city-status">未找到符合条件的城池，可换用今名或清除地域筛选。</p> : filtered.map(profile => {
          const place = placesById.get(profile.placeId)!;
          return <button type="button" key={profile.id} onClick={() => { if (disclosure.current) disclosure.current.open = false; onSelect(place.id); summary.current?.focus(); }}>
            <span className="period-city-name"><strong>{place.nameByPeriod?.[period.id] ?? place.name}{place.periodIds.length === 1 && place.nameByPeriod?.[period.id] && place.nameByPeriod[period.id] !== place.name && <small>（{place.name}）</small>}</strong><ArrowRight size={14} /></span>
            <span className="period-city-modern"><MapPin size={11} />今参考 · {place.modernName}</span>
            {profile.region && <span className="period-city-region-tag">{profile.region}</span>}
            <span className="period-city-summary">{profile.summary}</span>
          </button>;
        })}
      </div>
    </section>
  </details>;
}

export function CityPeriodHighlight({ period, currentYear, placeId, data, error, onRetry }: DataProps & { period: Period; currentYear?: number; placeId: string }) {
  const profile = data?.profiles.find(item => item.periodId === period.id && item.placeId === placeId);
  const research = profile?.historicalResearch ?? [];
  const textKey = (text: string) => boundarySearchKey(text).replace(/\s+/g, "");
  const summaryInResearch = !!profile && research.some(entry => textKey(entry.summary) === textKey(profile.summary));
  const researchQuotes = new Set(research.flatMap(entry => entry.findings.flatMap(finding => finding.evidence.map(item => `${item.sourceId}:${textKey(item.quote)}`))));
  const additionalEvidence = profile?.evidence.filter(item => !researchQuotes.has(`${item.sourceId}:${textKey(item.quote)}`)) ?? [];
  const politicalContext = profile?.politicalContext?.replace(/1200\s*年为当前阅读截面/g, "1200年为档案参考年份");
  if (!profile && data && !error) return <p className="period-highlight-missing">此城的{period.label}专门看点尚待补充，以下为已收录的概览与沿革。</p>;
  return <section className="period-city-highlight" aria-label="本朝看点">
    <h3><Landmark size={15} />{period.id === "song" ? "本期看点" : "本朝看点"}<span>{period.label}</span></h3>
    {error ? <p className="period-city-status" role="status">{error}<button type="button" onClick={onRetry}>重新加载</button></p> : !profile || !data ? <p className="period-city-status" role="status">本朝看点加载中…</p> : <>
      {!summaryInResearch && <p>{profile.summary}</p>}
      {(profile.namingNote || profile.politicalContext) && <dl className="period-city-notes">
        {profile.namingNote && <><dt>名称与年代</dt><dd>{profile.namingNote}</dd></>}
        {politicalContext && <><dt>政区关系</dt><dd>{politicalContext}</dd></>}
      </dl>}
      <p className="period-highlight-date-note">{period.id === "song" ? `档案整理参考年为1200年；当前所选年份为${formatNavigationYear(currentYear ?? period.year)}。本页沿革与政区关系按记载年代阅读，不随所选年份推定。` : "概览当前时期，不限于地图代表年；具体年代见文字与出处。"}</p>
      {research.length > 0 && <HistoricalResearchNotice entries={research} label={`${period.label}代城市史料研究`} limitNote="史料核查用于说明建置、沿革与事件；尚未据此核定古城址或重绘行政边界。" />}
      {(!research.length || additionalEvidence.length > 0) && <ContextEvidence evidence={research.length ? additionalEvidence : profile.evidence} sources={data.sources} />}
    </>}
  </section>;
}
