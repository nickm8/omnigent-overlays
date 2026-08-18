
import { buildBadgeId, scriptVersion } from "./config";

const liveReloadIntervalMs = 2000;
const reloadToastId = "omnigent-reload-toast";

export function ensureBuildBadge(): void {
  if (document.getElementById(buildBadgeId)) return;
  const hash = typeof window.__omnigentOverlaysBuild === "string" ? window.__omnigentOverlaysBuild : "direct";
  const badge = document.createElement("div");
  badge.id = buildBadgeId;
  badge.textContent = `UI v${scriptVersion} · ${hash}`;
  badge.title = "Local Omnigent userscript build";
  badge.style.cssText = [
    "position:fixed", "left:8px", "bottom:8px", "z-index:2147483647",
    "padding:3px 6px", "border:1px solid rgba(127,127,127,.35)", "border-radius:5px",
    "background:rgba(20,20,20,.82)", "color:#d4d4d4", "font:10px/1.2 ui-monospace,monospace",
    "pointer-events:none", "opacity:.78",
  ].join(";");
  document.body.append(badge);
}

function reloadForNewBuild(): void {
  const activeField = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const isEditable =
    activeField &&
    (activeField.tagName === "TEXTAREA" || activeField.tagName === "INPUT" || activeField.isContentEditable);
  const fieldContent = isEditable
    ? activeField.isContentEditable
      ? activeField.textContent
      : (activeField as HTMLInputElement | HTMLTextAreaElement).value
    : "";
  if (activeField && fieldContent && fieldContent.trim()) {
    activeField.addEventListener("blur", () => window.location.reload(), { once: true });
    return;
  }

  if (document.body && !document.getElementById(reloadToastId)) {
    const toast = document.createElement("div");
    toast.id = reloadToastId;
    toast.textContent = "↻ New build — refreshing…";
    toast.style.cssText = [
      "position:fixed", "left:50%", "top:14px", "transform:translateX(-50%)",
      "z-index:2147483647", "padding:7px 14px", "border-radius:999px",
      "background:#141414", "color:#f4f2ec", "opacity:.96",
      "font:12.5px/1.2 ui-sans-serif,system-ui,sans-serif", "box-shadow:0 4px 16px rgba(0,0,0,.32)",
    ].join(";");
    document.body.append(toast);
  }
  window.setTimeout(() => window.location.reload(), 500);
}

export function startLiveReload(): void {
  const baseline = window.__omnigentOverlaysBuild;
  if (typeof baseline !== "string") return;
  let stopped = false;
  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      const response = await fetch(`/_overlays/build?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const build = (await response.text()).trim();
        if (build && build !== baseline) {
          stopped = true;
          reloadForNewBuild();
          return;
        }
      }
    } catch {
    }
    window.setTimeout(poll, liveReloadIntervalMs);
  };
  window.setTimeout(poll, liveReloadIntervalMs);
}
