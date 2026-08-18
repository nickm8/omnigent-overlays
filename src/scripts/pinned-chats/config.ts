
export const pinnedLabelKey = "omnigent.pinned";
export const pinSetsStorageKey = "omnigent:pin-sets-v1";
export const activationAttribute = "data-omnigent-pinned-chat-sorter";
export const pinSetControlsId = "omnigent-pin-set-controls";
export const pinSetControlsStyleId = "omnigent-pin-set-controls-style";
export const pinRecentButtonId = "omnigent-pin-recent-button";
export const pinRecentDayButtonId = "omnigent-pin-recent-day-button";
export const pinMostRecentButtonId = "omnigent-pin-most-recent-button";
export const pinUnpinAllButtonId = "omnigent-pin-unpin-all-button";
export const pinOnlyButtonAttribute = "data-omnigent-pin-only";
export const aiRenameButtonAttribute = "data-omnigent-ai-rename-chat";
export const chatJumpFormId = "omnigent-chat-jump-form";
export const chatJumpInputId = "omnigent-chat-jump-input";
export const chatJumpStatusId = "omnigent-chat-jump-status";
export const chatRenameQueueStorageKey = "omnigent:chat-rename-queue-v1";
export const chatRenameQueueLimit = 6;
export const pinSetCount = 5;
export const recentPinWindowHours = 5;
export const recentPinDayWindowHours = 24;
export const mostRecentPinCount = 4;
export const recentWorkspacesStorageKey = "omnigent:recent-workspaces";
export const selectedWorkspaceStorageKey = "omnigent:selected-repo-workspace";
export const userHiddenRepoNamesStorageKey = "omnigent:hidden-repo-names";
export const userPinnedRepoNamesStorageKey = "omnigent:pinned-repo-names";
export const reposRootStorageKey = "omnigent:repos-root";
export const configuredHiddenRepoNamesStorageKey = "omnigent:configured-hidden-repo-names";
export const defaultReposRoot = "";

function readStoredString(key: string, fallback: string): string {
  try {
    const stored = localStorage.getItem(key);
    return stored && stored.trim() ? stored.trim().replace(/\/+$/, "") : fallback;
  } catch {
    return fallback;
  }
}

function readStoredNameSet(key: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string") : []);
  } catch {
    return new Set();
  }
}

export const reposRoot = readStoredString(reposRootStorageKey, defaultReposRoot);
export const projectFocusStorageKey = "omnigent:project-focus-v1";
export const repoPickerModeStorageKey = "omnigent:repo-picker-mode-v1";
export const workspacePickerAttribute = "data-omnigent-repos-picker";
export const workspacePickerStateAttribute = "data-omnigent-repos-picker-state";
export const workspacePickerStyleId = "omnigent-repos-workspace-picker-style";
export const hideRepoButtonAttribute = "data-omnigent-hide-repo";
export const focusRepoButtonAttribute = "data-omnigent-focus-repo";
export const pinRepoButtonAttribute = "data-omnigent-pin-repo";
export const resetHiddenReposButtonAttribute = "data-omnigent-reset-hidden-repos";
export const repoPickerToolbarAttribute = "data-omnigent-repo-picker-toolbar";
export const repoPickerModeAttribute = "data-omnigent-repo-picker-mode";
export const repoPickerModeToggleAttribute = "data-omnigent-repo-picker-mode-toggle";
export const projectRepoSessionButtonAttribute = "data-omnigent-project-repo-session";
export const pendingProjectRepoStorageKey = "omnigent:pending-project-repo-session";
export const buildBadgeId = "omnigent-build-badge";
export const sidebarSelector = "aside.conversations-sidebar";
export const sidebarResizeHandleSelector = '[role="separator"][aria-label="Resize sidebar"]';
export const sidebarResizeStyleId = "omnigent-sidebar-resize-style";
export const sidebarUnlockedWidthVar = "--omnigent-sidebar-width";
export const sidebarUnlockedWidthStorageKey = "omnigent:sidebar-width";
export const sidebarMinWidthPx = 220;
// Keep in sync with @version in tools/userscript-entries.ts.
export const scriptVersion = "0.11.0";

export const hiddenRepoNames: ReadonlySet<string> = readStoredNameSet(configuredHiddenRepoNamesStorageKey);
