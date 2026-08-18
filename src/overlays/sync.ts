
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OverlaySnapshot } from "./snapshot";
import { loadSnapshotFromDir } from "./snapshot";

const execFileAsync = promisify(execFile);

export interface SyncConfig {
  /** Local clone of the registry that has the remote configured. */
  registryDir: string;
  remote?: string;
  branch?: string;
  /** Directory under which per-revision staging trees are materialized. */
  stagingRoot: string;
  timeoutMs?: number;
}

export interface OverlayVersionChange {
  id: string;
  from?: string;
  to?: string;
}

export type SyncOutcome =
  | {
      ok: true;
      snapshot: OverlaySnapshot;
      revision: string;
      previousRevision?: string;
      changed: boolean;
      versionChanges: OverlayVersionChange[];
    }
  | { ok: false; status: number; error: string };

function message(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Overlay version deltas between two snapshots, for the panel's change summary. */
export function diffVersions(previous: OverlaySnapshot | undefined, next: OverlaySnapshot): OverlayVersionChange[] {
  const before = new Map((previous?.manifest.overlays ?? []).map((overlay) => [overlay.id, overlay.version]));
  const after = new Map(next.manifest.overlays.map((overlay) => [overlay.id, overlay.version]));
  const changes: OverlayVersionChange[] = [];
  for (const [id, to] of after) {
    const from = before.get(id);
    if (from !== to) changes.push({ id, ...(from !== undefined ? { from } : {}), to });
  }
  for (const [id, from] of before) {
    if (!after.has(id)) changes.push({ id, from });
  }
  return changes;
}

/**
 * Fetch the configured remote/branch, materialize that commit, validate it, and
 * return the resulting snapshot for atomic activation. Does not mutate any
 * active state itself — the caller swaps the snapshot pointer on success.
 */
export async function syncRegistry(config: SyncConfig, previous?: OverlaySnapshot): Promise<SyncOutcome> {
  const remote = config.remote ?? "origin";
  const branch = config.branch ?? "main";
  const timeout = config.timeoutMs ?? 30_000;
  const git = (args: string[]): Promise<{ stdout: string }> =>
    execFileAsync("git", ["-C", config.registryDir, ...args], { timeout, maxBuffer: 16 * 1024 * 1024 });

  try {
    await git(["fetch", "--no-tags", "--depth=1", remote, branch]);
  } catch (error) {
    return { ok: false, status: 502, error: `fetch failed: ${message(error)}` };
  }

  let sha: string;
  try {
    sha = (await git(["rev-parse", "FETCH_HEAD"])).stdout.trim();
  } catch (error) {
    return { ok: false, status: 502, error: `could not resolve fetched commit: ${message(error)}` };
  }
  if (!/^[0-9a-f]{7,64}$/.test(sha)) {
    return { ok: false, status: 502, error: `unexpected commit id: ${sha}` };
  }

  const dest = join(config.stagingRoot, sha);
  const tarPath = join(config.stagingRoot, `${sha}.tar`);
  try {
    await mkdir(config.stagingRoot, { recursive: true });
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    await git(["archive", "--format=tar", "-o", tarPath, "FETCH_HEAD"]);
    await execFileAsync("tar", ["-xf", tarPath, "-C", dest], { timeout });
  } catch (error) {
    await rm(tarPath, { force: true }).catch(() => undefined);
    return { ok: false, status: 500, error: `could not materialize registry: ${message(error)}` };
  } finally {
    await rm(tarPath, { force: true }).catch(() => undefined);
  }

  const loaded = await loadSnapshotFromDir(dest);
  if (!loaded.ok) {
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, status: 422, error: `registry validation failed: ${loaded.errors.join("; ")}` };
  }

  await rm(dest, { recursive: true, force: true }).catch(() => undefined);

  const snapshot = loaded.value;
  return {
    ok: true,
    snapshot,
    revision: snapshot.revision,
    ...(previous?.revision !== undefined ? { previousRevision: previous.revision } : {}),
    changed: previous?.revision !== snapshot.revision,
    versionChanges: diffVersions(previous, snapshot),
  };
}
