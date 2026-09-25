import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  ExternalLink,
  Globe2,
  Info,
  MapPin,
  Route,
  Search,
  X,
  Share2,
} from "lucide-react";
import type {
  Catalog,
  Evidence,
  HistoricalEvent,
  Period,
  Place,
  SearchResult,
  Source,
} from "../shared/types";
import HistoricalMap from "./components/HistoricalMap";
import HistoricalAtlasViewer from "./components/HistoricalAtlasViewer";
import EvidencePanel from "./components/EvidencePanel";
import SharePanel from "./components/SharePanel";
import OnboardingGuide from "./components/OnboardingGuide";
import CityPeriodHighlights, { CityPeriodHighlight } from "./components/CityPeriodHighlights";
import { CityChronicle, HistoricalGeography } from "./components/HistoricalContext";
import type { HistoricalContextData, HistoricalGeographyEntry } from "../shared/historical-context";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import {
  normalizeExploration,
  parseExploration,
  serializeExploration,
  type ExplorationState,
} from "../shared/exploration";
import "./map-topline.css";
import { canInteract, mapInteractionOptions, type MapInteractionMode } from "../shared/map-interactions";
import type { TangBoundaryCrosswalk } from "../shared/tang-boundary-crosswalk";
import TangJurisdictionInfo from "./components/TangJurisdictionInfo";

function formatYear(year: number) {
  return year < 0 ? `公元前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
}
function placeName(place: Place, period: Period) {
  return place.nameByPeriod?.[period.id] || place.name;
}

function MountainMark() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 42 42"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 30L14 12L22 26L28 17L38 30M9 30H33M17 30L22 21"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 35C14 32 17 37 23 34C28 32 33 34 36 33"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="30" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}

function CityDrawing() {
  return (
    <svg
      className="city-drawing"
      viewBox="0 0 280 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 58H275M24 57V39H63V58M216 57V39H256V58M68 57V33H211V58M68 39H210M94 32V19H188V32M85 18C107 15 122 10 140 4C158 10 173 15 196 18H85ZM74 32C99 29 119 24 140 19C161 24 181 29 206 32H74ZM19 39L44 29L70 39M210 39L235 29L262 39M136 5V0M127 57V43C127 34 153 34 153 43V57M87 44V55M100 44V55M112 44V55M168 44V55M181 44V55M194 44V55M104 21V30M121 21V30M157 21V30M174 21V30M34 45V53M53 45V53M225 45V53M245 45V53"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [historicalContext, setHistoricalContext] = useState<HistoricalContextData | null>(null);
  const [contextError, setContextError] = useState("");
  const [cityProfiles, setCityProfiles] = useState<CityPeriodProfilesData | null>(null);
  const [cityProfilesError, setCityProfilesError] = useState("");
  const [cityProfilesAttempt, setCityProfilesAttempt] = useState(0);
  const [geographySelection, setGeographySelection] = useState<HistoricalGeographyEntry | null>(null);
  const [geographyOpenRequest, setGeographyOpenRequest] = useState(0);
  const [atlasOpenRequest, setAtlasOpenRequest] = useState(0);
  const [tangBoundaries, setTangBoundaries] = useState<TangBoundaryCrosswalk | null>(null);
  const [crosswalkLoaded, setCrosswalkLoaded] = useState(false);
  const [jurisdictionRequest, setJurisdictionRequest] = useState<{ id: string; requestId: number }>();
  const [attempt, setAttempt] = useState(0);
  const [exploration, setExploration] = useState<ExplorationState>({
    periodId: "tang",
    topicId: null,
    placeId: "changan",
    eventId: null,
    modernNames: false,
    routeVisible: true,
    detailsView: "place",
  });
  const { periodId, placeId, eventId, modernNames, routeVisible } =
    exploration;
  const detailTab = exploration.detailsView;
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [boundaryStatus, setBoundaryStatus] = useState("历史边界加载中…");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [modal, setModal] = useState<"sources" | "about" | "share" | null>(
    null,
  );
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [sourceEvidence, setSourceEvidence] = useState<Evidence[]>([]);
  const searchBox = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const detailScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/tang-boundary-crosswalk.json", { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(data => { setTangBoundaries(data); setCrosswalkLoaded(true); })
      .catch(error => { if (error.name !== "AbortError") setCrosswalkLoaded(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/historical-context.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("历史地理与大事记暂时无法加载，请刷新重试。"); return response.json(); })
      .then(setHistoricalContext)
      .catch(error => { if (error.name !== "AbortError") setContextError(error.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCityProfilesError("");
    fetch("/data/city-period-profiles.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("本朝看点暂时无法加载"); return response.json() as Promise<CityPeriodProfilesData>; })
      .then(data => {
        if (!data || !Array.isArray(data.profiles) || !Array.isArray(data.sources)) throw new Error("本朝看点资料格式有误");
        setCityProfiles(data);
      })
      .catch(() => { if (!controller.signal.aborted) setCityProfilesError("本朝看点暂时无法加载，请重试。"); });
    return () => controller.abort();
  }, [cityProfilesAttempt]);

  function commit(next: ExplorationState) {
    if (!catalog) return;
    const normalized = normalizeExploration({ ...next, topicId: null }, catalog);
    setExploration(normalized);
    const search = serializeExploration(normalized);
    if (window.location.search !== search) {
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    fetch("/api/catalog", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("服务暂时没有响应");
        return response.json();
      })
      .then((data: Catalog) => {
        if (!data.periods?.length || !data.places?.length)
          throw new Error("历史资料尚未准备好");
        const initial = parseExploration(window.location.search, data);
        setExploration(initial);
        setCatalog(data);
        const search = serializeExploration(initial);
        if (window.location.search !== search)
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${search}${window.location.hash}`,
          );
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setLoadError(error.message || "无法加载历史资料");
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!catalog) return;
    const restore = () => {
      const state = parseExploration(window.location.search, catalog);
      setExploration(state);
      setModal(null);
      setFocusRequest((value) => value + 1);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [catalog]);

  const period =
    catalog?.periods.find((item) => item.id === periodId) ||
    catalog?.periods[0];
  const places = useMemo(
    () =>
      catalog?.places.filter((item) => item.periodIds.includes(periodId)) || [],
    [catalog, periodId],
  );
  const events = useMemo(
    () => catalog?.events.filter((item) => item.periodIds.includes(periodId)) || [],
    [catalog, periodId],
  );
  const place = places.find((item) => item.id === placeId) || places[0];
  const selectedEvent = catalog?.events.find((item) => item.id === eventId);
  const relatedEvents = events.filter(
    (item) => place && item.placeIds.includes(place.id),
  );
  const visibleSources =
    catalog?.sources.filter((source) => sourceIds.includes(source.id)) || [];

  useEffect(() => {
    detailScroll.current?.scrollTo({ top: 0 });
  }, [periodId, place?.id, eventId, detailTab]);
  function changePeriod(id: string) {
    setDetailsOpen(false);
    const first =
      catalog?.places.find(
        (item) =>
          item.periodIds.includes(id) &&
          (item.typeByPeriod?.[id] ?? item.type) === "capital",
      ) || catalog?.places.find((item) => item.periodIds.includes(id));
    commit({
      ...exploration,
      periodId: id,
      topicId: null,
      eventId: null,
      placeId: first?.id || null,
      detailsView: "place",
    });
  }
  function selectPlace(id: string) {
    if (!canInteract(interactionMode, "cities")) setInteractionMode("cities");
    setDetailsOpen(true);
    setFocusRequest((value) => value + 1);
    commit({
      ...exploration,
      placeId: id,
      eventId: null,
      detailsView: "place",
    });
  }
  function closeEventDetail(tab: "place" | "events") {
    commit({ ...exploration, eventId: null, detailsView: tab });
  }
  function openEvent(event: HistoricalEvent) {
    if (!canInteract(interactionMode, "cities")) setInteractionMode("cities");
    setDetailsOpen(true);
    commit({
      ...exploration,
      topicId: null,
      eventId: event.id,
      detailsView: "events",
      placeId: event.placeIds[0] || null,
      routeVisible: true,
    });
    setFocusRequest((value) => value + 1);
  }
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!searchBox.current?.contains(event.target as Node))
        setSearchOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setModal(null);
      }
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    setSearchResults([]);
    setSearchError("");
    if (!query.trim()) {
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("搜索暂时不可用，请稍后重试");
          return response.json();
        })
        .then((results: SearchResult[]) => {
          setSearchResults(results.slice(0, 8));
          setSearchLoading(false);
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            setSearchError(error.message);
            setSearchLoading(false);
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  function selectResult(result: SearchResult) {
    if (result.type !== "period") setDetailsOpen(true);
    if (result.type === "place" && !canInteract(interactionMode, "cities")) setInteractionMode("cities");
    const matchedPlace =
      result.type === "place"
        ? catalog?.places.find((item) => item.id === result.id)
        : undefined;
    const destinationPeriod =
      result.type === "place" &&
      !result.matchedHistoricalName &&
      matchedPlace?.periodIds.includes(periodId)
        ? periodId
        : result.periodId || periodId;
    if (result.type === "period") changePeriod(result.id);
    if (result.type === "place") {
      commit({
        ...exploration,
        periodId: destinationPeriod,
        topicId: null,
        placeId: result.id,
        eventId: null,
        detailsView: "place",
      });
      setFocusRequest((value) => value + 1);
    }
    if (result.type === "event") {
      const event = catalog?.events.find((item) => item.id === result.id);
      if (event) openEvent(event);
    }
    setQuery("");
    setSearchOpen(false);
  }
  function showSources(ids: string[], evidence: Evidence[] = []) {
    setSourceIds([
      ...new Set([...ids, ...evidence.map((item) => item.sourceId)]),
    ]);
    setSourceEvidence(evidence);
    setModal("sources");
  }

  if (!catalog || !period)
    return (
      <div className="loading-screen">
        <MountainMark />
        <h1>山河纪</h1>
        <p>{loadError || "正在展开历史地图…"}</p>
        {loadError && (
          <button
            className="primary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重新加载
          </button>
        )}
        <small>SHAN HE JI · 历史时空地图</small>
      </div>
    );

  return (
    <div className="app-shell map-first">
      <header className="site-header">
        <a className="brand" href="/" aria-label="山河纪首页">
          <MountainMark />
          <div>
            <strong>山河纪</strong>
            <span>SHAN HE JI</span>
          </div>
          <i />
          <span className="brand-description">中国历史时空地图</span>
        </a>
        <nav className="main-nav" aria-label="主导航">
          <button
            className="current"
            onClick={() => {
              setModal(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            地图探索
          </button>
          <button onClick={() => setModal("about")}>关于山河纪</button>
        </nav>
        <div className="header-right">
          <span className="edition-label">
            探索版 <span>V0.10.0</span>
          </span>
          <OnboardingGuide />
          <button
            className="share-button"
            onClick={() => setModal("share")}
            aria-label="分享当前探索"
          >
            <Share2 size={15} />
            <span>分享</span>
          </button>
          <button
            className="info-button"
            aria-label="关于数据与项目"
            onClick={() => setModal("about")}
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      <main>
        <section className="intro-row">
          <div>
            <div className="eyebrow intro-eyebrow">
              <span />
              以时间为经，以山河为纬
            </div>
            <h1>中国历史地图</h1>
            <label className="period-picker" data-tour="period-picker">
              <span>朝代</span>
              <select
                aria-label="选择朝代截面"
                value={periodId}
                onChange={(event) => changePeriod(event.target.value)}
              >
                {catalog.periods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {formatYear(item.year)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="search-wrap" ref={searchBox}>
            <div className="search-field">
              <Search size={18} />
              <input
                maxLength={80}
                aria-label="搜索历史地点、现代地名或事件"
                placeholder="搜索地点、事件，或一个时代"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0])
                    selectResult(searchResults[0]);
                }}
              />
              {query ? (
                <button aria-label="清空搜索" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              ) : (
                <span className="search-hint">探索</span>
              )}
            </div>
            {searchOpen && query.trim() && (
              <div
                className="search-results"
                role="region"
                aria-label="搜索结果"
              >
                <div className="search-result-caption">
                  {searchLoading
                    ? "正在检索历史资料…"
                    : searchError
                      ? "检索提示"
                      : `找到 ${searchResults.length} 个相关结果`}
                </div>
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => selectResult(result)}
                    >
                      {result.type === "place" ? (
                        <MapPin size={17} />
                      ) : result.type === "event" ? (
                        <Clock3 size={17} />
                      ) : (
                        <Globe2 size={17} />
                      )}
                      <span>
                        <strong>
                          {result.matchedHistoricalName || result.title}
                        </strong>
                        <small>{result.subtitle}</small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))
                ) : (
                  <p className="empty-search">
                    {searchLoading
                      ? "搜索中…"
                      : searchError ||
                        "未找到相关内容。试试“长安”“北京”或“安史之乱”。"}
                  </p>
                )}
                <p className="search-scope-hint">这里查精选地点、事件与时期。山川或行政区请在“地图工具”中查找。</p>
              </div>
            )}
          </div>
        </section>

        <section
          className={`atlas-workspace ${detailsOpen ? "details-open" : ""}`}
          aria-label="历史地图探索器"
        >
          <div className="map-column">
            <div className="map-topline">
              <div className="map-view-label">
                <Globe2 size={15} />
                <span>历史地图</span>
                <i />
                <small>
                  中国及周边地区
                </small>
              </div>
              <div className="map-display-mode" role="group" aria-label="地图点选对象" data-tour="display-mode">
                <span className="map-mode-caption">点选</span>
                {mapInteractionOptions.map(({value, label}) => (
                  <button key={value} type="button" aria-pressed={interactionMode === value} onClick={() => {
                    setInteractionMode(value);
                    if (!canInteract(value, "cities")) setDetailsOpen(false);
                  }}>{label}</button>
                ))}
              </div>
              <div className="map-place-controls">
                <CityPeriodHighlights period={period} places={places} data={cityProfiles} error={cityProfilesError}
                  onRetry={() => setCityProfilesAttempt(value => value + 1)} onSelect={selectPlace} />
                <button type="button" className="map-details-launch" aria-expanded={detailsOpen && detailTab === "place"} aria-controls="historical-details" onClick={() => {
                  if (!canInteract(interactionMode, "cities")) setInteractionMode("cities");
                  setDetailsOpen(true);
                  closeEventDetail("place");
                }}><BookOpen size={13} />地点档案</button>
                <button
                  onClick={() => {
                    setDetailsOpen(true);
                    closeEventDetail("events");
                  }}
                >
                  <Clock3 size={13} />
                  本期事件
                  <span>{events.length}</span>
                </button>
              </div>
              <button
                className={`modern-toggle ${modernNames ? "enabled" : ""}`}
                disabled={!canInteract(interactionMode, "cities")}
                title={!canInteract(interactionMode, "cities") ? "选择城池或全部后查看古今地名" : "同时显示古名与现代参考地区"}
                onClick={() =>
                  commit({ ...exploration, modernNames: !modernNames })
                }
                aria-pressed={modernNames}
              >
                <span className="toggle-track">
                  <span />
                </span>
                古今对照 <small>古名 + 今名</small>
              </button>
            </div>
            <HistoricalMap
              period={period}
              interactionMode={interactionMode}
              places={places}
              selectedPlace={place}
              selectedEvent={selectedEvent}
              onPlaceSelect={selectPlace}
              modernNames={modernNames}
              routeVisible={routeVisible}
              focusRequest={focusRequest}
              detailsOpen={detailsOpen}
              onBoundaryStatusChange={setBoundaryStatus}
              geographySelection={geographySelection}
              onGeographyOpen={() => setGeographyOpenRequest(value => value + 1)}
              onGeographyClear={() => setGeographySelection(null)}
              onNaturalSelect={() => setDetailsOpen(false)}
              onOpenAtlas={() => setAtlasOpenRequest(value => value + 1)}
              tangBoundaries={tangBoundaries} crosswalkLoading={!crosswalkLoaded} jurisdictionRequest={jurisdictionRequest}
            />
            <div className="map-bottomline">
              <HistoricalAtlasViewer periodId={periodId} openRequest={atlasOpenRequest} />
              <HistoricalGeography data={historicalContext} error={contextError} selected={geographySelection} openRequest={geographyOpenRequest}
                onLocate={entry => { setDetailsOpen(false); if (!canInteract(interactionMode, "rivers")) setInteractionMode("rivers"); setGeographySelection({ ...entry }); }} />
              <span>
                <Info size={12} />
                {`点选：${mapInteractionOptions.find(option => option.value === interactionMode)?.label} · 地形保持显示，仅切换名称与可点对象`}
              </span>
              <span className="map-count">{boundaryStatus}</span>
            </div>
          </div>

          {detailsOpen && (
            <aside
              id="historical-details"
              className="detail-panel"
              aria-label="历史地点与事件详情"
            >
              <div className="detail-drawer-header">
                <span>历史档案</span>
                <button
                  aria-label="收起档案，展开地图"
                  onClick={() => setDetailsOpen(false)}
                >
                  <span>收起</span>
                  <X size={15} />
                </button>
              </div>
              <div className="detail-tabs">
                <button
                  className={detailTab === "place" ? "active" : ""}
                  onClick={() => {
                    closeEventDetail("place");
                  }}
                >
                  <MapPin size={14} />
                  地点档案
                </button>
                <button
                  className={detailTab === "events" ? "active" : ""}
                  onClick={() => {
                    commit({ ...exploration, detailsView: "events" });
                  }}
                >
                  <Clock3 size={14} />
                  历史事件<span>{events.length}</span>
                </button>
              </div>
              <div className="detail-scroll" ref={detailScroll}>
                {detailTab === "place" && place ? (
                  <>
                    <div className="place-heading">
                      <div>
                        <span className="section-kicker">PLACE IN HISTORY</span>
                        <h2>
                          {placeName(place, period)}
                          <span className="place-tag">
                            {(place.typeByPeriod?.[period.id] ?? place.type) ===
                            "capital"
                              ? "都城"
                              : (place.typeByPeriod?.[period.id] ??
                                    place.type) === "pass"
                                ? "关隘"
                                : "城邑"}
                          </span>
                        </h2>
                        <p>
                          <MapPin size={13} />今 · {place.modernName}
                        </p>
                      </div>
                      <span className="seal">
                        山<br />河
                      </span>
                    </div>
                    <CityDrawing />
                    <CityPeriodHighlight period={period} placeId={place.id} data={cityProfiles} error={cityProfilesError}
                      onRetry={() => setCityProfilesAttempt(value => value + 1)} />
                    {periodId === "tang" && <TangJurisdictionInfo name={placeName(place, period)} link={tangBoundaries?.places[place.id]} loading={!crosswalkLoaded}
                      onView={id => { setDetailsOpen(false); setJurisdictionRequest({ id, requestId: Date.now() }); }} />}
                    <div className="detail-section">
                      <h3>
                        <span />
                        地点概览
                      </h3>
                      <p className="place-summary">{place.summary}</p>
                    </div>
                    <div className="place-facts">
                      <div>
                        <span>当前截面</span>
                        <strong>
                          {period.name} · {period.year < 0 ? "前" : ""}
                          {Math.abs(period.year)} 年
                        </strong>
                      </div>
                      <div>
                        <span>参考坐标</span>
                        <strong>
                          {place.coordinates[0].toFixed(2)}° E ·{" "}
                          {place.coordinates[1].toFixed(2)}° N
                        </strong>
                      </div>
                      {place.aliases.length > 0 && (
                        <div>
                          <span>历史别称</span>
                          <strong>
                            {place.aliases.slice(0, 3).join("、")}
                          </strong>
                        </div>
                      )}
                    </div>
                    {modernNames && (
                      <section className="place-name-history">
                        <h3>古今地名对照</h3>
                        <p>
                          <strong>{placeName(place, period)}</strong>
                          <ArrowRight size={13} />
                          <span>今 · {place.modernName}</span>
                        </p>
                        <p className="place-correspondence-note">
                          现代对应地区仅用于近似定位，古今地点范围未必一致。
                        </p>
                        <details>
                          <summary>查看已收录时期称谓</summary>
                          <table>
                            <thead>
                              <tr>
                                <th>代表截面</th>
                                <th>使用名称</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catalog.periods
                                .filter((item) =>
                                  place.periodIds.includes(item.id),
                                )
                                .map((item) => (
                                  <tr key={item.id}>
                                    <td>
                                      {item.label} ·{" "}
                                      {item.year < 0 ? "前 " : ""}
                                      {Math.abs(item.year)} 年
                                    </td>
                                    <td>
                                      {place.nameByPeriod?.[item.id] ||
                                        place.name}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                          <small>
                            仅列代表截面的已收录称谓，可能包含地区或政区名称；尚未逐项核定改名时间，不表示完整城市更名年表。
                          </small>
                        </details>
                      </section>
                    )}
                    {place.location && (
                      <div className="location-note">
                        <MapPin size={14} />
                        <div>
                          <strong>
                            {place.location.accuracy === "approximate"
                              ? "近似位置"
                              : place.location.accuracy === "uncertain"
                                ? "位置存在不确定性"
                                : "地点定位"}
                          </strong>
                          <p>{place.location.note}</p>
                        </div>
                      </div>
                    )}
                    <CityChronicle placeId={place.id} data={historicalContext} error={contextError} />
                    <div className="detail-section related-section">
                      <h3>
                        <span />
                        相关事件<small>{relatedEvents.length} 条记录</small>
                      </h3>
                      {relatedEvents.length ? (
                        relatedEvents.map((event) => (
                          <button
                            className="related-event"
                            key={event.id}
                            onClick={() => openEvent(event)}
                          >
                            <div className="event-year">{event.dateLabel}</div>
                            <div>
                              <strong>{event.title}</strong>
                              <ArrowRight size={14} />
                            </div>
                          </button>
                        ))
                      ) : (
                        <p className="quiet-text">
                          此地在当前时期中暂无事件记录。可在“历史事件”查看这一时期的故事。
                        </p>
                      )}
                    </div>
                    <EvidencePanel
                      evidence={place.evidence || []}
                      sources={catalog.sources}
                    />
                    <button
                      className="source-link"
                      onClick={() =>
                        showSources(place.sourceIds, place.evidence)
                      }
                    >
                      <BookOpen size={16} />
                      <span>
                        查阅史料与出处
                        <small>{place.sourceIds.length} 条参考来源</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="locate-link"
                      onClick={() => setFocusRequest((value) => value + 1)}
                    >
                      <MapPin size={13} />
                      在地图中定位此地
                    </button>
                  </>
                ) : selectedEvent ? (
                  <>
                    <button
                      className="back-link"
                      onClick={() => closeEventDetail("events")}
                    >
                      <ArrowLeft size={14} />
                      返回本期事件
                    </button>
                    <div className="event-heading">
                      <span className="section-kicker">
                        A MOMENT IN HISTORY
                      </span>
                      <span className="event-category">
                        {selectedEvent.category}
                      </span>
                      <h2>{selectedEvent.title}</h2>
                      <p>
                        <Clock3 size={14} />
                        {selectedEvent.dateLabel}
                      </p>
                    </div>
                    {selectedEvent.time && (
                      <div className="historical-time">
                        <span>时间标注</span>
                        {!selectedEvent.dateLabel.includes(
                          selectedEvent.time.original,
                        ) && (
                          <strong>
                            原纪年 · {selectedEvent.time.original}
                          </strong>
                        )}
                        <small>
                          {selectedEvent.time.calendar === "traditional-chinese"
                            ? "传统年份、月日均保留原文，未换算公历；数字年份仅作史书记年索引"
                            : "以公元年份标示"}
                          {selectedEvent.time.certainty === "approximate"
                            ? " · 时间约略"
                            : ""}
                        </small>
                      </div>
                    )}
                    <p className="event-summary">{selectedEvent.summary}</p>
                    {selectedEvent.personNames.length > 0 && (
                      <div className="detail-section">
                        <h3>
                          <span />
                          相关人物
                        </h3>
                        <div className="person-tags">
                          {selectedEvent.personNames.map((name) => (
                            <span key={name}>{name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="detail-section">
                      <h3>
                        <span />
                        发生在何处
                      </h3>
                      <div className="event-places">
                        {selectedEvent.placeIds
                          .map((id) =>
                            catalog.places.find((item) => item.id === id),
                          )
                          .filter((item): item is Place => !!item)
                          .map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                selectPlace(item.id);
                                setFocusRequest((value) => value + 1);
                              }}
                            >
                              <MapPin size={14} />
                              {placeName(item, period)}
                              <ArrowRight size={13} />
                            </button>
                          ))}
                      </div>
                    </div>
                    {selectedEvent.route && (
                      <div className="route-card">
                        <div>
                          <Route size={18} />
                          <strong>事件路线示意</strong>
                        </div>
                        <p>
                          连接相关地点，帮助理解空间关系；不表示完整行军轨迹。
                        </p>
                        <button
                          className={routeVisible ? "route-active" : ""}
                          onClick={() =>
                            commit({
                              ...exploration,
                              routeVisible: !routeVisible,
                            })
                          }
                        >
                          {routeVisible ? (
                            <Check size={14} />
                          ) : (
                            <Route size={14} />
                          )}{" "}
                          {routeVisible
                            ? "已显示路线 · 点击隐藏"
                            : "在地图上显示路线"}
                        </button>
                      </div>
                    )}
                    <EvidencePanel
                      evidence={selectedEvent.evidence || []}
                      sources={catalog.sources}
                    />
                    <button
                      className="source-link"
                      onClick={() =>
                        showSources(
                          selectedEvent.sourceIds,
                          selectedEvent.evidence,
                        )
                      }
                    >
                      <BookOpen size={16} />
                      <span>
                        查阅史料与出处
                        <small>
                          {selectedEvent.sourceIds.length} 条参考来源
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="event-list-heading">
                      <span className="section-kicker">STORIES OF THE ERA</span>
                      <h2>
                        {period.name} · 历史片段
                      </h2>
                      <p>这一时期，山河间发生了什么？</p>
                    </div>
                    <p className="snapshot-note">
                      <Info size={13} />
                      关联事件保留真实日期，不限于 {Math.abs(period.year)} 年。
                    </p>
                    <div className="era-events">
                      {events.map((event) => (
                        <button key={event.id} onClick={() => openEvent(event)}>
                          <span className="era-event-dot" />
                          <small>{event.dateLabel}</small>
                          <h3>
                            {event.title}
                            <ArrowRight size={15} />
                          </h3>
                          <p>{event.summary}</p>
                          <span className="event-category">
                            {event.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="detail-bottom">
                <span className="live-dot" />
                每一处地名，都是一段历史的入口
              </div>
            </aside>
          )}
        </section>

        <footer className="site-footer">
          <p>
            <MountainMark />
            <span>山河为卷，岁月作序。</span>
          </p>
          <div>
            <span>从公元前 221 年，走入中国历史</span>
            <button onClick={() => setModal("about")}>
              数据说明与项目介绍
              <ExternalLink size={12} />
            </button>
          </div>
        </footer>
      </main>

      <dialog
        aria-label={
          modal === "sources"
            ? "史料来源"
            : modal === "share"
              ? "分享当前探索"
              : "关于山河纪"
        }
        className="source-dialog"
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(event) => {
          if (event.target === dialog.current) setModal(null);
        }}
      >
        <div className="dialog-inner">
          <button
            className="dialog-close"
            aria-label="关闭弹窗"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          {modal === "share" ? (
            <SharePanel url={window.location.href} />
          ) : modal === "sources" ? (
            <>
              <span className="section-kicker">FOLLOW THE SOURCES</span>
              <h2>让每一段历史，有迹可循。</h2>
              <p className="dialog-intro">
                “事实依据”对应本条记录中的具体论断，核对状态逐条标注；“书目参考”提供进一步阅读，不代表所有细节均已考证。
              </p>
              <EvidencePanel
                evidence={sourceEvidence}
                sources={catalog.sources}
                expanded
              />
              <h3 className="source-group-title">书目参考</h3>
              <div className="source-list">
                {visibleSources.length ? (
                  visibleSources.map((source, index) => (
                    <SourceCard key={source.id} source={source} index={index} />
                  ))
                ) : (
                  <p>这条记录暂无公开来源，后续会补充。</p>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="section-kicker">ABOUT SHAN HE JI</span>
              <h2>把历史，放回地图里。</h2>
              <p className="dialog-intro">
                山河纪是一张可以按朝代探索的中国历史地图。选择时代、走进城邑、连接事件，再循着史料，认识地理与历史的彼此影响。
              </p>
              <div className="about-stats">
                <div>
                  <strong>{catalog.periods.length}</strong>
                  <span>历史截面</span>
                </div>
                <div>
                  <strong>{catalog.places.length}</strong>
                  <span>精选地点</span>
                </div>
                <div>
                  <strong>{catalog.events.length}</strong>
                  <span>精选事件</span>
                </div>
              </div>
              <div className="about-note">
                <h3>
                  <Info size={17} />
                  关于本探索版的数据
                </h3>
                <p>{catalog.metadata.dataNotice}</p>
                <p>{catalog.metadata.geographicNotice}</p>
                <p>
                  历史行政界来自 CHGIS 和 Hartwell 数据；资料年份与当前截面不同时，会单独标明。唐宋等 Hartwell 图层是近似行政模型；省、府、县与独立政权或诸部按来源分层，行政区不等于古城城墙。完整政权范围可通过“历史地图原图”查阅《中国历史地图集》扫描图的边界与图例。
                </p>
                <p>
                  底图采用{" "}
                  <a
                    href="https://www.naturalearthdata.com/about/terms-of-use/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Natural Earth 公有领域数据 <ExternalLink size={12} />
                  </a>
                  ，它是现代自然背景，不代表古代河道或海岸线复原。
                </p>
                <p>
                  部分地点的现代参考坐标来自{" "}
                  <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
                    GeoNames
                  </a>
                  ，按{" "}
                  <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                    CC BY 4.0
                  </a>
                  使用；它们不代表古城址的精确坐标。
                </p>
              </div>
              <button className="primary-button" onClick={() => setModal(null)}>
                开始探索
                <ArrowRight size={15} />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  return (
    <article className="source-card">
      <span className="source-number">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <span className="reference-tag">书目参考</span>
        <h3>{source.title}</h3>
        <p>
          {source.author}
          <span> · </span>
          {source.locator}
        </p>
        <p className="source-note">{source.note}</p>
        {source.edition && (
          <p className="source-meta">版本：{source.edition}</p>
        )}
        {source.retrievedAt && (
          <p className="source-meta">资料访问：{source.retrievedAt}</p>
        )}
        {source.license && (
          <p className="source-meta">许可：{source.license}</p>
        )}
        <a href={source.url} target="_blank" rel="noreferrer">
          前往来源页面
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}
