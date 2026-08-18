
import http from "node:http";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy-3";
import {
  createMutationSerializer,
  installShutdownHandlers,
  installUpstreamErrorHandler,
  isHtml,
  readBody,
  sendTransformedResponse,
  upstreamHeaders,
} from "./shared";
import { readFile } from "node:fs/promises";
import type { OverlaySnapshot } from "../overlays/snapshot";
import { loadSnapshotFromDir } from "../overlays/snapshot";
import { SnapshotHolder } from "../overlays/snapshot-holder";
import { applyDefaults } from "../overlays/validate";
import type { OverlayState } from "../overlays/types";
import { readState, writeState } from "../overlays/state-store";
import { OVERLAY_BOOTSTRAP_PATH, buildInjection, injectIntoHtml, parseOverlayAssetPath } from "../overlays/inject";
import { readOrCreateToken } from "../overlays/control-token";
import type { ControlDeps, OverlayStateView } from "../overlays/control-api";
import { CONTROL_PREFIX, handleControlRequest } from "../overlays/control-api";
import { syncRegistry } from "../overlays/sync";
import { buildSourceSnapshot } from "../../tools/source-snapshot";

const listenHost = process.env["OMNIGENT_PROXY_HOST"] || "127.0.0.1";
const listenPort = Number(process.env["OMNIGENT_PROXY_PORT"] || "6768");
const upstreamUrl = new URL(process.env["OMNIGENT_UPSTREAM_URL"] || "http://127.0.0.1:6767");
const upstreamOrigin = upstreamUrl.origin;

const repoRoot = process.env["OMNIGENT_USERSCRIPTS_ROOT"]
  ? resolve(process.env["OMNIGENT_USERSCRIPTS_ROOT"])
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryDir = process.env["OMNIGENT_OVERLAY_REGISTRY_DIR"];
const registryRemote = process.env["OMNIGENT_OVERLAY_REMOTE"] || "origin";
const registryBranch = process.env["OMNIGENT_OVERLAY_BRANCH"] || "main";
const stateDir = process.env["OMNIGENT_OVERLAY_STATE"]
  ? dirname(resolve(process.env["OMNIGENT_OVERLAY_STATE"]))
  : resolve(homedir(), ".omnigent-overlays");
const statePath = process.env["OMNIGENT_OVERLAY_STATE"] || resolve(stateDir, "state.json");
const tokenPath = resolve(stateDir, "control-token");
const stagingRoot = resolve(stateDir, "snapshots");
const bootstrapAssetPath = resolve(repoRoot, "assets", "overlays-bootstrap.js");
let controlToken = "";
let syncInProgress = false;

const buildPath = "/_overlays/build";

const snapshots = new SnapshotHolder();
const pendingInjection = new WeakMap<http.IncomingMessage, string>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Load the current on-disk registry as a validated snapshot (no network). */
async function loadRegistrySnapshotOnDisk(): Promise<OverlaySnapshot | undefined> {
  if (!registryDir) return undefined;
  const loaded = await loadSnapshotFromDir(registryDir);
  if (loaded.ok && loaded.value.manifest.overlays.length > 0) return loaded.value;
  if (!loaded.ok) {
    console.error(`Overlay registry at ${registryDir} is invalid: ${loaded.errors.join("; ")}`);
  }
  return undefined;
}

/**
 * The snapshot to serve a request from. In source mode (no registry) the
 * committed artifacts are rebuilt every call so local edits live-reload. In
 * registry mode the active snapshot changes only via an explicit sync, so this
 * returns the active one (loading the on-disk registry once at startup, falling
 * back to source if the registry is unreadable).
 */
async function getServingSnapshot(): Promise<OverlaySnapshot | undefined> {
  if (!registryDir) {
    try {
      return snapshots.set(await buildSourceSnapshot(repoRoot));
    } catch (error) {
      console.error("Source snapshot build failed; keeping last-good:", errorMessage(error));
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
    console.error("No overlay snapshot could be loaded:", errorMessage(error));
    return snapshots.current();
  }
}

/**
 * Read state and apply manifest defaults. When defaults need persisting, the
 * whole read-modify-write re-runs inside the mutation serializer so it cannot
 * clobber a concurrent PUT /_overlays/state/{id} (lost update). The common
 * nothing-changed path stays lock-free.
 */
async function stateWithDefaults(snapshot: OverlaySnapshot): Promise<{ state: OverlayState; error?: string }> {
  const read = await readState(statePath);
  if (read.error) {
    const moved = read.quarantinedTo ? ` (quarantined to ${read.quarantinedTo})` : "";
    console.error(`Overlay state unusable, falling back to defaults: ${read.error}${moved}`);
  }
  const applied = applyDefaults(snapshot.manifest, read.state);
  if (!applied.changed) {
    return read.error !== undefined ? { state: applied.state, error: read.error } : { state: applied.state };
  }
  const persisted = await serialize(async () => {
    const fresh = await readState(statePath);
    const reapplied = applyDefaults(snapshot.manifest, fresh.state);
    if (reapplied.changed) {
      try {
        await writeState(statePath, reapplied.state);
      } catch (error) {
        console.error("Could not persist overlay defaults:", errorMessage(error));
      }
    }
    return reapplied.state;
  });
  return read.error !== undefined ? { state: persisted, error: read.error } : { state: persisted };
}

/** Enabled map for a snapshot, applying manifest defaults once and persisting them. */
async function effectiveEnabled(snapshot: OverlaySnapshot): Promise<Record<string, boolean>> {
  return (await stateWithDefaults(snapshot)).state.enabled;
}

function serveJavaScript(response: http.ServerResponse, body: Buffer | string): void {
  response.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function serveNotFound(response: http.ServerResponse, message: string): void {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(message);
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

const serialize = createMutationSerializer();

async function buildStateView(): Promise<OverlayStateView> {
  const snapshot = await getServingSnapshot();
  if (!snapshot) return { activeRevision: "", overlays: [], stateError: "no overlay snapshot available" };
  const { state, error } = await stateWithDefaults(snapshot);
  const overlays = snapshot.manifest.overlays.map((overlay) => ({
    id: overlay.id,
    name: overlay.name,
    description: overlay.description,
    version: overlay.version,
    ...(overlay.author !== undefined ? { author: overlay.author } : {}),
    ...(overlay.tags !== undefined ? { tags: overlay.tags } : {}),
    hosts: overlay.hosts,
    ...(overlay.excludeHosts !== undefined ? { excludeHosts: overlay.excludeHosts } : {}),
    enabled: state.enabled[overlay.id] === true,
  }));
  return { activeRevision: snapshot.revision, overlays, stateError: error ?? null };
}

const controlDeps: ControlDeps = {
  get token(): string {
    return controlToken;
  },
  getStateView: buildStateView,
  setEnabled: (id, enabled) =>
    serialize(async () => {
      const snapshot = await getServingSnapshot();
      if (!snapshot || !snapshot.manifest.overlays.some((overlay) => overlay.id === id)) {
        return { ok: false as const, status: 404, error: `unknown overlay: ${id}` };
      }
      const read = await readState(statePath);
      const applied = applyDefaults(snapshot.manifest, read.state);
      const next = {
        schemaVersion: 1 as const,
        enabled: { ...applied.state.enabled, [id]: enabled },
        defaultsApplied: applied.state.defaultsApplied.includes(id)
          ? applied.state.defaultsApplied
          : [...applied.state.defaultsApplied, id],
      };
      await writeState(statePath, next);
      return { ok: true as const };
    }),
  sync: async () => {
    if (!registryDir) {
      const before = snapshots.current()?.revision;
      try {
        const snapshot = snapshots.set(await buildSourceSnapshot(repoRoot));
        return { ok: true as const, activeRevision: snapshot.revision, changed: before !== snapshot.revision };
      } catch (error) {
        return { ok: false as const, status: 503, error: `source rebuild failed: ${errorMessage(error)}` };
      }
    }
    if (syncInProgress) return { ok: false as const, status: 409, error: "a sync is already running" };
    syncInProgress = true;
    try {
      const outcome = await syncRegistry(
        { registryDir, remote: registryRemote, branch: registryBranch, stagingRoot },
        snapshots.current(),
      );
      if (!outcome.ok) return { ok: false as const, status: outcome.status, error: outcome.error };
      snapshots.set(outcome.snapshot);
      if (outcome.versionChanges.length > 0) {
        console.log(
          `Synced registry ${outcome.revision}: ` +
            outcome.versionChanges.map((change) => `${change.id} ${change.from ?? "∅"}→${change.to ?? "∅"}`).join(", "),
        );
      }
      return { ok: true as const, activeRevision: outcome.revision, changed: outcome.changed };
    } finally {
      syncInProgress = false;
    }
  },
};

async function serveBootstrap(response: http.ServerResponse): Promise<void> {
  try {
    serveJavaScript(response, await readFile(bootstrapAssetPath));
  } catch {
    serveJavaScript(response, "/* overlay panel asset missing; run npm run build */\n");
  }
}

const proxy = httpProxy.createProxyServer({
  changeOrigin: false,
  selfHandleResponse: true,
  ws: true,
});

function browserOrigin(request: http.IncomingMessage): string {
  const host = request.headers.host || `${listenHost}:${listenPort}`;
  return `http://${host}`;
}

function headersFor(request: http.IncomingMessage): { [header: string]: string } {
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

const server = http.createServer(async (request, response) => {
  const pathname = (request.url || "").split("?")[0] ?? "";

  if (pathname === OVERLAY_BOOTSTRAP_PATH) {
    await serveBootstrap(response);
    return;
  }

  const asset = parseOverlayAssetPath(pathname);
  if (asset) {
    const snapshot = snapshots.get(asset.revision);
    const bytes = snapshot?.assets.get(asset.id)?.bytes;
    if (bytes) serveJavaScript(response, bytes);
    else serveNotFound(response, "Unknown or stale overlay asset.");
    return;
  }

  if (pathname === buildPath) {
    const snapshot = await getServingSnapshot();
    if (!snapshot) {
      serveNotFound(response, "build unavailable");
      return;
    }
    response.writeHead(200, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" });
    response.end(snapshot.revision);
    return;
  }

  if (pathname.startsWith(`${CONTROL_PREFIX}/`)) {
    const body = request.method === "GET" || request.method === "HEAD" ? "" : await readBody(request);
    const result = await handleControlRequest(
      { method: request.method || "GET", pathname, headers: request.headers, body },
      controlDeps,
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

async function start(): Promise<void> {
  try {
    controlToken = await readOrCreateToken(tokenPath);
  } catch (error) {
    console.error("Could not read/create the overlay control token:", errorMessage(error));
  }
  const snapshot = await getServingSnapshot();
  server.listen(listenPort, listenHost, () => {
    console.log(`Omnigent overlay proxy listening on http://${listenHost}:${listenPort}`);
    console.log(`Forwarding to ${upstreamOrigin} with manifest-driven overlay injection`);
    if (snapshot) {
      console.log(
        `Active overlay snapshot ${snapshot.revision} (${snapshot.manifest.overlays.length} overlays)` +
          `${registryDir ? ` from ${registryDir}` : " from source"}`,
      );
    } else {
      console.error("No overlay snapshot could be loaded; pages will be served without overlays.");
    }
  });
}

installShutdownHandlers(proxy, server);
void start();
