import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  BookOpen,
  ExternalLink,
  Expand,
  LoaderCircle,
  Minus,
  Plus,
  X,
} from "lucide-react";
import "../atlas-viewer.css";

interface AtlasImage {
  id: string;
  periodId: string;
  title: string;
  imageUrl: string;
  width: number;
  height: number;
  sourceUrl: string;
  imageDate: { label: string; year: number } | null;
}

interface AtlasManifest {
  sourceNote: string;
  readmeUrl: string;
  images: AtlasImage[];
}

export default function HistoricalAtlasViewer({ periodId }: { periodId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [loadedImage, setLoadedImage] = useState("");
  const [failedImage, setFailedImage] = useState("");
  const [dragging, setDragging] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const noteId = useId();
  const selectId = useId();
  const images = useMemo(
    () => manifest?.images.filter((item) => item.periodId === periodId) ?? [],
    [manifest, periodId],
  );
  const selected = images.find((item) => item.id === selectedId) ?? images[0];
  const fit = selected
    ? Math.min(
        Math.max(1, viewport.width - 32) / selected.width,
        Math.max(1, viewport.height - 32) / selected.height,
        1,
      )
    : 1;
  const imageWidth = selected ? Math.round(selected.width * fit * zoom) : 0;
  const imageHeight = selected ? Math.round(selected.height * fit * zoom) : 0;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/data/atlas/manifest.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("原图目录暂时无法加载");
        return response.json() as Promise<AtlasManifest>;
      })
      .then((data) => {
        if (!Array.isArray(data.images)) throw new Error("原图目录格式有误");
        setManifest(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "原图目录加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!isOpen || !element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, selected?.id, loading, error]);

  useEffect(() => {
    setZoom(1);
    setFailedImage("");
    centerRef.current = null;
    viewportRef.current?.scrollTo(0, 0);
  }, [selected?.id, isOpen]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    const center = centerRef.current;
    if (!element || !center) return;
    element.scrollLeft = center.x * imageWidth + Math.max(0, (viewport.width - imageWidth) / 2) - viewport.width / 2;
    element.scrollTop = center.y * imageHeight + Math.max(0, (viewport.height - imageHeight) / 2) - viewport.height / 2;
    centerRef.current = null;
  }, [imageWidth, imageHeight, viewport]);

  function changeZoom(next: number) {
    const element = viewportRef.current;
    if (!element || !imageWidth || !imageHeight) return;
    centerRef.current = {
      x: (element.scrollLeft + viewport.width / 2 - Math.max(0, (viewport.width - imageWidth) / 2)) / imageWidth,
      y: (element.scrollTop + viewport.height / 2 - Math.max(0, (viewport.height - imageHeight) / 2)) / imageHeight,
    };
    setZoom(Math.min(8, Math.max(1, next)));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || event.button !== 0 || zoom === 1) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
    event.currentTarget.scrollTop = drag.top + drag.y - event.clientY;
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(false);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button ref={launchRef} type="button" className="atlas-launch" onClick={() => setIsOpen(true)}>
        <BookOpen size={15} aria-hidden="true" />
        历史地图原图
      </button>
      <dialog
        ref={dialogRef}
        className="atlas-dialog"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onClose={() => {
          setIsOpen(false);
          endDrag();
          launchRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="atlas-shell">
          <header className="atlas-header">
            <div className="atlas-heading">
              <span className="atlas-eyebrow">纸图影像参考</span>
              <h2 id={titleId}>历史地图原图</h2>
            </div>
            <p id={noteId}>原图年代独立于当前截面，见原图图例</p>
            <button type="button" className="atlas-icon-button atlas-close" onClick={close} aria-label="关闭历史地图原图" title="关闭（Esc）" autoFocus>
              <X size={21} />
            </button>
          </header>

          {loading ? (
            <div className="atlas-status" role="status"><LoaderCircle size={23} className="atlas-spinner" /><p>正在读取原图目录…</p></div>
          ) : error ? (
            <div className="atlas-status" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>重新加载</button></div>
          ) : !selected ? (
            <div className="atlas-status"><BookOpen size={30} /><p>这个时期暂未收录原图</p></div>
          ) : (
            <>
              <div className="atlas-toolbar">
                <div className="atlas-image-choice">
                  <label htmlFor={selectId}>选择图幅</label>
                  <select id={selectId} value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                    {images.map((item) => <option key={item.id} value={item.id}>{item.title}{item.imageDate ? ` · ${item.imageDate.year} 年` : ""}</option>)}
                  </select>
                </div>
                <div className="atlas-zoom-tools" aria-label="原图缩放">
                  <button type="button" className="atlas-icon-button" onClick={() => changeZoom(zoom / 1.5)} disabled={zoom <= 1} aria-label="缩小原图" title="缩小"><Minus size={17} /></button>
                  <output aria-live="polite" aria-label="相对适配大小的缩放比例">{Math.round(zoom * 100)}%</output>
                  <button type="button" className="atlas-icon-button" onClick={() => changeZoom(zoom * 1.5)} disabled={zoom >= 8} aria-label="放大原图" title="放大"><Plus size={17} /></button>
                  <button type="button" className="atlas-fit-button" onClick={() => { centerRef.current = null; setZoom(1); viewportRef.current?.scrollTo(0, 0); }}><Expand size={15} />适配全图</button>
                </div>
              </div>

              <div className="atlas-date-row">
                <strong>{selected.imageDate?.label ?? "原图年代见图例"}</strong>
                <span>放大后可拖动、滚动查看 · 保留完整图例</span>
              </div>

              <div className="atlas-image-area">
                <div
                  ref={viewportRef}
                  className={`atlas-viewport ${zoom > 1 ? "is-zoomed" : ""} ${dragging ? "is-dragging" : ""}`}
                  tabIndex={0}
                  role="region"
                  aria-label={`${selected.title}，可用方向键滚动查看`}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                >
                  <div className="atlas-image-canvas" style={{ width: Math.max(viewport.width, imageWidth), height: Math.max(viewport.height, imageHeight) }}>
                    {isOpen && (
                      <img
                        key={selected.id}
                        src={selected.imageUrl}
                        alt={`${selected.title}完整纸图扫描，含政权部族界及原图图例。${selected.imageDate?.label ?? "具体年代见原图"}`}
                        style={{ width: imageWidth, height: imageHeight }}
                        draggable={false}
                        onLoad={() => setLoadedImage(selected.id)}
                        onError={() => setFailedImage(selected.id)}
                      />
                    )}
                  </div>
                </div>
                {loadedImage !== selected.id && failedImage !== selected.id && <div className="atlas-image-loading" role="status"><LoaderCircle size={20} className="atlas-spinner" />正在加载完整原图…</div>}
                {failedImage === selected.id && <div className="atlas-image-loading" role="alert">原图加载失败，请关闭后重新打开，或查看下方来源原图。</div>}
              </div>

              <footer className="atlas-footer">
                <div><strong>《中国历史地图集》· 谭其骧主编</strong><p title={manifest?.sourceNote}>第三方保存的纸图扫描，非官方数字发布</p></div>
                <div className="atlas-source-links">
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">来源原图<ExternalLink size={12} /></a>
                  <a href={manifest?.readmeUrl} target="_blank" rel="noreferrer">来源说明<ExternalLink size={12} /></a>
                </div>
              </footer>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
