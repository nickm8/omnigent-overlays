
import { installStyles, observeAndApply, onDocumentReady } from "../shared/dom";

(function () {
  "use strict";

  if (window.__omnigentProjectFocus) return;
  window.__omnigentProjectFocus = true;

  const storageKey = "omnigent:project-focus-v1";
  const styleId = "omnigent-project-focus-style";
  const controlsId = "omnigent-project-focus-controls";
  const pillId = "omnigent-project-focus-pill";
  const clearId = "omnigent-project-focus-clear";
  const buttonAttribute = "data-omnigent-project-focus";
  const hostAttribute = "data-omnigent-project-focus-host";
  const hiddenAttribute = "data-omnigent-project-focus-hidden";
  const readyAttribute = "data-omnigent-project-focus-active";
  const pickingAttribute = "data-omnigent-project-focus-picking";
  const projectActionsSelector = '[data-testid="project-actions"]';
  const projectsHeaderLabel = "Projects";

  interface FocusState {
    enabled: boolean;
    names: string[];
  }

  /**
   * Picking mode: show every project AND reveal every ○ toggle, so the list can
   * be chosen. Deliberately NOT persisted — it is a transient editing mode, and
   * a reload should land back on whatever the operator actually focused.
   *
   * This mode exists because the toggles are hover-revealed (they would collide
   * with long project names otherwise), which on its own left no discoverable
   * way in: the pill was inert until something was selected, and nothing on
   * screen said "hover a project". Now the pill always does something.
   */
  let picking = false;

  interface ProjectGroup {
    /** The project's <section> (kGt root). */
    section: HTMLElement;
    /** The element to hide — the drop-target wrapper when there is one. */
    wrapper: HTMLElement;
    /** The header <div class="group/header relative"> the controls dock into. */
    header: HTMLElement;
    name: string;
  }


  function readState(): FocusState {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, names: [] };

      const record = value as Record<string, unknown>;
      const names = Array.isArray(record["names"])
        ? [...new Set(record["names"].filter((name): name is string => typeof name === "string" && name !== ""))]
        : [];
      return { enabled: record["enabled"] === true && names.length > 0, names };
    } catch {
      return { enabled: false, names: [] };
    }
  }

  function writeState(state: FocusState): void {
    try {
      const names = [...new Set(state.names)];
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ enabled: state.enabled && names.length > 0, names }),
      );
    } catch {
    }
    apply();
  }

  /**
   * Add/remove one project.
   *
   * Ticking must not re-apply the filter mid-pick, or the second project you
   * reached for would vanish before you got to it. So the filter is applied
   * only by the pill, with one shortcut: a tick from a clean slate outside
   * picking mode (i.e. you hovered a project row and clicked ○) focuses that
   * project immediately, because there is nothing to lose and it is the common
   * case. Emptying the set always turns focus off.
   */
  function toggleProject(name: string): void {
    const state = readState();
    const names = state.names.includes(name)
      ? state.names.filter((current) => current !== name)
      : [...state.names, name];
    const firstPick = state.names.length === 0 && !picking;
    const enabled = names.length === 0 ? false : firstPick ? true : state.enabled;
    writeState({ enabled, names });
  }

  /** Make one project the entire focus set — or clear it if it already is. */
  function soloProject(name: string): void {
    const state = readState();
    const alreadySolo = state.enabled && state.names.length === 1 && state.names[0] === name;
    picking = false;
    writeState(alreadySolo ? { enabled: false, names: [] } : { enabled: true, names: [name] });
  }

  /**
   * The pill's one job, in three states:
   *   focus applied    -> suspend it and go back to picking (show all, toggles up)
   *   picking, n picked -> apply the focus
   *   nothing picked    -> just enter/leave picking, so the toggles become
   *                        visible and the list is choosable at all
   * There is deliberately no dead state: whatever the sidebar looks like, the
   * pill moves you somewhere.
   */
  function cyclePill(): void {
    const state = readState();
    if (state.enabled) {
      picking = true;
      writeState({ enabled: false, names: state.names });
      return;
    }
    if (state.names.length > 0) {
      picking = false;
      writeState({ enabled: true, names: state.names });
      return;
    }
    picking = !picking;
    apply();
  }

  function clearFocus(): void {
    picking = false;
    writeState({ enabled: false, names: [] });
  }


  function projectName(section: Element): string {
    const button = section.querySelector("h2 button");
    if (!button) return "";
    for (const span of button.querySelectorAll(":scope > span")) {
      const text = span.textContent?.trim() ?? "";
      if (text !== "") return text;
    }
    return "";
  }

  function projectGroups(): ProjectGroup[] {
    const groups: ProjectGroup[] = [];
    for (const actions of document.querySelectorAll(projectActionsSelector)) {
      const section = actions.closest("section");
      const header = actions.closest("div.group\\/header") ?? section?.firstElementChild;
      const name = section ? projectName(section) : "";
      if (!(section instanceof HTMLElement) || !(header instanceof HTMLElement) || name === "") continue;

      const parent = section.parentElement;
      const wrapper = parent instanceof HTMLElement && parent.childElementCount === 1 ? parent : section;
      groups.push({ section, wrapper, header, name });
    }
    return groups;
  }

  /** The Projects section's header, where the master FOCUS pill docks. */
  function projectsHeader(groups: ProjectGroup[]): HTMLElement | null {
    const root = groups[0]?.wrapper.closest("section");
    const header = root?.firstElementChild;
    if (header instanceof HTMLElement) return header;

    for (const span of document.querySelectorAll("section h2 button > span")) {
      if (span.textContent?.trim() !== projectsHeaderLabel) continue;
      const section = span.closest("section");
      if (!section || section.querySelector(projectActionsSelector)) continue;
      const candidate = span.closest("div.group\\/header") ?? section.firstElementChild;
      if (candidate instanceof HTMLElement) return candidate;
    }
    return null;
  }


  function installFocusStyles(): void {
    installStyles(
      styleId,
      `
      [${hiddenAttribute}] {
        display: none !important;
      }

      /* Own the containing block for the docked controls instead of trusting
         the app's \`relative\` utility class to stay on the header. */
      [${hostAttribute}] {
        position: relative;
      }

      [${buttonAttribute}] {
        position: absolute;
        z-index: 3;
        top: 0.125rem;
        right: 4.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: 0.8125rem/1 system-ui, sans-serif;
        opacity: 0.6;
      }

      [${buttonAttribute}]:hover {
        background: var(--accent, rgba(127, 127, 127, 0.16));
        color: var(--foreground, currentColor);
        opacity: 1;
      }

      [${buttonAttribute}][aria-pressed="true"] {
        color: var(--primary, #7c3aed);
        opacity: 1;
      }

      /* Same grammar as the app's own ⋯/+ project actions (\`md:opacity-0
         md:group-hover/header:opacity-100\`): reveal on hover from the md
         breakpoint up, stay visible on touch layouts where there is no hover.
         Reserving a permanent slot instead would have to pad ~6rem off every
         project title in a ~320px sidebar; a focused project keeps its ◉ shown
         either way, so focus is always reversible without hunting. */
      @media (min-width: 768px) {
        [${buttonAttribute}]:not([aria-pressed="true"]) {
          opacity: 0;
        }

        [${hostAttribute}]:hover [${buttonAttribute}],
        [${buttonAttribute}]:focus-visible,
        /* Picking mode is the answer to "how do I choose?" — while it is on,
           every toggle is up, no hovering required (and no hover exists on
           touch). */
        [${pickingAttribute}] [${buttonAttribute}] {
          opacity: 1;
        }
      }

      /* One flex container so the pill and the clear button lay themselves out:
         the pill's width changes with its label, so fixed right offsets per
         button would drift apart. */
      #${controlsId} {
        position: absolute;
        z-index: 3;
        top: 0.125rem;
        right: 2.5rem;
        display: flex;
        align-items: center;
        gap: 0.1875rem;
      }

      #${controlsId} button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.375rem;
        padding: 0 0.4rem;
        border: 1px solid color-mix(in srgb, var(--border, #888) 80%, transparent);
        border-radius: 4px;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: 700 0.625rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.03em;
        opacity: 0.6;
      }

      #${controlsId} button:hover {
        opacity: 1;
      }

      #${pillId} {
        min-width: 2.75rem;
      }

      #${pillId}[aria-pressed="true"] {
        border-color: color-mix(in srgb, var(--primary, #7c3aed) 70%, transparent);
        background: color-mix(in srgb, var(--primary, #7c3aed) 18%, transparent);
        color: var(--foreground, currentColor);
        opacity: 1;
      }

      /* Picking mode: dashed border says "choosing, nothing applied yet". */
      #${pillId}[data-state="picking"] {
        border-style: dashed;
        border-color: color-mix(in srgb, var(--primary, #7c3aed) 60%, transparent);
        color: var(--foreground, currentColor);
        opacity: 1;
      }

      #${clearId} {
        width: 1.375rem;
        padding: 0;
        font-size: 0.6875rem;
      }

      #${clearId}[hidden] {
        display: none;
      }
      `,
    );
  }

  /** Assign only on change: every write here feeds the MutationObserver back. */
  function setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  function setAttribute(element: Element, name: string, value: string): void {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  /**
   * Dock `mine` just inboard of the app's own header action, measured rather
   * than guessed.
   *
   * The app's action container sits absolutely at `right-1` and its contents
   * change with the app version: the Projects header served on 2026-07-25 holds
   * only expand-all/revert, but `~/repos/omnigent/web/src/shell/Sidebar.tsx`
   * (which runs ahead of the installed server) already adds a "New project…"
   * button beside it — a hardcoded offset would collide the day that ships.
   * Nothing to avoid (the container is `hidden` below the md breakpoint) docks
   * at the edge, which is correct.
   *
   * The measurement is clamped to half the header, because it is only
   * meaningful when that container is the app's absolutely-positioned icon
   * cluster. Strip the app's stylesheet — a fixture, or a redesign that stops
   * positioning it — and the same div measures full-width, which without the
   * clamp would fling the control clean off the sidebar.
   */
  function dockInboardOfAppActions(header: HTMLElement, mine: HTMLElement): void {
    const action = [...header.children].find(
      (child): child is HTMLElement => child !== mine && child instanceof HTMLElement && child.tagName === "DIV",
    );
    const headerBox = header.getBoundingClientRect();
    const actionBox = action?.getBoundingClientRect();
    const reserved =
      actionBox && actionBox.width > 0 && headerBox.width > 0 ? headerBox.right - actionBox.left : 0;
    const usable = reserved > 0 && reserved <= headerBox.width / 2 ? reserved : 0;
    const right = `${Math.round((usable / 16 + 0.5) * 1000) / 1000}rem`;
    if (mine.style.right !== right) mine.style.right = right;
  }

  function ensureProjectButton(group: ProjectGroup, focused: boolean): void {
    setAttribute(group.header, hostAttribute, "");
    const existing = group.header.querySelector(`[${buttonAttribute}]`);
    const button =
      existing instanceof HTMLButtonElement
        ? existing
        : (() => {
            const created = document.createElement("button");
            created.type = "button";
            created.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              const name = created.getAttribute(buttonAttribute) || "";
              if (name === "") return;
              if (event.shiftKey || event.ctrlKey || event.metaKey) soloProject(name);
              else toggleProject(name);
            });
            group.header.append(created);
            return created;
          })();

    setAttribute(button, buttonAttribute, group.name);
    setAttribute(button, "aria-pressed", String(focused));
    setText(button, focused ? "◉" : "○");
    const label = focused ? `Remove ${group.name} from focus` : `Focus on ${group.name}`;
    setAttribute(button, "aria-label", label);
    setAttribute(button, "title", `${label} (shift-click: focus on ${group.name} only)`);
    dockInboardOfAppActions(group.header, button);
  }

  function ensureControls(header: HTMLElement, state: FocusState, total: number, hidden: number): void {
    setAttribute(header, hostAttribute, "");
    const existing = document.getElementById(controlsId);
    if (!(existing instanceof HTMLElement) || !header.contains(existing)) {
      existing?.remove();

      const controls = document.createElement("div");
      controls.id = controlsId;
      controls.setAttribute("aria-label", "Project focus");

      const pill = document.createElement("button");
      pill.id = pillId;
      pill.type = "button";
      pill.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) clearFocus();
        else cyclePill();
      });

      const clear = document.createElement("button");
      clear.id = clearId;
      clear.type = "button";
      clear.textContent = "✕";
      clear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearFocus();
      });

      controls.append(pill, clear);
      header.append(controls);
    }

    const pill = document.getElementById(pillId);
    const clear = document.getElementById(clearId);
    if (!(pill instanceof HTMLButtonElement) || !(clear instanceof HTMLButtonElement)) return;

    const count = state.names.length;
    const active = hidden > 0;
    setAttribute(pill, "aria-pressed", String(active));
    setAttribute(pill, "data-state", active ? "focused" : picking ? "picking" : "idle");
    setText(pill, active ? `FOCUS ${count}` : picking ? `PICK ${count}` : count === 0 ? "FOCUS" : `FOCUS ${count}`);

    const title = active
      ? `Focused on ${count} of ${total} projects — ${hidden} hidden. Click to show all and pick more.`
      : picking
        ? count === 0
          ? `Picking: tick the projects to keep with the ○ beside each of the ${total}, then click here to hide the rest.`
          : `${count} picked. Click here to focus on them and hide the other ${total - count}.`
        : state.enabled
          ? `Focus is on, but none of the ${count} picked projects are in this list — showing all.`
          : count === 0
            ? "Focus on a few projects and hide the rest. Click to start picking."
            : `Focus is off, ${count} picked. Click to apply.`;
    setAttribute(pill, "aria-label", title);
    setAttribute(pill, "title", title);

    dockInboardOfAppActions(header, document.getElementById(controlsId) as HTMLElement);

    clear.hidden = count === 0 && !picking;
    const clearTitle = count === 0 ? "Stop picking" : "Clear the focus selection";
    setAttribute(clear, "aria-label", clearTitle);
    setAttribute(clear, "title", clearTitle);
  }


  function apply(): void {
    if (!document.documentElement) return;
    installFocusStyles();
    setAttribute(document.documentElement, readyAttribute, "active");

    const groups = projectGroups();
    const state = readState();
    const focusedNames = new Set(state.names);
    document.documentElement.toggleAttribute(pickingAttribute, picking);

    const present = groups.filter((group) => focusedNames.has(group.name));
    const active = state.enabled && present.length > 0;

    let hidden = 0;
    for (const group of groups) {
      const focused = focusedNames.has(group.name);
      ensureProjectButton(group, focused);
      const hide = active && !focused;
      if (hide) hidden += 1;
      group.wrapper.toggleAttribute(hiddenAttribute, hide);
    }

    const header = projectsHeader(groups);
    if (header) ensureControls(header, state, groups.length, hidden);
    else document.getElementById(controlsId)?.remove();
  }

  onDocumentReady(() => {
    observeAndApply(apply);

    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === storageKey) apply();
    });
  });
})();
