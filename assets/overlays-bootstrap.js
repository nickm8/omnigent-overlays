// GENERATED from src/overlays/panel/bootstrap.ts by tools/build-userscripts.ts — edit the source, then npm run build.
"use strict";
(() => {
  // src/overlays/control-constants.ts
  var TOKEN_HEADER = "x-omnigent-overlays-token";

  // src/overlays/panel/bootstrap.ts
  var config = window.__omnigentOverlays;
  if (config && config.token && !window.__omnigentOverlaysPanelLoaded) {
    window.__omnigentOverlaysPanelLoaded = true;
    void main(config);
  }
  async function main(cfg) {
    const pageRevision = cfg.revision;
    let needsReload = false;
    let lastError = "";
    async function api(path, init) {
      return fetch(`${cfg.apiBase}${path}`, {
        ...init,
        cache: "no-store",
        headers: { [TOKEN_HEADER]: cfg.token, ...init?.headers ?? {} }
      });
    }
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.textContent = "⚙ Overlays";
    launcher.style.cssText = style(
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483646",
      "padding:8px 15px",
      "border:1px solid rgba(127,127,127,.4)",
      "border-radius:9px",
      "background:rgba(20,20,20,.85)",
      "color:#e6e6e6",
      "font:14px/1.2 ui-sans-serif,system-ui,sans-serif",
      "cursor:pointer",
      "opacity:.85"
    );
    const panel = document.createElement("div");
    panel.style.cssText = style(
      "position:fixed",
      "right:12px",
      "bottom:58px",
      "z-index:2147483646",
      "display:none",
      "width:min(440px,calc(100vw - 24px))",
      "max-height:78vh",
      "overflow:auto",
      "padding:16px",
      "border:1px solid rgba(127,127,127,.35)",
      "border-radius:12px",
      "background:#141414",
      "color:#e6e6e6",
      "font:14px/1.45 ui-sans-serif,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,.45)"
    );
    launcher.addEventListener("click", () => {
      const open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
      if (!open) void render();
    });
    function attach() {
      if (!document.body) {
        window.setTimeout(attach, 50);
        return;
      }
      document.body.append(launcher, panel);
    }
    attach();
    async function render() {
      panel.replaceChildren(heading());
      let view;
      try {
        const response = await api("/state");
        if (!response.ok) {
          panel.append(errorLine(`Could not load overlays (${response.status}).`));
          return;
        }
        view = await response.json();
      } catch {
        panel.append(errorLine("Injector control API unreachable."));
        return;
      }
      if (view.stateError) panel.append(errorLine(view.stateError));
      if (lastError) panel.append(errorLine(lastError));
      if (needsReload || view.activeRevision !== pageRevision) panel.append(reloadBanner());
      const enabled = view.overlays.filter((overlay) => overlay.enabled);
      const available = view.overlays.filter((overlay) => !overlay.enabled);
      panel.append(group("Enabled", enabled));
      panel.append(group("Available", available));
      panel.append(syncRow());
    }
    function heading() {
      const header = document.createElement("div");
      header.textContent = "Overlay library";
      header.style.cssText = style("font-weight:600", "margin-bottom:10px", "font-size:15px");
      return header;
    }
    function group(title, items) {
      const section = document.createElement("div");
      section.style.cssText = style("margin-top:10px");
      const label = document.createElement("div");
      label.textContent = `${title} (${items.length})`;
      label.style.cssText = style("text-transform:uppercase", "letter-spacing:.04em", "font-size:10px", "opacity:.6", "margin-bottom:4px");
      section.append(label);
      if (items.length === 0) {
        const none = document.createElement("div");
        none.textContent = "—";
        none.style.cssText = style("opacity:.4", "padding:2px 0");
        section.append(none);
      }
      for (const item of items) section.append(row(item));
      return section;
    }
    function row(item) {
      const wrap = document.createElement("div");
      wrap.style.cssText = style("display:flex", "align-items:center", "gap:8px", "padding:5px 0", "border-top:1px solid rgba(127,127,127,.15)");
      const meta = document.createElement("div");
      meta.style.cssText = style("flex:1", "min-width:0");
      const name = document.createElement("div");
      name.textContent = item.name;
      name.style.cssText = style("font-weight:500", "white-space:nowrap", "overflow:hidden", "text-overflow:ellipsis");
      const sub = document.createElement("div");
      sub.textContent = `v${item.version}${item.author ? ` · ${item.author}` : ""}`;
      sub.style.cssText = style("font-size:10.5px", "opacity:.55");
      meta.append(name, sub);
      meta.title = item.description;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = item.enabled ? "On" : "Off";
      toggle.style.cssText = toggleStyle(item.enabled);
      toggle.addEventListener("click", () => void setEnabled(item, toggle));
      wrap.append(meta, toggle);
      return wrap;
    }
    async function setEnabled(item, toggle) {
      toggle.disabled = true;
      lastError = "";
      try {
        const response = await api(`/state/${item.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !item.enabled })
        });
        if (!response.ok) {
          const detail = await safeError(response);
          lastError = `Toggle failed (${response.status})${detail ? `: ${detail}` : ""}.`;
        } else {
          needsReload = true;
        }
      } catch {
        lastError = "Injector control API unreachable.";
      }
      await render();
    }
    function syncRow() {
      const wrap = document.createElement("div");
      wrap.style.cssText = style("margin-top:12px", "display:flex", "justify-content:flex-end");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Sync library";
      button.style.cssText = toggleStyle(false);
      button.addEventListener("click", async () => {
        button.disabled = true;
        lastError = "";
        try {
          const response = await api("/sync", { method: "POST" });
          if (!response.ok) {
            const detail = await safeError(response);
            lastError = `Sync failed (${response.status})${detail ? `: ${detail}` : ""}.`;
          } else {
            const result = await response.json();
            if (result.changed || result.activeRevision !== pageRevision) needsReload = true;
          }
        } catch {
          lastError = "Injector control API unreachable.";
        }
        await render();
      });
      wrap.append(button);
      return wrap;
    }
    function reloadBanner() {
      const banner = document.createElement("div");
      banner.style.cssText = style(
        "margin:8px 0",
        "padding:7px 9px",
        "border-radius:7px",
        "background:#3a2f12",
        "border:1px solid #6b571f",
        "display:flex",
        "align-items:center",
        "gap:8px"
      );
      const text = document.createElement("span");
      text.textContent = "Reload to apply changes";
      text.style.cssText = style("flex:1");
      const reload = document.createElement("button");
      reload.type = "button";
      reload.textContent = "Reload";
      reload.style.cssText = toggleStyle(true);
      reload.addEventListener("click", () => window.location.reload());
      banner.append(text, reload);
      return banner;
    }
    function errorLine(message) {
      const line = document.createElement("div");
      line.textContent = message;
      line.style.cssText = style("margin:6px 0", "padding:6px 8px", "border-radius:6px", "background:#3a1616", "border:1px solid #6b1f1f", "font-size:11.5px");
      return line;
    }
    async function safeError(response) {
      try {
        const body = await response.json();
        return body.error ?? "";
      } catch {
        return "";
      }
    }
  }
  function style(...rules) {
    return rules.join(";");
  }
  function toggleStyle(active) {
    return style(
      "padding:5px 13px",
      "border-radius:7px",
      "cursor:pointer",
      "font:13px/1.2 ui-sans-serif,system-ui,sans-serif",
      active ? "background:#2f6b3a" : "background:#2a2a2a",
      active ? "border:1px solid #3f8a4f" : "border:1px solid rgba(127,127,127,.4)",
      "color:#e6e6e6"
    );
  }
})();
