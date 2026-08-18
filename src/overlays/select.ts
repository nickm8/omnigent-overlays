
import type { OverlayManifest } from "./types";
import { hostMatchesAny } from "./hosts";

/** True if an overlay's host rules admit `host` and its excludeHosts don't veto it. */
export function overlayMatchesHost(
  overlay: OverlayManifest["overlays"][number],
  host: string,
): boolean {
  if (!hostMatchesAny(host, overlay.hosts)) return false;
  if (overlay.excludeHosts && hostMatchesAny(host, overlay.excludeHosts)) return false;
  return true;
}

/** Ids of every overlay whose routing matches `host`, in manifest order. */
export function overlaysForHost(manifest: OverlayManifest, host: string): string[] {
  return manifest.overlays.filter((overlay) => overlayMatchesHost(overlay, host)).map((overlay) => overlay.id);
}

/** Ids of overlays that both match `host` and are enabled in `enabled`. */
export function enabledOverlaysForHost(
  manifest: OverlayManifest,
  host: string,
  enabled: Record<string, boolean>,
): string[] {
  return overlaysForHost(manifest, host).filter((id) => enabled[id] === true);
}
