// GENERATED from src/proxies/proxy.ts by tools/build-userscripts.ts — edit the source, then npm run build.
// src/proxies/proxy.ts
import http from "node:http";
import { homedir } from "node:os";
import { dirname as dirname3, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy-3";

// src/proxies/shared.ts
function rewriteBrowserUrl(value, browserOrigin2, upstreamOrigin2) {
  try {
    const parsed = new URL(value);
    if (parsed.origin === browserOrigin2) {
      return `${upstreamOrigin2}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
  }
  return value;
}
function upstreamHeaders(request, upstreamHost, browserOrigin2, upstreamOrigin2) {
  const headers = { ...request.headers };
  headers.host = upstreamHost;
  headers["accept-encoding"] = "identity";
  if (typeof headers.origin === "string") {
    headers.origin = rewriteBrowserUrl(headers.origin, browserOrigin2, upstreamOrigin2);
  }
  if (typeof headers.referer === "string") {
    headers.referer = rewriteBrowserUrl(headers.referer, browserOrigin2, upstreamOrigin2);
  }
  return headers;
}
function isHtml(response) {
  return (response.headers["content-type"] || "").toLowerCase().includes("text/html");
}
function sendTransformedResponse(proxyResponse, response, transform, headerOverrides = {}) {
  const chunks = [];
  proxyResponse.on("data", (chunk) => chunks.push(chunk));
  proxyResponse.on("error", () => response.destroy());
  proxyResponse.on("end", () => {
    const headers = { ...proxyResponse.headers };
    delete headers["content-length"];
    delete headers["content-encoding"];
    delete headers["etag"];
    delete headers["last-modified"];
    delete headers["transfer-encoding"];
    Object.assign(headers, headerOverrides);
    const body = Buffer.from(transform(Buffer.concat(chunks).toString("utf8")));
    headers["content-length"] = String(body.length);
    response.writeHead(proxyResponse.statusCode || 200, headers);
    response.end(body);
  });
}
function installUpstreamErrorHandler(proxy2, message3) {
  proxy2.on("error", (error, _request, response) => {
    console.error("Upstream proxy error:", error.message);
    if (response && "writeHead" in response && !response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end(message3);
    } else {
      response?.destroy();
    }
  });
}
function installShutdownHandlers(proxy2, server2) {
  const shutdown = () => {
    proxy2.close();
    server2.close(() => process.exit(0));
    server2.closeAllConnections?.();
    setTimeout(() => process.exit(0), 250).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
async function readBody(request, limit = 8192) {
  return new Promise((resolveBody) => {
    let data = "";
    let size = 0;
    let aborted = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        aborted = true;
        request.destroy();
        resolveBody("");
        return;
      }
      data += chunk.toString("utf8");
    });
    request.on("end", () => {
      if (!aborted) resolveBody(data);
    });
    request.on("error", () => resolveBody(""));
  });
}
function createMutationSerializer() {
  let chain = Promise.resolve();
  return (task) => {
    const run = chain.then(task, task);
    chain = run.then(
      () => void 0,
      () => void 0
    );
    return run;
  };
}

// src/proxies/proxy.ts
import { readFile as readFile5 } from "node:fs/promises";

// src/overlays/snapshot.ts
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

// src/overlays/hosts.ts
function normalizeHost(host) {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith("[")) return lower.replace(/\]:\d+$/, "]");
  return lower.replace(/:\d+$/, "");
}
function isValidHostRule(rule) {
  if (typeof rule !== "string" || rule.length === 0) return false;
  if (rule === "*") return true;
  if (rule.startsWith("*.")) {
    const suffix = rule.slice(2);
    return suffix.length > 0 && !suffix.includes("*");
  }
  return !rule.includes("*");
}
function hostMatchesRule(host, rule) {
  const normalized = normalizeHost(host);
  if (rule === "*") return true;
  if (rule.startsWith("*.")) {
    const dotSuffix = rule.slice(1);
    return normalized.endsWith(dotSuffix) && normalized.length > dotSuffix.length;
  }
  return normalized === rule.toLowerCase();
}
function hostMatchesAny(host, rules) {
  return rules.some((rule) => hostMatchesRule(host, rule));
}

// src/overlays/validate.ts
var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var SHA256_PATTERN = /^[0-9a-f]{64}$/;
var SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function isSafeRegistryPath(path) {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  if (!path.startsWith("overlays/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function validateEntry(input, index, errors) {
  const where = `overlays[${index}]`;
  if (!isRecord(input)) {
    errors.push(`${where}: expected an object`);
    return void 0;
  }
  let ok = true;
  const fail = (message3) => {
    ok = false;
    errors.push(`${where}: ${message3}`);
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
  if ("excludeHosts" in input && input["excludeHosts"] !== void 0) {
    if (!isStringArray(input["excludeHosts"]) || !input["excludeHosts"].every(isValidHostRule)) {
      fail("excludeHosts must be host rules");
    }
  }
  if ("tags" in input && input["tags"] !== void 0 && !isStringArray(input["tags"])) {
    fail("tags must be a string array");
  }
  if ("screenshot" in input && input["screenshot"] !== void 0 && !isSafeRegistryPath(input["screenshot"])) {
    fail("screenshot must be a safe path under overlays/");
  }
  if ("author" in input && input["author"] !== void 0 && typeof input["author"] !== "string") {
    fail("author must be a string");
  }
  if ("defaultEnabled" in input && input["defaultEnabled"] !== void 0 && typeof input["defaultEnabled"] !== "boolean") {
    fail("defaultEnabled must be a boolean");
  }
  if (!ok) return void 0;
  const entry = {
    id: input["id"],
    name: input["name"],
    description: input["description"],
    version: input["version"],
    entry: input["entry"],
    sha256: input["sha256"],
    hosts: [...input["hosts"]]
  };
  if (input["excludeHosts"] !== void 0) entry.excludeHosts = [...input["excludeHosts"]];
  if (input["tags"] !== void 0) entry.tags = [...input["tags"]];
  if (input["screenshot"] !== void 0) entry.screenshot = input["screenshot"];
  if (input["author"] !== void 0) entry.author = input["author"];
  if (input["defaultEnabled"] !== void 0) entry.defaultEnabled = input["defaultEnabled"];
  return entry;
}
function validateManifest(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ["manifest must be an object"] };
  if (input["schemaVersion"] !== 1) {
    return { ok: false, errors: [`unsupported schemaVersion: ${JSON.stringify(input["schemaVersion"])}`] };
  }
  if (!Array.isArray(input["overlays"])) {
    return { ok: false, errors: ["overlays must be an array"] };
  }
  if ("generatedAt" in input && input["generatedAt"] !== void 0 && typeof input["generatedAt"] !== "string") {
    errors.push("generatedAt must be a string");
  }
  if ("sourceRevision" in input && input["sourceRevision"] !== void 0 && typeof input["sourceRevision"] !== "string") {
    errors.push("sourceRevision must be a string");
  }
  const overlays = [];
  const seen = /* @__PURE__ */ new Set();
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
  const manifest = { schemaVersion: 1, overlays };
  if (typeof input["generatedAt"] === "string") manifest.generatedAt = input["generatedAt"];
  if (typeof input["sourceRevision"] === "string") manifest.sourceRevision = input["sourceRevision"];
  return { ok: true, value: manifest };
}
function validateState(input) {
  if (!isRecord(input)) return { ok: false, errors: ["state must be an object"] };
  if (input["schemaVersion"] !== 1) {
    return { ok: false, errors: [`unsupported schemaVersion: ${JSON.stringify(input["schemaVersion"])}`] };
  }
  const errors = [];
  const enabled = {};
  const rawEnabled = input["enabled"];
  if (rawEnabled === void 0) {
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
  let defaultsApplied = [];
  const rawDefaults = input["defaultsApplied"];
  if (rawDefaults === void 0) {
  } else if (!isStringArray(rawDefaults)) {
    errors.push("defaultsApplied must be a string array");
  } else {
    defaultsApplied = [...rawDefaults];
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: 1, enabled, defaultsApplied } };
}
function applyDefaults(manifest, state) {
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

// src/overlays/snapshot.ts
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function computeRevision(manifest) {
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
        overlay.excludeHosts ?? []
      ])
    );
  }
  return hash.digest("hex").slice(0, 12);
}
function makeSnapshot(manifest, assets) {
  return { revision: computeRevision(manifest), manifest, assets };
}
async function loadSnapshotFromDir(dir) {
  const root = resolve(dir);
  let manifestText;
  try {
    manifestText = await readFile(resolve(root, "manifest.json"), "utf8");
  } catch (error) {
    return { ok: false, errors: [`cannot read manifest.json: ${errorMessage(error)}`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(manifestText);
  } catch (error) {
    return { ok: false, errors: [`manifest.json is not valid JSON: ${errorMessage(error)}`] };
  }
  const validation = validateManifest(parsed);
  if (!validation.ok) return validation;
  const manifest = validation.value;
  let rootReal;
  try {
    rootReal = await realpath(root);
  } catch (error) {
    return { ok: false, errors: [`cannot resolve registry directory: ${errorMessage(error)}`] };
  }
  const assets = /* @__PURE__ */ new Map();
  const errors = [];
  for (const overlay of manifest.overlays) {
    const full = resolve(root, overlay.entry);
    if (full !== root && !full.startsWith(root + sep)) {
      errors.push(`${overlay.id}: entry escapes the registry directory`);
      continue;
    }
    let real;
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
    let bytes;
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
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/overlays/snapshot-holder.ts
var SnapshotHolder = class {
  constructor(keep = 4) {
    this.keep = keep;
  }
  byRevision = /* @__PURE__ */ new Map();
  order = [];
  currentRevision;
  /** Activate a snapshot for new page loads; returns it for convenience. */
  set(snapshot) {
    this.byRevision.set(snapshot.revision, snapshot);
    this.order = this.order.filter((revision) => revision !== snapshot.revision);
    this.order.push(snapshot.revision);
    this.currentRevision = snapshot.revision;
    while (this.order.length > this.keep) {
      const oldest = this.order[0];
      if (oldest === this.currentRevision) break;
      this.order.shift();
      this.byRevision.delete(oldest);
    }
    return snapshot;
  }
  current() {
    return this.currentRevision ? this.byRevision.get(this.currentRevision) : void 0;
  }
  get(revision) {
    return this.byRevision.get(revision);
  }
};

// src/overlays/state-store.ts
import { mkdir, readFile as readFile2, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function freshState() {
  return { schemaVersion: 1, enabled: {}, defaultsApplied: [] };
}
async function readState(path) {
  let text;
  try {
    text = await readFile2(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return { state: freshState() };
    return { state: freshState(), error: `cannot read state: ${message(error)}` };
  }
  let parsed;
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
async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(state, null, 2)}
`;
  await writeFile(temp, body, { mode: 384 });
  await rename(temp, path);
}
async function quarantine(path) {
  const target = `${path}.corrupt-${Date.now()}`;
  try {
    await rename(path, target);
    return { quarantinedTo: target };
  } catch {
    return {};
  }
}
function isNotFound(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/overlays/select.ts
function overlayMatchesHost(overlay, host) {
  if (!hostMatchesAny(host, overlay.hosts)) return false;
  if (overlay.excludeHosts && hostMatchesAny(host, overlay.excludeHosts)) return false;
  return true;
}
function overlaysForHost(manifest, host) {
  return manifest.overlays.filter((overlay) => overlayMatchesHost(overlay, host)).map((overlay) => overlay.id);
}
function enabledOverlaysForHost(manifest, host, enabled) {
  return overlaysForHost(manifest, host).filter((id) => enabled[id] === true);
}

// src/overlays/inject.ts
var OVERLAY_BOOTSTRAP_PATH = "/_overlays/bootstrap.js";
var OVERLAY_ASSET_PREFIX = "/_overlays/assets";
function overlayAssetPath(revision, id) {
  return `${OVERLAY_ASSET_PREFIX}/${revision}/${id}.js`;
}
function parseOverlayAssetPath(pathname) {
  const match = /^\/_overlays\/assets\/([0-9a-f]{6,})\/([a-z0-9]+(?:-[a-z0-9]+)*)\.js$/.exec(pathname);
  if (!match) return void 0;
  return { revision: match[1], id: match[2] };
}
function overlayScriptSrcs(snapshot, host, enabled) {
  const overlays = enabledOverlaysForHost(snapshot.manifest, host, enabled).map(
    (id) => overlayAssetPath(snapshot.revision, id)
  );
  return [OVERLAY_BOOTSTRAP_PATH, ...overlays];
}
function buildInjection(snapshot, host, enabled, config) {
  const buildMarker = `<script>window.__omnigentOverlaysBuild=${JSON.stringify(snapshot.revision)};</script>`;
  const configScript = config ? `<script>window.__omnigentOverlays=${JSON.stringify({
    token: config.token,
    revision: snapshot.revision,
    apiBase: "/_overlays"
  })};</script>` : "";
  const tags = overlayScriptSrcs(snapshot, host, enabled).map((src) => `<script src="${src}"></script>`).join("");
  return `${buildMarker}${configScript}${tags}`;
}
function injectIntoHtml(html, injection) {
  return /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${injection}</head>`) : `${html}${injection}`;
}

// src/overlays/control-token.ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile3, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
async function readOrCreateToken(path) {
  try {
    const existing = (await readFile3(path, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
  }
  const token = randomBytes(32).toString("hex");
  await mkdir2(dirname2(path), { recursive: true, mode: 448 });
  await writeFile2(path, `${token}
`, { mode: 384 });
  return token;
}
function tokensMatch(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// src/overlays/control-constants.ts
var CONTROL_PREFIX = "/_overlays";
var TOKEN_HEADER = "x-omnigent-overlays-token";

// src/overlays/control-api.ts
var MAX_BODY_BYTES = 4096;
function headerValue(headers, name) {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}
function isSameOrigin(request) {
  const origin = headerValue(request.headers, "origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === headerValue(request.headers, "host");
  } catch {
    return false;
  }
}
function authorize(request, deps) {
  const site = headerValue(request.headers, "sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return { status: 403, body: { error: "cross-site request rejected" } };
  }
  if (!isSameOrigin(request)) {
    return { status: 403, body: { error: "cross-origin request rejected" } };
  }
  const token = headerValue(request.headers, TOKEN_HEADER);
  if (!token || !tokensMatch(token, deps.token)) {
    return { status: 401, body: { error: "missing or invalid control token" } };
  }
  return void 0;
}
function parseStateIdPath(pathname) {
  const match = /^\/_overlays\/state\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname);
  return match ? match[1] : void 0;
}
async function handleControlRequest(request, deps) {
  const { method, pathname } = request;
  if (pathname === `${CONTROL_PREFIX}/state` && method === "GET") {
    const denied = authorize(request, deps);
    if (denied) return denied;
    return { status: 200, body: await deps.getStateView() };
  }
  const id = parseStateIdPath(pathname);
  if (id !== void 0 && method === "PUT") {
    const denied = authorize(request, deps);
    if (denied) return denied;
    if (request.body.length > MAX_BODY_BYTES) {
      return { status: 413, body: { error: "request body too large" } };
    }
    let parsed;
    try {
      parsed = JSON.parse(request.body || "{}");
    } catch {
      return { status: 400, body: { error: "body must be JSON" } };
    }
    if (typeof parsed !== "object" || parsed === null || typeof parsed.enabled !== "boolean") {
      return { status: 400, body: { error: "body must be { enabled: boolean }" } };
    }
    const enabled = parsed.enabled;
    const result = await deps.setEnabled(id, enabled);
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return { status: 200, body: { id, enabled } };
  }
  if (pathname === `${CONTROL_PREFIX}/sync` && method === "POST") {
    const denied = authorize(request, deps);
    if (denied) return denied;
    const result = await deps.sync();
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return { status: 200, body: { activeRevision: result.activeRevision, changed: result.changed } };
  }
  if (pathname === `${CONTROL_PREFIX}/state` || id !== void 0 || pathname === `${CONTROL_PREFIX}/sync`) {
    return { status: 405, body: { error: "method not allowed" } };
  }
  return void 0;
}

// src/overlays/sync.ts
import { execFile } from "node:child_process";
import { mkdir as mkdir3, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
function message2(error) {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String(error.stderr ?? "").trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}
function diffVersions(previous, next) {
  const before = new Map((previous?.manifest.overlays ?? []).map((overlay) => [overlay.id, overlay.version]));
  const after = new Map(next.manifest.overlays.map((overlay) => [overlay.id, overlay.version]));
  const changes = [];
  for (const [id, to] of after) {
    const from = before.get(id);
    if (from !== to) changes.push({ id, ...from !== void 0 ? { from } : {}, to });
  }
  for (const [id, from] of before) {
    if (!after.has(id)) changes.push({ id, from });
  }
  return changes;
}
async function syncRegistry(config, previous) {
  const remote = config.remote ?? "origin";
  const branch = config.branch ?? "main";
  const timeout = config.timeoutMs ?? 3e4;
  const git = (args) => execFileAsync("git", ["-C", config.registryDir, ...args], { timeout, maxBuffer: 16 * 1024 * 1024 });
  try {
    await git(["fetch", "--no-tags", "--depth=1", remote, branch]);
  } catch (error) {
    return { ok: false, status: 502, error: `fetch failed: ${message2(error)}` };
  }
  let sha;
  try {
    sha = (await git(["rev-parse", "FETCH_HEAD"])).stdout.trim();
  } catch (error) {
    return { ok: false, status: 502, error: `could not resolve fetched commit: ${message2(error)}` };
  }
  if (!/^[0-9a-f]{7,64}$/.test(sha)) {
    return { ok: false, status: 502, error: `unexpected commit id: ${sha}` };
  }
  const dest = join(config.stagingRoot, sha);
  const tarPath = join(config.stagingRoot, `${sha}.tar`);
  try {
    await mkdir3(config.stagingRoot, { recursive: true });
    await rm(dest, { recursive: true, force: true });
    await mkdir3(dest, { recursive: true });
    await git(["archive", "--format=tar", "-o", tarPath, "FETCH_HEAD"]);
    await execFileAsync("tar", ["-xf", tarPath, "-C", dest], { timeout });
  } catch (error) {
    await rm(tarPath, { force: true }).catch(() => void 0);
    return { ok: false, status: 500, error: `could not materialize registry: ${message2(error)}` };
  } finally {
    await rm(tarPath, { force: true }).catch(() => void 0);
  }
  const loaded = await loadSnapshotFromDir(dest);
  if (!loaded.ok) {
    await rm(dest, { recursive: true, force: true }).catch(() => void 0);
    return { ok: false, status: 422, error: `registry validation failed: ${loaded.errors.join("; ")}` };
  }
  await rm(dest, { recursive: true, force: true }).catch(() => void 0);
  const snapshot = loaded.value;
  return {
    ok: true,
    snapshot,
    revision: snapshot.revision,
    ...previous?.revision !== void 0 ? { previousRevision: previous.revision } : {},
    changed: previous?.revision !== snapshot.revision,
    versionChanges: diffVersions(previous, snapshot)
  };
}

// tools/source-snapshot.ts
import { readFile as readFile4 } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";

// tools/overlay-manifest.ts
function overlayEntryPath(id) {
  return `overlays/${id}.user.js`;
}
function overlayManifestFromEntries(source, options) {
  const overlays = source.filter(
    (entry) => entry.overlay !== void 0
  ).map((entry) => {
    const meta = entry.overlay;
    const overlay = {
      id: meta.id,
      name: entry.name,
      description: entry.description,
      version: entry.version,
      entry: overlayEntryPath(meta.id),
      sha256: options.sha256For(entry),
      hosts: [...meta.hosts]
    };
    if (meta.excludeHosts !== void 0) overlay.excludeHosts = [...meta.excludeHosts];
    if (meta.tags !== void 0) overlay.tags = [...meta.tags];
    if (meta.author !== void 0) overlay.author = meta.author;
    if (meta.defaultEnabled !== void 0) overlay.defaultEnabled = meta.defaultEnabled;
    return overlay;
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const manifest = { schemaVersion: 1, overlays };
  if (options.generatedAt !== void 0) manifest.generatedAt = options.generatedAt;
  if (options.sourceRevision !== void 0) manifest.sourceRevision = options.sourceRevision;
  return manifest;
}

// tools/userscript-entries.ts
var entries = [
  {
    source: "src/scripts/pinned-chats/index.ts",
    output: "userscripts/omnigent-pinned-chats.user.js",
    name: "Omnigent Pinned Chats",
    version: "0.11.0",
    description: "Managed pinned Omnigent chats.",
    overlay: {
      id: "pinned-chats",
      hosts: ["*"],
      tags: ["sidebar", "workspace", "productivity"],
      author: "dev",
      defaultEnabled: true
    }
  },
  {
    source: "src/scripts/project-focus.ts",
    output: "userscripts/omnigent-project-focus.user.js",
    name: "Omnigent Project Focus",
    version: "0.2.2",
    description: "Allows for filtering the sidebar's Projects list to a subset you want to focus on.",
    overlay: {
      id: "project-focus",
      hosts: ["localhost", "127.0.0.1"],
      tags: ["sidebar", "projects", "declutter", "productivity"],
      author: "dev",
      defaultEnabled: true
    }
  },
  {
    source: "src/scripts/palette-swapper.ts",
    output: "userscripts/omnigent-palette-swapper.user.js",
    name: "Omnigent Palette Swapper",
    version: "0.1.2",
    description: "Switcher for the app's colour palette",
    overlay: {
      id: "palette-swapper",
      hosts: ["*"],
      tags: ["theme", "appearance", "productivity"],
      author: "dev",
      defaultEnabled: true
    }
  }
];

// tools/source-snapshot.ts
function overlayArtifactPaths(repoRoot2) {
  const paths = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.overlay) paths.set(entry.overlay.id, resolve2(repoRoot2, entry.output));
  }
  return paths;
}
async function buildSourceSnapshot(repoRoot2) {
  const artifactPaths = overlayArtifactPaths(repoRoot2);
  const bytesById = /* @__PURE__ */ new Map();
  for (const [id, path] of artifactPaths) {
    bytesById.set(id, await readFile4(path));
  }
  const manifest = overlayManifestFromEntries(entries, {
    sha256For: (entry) => {
      const bytes = entry.overlay ? bytesById.get(entry.overlay.id) : void 0;
      return bytes ? sha256Hex(bytes) : "";
    }
  });
  const assets = /* @__PURE__ */ new Map();
  for (const [id, bytes] of bytesById) {
    assets.set(id, { bytes, sha256: sha256Hex(bytes) });
  }
  return makeSnapshot(manifest, assets);
}

// src/proxies/proxy.ts
var listenHost = process.env["OMNIGENT_PROXY_HOST"] || "127.0.0.1";
var listenPort = Number(process.env["OMNIGENT_PROXY_PORT"] || "6768");
var upstreamUrl = new URL(process.env["OMNIGENT_UPSTREAM_URL"] || "http://127.0.0.1:6767");
var upstreamOrigin = upstreamUrl.origin;
var repoRoot = process.env["OMNIGENT_USERSCRIPTS_ROOT"] ? resolve3(process.env["OMNIGENT_USERSCRIPTS_ROOT"]) : resolve3(dirname3(fileURLToPath(import.meta.url)), "..");
var registryDir = process.env["OMNIGENT_OVERLAY_REGISTRY_DIR"];
var registryRemote = process.env["OMNIGENT_OVERLAY_REMOTE"] || "origin";
var registryBranch = process.env["OMNIGENT_OVERLAY_BRANCH"] || "main";
var stateDir = process.env["OMNIGENT_OVERLAY_STATE"] ? dirname3(resolve3(process.env["OMNIGENT_OVERLAY_STATE"])) : resolve3(homedir(), ".omnigent-overlays");
var statePath = process.env["OMNIGENT_OVERLAY_STATE"] || resolve3(stateDir, "state.json");
var tokenPath = resolve3(stateDir, "control-token");
var stagingRoot = resolve3(stateDir, "snapshots");
var bootstrapAssetPath = resolve3(repoRoot, "assets", "overlays-bootstrap.js");
var controlToken = "";
var syncInProgress = false;
var buildPath = "/_overlays/build";
var snapshots = new SnapshotHolder();
var pendingInjection = /* @__PURE__ */ new WeakMap();
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
async function loadRegistrySnapshotOnDisk() {
  if (!registryDir) return void 0;
  const loaded = await loadSnapshotFromDir(registryDir);
  if (loaded.ok && loaded.value.manifest.overlays.length > 0) return loaded.value;
  if (!loaded.ok) {
    console.error(`Overlay registry at ${registryDir} is invalid: ${loaded.errors.join("; ")}`);
  }
  return void 0;
}
async function getServingSnapshot() {
  if (!registryDir) {
    try {
      return snapshots.set(await buildSourceSnapshot(repoRoot));
    } catch (error) {
      console.error("Source snapshot build failed; keeping last-good:", errorMessage2(error));
      return snapshots.current();
    }
  }
  const current = snapshots.current();
  if (current) return current;
  const onDisk = await loadRegistrySnapshotOnDisk();
  if (onDisk) return snapshots.set(onDisk);
  try {
    console.error("Registry snapshot unavailable; falling back to source artifacts.");
    return snapshots.set(await buildSourceSnapshot(repoRoot));
  } catch (error) {
    console.error("No overlay snapshot could be loaded:", errorMessage2(error));
    return snapshots.current();
  }
}
async function stateWithDefaults(snapshot) {
  const read = await readState(statePath);
  if (read.error) {
    const moved = read.quarantinedTo ? ` (quarantined to ${read.quarantinedTo})` : "";
    console.error(`Overlay state unusable, falling back to defaults: ${read.error}${moved}`);
  }
  const applied = applyDefaults(snapshot.manifest, read.state);
  if (!applied.changed) {
    return read.error !== void 0 ? { state: applied.state, error: read.error } : { state: applied.state };
  }
  const persisted = await serialize(async () => {
    const fresh = await readState(statePath);
    const reapplied = applyDefaults(snapshot.manifest, fresh.state);
    if (reapplied.changed) {
      try {
        await writeState(statePath, reapplied.state);
      } catch (error) {
        console.error("Could not persist overlay defaults:", errorMessage2(error));
      }
    }
    return reapplied.state;
  });
  return read.error !== void 0 ? { state: persisted, error: read.error } : { state: persisted };
}
async function effectiveEnabled(snapshot) {
  return (await stateWithDefaults(snapshot)).state.enabled;
}
function serveJavaScript(response, body) {
  response.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}
function serveNotFound(response, message3) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(message3);
}
function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}
var serialize = createMutationSerializer();
async function buildStateView() {
  const snapshot = await getServingSnapshot();
  if (!snapshot) return { activeRevision: "", overlays: [], stateError: "no overlay snapshot available" };
  const { state, error } = await stateWithDefaults(snapshot);
  const overlays = snapshot.manifest.overlays.map((overlay) => ({
    id: overlay.id,
    name: overlay.name,
    description: overlay.description,
    version: overlay.version,
    ...overlay.author !== void 0 ? { author: overlay.author } : {},
    ...overlay.tags !== void 0 ? { tags: overlay.tags } : {},
    hosts: overlay.hosts,
    ...overlay.excludeHosts !== void 0 ? { excludeHosts: overlay.excludeHosts } : {},
    enabled: state.enabled[overlay.id] === true
  }));
  return { activeRevision: snapshot.revision, overlays, stateError: error ?? null };
}
var controlDeps = {
  get token() {
    return controlToken;
  },
  getStateView: buildStateView,
  setEnabled: (id, enabled) => serialize(async () => {
    const snapshot = await getServingSnapshot();
    if (!snapshot || !snapshot.manifest.overlays.some((overlay) => overlay.id === id)) {
      return { ok: false, status: 404, error: `unknown overlay: ${id}` };
    }
    const read = await readState(statePath);
    const applied = applyDefaults(snapshot.manifest, read.state);
    const next = {
      schemaVersion: 1,
      enabled: { ...applied.state.enabled, [id]: enabled },
      defaultsApplied: applied.state.defaultsApplied.includes(id) ? applied.state.defaultsApplied : [...applied.state.defaultsApplied, id]
    };
    await writeState(statePath, next);
    return { ok: true };
  }),
  sync: async () => {
    if (!registryDir) {
      const before = snapshots.current()?.revision;
      try {
        const snapshot = snapshots.set(await buildSourceSnapshot(repoRoot));
        return { ok: true, activeRevision: snapshot.revision, changed: before !== snapshot.revision };
      } catch (error) {
        return { ok: false, status: 503, error: `source rebuild failed: ${errorMessage2(error)}` };
      }
    }
    if (syncInProgress) return { ok: false, status: 409, error: "a sync is already running" };
    syncInProgress = true;
    try {
      const outcome = await syncRegistry(
        { registryDir, remote: registryRemote, branch: registryBranch, stagingRoot },
        snapshots.current()
      );
      if (!outcome.ok) return { ok: false, status: outcome.status, error: outcome.error };
      snapshots.set(outcome.snapshot);
      if (outcome.versionChanges.length > 0) {
        console.log(
          `Synced registry ${outcome.revision}: ` + outcome.versionChanges.map((change) => `${change.id} ${change.from ?? "∅"}→${change.to ?? "∅"}`).join(", ")
        );
      }
      return { ok: true, activeRevision: outcome.revision, changed: outcome.changed };
    } finally {
      syncInProgress = false;
    }
  }
};
async function serveBootstrap(response) {
  try {
    serveJavaScript(response, await readFile5(bootstrapAssetPath));
  } catch {
    serveJavaScript(response, "/* overlay panel asset missing; run npm run build */\n");
  }
}
var proxy = httpProxy.createProxyServer({
  changeOrigin: false,
  selfHandleResponse: true,
  ws: true
});
function browserOrigin(request) {
  const host = request.headers.host || `${listenHost}:${listenPort}`;
  return `http://${host}`;
}
function headersFor(request) {
  return upstreamHeaders(request, upstreamUrl.host, browserOrigin(request), upstreamOrigin);
}
proxy.on("proxyRes", (proxyResponse, request, response) => {
  if (isHtml(proxyResponse)) {
    const injection = pendingInjection.get(request) ?? "";
    pendingInjection.delete(request);
    sendTransformedResponse(proxyResponse, response, (html) => injectIntoHtml(html, injection));
    return;
  }
  response.writeHead(proxyResponse.statusCode || 200, proxyResponse.headers);
  proxyResponse.pipe(response);
});
installUpstreamErrorHandler(proxy, "Overlay proxy could not reach Omnigent.");
var server = http.createServer(async (request, response) => {
  const pathname = (request.url || "").split("?")[0] ?? "";
  if (pathname === OVERLAY_BOOTSTRAP_PATH) {
    await serveBootstrap(response);
    return;
  }
  const asset = parseOverlayAssetPath(pathname);
  if (asset) {
    const snapshot2 = snapshots.get(asset.revision);
    const bytes = snapshot2?.assets.get(asset.id)?.bytes;
    if (bytes) serveJavaScript(response, bytes);
    else serveNotFound(response, "Unknown or stale overlay asset.");
    return;
  }
  if (pathname === buildPath) {
    const snapshot2 = await getServingSnapshot();
    if (!snapshot2) {
      serveNotFound(response, "build unavailable");
      return;
    }
    response.writeHead(200, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" });
    response.end(snapshot2.revision);
    return;
  }
  if (pathname.startsWith(`${CONTROL_PREFIX}/`)) {
    const body = request.method === "GET" || request.method === "HEAD" ? "" : await readBody(request);
    const result = await handleControlRequest(
      { method: request.method || "GET", pathname, headers: request.headers, body },
      controlDeps
    );
    sendJson(response, result?.status ?? 404, result?.body ?? { error: "not found" });
    return;
  }
  const snapshot = await getServingSnapshot();
  if (snapshot) {
    const host = request.headers.host || `${listenHost}:${listenPort}`;
    const enabled = await effectiveEnabled(snapshot);
    pendingInjection.set(request, buildInjection(snapshot, host, enabled, { token: controlToken }));
  }
  proxy.web(request, response, { target: upstreamOrigin, headers: headersFor(request) });
});
server.on("upgrade", (request, socket, head) => {
  proxy.ws(request, socket, head, { target: upstreamOrigin, headers: headersFor(request) });
});
async function start() {
  try {
    controlToken = await readOrCreateToken(tokenPath);
  } catch (error) {
    console.error("Could not read/create the overlay control token:", errorMessage2(error));
  }
  const snapshot = await getServingSnapshot();
  server.listen(listenPort, listenHost, () => {
    console.log(`Omnigent overlay proxy listening on http://${listenHost}:${listenPort}`);
    console.log(`Forwarding to ${upstreamOrigin} with manifest-driven overlay injection`);
    if (snapshot) {
      console.log(
        `Active overlay snapshot ${snapshot.revision} (${snapshot.manifest.overlays.length} overlays)${registryDir ? ` from ${registryDir}` : " from source"}`
      );
    } else {
      console.error("No overlay snapshot could be loaded; pages will be served without overlays.");
    }
  });
}
installShutdownHandlers(proxy, server);
void start();
