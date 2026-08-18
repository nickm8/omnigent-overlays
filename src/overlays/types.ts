
export interface OverlayManifestEntry {
  /** Immutable slug, unique per manifest. Matches ^[a-z0-9]+(?:-[a-z0-9]+)*$. */
  id: string;
  /** Display name shown in the panel. */
  name: string;
  /** One-line description shown in the panel. */
  description: string;
  /** Valid SemVer. Must change whenever the artifact bytes change. */
  version: string;
  /** POSIX path under `overlays/` in the registry; no `..`, not absolute. */
  entry: string;
  /** Lowercase hex sha256 of the artifact bytes at `entry`. */
  sha256: string;
  /** Allow-list of host rules (`*`, `*.suffix`, or an exact hostname). */
  hosts: string[];
  /** Optional deny-list, same matcher as `hosts`; a match here suppresses injection. */
  excludeHosts?: string[];
  tags?: string[];
  /** Optional screenshot path, same path-safety rules as `entry`. */
  screenshot?: string;
  author?: string;
  /** Whether a fresh machine enables this overlay on first sync. */
  defaultEnabled?: boolean;
}

export interface OverlayManifest {
  schemaVersion: 1;
  /** ISO-8601 timestamp the manifest was generated. */
  generatedAt?: string;
  /** git sha of the source revision the artifacts were built from. */
  sourceRevision?: string;
  overlays: OverlayManifestEntry[];
}

export interface OverlayState {
  schemaVersion: 1;
  /** User intent per overlay id. Absent id => fall back to manifest default once. */
  enabled: Record<string, boolean>;
  /** Ids whose manifest default has already been applied (so a later default
   *  change cannot silently override a user's explicit choice). */
  defaultsApplied: string[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
