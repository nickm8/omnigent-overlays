
import { tokensMatch } from "./control-token";
import { CONTROL_PREFIX, TOKEN_HEADER } from "./control-constants";

export { CONTROL_PREFIX, TOKEN_HEADER };
const MAX_BODY_BYTES = 4096;

export interface OverlayStateItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  hosts: string[];
  excludeHosts?: string[];
  enabled: boolean;
}

export interface OverlayStateView {
  activeRevision: string;
  overlays: OverlayStateItem[];
  /** A reason the on-disk state could not be used (e.g. quarantined), or null. */
  stateError: string | null;
}

export type MutationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export type SyncResult =
  | { ok: true; activeRevision: string; changed: boolean }
  | { ok: false; status: number; error: string };

export interface ControlDeps {
  token: string;
  getStateView(): Promise<OverlayStateView>;
  setEnabled(id: string, enabled: boolean): Promise<MutationResult>;
  sync(): Promise<SyncResult>;
}

export interface ControlRequest {
  method: string;
  pathname: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface ControlResponse {
  status: number;
  body: unknown;
}

function headerValue(headers: ControlRequest["headers"], name: string): string {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

function isSameOrigin(request: ControlRequest): boolean {
  const origin = headerValue(request.headers, "origin");
  if (!origin) return true; 
  try {
    return new URL(origin).host === headerValue(request.headers, "host");
  } catch {
    return false;
  }
}

/** Reject cross-site / cross-origin requests and anything without the token. */
export function authorize(request: ControlRequest, deps: ControlDeps): ControlResponse | undefined {
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
  return undefined;
}

function parseStateIdPath(pathname: string): string | undefined {
  const match = /^\/_overlays\/state\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname);
  return match ? (match[1] as string) : undefined;
}

/**
 * Handle a control route. Returns undefined for paths this module does not own
 * (so the proxy can serve assets/bootstrap or forward upstream). Any path under
 * /_overlays that is not a known control route resolves to a JSON 404 here only
 * when the proxy routes it in; asset/bootstrap paths are handled before this.
 */
export async function handleControlRequest(
  request: ControlRequest,
  deps: ControlDeps,
): Promise<ControlResponse | undefined> {
  const { method, pathname } = request;

  if (pathname === `${CONTROL_PREFIX}/state` && method === "GET") {
    const denied = authorize(request, deps);
    if (denied) return denied;
    return { status: 200, body: await deps.getStateView() };
  }

  const id = parseStateIdPath(pathname);
  if (id !== undefined && method === "PUT") {
    const denied = authorize(request, deps);
    if (denied) return denied;
    if (request.body.length > MAX_BODY_BYTES) {
      return { status: 413, body: { error: "request body too large" } };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(request.body || "{}");
    } catch {
      return { status: 400, body: { error: "body must be JSON" } };
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { enabled?: unknown }).enabled !== "boolean") {
      return { status: 400, body: { error: "body must be { enabled: boolean }" } };
    }
    const enabled = (parsed as { enabled: boolean }).enabled;
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

  if (pathname === `${CONTROL_PREFIX}/state` || id !== undefined || pathname === `${CONTROL_PREFIX}/sync`) {
    return { status: 405, body: { error: "method not allowed" } };
  }
  return undefined;
}
