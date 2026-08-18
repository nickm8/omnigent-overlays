// ==UserScript==
// @name          Omnigent Palette Swapper
// @namespace     https://omnigent.local/userscripts
// @version       0.1.2
// @description   Switcher for the app's colour palette
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
  function installStyles(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.documentElement.append(style);
  }

  // src/scripts/palette-swapper.ts
  (function() {
    "use strict";
    if (window.__omnigentPaletteSwapper) return;
    window.__omnigentPaletteSwapper = true;
    const toggleId = "omnigent-palette-swapper-toggle";
    const panelId = "omnigent-palette-swapper-panel";
    const styleId = "omnigent-palette-swapper-style";
    const paletteStorageKey = "omnigent:ui-theme-palette";
    const modeStorageKey = "web-theme";
    const defaultPaletteId = "omni";
    const PALETTES = [
      {
        id: "omni",
        label: "Omnigent",
        blurb: "The signature pink brand look.",
        light: { bg: "#fdf7fb", card: "#ffffff", accent: "#df3c85", border: "#e8ecf0", text: "#11171c" },
        dark: { bg: "#160e24", card: "#28223a", accent: "#df3c85", border: "#2a2440", text: "#f4f5f7" }
      },
      {
        id: "dracula",
        label: "Dracula",
        blurb: "Moody purple with a pink pop.",
        light: { bg: "#f7f5fd", card: "#ffffff", accent: "#7c3aed", border: "#e6e0f2", text: "#1e1a2b" },
        dark: { bg: "#282a36", card: "#343746", accent: "#bd93f9", border: "#44475a", text: "#f8f8f2" }
      },
      {
        id: "github",
        label: "GitHub",
        blurb: "Clean neutrals with a signal blue.",
        light: { bg: "#f6f8fa", card: "#ffffff", accent: "#0969da", border: "#d1d9e0", text: "#1f2328" },
        dark: { bg: "#0d1117", card: "#161b22", accent: "#58a6ff", border: "#30363d", text: "#e6edf3" }
      },
      {
        id: "catppuccin",
        label: "Catppuccin",
        blurb: "Soft pastels",
        light: { bg: "#eff1f5", card: "#ffffff", accent: "#8839ef", border: "#ccd0da", text: "#4c4f69" },
        dark: { bg: "#1e1e2e", card: "#313244", accent: "#cba6f7", border: "#45475a", text: "#cdd6f4" }
      },
      {
        id: "gruvbox",
        label: "Gruvbox",
        blurb: "Warm retro earth tones.",
        light: { bg: "#fbf1c7", card: "#fffdf2", accent: "#d65d0e", border: "#e6d5a8", text: "#3c3836" },
        dark: { bg: "#282828", card: "#3c3836", accent: "#fe8019", border: "#504945", text: "#ebdbb2" }
      }
    ];
    const MODES = [
      { id: "light", label: "☀", title: "Light" },
      { id: "system", label: "◑", title: "Follow system" },
      { id: "dark", label: "☾", title: "Dark" }
    ];
    let panelOpen = false;
    function isKnownPalette(id) {
      return PALETTES.some((palette) => palette.id === id);
    }
    function readPalette() {
      try {
        const raw = window.localStorage.getItem(paletteStorageKey);
        if (!raw) return defaultPaletteId;
        const value = JSON.parse(raw);
        return typeof value === "string" && isKnownPalette(value) ? value : defaultPaletteId;
      } catch {
        return defaultPaletteId;
      }
    }
    function readMode() {
      try {
        const raw = window.localStorage.getItem(modeStorageKey);
        return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
      } catch {
        return "system";
      }
    }
    function prefersDark() {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    }
    function applyPalette(id) {
      const root = document.documentElement;
      if (!root) return;
      if (id === defaultPaletteId || !isKnownPalette(id)) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", id);
      }
    }
    function applyMode(mode) {
      const root = document.documentElement;
      if (!root) return;
      const dark = mode === "dark" || mode === "system" && prefersDark();
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    }
    function writePalette(id) {
      try {
        if (id === defaultPaletteId || !isKnownPalette(id)) {
          window.localStorage.removeItem(paletteStorageKey);
        } else {
          window.localStorage.setItem(paletteStorageKey, JSON.stringify(id));
        }
      } catch {
      }
      applyPalette(id);
    }
    function writeMode(mode) {
      try {
        window.localStorage.setItem(modeStorageKey, mode);
      } catch {
      }
      applyMode(mode);
    }
    function activeSwatch(palette) {
      const mode = readMode();
      const dark = mode === "dark" || mode === "system" && prefersDark();
      return dark ? palette.dark : palette.light;
    }
    function installPaletteStyles() {
      installStyles(
        styleId,
        `
      /* Sits immediately left of the overlay launcher (right:12px, 100px wide),
         vertically centred against its 35px height. */
      #${toggleId}{position:fixed;right:120px;bottom:15px;z-index:2147483646;
        width:30px;height:30px;padding:0;border:1px solid #4a5568;border-radius:999px;
        background:#1a202c;color:#e2e8f0;cursor:pointer;
        font:15px/1 system-ui,sans-serif;box-shadow:0 2px 8px #0006;
        display:flex;align-items:center;justify-content:center}
      #${toggleId}:hover{background:#2d3748}
      #${toggleId}[aria-expanded=true]{background:#2d3748;border-color:#718096}

      #${panelId}{position:fixed;right:120px;bottom:52px;z-index:2147483646;
        width:236px;padding:10px;border:1px solid #4a5568;border-radius:12px;
        background:#12161f;color:#e2e8f0;box-shadow:0 6px 24px #0009;
        font:13px/1.35 system-ui,sans-serif}
      #${panelId}[hidden]{display:none}
      #${panelId} .ps-title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;
        color:#8b96a8;margin:0 2px 8px}

      #${panelId} .ps-palette{display:flex;align-items:center;gap:9px;width:100%;
        margin:0 0 4px;padding:6px 7px;border:1px solid transparent;border-radius:9px;
        background:transparent;color:inherit;cursor:pointer;text-align:left}
      #${panelId} .ps-palette:hover{background:#1c2431}
      #${panelId} .ps-palette[aria-pressed=true]{border-color:#718096;background:#1c2431}
      #${panelId} .ps-swatch{flex:0 0 auto;width:34px;height:26px;border-radius:6px;
        position:relative;overflow:hidden}
      #${panelId} .ps-swatch i{position:absolute;right:5px;top:50%;transform:translateY(-50%);
        width:12px;height:12px;border-radius:999px}
      #${panelId} .ps-label{display:block;font-weight:600;font-size:12.5px}
      #${panelId} .ps-blurb{display:block;font-size:10.5px;color:#8b96a8;margin-top:1px}
      #${panelId} .ps-check{margin-left:auto;color:#9ad;font-size:12px;visibility:hidden}
      #${panelId} .ps-palette[aria-pressed=true] .ps-check{visibility:visible}

      #${panelId} .ps-modes{display:flex;gap:4px;margin-top:9px;padding-top:9px;
        border-top:1px solid #2a3444}
      #${panelId} .ps-mode{flex:1;padding:6px 0;border:1px solid #333c4a;border-radius:8px;
        background:#14141c;color:#c9d2df;cursor:pointer;font:14px/1 system-ui,sans-serif}
      #${panelId} .ps-mode:hover{background:#1c2431}
      #${panelId} .ps-mode[aria-pressed=true]{border-color:#718096;background:#243044;color:#fff}
      `
      );
    }
    function buildPalette(palette, currentId) {
      const swatch = activeSwatch(palette);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ps-palette";
      button.setAttribute("aria-pressed", String(palette.id === currentId));
      button.title = palette.blurb;
      const chip = document.createElement("span");
      chip.className = "ps-swatch";
      chip.style.background = swatch.card;
      chip.style.border = `1px solid ${swatch.border}`;
      const dot = document.createElement("i");
      dot.style.background = swatch.accent;
      chip.append(dot);
      const meta = document.createElement("span");
      meta.style.minWidth = "0";
      const label = document.createElement("span");
      label.className = "ps-label";
      label.textContent = palette.label;
      const blurb = document.createElement("span");
      blurb.className = "ps-blurb";
      blurb.textContent = palette.blurb;
      meta.append(label, blurb);
      const check = document.createElement("span");
      check.className = "ps-check";
      check.textContent = "✓";
      button.append(chip, meta, check);
      button.addEventListener("click", () => {
        writePalette(palette.id);
        renderPanel();
      });
      return button;
    }
    function buildModes(currentMode) {
      const row = document.createElement("div");
      row.className = "ps-modes";
      for (const mode of MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ps-mode";
        button.textContent = mode.label;
        button.title = mode.title;
        button.setAttribute("aria-label", mode.title);
        button.setAttribute("aria-pressed", String(mode.id === currentMode));
        button.addEventListener("click", () => {
          writeMode(mode.id);
          renderPanel();
        });
        row.append(button);
      }
      return row;
    }
    function renderPanel() {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      panel.hidden = !panelOpen;
      if (!panelOpen) return;
      const currentId = readPalette();
      const currentMode = readMode();
      panel.replaceChildren();
      const title = document.createElement("p");
      title.className = "ps-title";
      title.textContent = "Colour palette";
      panel.append(title);
      for (const palette of PALETTES) panel.append(buildPalette(palette, currentId));
      panel.append(buildModes(currentMode));
    }
    function setPanelOpen(open) {
      panelOpen = open;
      const toggle = document.getElementById(toggleId);
      toggle?.setAttribute("aria-expanded", String(open));
      renderPanel();
    }
    function render() {
      installPaletteStyles();
      if (!document.getElementById(toggleId)) {
        const toggle = document.createElement("button");
        toggle.id = toggleId;
        toggle.type = "button";
        toggle.textContent = "🎨";
        toggle.title = "Switch colour palette";
        toggle.setAttribute("aria-label", "Switch colour palette");
        toggle.setAttribute("aria-expanded", "false");
        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          setPanelOpen(!panelOpen);
        });
        document.body.append(toggle);
      }
      if (!document.getElementById(panelId)) {
        const panel = document.createElement("div");
        panel.id = panelId;
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Colour palette");
        panel.addEventListener("click", (event) => event.stopPropagation());
        document.body.append(panel);
        renderPanel();
      }
    }
    function applyStored() {
      applyPalette(readPalette());
      applyMode(readMode());
    }
    applyStored();
    onDocumentReady(() => {
      applyStored();
      render();
      document.addEventListener("click", () => {
        if (panelOpen) setPanelOpen(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && panelOpen) setPanelOpen(false);
      });
      window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (readMode() === "system") {
          applyMode("system");
          renderPanel();
        }
      });
      const observer = new MutationObserver(() => render());
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  })();
})();
