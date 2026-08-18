
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { OverlayState } from "./types";
import { validateState } from "./validate";

export const EMPTY_STATE: OverlayState = { schemaVersion: 1, enabled: {}, defaultsApplied: [] };

export interface ReadStateResult {
  state: OverlayState;
  /** A human-readable reason the on-disk file could not be used, if any. */
  error?: string;
  /** Where a corrupt file was moved, if it was quarantined. */
  quarantinedTo?: string;
}

function freshState(): OverlayState {
  return { schemaVersion: 1, enabled: {}, defaultsApplied: [] };
}

export async function readState(path: string): Promise<ReadStateResult> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return { state: freshState() };
    return { state: freshState(), error: `cannot read state: ${message(error)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const quarantinedTo = await quarantine(path);
    return { state: freshState(), error: `state.json is not valid JSON: ${message(error)}`, ...quarantinedTo };
  }

  const validation = validateState(parsed);
  if (!validation.ok) {
    const quarantinedTo = await quarantine(path);
    return { state: freshState(), error: `state.json is invalid: ${validation.errors.join("; ")}`, ...quarantinedTo };
  }
  return { state: validation.value };
}

export async function writeState(path: string, state: OverlayState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(temp, body, { mode: 0o600 });
  await rename(temp, path);
}

async function quarantine(path: string): Promise<{ quarantinedTo?: string }> {
  const target = `${path}.corrupt-${Date.now()}`;
  try {
    await rename(path, target);
    return { quarantinedTo: target };
  } catch {
    return {};
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
