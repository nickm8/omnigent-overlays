
import type { OverlaySnapshot } from "./snapshot";
import { enabledOverlaysForHost } from "./select";

export const OVERLAY_BOOTSTRAP_PATH = "/_overlays/bootstrap.js";
export const OVERLAY_ASSET_PREFIX = "/_overlays/assets";

export function overlayAssetPath(revision: string, id: string): string {
  return `${OVERLAY_ASSET_PREFIX}/${revision}/${id}.js`;
}

export interface ParsedAssetPath {
  revision: string;
  id: string;
}

export function parseOverlayAssetPath(pathname: string): ParsedAssetPath | undefined {
  const match = /^\/_overlays\/assets\/([0-9a-f]{6,})\/([a-z0-9]+(?:-[a-z0-9]+)*)\.js$/.exec(pathname);
  if (!match) return undefined;
  return { revision: match[1] as string, id: match[2] as string };
}

/** Script srcs for a host: the mandatory bootstrap first, then enabled overlays. */
export function overlayScriptSrcs(
  snapshot: OverlaySnapshot,
  host: string,
  enabled: Record<string, boolean>,
): string[] {
  const overlays = enabledOverlaysForHost(snapshot.manifest, host, enabled).map((id) =>
    overlayAssetPath(snapshot.revision, id),
  );
  return [OVERLAY_BOOTSTRAP_PATH, ...overlays];
}

export interface InjectionConfig {
  /** Local control-API token, delivered to the same-origin page only. */
  token: string;
}

/** The full HTML fragment injected into <head>: build marker + config + tags. */
export function buildInjection(
  snapshot: OverlaySnapshot,
  host: string,
  enabled: Record<string, boolean>,
  config?: InjectionConfig,
): string {
  const buildMarker = `<script>window.__omnigentOverlaysBuild=${JSON.stringify(snapshot.revision)};</script>`;
  const configScript = config
    ? `<script>window.__omnigentOverlays=${JSON.stringify({
        token: config.token,
        revision: snapshot.revision,
        apiBase: "/_overlays",
      })};</script>`
    : "";
  const tags = overlayScriptSrcs(snapshot, host, enabled)
    .map((src) => `<script src="${src}"></script>`)
    .join("");
  return `${buildMarker}${configScript}${tags}`;
}

export function injectIntoHtml(html: string, injection: string): string {
  return /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${injection}</head>`) : `${html}${injection}`;
}
