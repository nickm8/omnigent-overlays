// ==UserScript==
// @name          Omnigent Project Focus
// @namespace     https://omnigent.local/userscripts
// @version       0.2.2
// @description   Allows for filtering the sidebar's Projects list to a subset you want to focus on.
// @match         http://localhost/*
// @match         http://127.0.0.1/*
// @run-at        document-start
// @grant         none
// ==/UserScript==
"use strict";
(() => {
  // src/shared/dom.ts
  function onDocumentReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }
  function observeAndApply(fn) {
    fn();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        fn();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  function installStyles(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.documentElement.append(style);
  }

  // src/scripts/project-focus.ts
  (function() {
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
    let picking = false;
    function readState() {
      try {
        const value = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, names: [] };
        const record = value;
        const names = Array.isArray(record["names"]) ? [...new Set(record["names"].filter((name) => typeof name === "string" && name !== ""))] : [];
        return { enabled: record["enabled"] === true && names.length > 0, names };
      } catch {
        return { enabled: false, names: [] };
      }
    }
    function writeState(state) {
      try {
        const names = [...new Set(state.names)];
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ enabled: state.enabled && names.length > 0, names })
        );
      } catch {
      }
      apply();
    }
    function toggleProject(name) {
      const state = readState();
      const names = state.names.includes(name) ? state.names.filter((current) => current !== name) : [...state.names, name];
      const firstPick = state.names.length === 0 && !picking;
      const enabled = names.length === 0 ? false : firstPick ? true : state.enabled;
      writeState({ enabled, names });
    }
    function soloProject(name) {
      const state = readState();
      const alreadySolo = state.enabled && state.names.length === 1 && state.names[0] === name;
      picking = false;
      writeState(alreadySolo ? { enabled: false, names: [] } : { enabled: true, names: [name] });
    }
    function cyclePill() {
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
    function clearFocus() {
      picking = false;
      writeState({ enabled: false, names: [] });
    }
    function projectName(section) {
      const button = section.querySelector("h2 button");
      if (!button) return "";
      for (const span of button.querySelectorAll(":scope > span")) {
        const text = span.textContent?.trim() ?? "";
        if (text !== "") return text;
      }
      return "";
    }
    function projectGroups() {
      const groups = [];
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
    function projectsHeader(groups) {
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
    function installFocusStyles() {
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
      `
      );
    }
    function setText(element, text) {
      if (element.textContent !== text) element.textContent = text;
    }
    function setAttribute(element, name, value) {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }
    function dockInboardOfAppActions(header, mine) {
      const action = [...header.children].find(
        (child) => child !== mine && child instanceof HTMLElement && child.tagName === "DIV"
      );
      const headerBox = header.getBoundingClientRect();
      const actionBox = action?.getBoundingClientRect();
      const reserved = actionBox && actionBox.width > 0 && headerBox.width > 0 ? headerBox.right - actionBox.left : 0;
      const usable = reserved > 0 && reserved <= headerBox.width / 2 ? reserved : 0;
      const right = `${Math.round((usable / 16 + 0.5) * 1e3) / 1e3}rem`;
      if (mine.style.right !== right) mine.style.right = right;
    }
    function ensureProjectButton(group, focused) {
      setAttribute(group.header, hostAttribute, "");
      const existing = group.header.querySelector(`[${buttonAttribute}]`);
      const button = existing instanceof HTMLButtonElement ? existing : (() => {
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
    function ensureControls(header, state, total, hidden) {
      setAttribute(header, hostAttribute, "");
      const existing = document.getElementById(controlsId);
      if (!(existing instanceof HTMLElement) || !header.contains(existing)) {
        existing?.remove();
        const controls = document.createElement("div");
        controls.id = controlsId;
        controls.setAttribute("aria-label", "Project focus");
        const pill2 = document.createElement("button");
        pill2.id = pillId;
        pill2.type = "button";
        pill2.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) clearFocus();
          else cyclePill();
        });
        const clear2 = document.createElement("button");
        clear2.id = clearId;
        clear2.type = "button";
        clear2.textContent = "✕";
        clear2.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          clearFocus();
        });
        controls.append(pill2, clear2);
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
      const title = active ? `Focused on ${count} of ${total} projects — ${hidden} hidden. Click to show all and pick more.` : picking ? count === 0 ? `Picking: tick the projects to keep with the ○ beside each of the ${total}, then click here to hide the rest.` : `${count} picked. Click here to focus on them and hide the other ${total - count}.` : state.enabled ? `Focus is on, but none of the ${count} picked projects are in this list — showing all.` : count === 0 ? "Focus on a few projects and hide the rest. Click to start picking." : `Focus is off, ${count} picked. Click to apply.`;
      setAttribute(pill, "aria-label", title);
      setAttribute(pill, "title", title);
      dockInboardOfAppActions(header, document.getElementById(controlsId));
      clear.hidden = count === 0 && !picking;
      const clearTitle = count === 0 ? "Stop picking" : "Clear the focus selection";
      setAttribute(clear, "aria-label", clearTitle);
      setAttribute(clear, "title", clearTitle);
    }
    function apply() {
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
})();
