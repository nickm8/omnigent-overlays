
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { OverlayManifest, ValidationResult } from "./types";
import { validateManifest } from "./validate";

export interface OverlaySnapshotAsset {
  bytes: Buffer;
  sha256: string;
}

export interface OverlaySnapshot {
  /** Content-derived id; changes whenever any overlay's routing or bytes change. */
  revision: string;
  manifest: OverlayManifest;
  assets: Map<string, OverlaySnapshotAsset>;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Derive a stable revision from the manifest's routing + artifact hashes. */
export function computeRevision(manifest: OverlayManifest): string {
  const hash = createHash("sha256");
  hash.update(manifest.sourceRevision ?? "");
  for (const overlay of manifest.overlays) {
    hash.update("\0");
    hash.update(
      JSON.stringify([
        overlay.id,
        overlay.version,
        overlay.sha256,
        overlay.hosts,
        overlay.excludeHosts ?? [],
      ]),
    );
  }
  return hash.digest("hex").slice(0, 12);
}

/** Assemble a snapshot from an already-validated manifest and matching assets. */
export function makeSnapshot(manifest: OverlayManifest, assets: Map<string, OverlaySnapshotAsset>): OverlaySnapshot {
  return { revision: computeRevision(manifest), manifest, assets };
}

/**
 * Load and fully verify a registry directory (manifest.json + overlays/*).
 * Fails closed: any invalid manifest, missing artifact, path escape, or hash
 * mismatch rejects the whole candidate.
 */
export async function loadSnapshotFromDir(dir: string): Promise<ValidationResult<OverlaySnapshot>> {
  const root = resolve(dir);
  let manifestText: string;
  try {
    manifestText = await readFile(resolve(root, "manifest.json"), "utf8");
  } catch (error) {
    return { ok: false, errors: [`cannot read manifest.json: ${errorMessage(error)}`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch (error) {
    return { ok: false, errors: [`manifest.json is not valid JSON: ${errorMessage(error)}`] };
  }

  const validation = validateManifest(parsed);
  if (!validation.ok) return validation;
  const manifest = validation.value;

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch (error) {
    return { ok: false, errors: [`cannot resolve registry directory: ${errorMessage(error)}`] };
  }

  const assets = new Map<string, OverlaySnapshotAsset>();
  const errors: string[] = [];
  for (const overlay of manifest.overlays) {
    const full = resolve(root, overlay.entry);
    if (full !== root && !full.startsWith(root + sep)) {
      errors.push(`${overlay.id}: entry escapes the registry directory`);
      continue;
    }
    let real: string;
    try {
      real = await realpath(full);
    } catch (error) {
      errors.push(`${overlay.id}: cannot read ${overlay.entry}: ${errorMessage(error)}`);
      continue;
    }
    if (real !== rootReal && !real.startsWith(rootReal + sep)) {
      errors.push(`${overlay.id}: entry resolves outside the registry directory`);
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(real);
    } catch (error) {
      errors.push(`${overlay.id}: cannot read ${overlay.entry}: ${errorMessage(error)}`);
      continue;
    }
    const sha256 = sha256Hex(bytes);
    if (sha256 !== overlay.sha256) {
      errors.push(`${overlay.id}: sha256 mismatch (manifest ${overlay.sha256}, file ${sha256})`);
      continue;
    }
    assets.set(overlay.id, { bytes, sha256 });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: makeSnapshot(manifest, assets) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
