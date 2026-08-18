
import type { OverlayManifest, OverlayManifestEntry } from "../src/overlays/types";
import type { UserscriptEntry } from "./userscript-entries";

export interface ManifestBuildOptions {
  generatedAt?: string;
  sourceRevision?: string;
  /** Returns the lowercase-hex sha256 of the built artifact for an overlay entry. */
  sha256For: (entry: UserscriptEntry) => string;
}

/** The registry path an overlay's artifact is published to. */
export function overlayEntryPath(id: string): string {
  return `overlays/${id}.user.js`;
}

/** Build (but do not persist) the manifest for every `overlay`-tagged entry. */
export function overlayManifestFromEntries(
  source: readonly UserscriptEntry[],
  options: ManifestBuildOptions,
): OverlayManifest {
  const overlays: OverlayManifestEntry[] = source
    .filter((entry): entry is UserscriptEntry & { overlay: NonNullable<UserscriptEntry["overlay"]> } =>
      entry.overlay !== undefined,
    )
    .map((entry) => {
      const meta = entry.overlay;
      const overlay: OverlayManifestEntry = {
        id: meta.id,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        entry: overlayEntryPath(meta.id),
        sha256: options.sha256For(entry),
        hosts: [...meta.hosts],
      };
      if (meta.excludeHosts !== undefined) overlay.excludeHosts = [...meta.excludeHosts];
      if (meta.tags !== undefined) overlay.tags = [...meta.tags];
      if (meta.author !== undefined) overlay.author = meta.author;
      if (meta.defaultEnabled !== undefined) overlay.defaultEnabled = meta.defaultEnabled;
      return overlay;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const manifest: OverlayManifest = { schemaVersion: 1, overlays };
  if (options.generatedAt !== undefined) manifest.generatedAt = options.generatedAt;
  if (options.sourceRevision !== undefined) manifest.sourceRevision = options.sourceRevision;
  return manifest;
}

/** Serialize a manifest deterministically (stable key order, trailing newline). */
export function serializeManifest(manifest: OverlayManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Overlays whose artifact bytes changed since the published manifest but whose
 * version did not. Publishing these would break the "version changes when bytes
 * change" invariant that lets clients trust `version` for update detection.
 */
export function versionRegressions(
  published: OverlayManifest | undefined,
  next: OverlayManifest,
): Array<{ id: string; version: string }> {
  if (!published) return [];
  const prior = new Map(published.overlays.map((overlay) => [overlay.id, overlay]));
  const offenders: Array<{ id: string; version: string }> = [];
  for (const overlay of next.overlays) {
    const before = prior.get(overlay.id);
    if (before && before.sha256 !== overlay.sha256 && before.version === overlay.version) {
      offenders.push({ id: overlay.id, version: overlay.version });
    }
  }
  return offenders;
}
