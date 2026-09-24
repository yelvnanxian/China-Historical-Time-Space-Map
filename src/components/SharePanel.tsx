import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

export default function SharePanel({ url }: { url: string }) {
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(url).hostname,
  );
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <>
      <span className="section-kicker">A PLACE, A MOMENT, A LINK</span>
      <h2>分享此刻的山河。</h2>
      <p className="dialog-intro">
        链接保存当前专题、事件、地点与地名显示方式。重新打开链接，会从你正在看的位置开始探索。
      </p>
      {isLocal && (
        <p className="share-local-note">
          当前为本机预览链接，跨设备访问需先部署。
        </p>
      )}
      <label className="share-url-label" htmlFor="share-url">
        <Link2 size={14} />
        当前探索链接
      </label>
      <textarea
        id="share-url"
        className="share-url"
        value={url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <button className="primary-button" onClick={copy}>
        {status === "copied" ? <Check size={15} /> : <Copy size={15} />}{" "}
        {status === "copied" ? "链接已复制" : "复制链接"}
      </button>
      <p className={`share-status ${status}`} role="status">
        {status === "failed"
          ? "浏览器未允许自动复制。请选中上方链接，使用复制快捷键。"
          : status === "copied"
            ? "已复制到剪贴板，可以粘贴分享。"
            : "也可以直接选中上方链接复制。"}
      </p>
    </>
  );
}
