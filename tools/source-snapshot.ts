
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { OverlaySnapshot, OverlaySnapshotAsset } from "../src/overlays/snapshot";
import { makeSnapshot, sha256Hex } from "../src/overlays/snapshot";
import { overlayManifestFromEntries } from "./overlay-manifest";
import { entries } from "./userscript-entries";

/** Map of overlay id -> committed artifact path, for every registry overlay. */
export function overlayArtifactPaths(repoRoot: string): Map<string, string> {
  const paths = new Map<string, string>();
  for (const entry of entries) {
    if (entry.overlay) paths.set(entry.overlay.id, resolve(repoRoot, entry.output));
  }
  return paths;
}

export async function buildSourceSnapshot(repoRoot: string): Promise<OverlaySnapshot> {
  const artifactPaths = overlayArtifactPaths(repoRoot);
  const bytesById = new Map<string, Buffer>();
  for (const [id, path] of artifactPaths) {
    bytesById.set(id, await readFile(path));
  }

  const manifest = overlayManifestFromEntries(entries, {
    sha256For: (entry) => {
      const bytes = entry.overlay ? bytesById.get(entry.overlay.id) : undefined;
      return bytes ? sha256Hex(bytes) : "";
    },
  });

  const assets = new Map<string, OverlaySnapshotAsset>();
  for (const [id, bytes] of bytesById) {
    assets.set(id, { bytes, sha256: sha256Hex(bytes) });
  }

  return makeSnapshot(manifest, assets);
}
