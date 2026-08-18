
import { installStyles, setNativeValue } from "../../shared/dom";
import {
  focusRepoButtonAttribute,
  hideRepoButtonAttribute,
  pendingProjectRepoStorageKey,
  pinRepoButtonAttribute,
  projectFocusStorageKey,
  projectRepoSessionButtonAttribute,
  repoPickerModeAttribute,
  repoPickerModeToggleAttribute,
  repoPickerToolbarAttribute,
  reposRoot,
  resetHiddenReposButtonAttribute,
  selectedWorkspaceStorageKey,
  workspacePickerAttribute,
  workspacePickerStateAttribute,
  workspacePickerStyleId,
} from "./config";
import type { RepoPickerMode } from "./repo-prefs";
import {
  filterRecentWorkspaces,
  focusedRepoNames,
  hideRepoName,
  isAllowedWorkspacePath,
  isVisibleRepoName,
  pinnedRepoNames,
  repoPickerMode,
  resetUserHiddenRepoNames,
  setRepoPickerMode,
  toggleRepoNameFocus,
  toggleRepoNamePin,
  userHiddenRepoCount,
  workspacePathForRepo,
} from "./repo-prefs";

export function installWorkspacePickerStyles(): void {
  installStyles(
    workspacePickerStyleId,
    `
      [data-testid="workspace-picker"][${workspacePickerAttribute}] > div:first-child {
        display: none !important;
      }

      [data-testid="workspace-picker"][${workspacePickerAttribute}]
        [data-testid^="workspace-picker-entry-"].omnigent-repos-hidden,
      [data-testid="workspace-picker"][${workspacePickerAttribute}]
        [data-testid^="workspace-picker-entry-"].omnigent-repos-unfocused {
        display: none !important;
      }

      [data-testid="workspace-picker"][${workspacePickerAttribute}]
        [data-testid^="workspace-picker-entry-"] {
        padding-right: 5rem !important;
      }

      [${repoPickerToolbarAttribute}] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
      }

      /* Focus/All slider. Focused = knob left, so the label being read as
         "on" sits under the knob rather than opposite it. */
      [${repoPickerModeToggleAttribute}] {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        border: 0;
        border-radius: 999px;
        padding: 0.125rem 0.25rem;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: inherit;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      [${repoPickerModeToggleAttribute}]:hover {
        color: var(--foreground, #fff);
      }

      [${repoPickerModeToggleAttribute}] [data-part="track"] {
        position: relative;
        display: inline-block;
        width: 1.75rem;
        height: 0.875rem;
        border: 1px solid color-mix(in srgb, var(--border, #888) 80%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--muted-foreground, #8b8b8b) 18%, transparent);
      }

      [${repoPickerModeToggleAttribute}] [data-part="knob"] {
        position: absolute;
        top: 1px;
        left: 1px;
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 999px;
        background: var(--muted-foreground, #8b8b8b);
        transition: transform 120ms ease;
      }

      [${repoPickerModeToggleAttribute}][aria-checked="false"] [data-part="knob"] {
        transform: translateX(0.75rem);
      }

      [${repoPickerModeToggleAttribute}][aria-checked="true"] [data-part="track"] {
        border-color: color-mix(in srgb, var(--primary, #7c3aed) 70%, transparent);
        background: color-mix(in srgb, var(--primary, #7c3aed) 30%, transparent);
      }

      [${repoPickerModeToggleAttribute}][aria-checked="true"] [data-part="knob"] {
        background: var(--primary, #7c3aed);
      }

      [${repoPickerModeToggleAttribute}] [data-part="label"] {
        opacity: 0.5;
      }

      [${repoPickerModeToggleAttribute}][aria-checked="true"] [data-part="label"][data-side="focus"],
      [${repoPickerModeToggleAttribute}][aria-checked="false"] [data-part="label"][data-side="all"] {
        color: var(--foreground, #fff);
        opacity: 1;
      }

      /* Nothing focused yet: the slider stays operable (so the preference can
         be set ahead of the first ◉) but reads as unavailable. */
      [${repoPickerModeToggleAttribute}][data-empty="true"] [data-part="label"][data-side="focus"] {
        opacity: 0.35;
      }

      [${resetHiddenReposButtonAttribute}] {
        border: 0;
        border-radius: 4px;
        padding: 0.25rem 0.5rem;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: inherit;
        font-size: 0.75rem;
      }

      [${resetHiddenReposButtonAttribute}]:hover {
        background: var(--accent, rgba(127, 127, 127, 0.16));
        color: var(--foreground, #fff);
      }

      [${hideRepoButtonAttribute}],
      [${pinRepoButtonAttribute}],
      [${focusRepoButtonAttribute}] {
        position: absolute;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: inherit;
        font-size: 0.875rem;
        line-height: 1;
      }

      [${hideRepoButtonAttribute}]:hover,
      [${pinRepoButtonAttribute}]:hover,
      [${focusRepoButtonAttribute}]:hover {
        background: var(--accent, rgba(127, 127, 127, 0.16));
        color: var(--foreground, #fff);
      }

      [${pinRepoButtonAttribute}][aria-pressed="true"] {
        background: var(--accent, rgba(127, 127, 127, 0.16));
        color: var(--foreground, #fff);
      }

      [${focusRepoButtonAttribute}][aria-pressed="true"] {
        color: var(--primary, #7c3aed);
      }

      [${pinRepoButtonAttribute}] svg {
        width: 0.875rem;
        height: 0.875rem;
        stroke: currentColor;
      }

      [data-testid="workspace-picker"][${workspacePickerAttribute}]
        [${workspacePickerStateAttribute}="loading"] .overflow-y-auto {
        opacity: 0.35;
        pointer-events: none;
      }

      [${projectRepoSessionButtonAttribute}] svg {
        display: none !important;
      }

      [${projectRepoSessionButtonAttribute}]::before {
        content: "+";
        font-size: 1.125rem;
        font-weight: 500;
        line-height: 1;
      }
    `,
  );
}

export function setControlledInputValue(input: HTMLInputElement, value: string): void {
  setNativeValue(input, value, new Event("input", { bubbles: true }));
}

function entriesFingerprint(picker: Element): string {
  return [...picker.querySelectorAll('[data-testid^="workspace-picker-entry-"]')]
    .map((entry) => entry.getAttribute("data-testid"))
    .join("|");
}

/**
 * True once the picker's listing has actually settled on reposRoot. The path
 * input reads reposRoot the instant `forcePickerToReposRoot` sets it, before
 * the entries navigate — so a name-independent listing check is required to
 * avoid decorating the directory the picker opened in. (Keying off a specific
 * repo entry, e.g. `omnigent-extras`, rots the moment that repo is
 * renamed and leaves the picker stuck in `loading` forever.)
 */
function pickerShowsReposRoot(picker: Element): boolean {
  const pathInput = picker.querySelector('[data-testid="workspace-picker-path-input"]');
  if (!(pathInput instanceof HTMLInputElement)) return false;
  if (pathInput.value.replace(/\/+$/, "") !== reposRoot) return false;

  const fingerprint = entriesFingerprint(picker);
  if (fingerprint === "") return false;

  const preRoot = (picker as HTMLElement).dataset["omnigentPreRootEntries"];
  if (preRoot === undefined || fingerprint !== preRoot) return true;

  const navigationStartedAt = Number(
    (picker as HTMLElement).dataset["omnigentReposNavigationStartedAt"] || "",
  );
  return Number.isFinite(navigationStartedAt) && Date.now() - navigationStartedAt >= 500;
}

function repoNameForPickerEntry(entry: Element): string {
  const testId = entry.getAttribute("data-testid") || "";
  const prefix = "workspace-picker-entry-";
  return testId.startsWith(prefix) ? testId.slice(prefix.length) : "";
}

function hideRepoFromPicker(name: string): void {
  if (!isVisibleRepoName(name)) return;

  hideRepoName(name);
  if (window.localStorage.getItem(selectedWorkspaceStorageKey) === workspacePathForRepo(name)) {
    window.localStorage.removeItem(selectedWorkspaceStorageKey);
  }
  filterRecentWorkspaces();
  constrainWorkspacePickers();
}

function togglePinnedRepo(name: string): void {
  if (!isVisibleRepoName(name)) return;

  toggleRepoNamePin(name);
  constrainWorkspacePickers();
}

function toggleFocusedRepo(name: string): void {
  toggleRepoNameFocus(name);
  constrainWorkspacePickers();
}

function ensureModeToggle(toolbar: HTMLElement, mode: RepoPickerMode, focusCount: number): void {
  let toggle = toolbar.querySelector<HTMLButtonElement>(`[${repoPickerModeToggleAttribute}]`);
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute(repoPickerModeToggleAttribute, "");
    toggle.setAttribute("role", "switch");
    const focusLabel = document.createElement("span");
    focusLabel.setAttribute("data-part", "label");
    focusLabel.setAttribute("data-side", "focus");
    const track = document.createElement("span");
    track.setAttribute("data-part", "track");
    const knob = document.createElement("span");
    knob.setAttribute("data-part", "knob");
    track.append(knob);
    const allLabel = document.createElement("span");
    allLabel.setAttribute("data-part", "label");
    allLabel.setAttribute("data-side", "all");
    allLabel.textContent = "All";
    toggle.append(focusLabel, track, allLabel);
    toolbar.prepend(toggle);
  }

  const focused = mode === "focus";
  toggle.setAttribute("aria-checked", String(focused));
  toggle.setAttribute("data-empty", String(focusCount === 0));
  const focusLabel = toggle.querySelector<HTMLElement>('[data-side="focus"]');
  if (focusLabel) focusLabel.textContent = focusCount === 0 ? "Focus" : `Focus ${focusCount}`;
  const title =
    focusCount === 0
      ? "No focused projects yet — focus one with the ◉ beside a repository, or from the sidebar Projects list."
      : focused
        ? `Showing the ${focusCount} focused projects. Click for every repository.`
        : `Showing every repository, pinned first. Click for the ${focusCount} focused projects.`;
  toggle.setAttribute("aria-label", title);
  toggle.title = title;
}

function ensureRepoPickerToolbar(picker: HTMLElement, mode: RepoPickerMode, focusCount: number): void {
  const hiddenCount = userHiddenRepoCount();
  let toolbar = picker.querySelector<HTMLElement>(`[${repoPickerToolbarAttribute}]`);
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.setAttribute(repoPickerToolbarAttribute, "");
    picker.firstElementChild?.after(toolbar);
  }

  ensureModeToggle(toolbar, mode, focusCount);

  let button = toolbar.querySelector<HTMLButtonElement>(`[${resetHiddenReposButtonAttribute}]`);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.setAttribute(resetHiddenReposButtonAttribute, "");
    toolbar.append(button);
  }
  button.hidden = hiddenCount === 0;
  button.textContent = `Restore hidden (${hiddenCount})`;
  button.setAttribute("aria-label", `Restore ${hiddenCount} hidden repositories`);
  button.title = "Show repositories hidden with the x buttons";
}

function ensureHideRepoButton(picker: Element, entry: HTMLElement, name: string): void {
  const existing = [...picker.querySelectorAll(`[${hideRepoButtonAttribute}]`)].find(
    (button) => button.getAttribute(hideRepoButtonAttribute) === name,
  );
  if (existing) return;

  const list = entry.parentElement;
  if (!(list instanceof HTMLElement)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(hideRepoButtonAttribute, name);
  button.setAttribute("aria-label", `Hide ${name} from repository picker`);
  button.title = `Hide ${name} from repository picker`;
  button.textContent = "x";
  list.style.position = "relative";
  entry.after(button);
}

function ensurePinRepoButton(picker: Element, entry: HTMLElement, name: string): void {
  const existing = [...picker.querySelectorAll(`[${pinRepoButtonAttribute}]`)].find(
    (button) => button.getAttribute(pinRepoButtonAttribute) === name,
  );
  const pinned = pinnedRepoNames().includes(name);
  if (existing instanceof HTMLElement) {
    existing.setAttribute("aria-pressed", String(pinned));
    existing.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} ${name} in repository picker`);
    existing.title = `${pinned ? "Unpin" : "Pin"} ${name} in repository picker`;
    return;
  }

  const list = entry.parentElement;
  if (!(list instanceof HTMLElement)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(pinRepoButtonAttribute, name);
  button.setAttribute("aria-pressed", String(pinned));
  button.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} ${name} in repository picker`);
  button.title = `${pinned ? "Unpin" : "Pin"} ${name} in repository picker`;
  const sourceIcon =
    document.querySelector('button[data-testid="quick-pin-conversation"][aria-label="Pin conversation"] svg') ||
    document.querySelector('button[data-testid="quick-pin-conversation"] svg');
  if (sourceIcon instanceof SVGElement) {
    const icon = sourceIcon.cloneNode(true) as SVGElement;
    icon.removeAttribute("class");
    button.append(icon);
  } else {
    button.textContent = "*";
  }
  list.style.position = "relative";
  entry.after(button);
}

function ensureFocusRepoButton(picker: Element, entry: HTMLElement, name: string, focused: boolean): void {
  const existing = [...picker.querySelectorAll(`[${focusRepoButtonAttribute}]`)].find(
    (button) => button.getAttribute(focusRepoButtonAttribute) === name,
  );
  const label = focused ? `Remove ${name} from focus` : `Focus on ${name}`;
  if (existing instanceof HTMLElement) {
    existing.setAttribute("aria-pressed", String(focused));
    existing.setAttribute("aria-label", label);
    existing.title = `${label} (shared with the sidebar Projects focus)`;
    if (existing.textContent !== (focused ? "◉" : "○")) existing.textContent = focused ? "◉" : "○";
    return;
  }

  const list = entry.parentElement;
  if (!(list instanceof HTMLElement)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(focusRepoButtonAttribute, name);
  button.setAttribute("aria-pressed", String(focused));
  button.setAttribute("aria-label", label);
  button.title = `${label} (shared with the sidebar Projects focus)`;
  button.textContent = focused ? "◉" : "○";
  list.style.position = "relative";
  entry.after(button);
}

/**
 * Right-hand action slots, from the row edge inwards: x, then focus, then pin.
 * Pin only exists in All mode (it is what orders that list), so focus takes
 * the middle slot there and the inner one in Focus mode — no dead gap.
 */
function positionRepoActions(picker: Element, entry: HTMLElement, name: string, mode: RepoPickerMode): void {
  const top = `${entry.offsetTop + Math.max(0, (entry.offsetHeight - 20) / 2)}px`;
  const rights: Record<string, string> = {
    [hideRepoButtonAttribute]: "6px",
    [focusRepoButtonAttribute]: "30px",
    [pinRepoButtonAttribute]: "54px",
  };
  for (const [attribute, right] of Object.entries(rights)) {
    const button = [...picker.querySelectorAll(`[${attribute}]`)].find(
      (candidate) => candidate.getAttribute(attribute) === name,
    );
    if (!(button instanceof HTMLElement)) continue;
    button.style.top = top;
    button.style.right = right;
  }
}

function orderPickerEntries(picker: Element, mode: RepoPickerMode): void {
  const entries = [...picker.querySelectorAll<HTMLElement>('[data-testid^="workspace-picker-entry-"]')];
  const list = entries[0]?.parentElement;
  if (!(list instanceof HTMLElement)) return;

  const ranked = mode === "focus" ? focusedRepoNames() : pinnedRepoNames();
  list.style.display = "flex";
  list.style.flexDirection = "column";
  entries.forEach((entry, index) => {
    const rank = ranked.indexOf(repoNameForPickerEntry(entry));
    entry.style.order = String(rank === -1 ? ranked.length + index : rank);
  });
  entries.forEach((entry) => positionRepoActions(picker, entry, repoNameForPickerEntry(entry), mode));
}

function forcePickerToReposRoot(picker: HTMLElement): void {
  const pathInput = picker.querySelector('[data-testid="workspace-picker-path-input"]');
  if (!(pathInput instanceof HTMLInputElement)) return;

  picker.setAttribute(workspacePickerAttribute, "");
  picker.setAttribute(workspacePickerStateAttribute, "loading");

  if (pathInput.value.replace(/\/+$/, "") === reposRoot) return;

  picker.dataset["omnigentPreRootEntries"] = entriesFingerprint(picker);
  picker.dataset["omnigentReposNavigationStartedAt"] = String(Date.now());
  setControlledInputValue(pathInput, reposRoot);
  window.setTimeout(() => {
    pathInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  }, 0);
  window.setTimeout(constrainWorkspacePickers, 550);
}

function decorateReposPicker(picker: HTMLElement): void {
  picker.setAttribute(workspacePickerAttribute, "");
  if (!pickerShowsReposRoot(picker)) {
    picker.setAttribute(workspacePickerStateAttribute, "loading");
    return;
  }

  picker.setAttribute(workspacePickerStateAttribute, "ready");
  delete picker.dataset["omnigentPreRootEntries"];
  delete picker.dataset["omnigentReposNavigationStartedAt"];

  const focused = focusedRepoNames();
  const focusedSet = new Set(focused);
  const mode = repoPickerMode();
  picker.setAttribute(repoPickerModeAttribute, mode);
  ensureRepoPickerToolbar(picker, mode, focused.length);

  picker.querySelectorAll<HTMLElement>('[data-testid^="workspace-picker-entry-"]').forEach((entry) => {
    const name = repoNameForPickerEntry(entry);
    const visible = isVisibleRepoName(name);
    entry.classList.toggle("omnigent-repos-hidden", !visible);
    entry.classList.toggle("omnigent-repos-unfocused", visible && mode === "focus" && !focusedSet.has(name));
    if (visible) {
      entry.setAttribute("title", `Use ${name} as the workspace`);
      ensureHideRepoButton(picker, entry, name);
      ensurePinRepoButton(picker, entry, name);
      ensureFocusRepoButton(picker, entry, name, focusedSet.has(name));
    }
  });

  for (const attribute of [hideRepoButtonAttribute, pinRepoButtonAttribute, focusRepoButtonAttribute]) {
    picker.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach((button) => {
      const name = button.getAttribute(attribute) || "";
      const rowShown = isVisibleRepoName(name) && (mode === "all" || focusedSet.has(name));
      const offered = attribute !== pinRepoButtonAttribute || mode === "all";
      button.hidden = !rowShown || !offered;
    });
  }
  orderPickerEntries(picker, mode);
}

export function constrainWorkspacePickers(): void {
  installWorkspacePickerStyles();
  document.querySelectorAll<HTMLElement>('[data-testid="workspace-picker"]').forEach((picker) => {
    if (picker.dataset["omnigentSelectedRepo"]) return;
    forcePickerToReposRoot(picker);
    decorateReposPicker(picker);
  });
}

function projectNameForNewSessionButton(button: Element): string {
  const section = button.closest("section");
  const name = section?.querySelector("h2 button > span")?.textContent?.trim() || "";
  return name;
}

export function ensureProjectRepoSessionButtons(): void {
  document.querySelectorAll<HTMLElement>('[data-testid="project-new-session"]').forEach((button) => {
    const name = projectNameForNewSessionButton(button);
    if (!isVisibleRepoName(name)) {
      button.removeAttribute(projectRepoSessionButtonAttribute);
      return;
    }
    button.setAttribute(projectRepoSessionButtonAttribute, name);
    button.setAttribute("aria-label", `New session in ${workspacePathForRepo(name)}`);
    button.title = `New session in ${workspacePathForRepo(name)}`;
  });
}

export function applyPendingProjectRepoSelection(): void {
  if (window.location.pathname !== "/") return;
  const name = window.localStorage.getItem(pendingProjectRepoStorageKey) || "";
  if (!isVisibleRepoName(name)) {
    if (name !== "") window.localStorage.removeItem(pendingProjectRepoStorageKey);
    return;
  }

  const chip = document.querySelector<HTMLElement>('[data-testid="new-chat-landing-workspace-chip"]');
  if (!chip) return;
  const chipLabel = chip.querySelector("span")?.textContent?.trim() || "";
  if (chipLabel === name && selectedWorkspaceMatchesChip()) {
    window.localStorage.removeItem(pendingProjectRepoStorageKey);
    return;
  }

  const picker = document.querySelector<HTMLElement>('[data-testid="workspace-picker"]');
  if (!picker) {
    window.setTimeout(() => {
      if (!document.querySelector('[data-testid="workspace-picker"]')) chip.click();
    }, 0);
    return;
  }
  if (picker.getAttribute(workspacePickerStateAttribute) !== "ready") return;
  if (picker.dataset["omnigentPendingProjectRepoClicked"] === name) return;

  const entry = [...picker.querySelectorAll<HTMLElement>('[data-testid^="workspace-picker-entry-"]')].find(
    (candidate) => repoNameForPickerEntry(candidate) === name,
  );
  if (!entry) {
    window.localStorage.removeItem(pendingProjectRepoStorageKey);
    return;
  }
  picker.dataset["omnigentPendingProjectRepoClicked"] = name;
  entry.click();
}

function selectedWorkspaceMatchesChip(): boolean {
  const selectedWorkspace = window.localStorage.getItem(selectedWorkspaceStorageKey) || "";
  if (!isAllowedWorkspacePath(selectedWorkspace)) return false;

  const chip = document.querySelector('[data-testid="new-chat-landing-workspace-chip"]');
  const label = chip?.querySelector("span")?.textContent?.trim() || "";
  return label === selectedWorkspace.slice(reposRoot.length + 1);
}

function openWorkspacePicker(): void {
  if (document.querySelector('[data-testid="workspace-picker"]')) return;
  document
    .querySelector<HTMLElement>('[data-testid="new-chat-landing-workspace-chip"]')
    ?.click();
}

function closeWorkspacePickerAfterSelection(picker: HTMLElement, name: string): void {
  picker.dataset["omnigentSelectedRepo"] = name;
  let checks = 0;
  const checkWorkspace = (): void => {
    if (!document.contains(picker) || picker.dataset["omnigentSelectedRepo"] !== name) return;

    const chip = document.querySelector<HTMLElement>('[data-testid="new-chat-landing-workspace-chip"]');
    const label = chip?.querySelector("span")?.textContent?.trim() || "";
    if (label === name) {
      chip?.click();
      return;
    }

    checks += 1;
    if (checks < 40) {
      window.setTimeout(checkWorkspace, 50);
    } else {
      delete picker.dataset["omnigentSelectedRepo"];
      constrainWorkspacePickers();
    }
  };
  window.setTimeout(checkWorkspace, 0);
}

export function installWorkspaceSelectionHandlers(): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const projectRepoSessionButton = target?.closest(`[${projectRepoSessionButtonAttribute}]`);
      if (projectRepoSessionButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const name = projectRepoSessionButton.getAttribute(projectRepoSessionButtonAttribute) || "";
        if (!isVisibleRepoName(name)) return;
        window.localStorage.setItem(pendingProjectRepoStorageKey, name);
        window.localStorage.setItem(selectedWorkspaceStorageKey, workspacePathForRepo(name));
        window.location.assign("/");
        return;
      }

      const resetHiddenButton = target?.closest(`[${resetHiddenReposButtonAttribute}]`);
      if (resetHiddenButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        resetUserHiddenRepoNames();
        constrainWorkspacePickers();
        return;
      }

      const modeToggle = target?.closest(`[${repoPickerModeToggleAttribute}]`);
      if (modeToggle instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        setRepoPickerMode(modeToggle.getAttribute("aria-checked") === "true" ? "all" : "focus");
        constrainWorkspacePickers();
        return;
      }

      const focusButton = target?.closest(`[${focusRepoButtonAttribute}]`);
      if (focusButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        toggleFocusedRepo(focusButton.getAttribute(focusRepoButtonAttribute) || "");
        return;
      }

      const pinButton = target?.closest(`[${pinRepoButtonAttribute}]`);
      if (pinButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        togglePinnedRepo(pinButton.getAttribute(pinRepoButtonAttribute) || "");
        return;
      }

      const hideButton = target?.closest(`[${hideRepoButtonAttribute}]`);
      if (hideButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        hideRepoFromPicker(hideButton.getAttribute(hideRepoButtonAttribute) || "");
        return;
      }

      const entry = target?.closest('[data-testid^="workspace-picker-entry-"]');
      if (!(entry instanceof HTMLElement)) return;

      const picker = entry.closest('[data-testid="workspace-picker"]');
      if (
        !picker?.hasAttribute(workspacePickerAttribute) ||
        picker.getAttribute(workspacePickerStateAttribute) !== "ready"
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const name = repoNameForPickerEntry(entry);
      if (!isVisibleRepoName(name)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      window.localStorage.setItem(selectedWorkspaceStorageKey, workspacePathForRepo(name));
      closeWorkspacePickerAfterSelection(picker as HTMLElement, name);
    },
    true,
  );

  const blockUnselectedWorkspace = (event: Event): void => {
    if (selectedWorkspaceMatchesChip()) return;
    event.preventDefault();
    event.stopPropagation();
    openWorkspacePicker();
  };

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-testid="new-chat-landing-submit"]')) {
        blockUnselectedWorkspace(event);
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="new-chat-landing"]')) {
        blockUnselectedWorkspace(event);
      }
    },
    true,
  );

  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === projectFocusStorageKey) constrainWorkspacePickers();
  });
}
