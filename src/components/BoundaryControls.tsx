import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Info,
  Layers2,
  LoaderCircle,
  MapPin,
  X,
} from "lucide-react";
import {
  boundaryLevelNames,
  boundaryCountryCoverage,
  type BoundaryDataset,
  type BoundaryLevel,
  type BoundarySelection,
} from "../../shared/boundaries";
import "../boundaries.css";
import { boundarySearchKey } from "../../shared/boundary-search";
import { mapViewLevelOptions, type MapViewLevel } from "../../shared/map-detail-levels";

export interface BoundaryControlsProps {
  embedded?: boolean;
  enabled?: boolean;
  datasets: BoundaryDataset[];
  selectedDataset: BoundaryDataset | undefined;
  onDatasetChange: (id: string) => void;
  visibleLevels: BoundaryLevel[];
  viewLevel: MapViewLevel;
  onViewLevelChange: (level: MapViewLevel) => void;
  activeLevel: BoundaryLevel | null;
  zoom: number;
  onOpenAtlas?: () => void;
  selection: BoundarySelection | null;
  onSelectionClose: () => void;
  currentYear: number;
  loading: boolean;
  error: string;
  regionOptions?: BoundarySelection[];
  onRegionSelect?: (id: string) => void;
  correspondenceSources?: { id: string; title: string; url: string; note: string }[];
  correspondenceError?: string;
}

const levelOrder: BoundaryLevel[] = [
  "country",
  "province",
  "prefecture",
  "county",
];

function yearLabel(year: number) {
  return year < 0 ? `前 ${Math.abs(year)} 年` : `${year} 年`;
}

export default function BoundaryControls(props: BoundaryControlsProps) {
  const [expanded, setExpanded] = useState(!!props.embedded);
  const [regionQuery, setRegionQuery] = useState("");
  const bodyId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const dataset = props.selectedDataset;
  const countryCoverage = boundaryCountryCoverage(dataset);
  const regionIndex = useMemo(() => (props.regionOptions ?? []).map(region => ({ region, key: boundarySearchKey([region.name, region.originalName, ...(region.modernNames ?? [])].join(" ")) })), [props.regionOptions]);
  const regionResults = useMemo(() => {
    const query = boundarySearchKey(regionQuery);
    if (!query) return [];
    return regionIndex.filter(item => item.key.includes(query)).slice(0, 20).map(item => item.region);
  }, [regionQuery, regionIndex]);
  const levels = useMemo(
    () =>
      levelOrder.filter((level) =>
        dataset?.layers.some((layer) => layer.level === level),
      ),
    [dataset],
  );
  const missingLevels = levelOrder.filter((level) => !levels.includes(level));
  const selectedSource = props.selection
    ? props.datasets.find((item) => item.id === props.selection?.sourceId) ||
      (dataset?.year === props.selection.year ? dataset : undefined)
    : undefined;

  useEffect(() => {
    if (props.selection) setExpanded(true);
  }, [props.selection]);
  useEffect(() => { setRegionQuery(""); }, [dataset?.id]);

  return (
    <section
      className={`boundary-controls ${expanded ? "is-expanded" : ""}`}
      aria-label="历史行政边界资料"
      aria-busy={props.loading}
    >
      <button
        className="boundary-controls-heading"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Layers2 size={15} />
        <strong>行政边界</strong>
        <span className="boundary-heading-year">
          {dataset
            ? yearLabel(dataset.year)
            : props.loading
              ? "加载中"
              : props.datasets.length
                ? "选择资料"
                : "未收录"}
        </span>
        {props.loading && (
          <LoaderCircle className="boundary-loading-icon" size={13} />
        )}
        <ChevronDown
          size={14}
          className={`boundary-expansion-icon ${expanded ? "rotated" : ""}`}
        />
      </button>

      {expanded && dataset && dataset.year !== props.currentYear && (
        <p className="boundary-year-notice">
          边界为 {yearLabel(dataset.year)}参考，当前截面
          {yearLabel(props.currentYear)}
        </p>
      )}
      {expanded && dataset?.accuracy === "approximate-model" && (
        <p className="boundary-model-notice">
          <Info size={11} />
          近似推演模型 · 尚未逐段核定
        </p>
      )}
      {expanded && dataset?.layers.some(layer => layer.warning) && (
        <p className="boundary-year-notice">部分图层的来源年份标注存在冲突，展开查看说明。</p>
      )}
      {!dataset && !props.loading && !props.error && (
        <p className="boundary-empty-notice">
          {props.datasets.length
            ? "请选择已接入的边界资料年份。"
            : "当前时期暂无已接入的边界资料。"}
        </p>
      )}
      {props.error && (
        <p className="boundary-error" role="alert">
          <Info size={12} />
          <span>{props.error}</span>
        </p>
      )}

      {expanded && (
        <div id={bodyId} className="boundary-controls-body">
          <fieldset className="boundary-view-presets" disabled={props.enabled === false}>
            <legend>地图显示层级</legend>
            <div>{mapViewLevelOptions.map(option => <label key={option.value} className={props.viewLevel === option.value ? "is-selected" : ""}>
              <input type="radio" name={`${bodyId}-view-level`} value={option.value} checked={props.viewLevel === option.value} onChange={() => props.onViewLevelChange(option.value)} />
              <span>{option.label}</span>
            </label>)}</div>
          </fieldset>
          <p className="boundary-effective-level" role="status">
            {props.enabled === false ? "行政边界已关闭" : props.viewLevel === "cities" ? "当前只显示已收录城池；未显示行政区轮廓。" : props.activeLevel ? `${props.viewLevel === "auto" ? "自动显示" : "当前显示"}：${boundaryLevelNames[props.activeLevel]}${props.viewLevel === "auto" && props.zoom >= 5.4 ? "与城池" : props.viewLevel === "county" ? "与城池" : ""}。点击名称或区域可高亮辖区。` : "当前资料未提供所选层级。"}
          </p>
          {props.viewLevel === "auto" && <p className="boundary-scale-guide">缩小看国家与省道，放大依次看府州、县域与城池；点选查找结果会固定到该层级。</p>}
          {countryCoverage.incomplete && (props.viewLevel === "country" || props.viewLevel === "auto" && props.zoom < 4) && <aside className="boundary-country-notice">
            <p>{countryCoverage.note}{props.viewLevel === "auto" && props.visibleLevels.includes("province") ? "当前以省道显示行政范围，周边诸部作为背景。" : ""}</p>
            {props.onOpenAtlas && <button type="button" onClick={props.onOpenAtlas}>查看历史原图 <ExternalLink size={12} /></button>}
          </aside>}
          {dataset && props.onRegionSelect && props.enabled !== false && (
            <div className="boundary-region-search">
              <label htmlFor={`${bodyId}-search`}>查找当前资料中的行政区</label>
              <input ref={searchInput} id={`${bodyId}-search`} type="search" value={regionQuery} onChange={event => setRegionQuery(event.target.value)} placeholder="输入古名或现代地区名" />
              <small>搜索所有已收录层级，选择后显示对应辖区。</small>
              {regionQuery.trim() && <div className="boundary-search-results" role="region" aria-label="行政区搜索结果">
                {regionResults.length ? regionResults.map(region => <button key={region.id} onClick={() => { props.onRegionSelect?.(region.id); setRegionQuery(""); searchInput.current?.focus(); }}><strong>{region.name}</strong><span>{boundaryLevelNames[region.level]}</span></button>) : <p>当前资料中没有匹配的行政区。</p>}
              </div>}
            </div>
          )}
          {props.selection && (
            <article className="boundary-selection">
              <div className="boundary-selection-heading">
                <span>
                  <MapPin size={13} />
                  {boundaryLevelNames[props.selection.level]}
                </span>
                <button
                  onClick={props.onSelectionClose}
                  aria-label="关闭行政区域详情"
                  title="关闭区域详情"
                >
                  <X size={15} />
                </button>
              </div>
              <h3>{props.selection.name}</h3>
              <p className="boundary-selection-highlight-note">地图已用深色边线与底色高亮该区域范围。</p>
              <details className="boundary-original-name"><summary>查看来源原文</summary>
                <p>原文名称 · {props.selection.originalName || "来源未提供"}</p>
                {props.selection.originalPolity && <p>原始分组 · {props.selection.originalPolity}</p>}
                {props.selection.originalAdminType && <p>原始类型 · {props.selection.originalAdminType}</p>}
              </details>
              {props.selection.nameCorrectionNote && <p className="boundary-selection-caveat">{props.selection.nameCorrectionNote}{props.selection.nameSourceUrl && <> <a href={props.selection.nameSourceUrl} target="_blank" rel="noreferrer">核查来源 ↗</a></>}</p>}
              <section className="boundary-modern-comparison">
                <strong>今参考 · {props.selection.modernNames?.length ? props.selection.modernNames.join(" / ") : "对应地区待补"}</strong>
                <p>{props.correspondenceError || props.selection.correspondenceNote}</p>
                {(props.correspondenceSources ?? []).filter(source => props.selection?.correspondenceSourceIds?.includes(source.id)).map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}
              </section>
              <dl>
                {props.selection.polity && props.selection.level !== "country" && props.selection.nameStatus !== "source-recovered" && <div><dt>来源分组</dt><dd>{props.selection.polity}</dd></div>}
                {props.selection.sourceAdminType && props.selection.nameStatus !== "source-recovered" && <div><dt>来源类型</dt><dd>{props.selection.sourceAdminType}</dd></div>}
                <div>
                  <dt>资料年份</dt>
                  <dd>{yearLabel(props.selection.year)}</dd>
                </div>
                <div>
                  <dt>记录标识</dt>
                  <dd className="boundary-record-id">
                    {props.selection.recordId || props.selection.id}
                  </dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>
                    {selectedSource?.sourceName || props.selection.sourceId}
                  </dd>
                </div>
              </dl>
              {selectedSource?.accuracy === "approximate-model" && (
                <p className="boundary-selection-caveat">
                  当前区域来自近似推演模型，并非经史料逐段核定的行政边界。
                </p>
              )}
              {selectedSource && (
                <a
                  className="boundary-source-link"
                  href={selectedSource.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查阅此区域的资料来源 <ExternalLink size={11} />
                </a>
              )}
            </article>
          )}

          {props.datasets.length > 0 && (
            <label className="boundary-dataset-picker">
              <span>选择资料年份</span>
              <select
                aria-label="选择历史边界资料年份"
                value={dataset?.id || ""}
                onChange={(event) => props.onDatasetChange(event.target.value)}
              >
                {!dataset && <option value="">请选择边界资料</option>}
                {props.datasets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {yearLabel(item.year)} · {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {props.loading && (
            <p className="boundary-loading-status" role="status">
              正在加载行政区资料…
            </p>
          )}

          {dataset ? (
            <>
              <fieldset className="boundary-layer-list">
                <legend>行政层级与图例</legend>
                {levels.map((level) => {
                  const layers = dataset.layers.filter(
                    (layer) => layer.level === level,
                  );
                  const count = layers.reduce(
                    (total, layer) => total + layer.featureCount,
                    0,
                  );
                  return (
                    <div key={level} className="boundary-level-control">
                      <span
                        className={`boundary-level-swatch boundary-level-${level}`}
                        aria-hidden="true"
                      />
                      <span>{layers.map(layer => layer.label).join(" / ")}</span>
                      <small>{count} 条 · {props.enabled !== false && props.visibleLevels.includes(level) ? "显示中" : "隐藏"}</small>
                    </div>
                  );
                })}
                {!levels.length && (
                  <p className="boundary-unavailable-levels">
                    这份资料尚未提供可显示的行政区层级。
                  </p>
                )}
              </fieldset>
              {missingLevels.length > 0 && (
                <p className="boundary-unavailable-levels">
                  未收录层级：
                  {missingLevels
                    .map((level) => boundaryLevelNames[level])
                    .join("、")}
                </p>
              )}
              {dataset.layers.filter(layer => layer.warning).map(layer => (
                <p className="boundary-selection-caveat" key={layer.id}>{layer.warning}</p>
              ))}

              <div className="boundary-dataset-description">
                <dl>
                  <div>
                    <dt>覆盖范围</dt>
                    <dd>{dataset.coverage}</dd>
                  </div>
                  <div>
                    <dt>资料性质</dt>
                    <dd>
                      {dataset.accuracy === "approximate-model"
                        ? "近似推演模型"
                        : "历史 GIS 资料"}
                    </dd>
                  </div>
                </dl>
                <p>{dataset.note}</p>
                <a
                  className="boundary-source-link"
                  href={dataset.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {dataset.sourceName} <ExternalLink size={11} />
                </a>
              </div>
            </>
          ) : (
            !props.datasets.length && (
              <p className="boundary-no-data">
                这一时期继续展示已收录地点与现代自然地理背景。其他年份的行政边界不能代替当前时期的边界。
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}
