
import {
  hiddenRepoNames,
  projectFocusStorageKey,
  recentWorkspacesStorageKey,
  repoPickerModeStorageKey,
  reposRoot,
  userHiddenRepoNamesStorageKey,
  userPinnedRepoNamesStorageKey,
} from "./config";

function readUserHiddenRepoNames(): Set<string> {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(userHiddenRepoNamesStorageKey) || "[]",
    );
    return new Set(
      Array.isArray(value)
        ? value.filter((name): name is string => typeof name === "string" && name.trim() !== "")
        : [],
    );
  } catch {
    return new Set();
  }
}

function readUserPinnedRepoNames(): string[] {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(userPinnedRepoNamesStorageKey) || "[]",
    );
    return Array.isArray(value)
      ? [...new Set(value.filter((name): name is string => typeof name === "string" && name.trim() !== ""))]
      : [];
  } catch {
    return [];
  }
}

const userHiddenRepoNames = readUserHiddenRepoNames();
let userPinnedRepoNames = readUserPinnedRepoNames();

function writeUserHiddenRepoNames(): void {
  window.localStorage.setItem(
    userHiddenRepoNamesStorageKey,
    JSON.stringify([...userHiddenRepoNames].sort()),
  );
}

function writeUserPinnedRepoNames(): void {
  window.localStorage.setItem(userPinnedRepoNamesStorageKey, JSON.stringify(userPinnedRepoNames));
}

export function pinnedRepoNames(): readonly string[] {
  return userPinnedRepoNames;
}

export function userHiddenRepoCount(): number {
  return userHiddenRepoNames.size;
}

export function hideRepoName(name: string): void {
  userHiddenRepoNames.add(name);
  writeUserHiddenRepoNames();
  userPinnedRepoNames = userPinnedRepoNames.filter((pinnedName) => pinnedName !== name);
  writeUserPinnedRepoNames();
}

export function resetUserHiddenRepoNames(): void {
  userHiddenRepoNames.clear();
  writeUserHiddenRepoNames();
}

/** Pin name first when unpinned; unpin it when already pinned. */
export function toggleRepoNamePin(name: string): void {
  const index = userPinnedRepoNames.indexOf(name);
  userPinnedRepoNames =
    index === -1
      ? [name, ...userPinnedRepoNames]
      : userPinnedRepoNames.filter((pinnedName) => pinnedName !== name);
  writeUserPinnedRepoNames();
}

type ProjectFocusState = { enabled: boolean; names: string[] };

/**
 * The sidebar's focus list, read straight from localStorage every call. The
 * project-focus userscript owns this key and edits it in the same tab, so a
 * module-level cache (as pins/hidden use) would go stale between renders.
 */
function readProjectFocus(): ProjectFocusState {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(projectFocusStorageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, names: [] };

    const record = value as Record<string, unknown>;
    const rawNames = record["names"];
    const names = Array.isArray(rawNames)
      ? [...new Set(rawNames.filter((name): name is string => typeof name === "string" && name !== ""))]
      : [];
    return { enabled: record["enabled"] === true && names.length > 0, names };
  } catch {
    return { enabled: false, names: [] };
  }
}

function writeProjectFocus(state: ProjectFocusState): void {
  try {
    const names = [...new Set(state.names)];
    window.localStorage.setItem(
      projectFocusStorageKey,
      JSON.stringify({ enabled: state.enabled && names.length > 0, names }),
    );
  } catch {
  }
}

/** Focus-list order, restricted to repos the picker is allowed to show. */
export function focusedRepoNames(): readonly string[] {
  return readProjectFocus().names.filter(isVisibleRepoName);
}

/**
 * Add/remove a repo in the shared focus list. Mirrors project-focus's own
 * toggle: the first pick onto an empty list also switches focus on, so one
 * click from the picker filters the sidebar too instead of silently building
 * a list that is never applied.
 */
export function toggleRepoNameFocus(name: string): void {
  if (!isVisibleRepoName(name)) return;

  const state = readProjectFocus();
  const names = state.names.includes(name)
    ? state.names.filter((current) => current !== name)
    : [...state.names, name];
  const firstPick = state.names.length === 0;
  writeProjectFocus({
    enabled: names.length === 0 ? false : firstPick ? true : state.enabled,
    names,
  });
}

export type RepoPickerMode = "focus" | "all";

/**
 * The remembered slider position, with "all" forced whenever focus would show
 * an empty list — the picker must never be a dead end.
 */
export function repoPickerMode(): RepoPickerMode {
  if (focusedRepoNames().length === 0) return "all";
  return window.localStorage.getItem(repoPickerModeStorageKey) === "all" ? "all" : "focus";
}

export function setRepoPickerMode(mode: RepoPickerMode): void {
  window.localStorage.setItem(repoPickerModeStorageKey, mode);
}

export function isVisibleRepoName(name: string): boolean {
  return (
    name !== "" &&
    !name.startsWith("_") &&
    !hiddenRepoNames.has(name) &&
    !userHiddenRepoNames.has(name)
  );
}

export function isAllowedWorkspacePath(path: unknown): boolean {
  if (typeof path !== "string") return false;

  const normalized = path.replace(/\/+$/, "");
  if (!normalized.startsWith(`${reposRoot}/`)) return false;

  const name = normalized.slice(reposRoot.length + 1);
  return !name.includes("/") && isVisibleRepoName(name);
}

export function workspacePathForRepo(name: string): string {
  return `${reposRoot}/${name}`;
}

/** Drop non-permitted paths from Omnigent's recent-workspaces value. */
export function filterRecentWorkspaces(): void {
  try {
    const raw = window.localStorage.getItem(recentWorkspacesStorageKey);
    if (!raw) return;

    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const filtered = Object.fromEntries(
      Object.entries(value).map(([hostId, paths]) => [
        hostId,
        Array.isArray(paths) ? paths.filter(isAllowedWorkspacePath) : [],
      ]),
    );
    window.localStorage.setItem(recentWorkspacesStorageKey, JSON.stringify(filtered));
  } catch {
  }
}
