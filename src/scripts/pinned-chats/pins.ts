
import { identityRequestHeaders } from "../../shared/omnigent-api";
import { pinnedLabelKey, pinSetsStorageKey } from "./config";

export type PinSets = Record<string, string[]>;

let hasCheckedPinnedOrder = false;

let cachedPinnedIds: string[] = [];
let pinnedCacheGeneration = 0;

export function cachedPinnedConversationIds(): string[] {
  return cachedPinnedIds;
}

export function pinnedConversationCacheGeneration(): number {
  return pinnedCacheGeneration;
}

export function readPinSets(): PinSets {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(pinSetsStorageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value)
        .filter(([slot, ids]) => /^\d+$/.test(slot) && Array.isArray(ids))
        .map(([slot, ids]) => [
          slot,
          [...new Set((ids as unknown[]).filter((id): id is string => typeof id === "string"))],
        ]),
    );
  } catch {
    return {};
  }
}

export function writePinSets(pinSets: PinSets): void {
  window.localStorage.setItem(pinSetsStorageKey, JSON.stringify(pinSets));
}

export function samePinSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

interface SessionRecord {
  id?: unknown;
  labels?: unknown;
  [key: string]: unknown;
}

function pinLabelValue(session: SessionRecord): string | null {
  const labels = session.labels;
  if (!labels || typeof labels !== "object") return null;
  const value = (labels as Record<string, unknown>)[pinnedLabelKey];
  return typeof value === "string" ? value : null;
}

export interface PinnedSession {
  id: string;
  updatedAt: number | null;
  title: unknown;
}

/**
 * The pinned sessions in sidebar display order: ascending by the numeric
 * value of the pin label, non-numeric labels last in input order — the same
 * comparator the app uses to render the Pinned section.
 */
export function pinnedDisplayOrder(sessions: readonly unknown[]): PinnedSession[] {
  const labelled = sessions
    .map((session) => (session && typeof session === "object" ? (session as SessionRecord) : {}))
    .filter((session): session is SessionRecord & { id: string } => typeof session.id === "string")
    .filter((session) => pinLabelValue(session) !== null);

  const rank = (session: SessionRecord): number => {
    const value = Number(pinLabelValue(session) || Number.NaN);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };

  return labelled
    .map((session, index) => ({ session, index }))
    .sort((left, right) => rank(left.session) - rank(right.session) || left.index - right.index)
    .map(({ session }) => ({
      id: session.id,
      updatedAt: Number.isFinite(Number(session["updated_at"])) ? Number(session["updated_at"]) : null,
      title: session["title"],
    }));
}

export interface PinLabelPatch {
  id: string;
  value: string;
}

/**
 * The label writes that turn `currentDisplayIds` into `desiredDisplayIds`:
 * every desired id gets an ascending value from `base` (so the app renders
 * exactly that order) and every removed id gets `""` (which clears the
 * label). Empty when the order already matches.
 */
export function pinLabelPatches(
  currentDisplayIds: readonly string[],
  desiredDisplayIds: readonly string[],
  base: number,
): PinLabelPatch[] {
  if (
    currentDisplayIds.length === desiredDisplayIds.length &&
    currentDisplayIds.every((id, index) => id === desiredDisplayIds[index])
  ) {
    return [];
  }

  const desired = new Set(desiredDisplayIds);
  return [
    ...desiredDisplayIds.map((id, index) => ({ id, value: String(base + index) })),
    ...currentDisplayIds.filter((id) => !desired.has(id)).map((id) => ({ id, value: "" })),
  ];
}

async function patchPinLabel(id: string, value: string, headers: Record<string, string>): Promise<void> {
  const response = await window.fetch(`/v1/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ labels: { [pinnedLabelKey]: value } }),
  });
  if (!response.ok) throw new Error(`Updating pin failed: ${response.status}`);
}

/**
 * The pinned sessions, newest-used first (the server sorts by updated_at
 * desc). Use `pinnedDisplayOrder` on the result for the sidebar order.
 * Refreshes the synchronous cache as a side effect.
 */
export async function fetchPinnedSessions(): Promise<unknown[]> {
  const headers = await identityRequestHeaders();
  const params = new URLSearchParams({
    order: "desc",
    sort_by: "updated_at",
    limit: "100",
    pinned: "true",
  });
  const response = await window.fetch(`/v1/sessions?${params.toString()}`, {
    credentials: "same-origin",
    headers,
  });
  if (!response.ok) throw new Error(`Could not read pinned chats: ${response.status}`);

  const body: unknown = await response.json();
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = Array.isArray(record["data"]) ? record["data"] : [];
  const pinned = data.filter(
    (session) =>
      session && typeof session === "object" && pinLabelValue(session as SessionRecord) !== null,
  );

  cachedPinnedIds = pinnedDisplayOrder(pinned).map(({ id }) => id);
  pinnedCacheGeneration += 1;
  return pinned;
}

/**
 * Make `desiredDisplayIds` (top of the Pinned section first) the exact pin
 * state on the server, then reload so the app rerenders it. Returns false —
 * without reloading — when nothing would change.
 */
export async function applyPinnedConversations(desiredDisplayIds: string[]): Promise<boolean> {
  const current = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
  const patches = pinLabelPatches(current, desiredDisplayIds, Date.now());
  if (patches.length === 0) return false;

  const headers = await identityRequestHeaders();
  await Promise.all(patches.map(({ id, value }) => patchPinLabel(id, value, headers)));
  window.location.reload();
  return true;
}

interface SessionsPage {
  data: unknown[];
  hasMore: boolean;
  lastId: string | null;
}

async function fetchSessionsPage(after: string | null, headers: Record<string, string>): Promise<SessionsPage> {
  const params = new URLSearchParams({ order: "desc", sort_by: "updated_at", limit: "100" });
  if (after) params.set("after", after);
  const response = await window.fetch(`/v1/sessions?${params.toString()}`, {
    credentials: "same-origin",
    headers,
  });
  if (!response.ok) throw new Error(`Could not check recent chats: ${response.status}`);

  const body: unknown = await response.json();
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    data: Array.isArray(record["data"]) ? record["data"] : [],
    hasMore: record["has_more"] === true,
    lastId: typeof record["last_id"] === "string" && record["last_id"] !== "" ? record["last_id"] : null,
  };
}

/** Every conversation used within the last `hours`, newest first. */
export async function recentlyUsedConversationIds(hours: number): Promise<string[]> {
  const cutoff = Date.now() / 1000 - hours * 60 * 60;
  const headers = await identityRequestHeaders();
  const ids: string[] = [];
  let after: string | null = null;

  for (let page = 0; page < 50; page += 1) {
    const { data, hasMore, lastId } = await fetchSessionsPage(after, headers);
    let reachedCutoff = false;
    for (const conversation of data) {
      const record =
        conversation && typeof conversation === "object" ? (conversation as Record<string, unknown>) : {};
      const updatedAt = Number(record["updated_at"]);
      if (!Number.isFinite(updatedAt) || updatedAt < cutoff) {
        reachedCutoff = true;
        break;
      }
      if (typeof record["id"] === "string") ids.push(record["id"]);
    }
    if (reachedCutoff || !hasMore || !lastId) break;
    after = lastId;
  }

  return [...new Set(ids)];
}

export interface RecentConversation {
  id: string;
  title: unknown;
}

/**
 * The `count` most recently updated non-archived conversations. The title
 * rides along so callers can tell an auto-generated one from a user's own.
 */
export async function mostRecentConversations(count: number): Promise<RecentConversation[]> {
  const headers = await identityRequestHeaders();
  const conversations: RecentConversation[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 50 && conversations.length < count; page += 1) {
    const { data, hasMore, lastId } = await fetchSessionsPage(after, headers);
    for (const conversation of data) {
      const record =
        conversation && typeof conversation === "object" ? (conversation as Record<string, unknown>) : {};
      const id = record["id"];
      if (record["archived"] === true || typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      conversations.push({ id, title: record["title"] });
      if (conversations.length >= count) break;
    }
    if (conversations.length >= count || !hasMore || !lastId) break;
    after = lastId;
  }

  return conversations.slice(0, count);
}

/**
 * One-shot on load: relabel the pins so the sidebar shows them by
 * updated_at (newest-used at the top) and reload only when that changes the
 * order. Also primes the synchronous pinned-ids cache.
 */
export async function sortPinnedConversationsByRecentUse(): Promise<void> {
  if (hasCheckedPinnedOrder) return;
  hasCheckedPinnedOrder = true;

  const pinned = await fetchPinnedSessions();
  const desiredDisplayIds = pinned
    .map((session) => (session && typeof session === "object" ? (session as SessionRecord) : {}))
    .map((session) => session.id)
    .filter((id): id is string => typeof id === "string");
  const currentDisplayIds = pinnedDisplayOrder(pinned).map(({ id }) => id);

  const patches = pinLabelPatches(currentDisplayIds, desiredDisplayIds, Date.now());
  if (patches.length === 0) return;

  const headers = await identityRequestHeaders();
  await Promise.all(patches.map(({ id, value }) => patchPinLabel(id, value, headers)));
  window.location.reload();
}
