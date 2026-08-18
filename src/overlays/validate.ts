
import type {
  OverlayManifest,
  OverlayManifestEntry,
  OverlayState,
  ValidationResult,
} from "./types";
import { isValidHostRule } from "./hosts";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A path is safe if it stays under `overlays/` with no traversal or absolute segment. */
export function isSafeRegistryPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  if (!path.startsWith("overlays/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateEntry(input: unknown, index: number, errors: string[]): OverlayManifestEntry | undefined {
  const where = `overlays[${index}]`;
  if (!isRecord(input)) {
    errors.push(`${where}: expected an object`);
    return undefined;
  }
  let ok = true;
  const fail = (message: string): void => {
    ok = false;
    errors.push(`${where}: ${message}`);
  };

  if (!isNonEmptyString(input["id"]) || !ID_PATTERN.test(input["id"])) {
    fail("id must match ^[a-z0-9]+(?:-[a-z0-9]+)*$");
  }
  if (!isNonEmptyString(input["name"])) fail("name must be a non-empty string");
  if (!isNonEmptyString(input["description"])) fail("description must be a non-empty string");
  if (!isNonEmptyString(input["version"]) || !SEMVER_PATTERN.test(input["version"])) {
    fail("version must be valid SemVer");
  }
  if (!isSafeRegistryPath(input["entry"])) fail("entry must be a safe path under overlays/");
  if (typeof input["sha256"] !== "string" || !SHA256_PATTERN.test(input["sha256"])) {
    fail("sha256 must be lowercase hex of length 64");
  }
  if (!isStringArray(input["hosts"]) || input["hosts"].length === 0) {
    fail("hosts must be a non-empty string array");
  } else if (!input["hosts"].every(isValidHostRule)) {
    fail("hosts contains an invalid rule (only *, *.suffix, or exact host)");
  }
  if ("excludeHosts" in input && input["excludeHosts"] !== undefined) {
    if (!isStringArray(input["excludeHosts"]) || !input["excludeHosts"].every(isValidHostRule)) {
      fail("excludeHosts must be host rules");
    }
  }
  if ("tags" in input && input["tags"] !== undefined && !isStringArray(input["tags"])) {
    fail("tags must be a string array");
  }
  if ("screenshot" in input && input["screenshot"] !== undefined && !isSafeRegistryPath(input["screenshot"])) {
    fail("screenshot must be a safe path under overlays/");
  }
  if ("author" in input && input["author"] !== undefined && typeof input["author"] !== "string") {
    fail("author must be a string");
  }
  if (
    "defaultEnabled" in input &&
    input["defaultEnabled"] !== undefined &&
    typeof input["defaultEnabled"] !== "boolean"
  ) {
    fail("defaultEnabled must be a boolean");
  }

  if (!ok) return undefined;

  const entry: OverlayManifestEntry = {
    id: input["id"] as string,
    name: input["name"] as string,
    description: input["description"] as string,
    version: input["version"] as string,
    entry: input["entry"] as string,
    sha256: input["sha256"] as string,
    hosts: [...(input["hosts"] as string[])],
  };
  if (input["excludeHosts"] !== undefined) entry.excludeHosts = [...(input["excludeHosts"] as string[])];
  if (input["tags"] !== undefined) entry.tags = [...(input["tags"] as string[])];
  if (input["screenshot"] !== undefined) entry.screenshot = input["screenshot"] as string;
  if (input["author"] !== undefined) entry.author = input["author"] as string;
  if (input["defaultEnabled"] !== undefined) entry.defaultEnabled = input["defaultEnabled"] as boolean;
  return entry;
}

export function validateManifest(input: unknown): ValidationResult<OverlayManifest> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["manifest must be an object"] };
  if (input["schemaVersion"] !== 1) {
    return { ok: false, errors: [`unsupported schemaVersion: ${JSON.stringify(input["schemaVersion"])}`] };
  }
  if (!Array.isArray(input["overlays"])) {
    return { ok: false, errors: ["overlays must be an array"] };
  }
  if ("generatedAt" in input && input["generatedAt"] !== undefined && typeof input["generatedAt"] !== "string") {
    errors.push("generatedAt must be a string");
  }
  if (
    "sourceRevision" in input &&
    input["sourceRevision"] !== undefined &&
    typeof input["sourceRevision"] !== "string"
  ) {
    errors.push("sourceRevision must be a string");
  }

  const overlays: OverlayManifestEntry[] = [];
  const seen = new Set<string>();
  input["overlays"].forEach((raw, index) => {
    const entry = validateEntry(raw, index, errors);
    if (!entry) return;
    if (seen.has(entry.id)) {
      errors.push(`overlays[${index}]: duplicate id "${entry.id}"`);
      return;
    }
    seen.add(entry.id);
    overlays.push(entry);
  });

  if (errors.length > 0) return { ok: false, errors };

  const manifest: OverlayManifest = { schemaVersion: 1, overlays };
  if (typeof input["generatedAt"] === "string") manifest.generatedAt = input["generatedAt"];
  if (typeof input["sourceRevision"] === "string") manifest.sourceRevision = input["sourceRevision"];
  return { ok: true, value: manifest };
}

export function validateState(input: unknown): ValidationResult<OverlayState> {
  if (!isRecord(input)) return { ok: false, errors: ["state must be an object"] };
  if (input["schemaVersion"] !== 1) {
    return { ok: false, errors: [`unsupported schemaVersion: ${JSON.stringify(input["schemaVersion"])}`] };
  }
  const errors: string[] = [];

  const enabled: Record<string, boolean> = {};
  const rawEnabled = input["enabled"];
  if (rawEnabled === undefined) {
  } else if (!isRecord(rawEnabled)) {
    errors.push("enabled must be an object");
  } else {
    for (const [id, value] of Object.entries(rawEnabled)) {
      if (typeof value !== "boolean") {
        errors.push(`enabled["${id}"] must be a boolean`);
      } else {
        enabled[id] = value;
      }
    }
  }

  let defaultsApplied: string[] = [];
  const rawDefaults = input["defaultsApplied"];
  if (rawDefaults === undefined) {
  } else if (!isStringArray(rawDefaults)) {
    errors.push("defaultsApplied must be a string array");
  } else {
    defaultsApplied = [...rawDefaults];
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: 1, enabled, defaultsApplied } };
}

/**
 * Apply each overlay's manifest default to a missing id exactly once, recording
 * it in `defaultsApplied`. Returns a new state and whether anything changed.
 */
export function applyDefaults(
  manifest: OverlayManifest,
  state: OverlayState,
): { state: OverlayState; changed: boolean } {
  const enabled = { ...state.enabled };
  const defaultsApplied = [...state.defaultsApplied];
  const alreadyApplied = new Set(defaultsApplied);
  let changed = false;
  for (const overlay of manifest.overlays) {
    if (overlay.id in enabled || alreadyApplied.has(overlay.id)) continue;
    enabled[overlay.id] = overlay.defaultEnabled ?? false;
    defaultsApplied.push(overlay.id);
    alreadyApplied.add(overlay.id);
    changed = true;
  }
  return { state: { schemaVersion: 1, enabled, defaultsApplied }, changed };
}
