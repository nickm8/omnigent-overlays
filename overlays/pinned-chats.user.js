// ==UserScript==
// @name          Omnigent Pinned Chats
// @namespace     https://omnigent.local/userscripts
// @version       0.11.0
// @description   Managed pinned Omnigent chats.
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
  function setNativeValue(input, value, event) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, value);
    input.dispatchEvent(event);
    return true;
  }

  // src/shared/omnigent-api.ts
  async function identityRequestHeaders() {
    try {
      const response = await window.fetch("/v1/me", { credentials: "same-origin" });
      if (!response.ok) return {};
      const identity = await response.json();
      const userId = identity && typeof identity === "object" && "user_id" in identity ? identity.user_id : null;
      if (typeof userId === "string" && userId !== "local") {
        return { "X-Forwarded-Email": userId };
      }
    } catch {
    }
    return {};
  }
  async function apiErrorMessage(response, operation) {
    const text = await response.text();
    return `${operation} failed: ${text || `${response.status} ${response.statusText}`}`;
  }
  function terminalAttachUrl(conversationId, terminalId) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/v1/sessions/${encodeURIComponent(conversationId)}/resources/terminals/${encodeURIComponent(terminalId)}/attach`;
  }
  async function createTerminalResource(conversationId, sessionKey) {
    const headers = await identityRequestHeaders();
    const agentResponse = await window.fetch(`/v1/sessions/${encodeURIComponent(conversationId)}/agent`, {
      credentials: "same-origin",
      headers
    });
    if (!agentResponse.ok) throw new Error(await apiErrorMessage(agentResponse, "Reading shell options"));
    const agent = await agentResponse.json();
    const declared = agent && typeof agent === "object" && "terminals" in agent && Array.isArray(agent.terminals) ? agent.terminals : [];
    const terminals = declared.filter(
      (terminal2) => typeof terminal2 === "string" && terminal2 !== ""
    );
    const terminal = terminals.includes("shell") ? "shell" : terminals[0];
    if (!terminal) throw new Error("This conversation does not allow shells.");
    const terminalResponse = await window.fetch(
      `/v1/sessions/${encodeURIComponent(conversationId)}/resources/terminals`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ terminal, session_key: sessionKey })
      }
    );
    if (!terminalResponse.ok) throw new Error(await apiErrorMessage(terminalResponse, "Starting shell"));
    const resource = await terminalResponse.json();
    const id = resource && typeof resource === "object" && "id" in resource ? resource.id : null;
    if (typeof id !== "string" || id === "") {
      throw new Error("The shell did not return a terminal id.");
    }
    return id;
  }
  async function terminalMessageText(data) {
    if (typeof data === "string") return data;
    if (data instanceof Blob) return data.text();
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return "";
  }

  // src/scripts/pinned-chats/config.ts
  var pinnedLabelKey = "omnigent.pinned";
  var pinSetsStorageKey = "omnigent:pin-sets-v1";
  var activationAttribute = "data-omnigent-pinned-chat-sorter";
  var pinSetControlsId = "omnigent-pin-set-controls";
  var pinSetControlsStyleId = "omnigent-pin-set-controls-style";
  var pinRecentButtonId = "omnigent-pin-recent-button";
  var pinRecentDayButtonId = "omnigent-pin-recent-day-button";
  var pinMostRecentButtonId = "omnigent-pin-most-recent-button";
  var pinUnpinAllButtonId = "omnigent-pin-unpin-all-button";
  var pinOnlyButtonAttribute = "data-omnigent-pin-only";
  var aiRenameButtonAttribute = "data-omnigent-ai-rename-chat";
  var chatJumpFormId = "omnigent-chat-jump-form";
  var chatJumpInputId = "omnigent-chat-jump-input";
  var chatJumpStatusId = "omnigent-chat-jump-status";
  var chatRenameQueueStorageKey = "omnigent:chat-rename-queue-v1";
  var chatRenameQueueLimit = 6;
  var pinSetCount = 5;
  var recentPinWindowHours = 5;
  var recentPinDayWindowHours = 24;
  var mostRecentPinCount = 4;
  var recentWorkspacesStorageKey = "omnigent:recent-workspaces";
  var selectedWorkspaceStorageKey = "omnigent:selected-repo-workspace";
  var userHiddenRepoNamesStorageKey = "omnigent:hidden-repo-names";
  var userPinnedRepoNamesStorageKey = "omnigent:pinned-repo-names";
  var reposRootStorageKey = "omnigent:repos-root";
  var configuredHiddenRepoNamesStorageKey = "omnigent:configured-hidden-repo-names";
  var defaultReposRoot = "";
  function readStoredString(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored && stored.trim() ? stored.trim().replace(/\/+$/, "") : fallback;
    } catch {
      return fallback;
    }
  }
  function readStoredNameSet(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : []);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  var reposRoot = readStoredString(reposRootStorageKey, defaultReposRoot);
  var projectFocusStorageKey = "omnigent:project-focus-v1";
  var repoPickerModeStorageKey = "omnigent:repo-picker-mode-v1";
  var workspacePickerAttribute = "data-omnigent-repos-picker";
  var workspacePickerStateAttribute = "data-omnigent-repos-picker-state";
  var workspacePickerStyleId = "omnigent-repos-workspace-picker-style";
  var hideRepoButtonAttribute = "data-omnigent-hide-repo";
  var focusRepoButtonAttribute = "data-omnigent-focus-repo";
  var pinRepoButtonAttribute = "data-omnigent-pin-repo";
  var resetHiddenReposButtonAttribute = "data-omnigent-reset-hidden-repos";
  var repoPickerToolbarAttribute = "data-omnigent-repo-picker-toolbar";
  var repoPickerModeAttribute = "data-omnigent-repo-picker-mode";
  var repoPickerModeToggleAttribute = "data-omnigent-repo-picker-mode-toggle";
  var projectRepoSessionButtonAttribute = "data-omnigent-project-repo-session";
  var pendingProjectRepoStorageKey = "omnigent:pending-project-repo-session";
  var buildBadgeId = "omnigent-build-badge";
  var sidebarSelector = "aside.conversations-sidebar";
  var sidebarResizeHandleSelector = '[role="separator"][aria-label="Resize sidebar"]';
  var sidebarResizeStyleId = "omnigent-sidebar-resize-style";
  var sidebarUnlockedWidthVar = "--omnigent-sidebar-width";
  var sidebarUnlockedWidthStorageKey = "omnigent:sidebar-width";
  var sidebarMinWidthPx = 220;
  var scriptVersion = "0.11.0";
  var hiddenRepoNames = readStoredNameSet(configuredHiddenRepoNamesStorageKey);

  // src/scripts/pinned-chats/chat-tools.ts
  function chatMessageText(item) {
    const record = item && typeof item === "object" ? item : null;
    if (!record || record["type"] !== "message" || typeof record["role"] !== "string") return "";
    if (!["user", "assistant"].includes(record["role"])) return "";
    if (record["is_meta"] === true || !Array.isArray(record["content"])) return "";
    return record["content"].filter(
      (block) => Boolean(block && typeof block["text"] === "string")
    ).map((block) => block.text).join("\n").replace(/\u0001/g, "").trim();
  }
  async function sampledChatContext(conversationId) {
    const headers = await identityRequestHeaders();
    const requestPage = async (order) => {
      const params = new URLSearchParams({ limit: "30", order });
      const response = await window.fetch(
        `/v1/sessions/${encodeURIComponent(conversationId)}/items?${params}`,
        { credentials: "same-origin", headers }
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Reading chat context"));
      const body = await response.json();
      const data = body && typeof body === "object" ? body["data"] : null;
      return Array.isArray(data) ? data : [];
    };
    const [oldestItems, newestItems] = await Promise.all([requestPage("asc"), requestPage("desc")]);
    const normalize = (items) => items.map((item) => {
      const record = item && typeof item === "object" ? item : {};
      return { id: record["id"], role: String(record["role"] ?? ""), text: chatMessageText(item) };
    }).filter((item) => item.text !== "");
    const opening = normalize(oldestItems).slice(0, 4);
    const recent = normalize(newestItems).slice(0, 6).reverse();
    const selected = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of [...opening, ...recent]) {
      const key = typeof item.id === "string" ? item.id : `${item.role}:${item.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(`${item.role.toUpperCase()}: ${item.text.slice(0, 1200)}`);
    }
    return selected.join("\n\n").slice(0, 8e3);
  }
  function generateChatTitle(conversationId, terminalId, context) {
    return new Promise((resolve, reject) => {
      const url = terminalAttachUrl(conversationId, terminalId);
      const marker = `__OMNIGENT_TITLE_${Math.random().toString(36).slice(2)}__`;
      const prompt = [
        "Write a concise title for this chat based on the sampled context below.",
        "Use 3-8 plain-language words. Capture the actual task or outcome, not generic words like chat or help.",
        "Output only the title: no quotes, markdown, punctuation suffix, or explanation.",
        "",
        context
      ].join("\n");
      const encodedPrompt = window.btoa(unescape(encodeURIComponent(prompt)));
      const socket = new WebSocket(url);
      let output = "";
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Timed out generating a chat title."));
      }, 3e4);
      const finish = (callback, value) => {
        window.clearTimeout(timeout);
        socket.close();
        callback(value);
      };
      socket.addEventListener(
        "open",
        () => {
          const command = `title=$(printf '%s' '${encodedPrompt}' | base64 -d | command claude -p --model haiku --no-session-persistence --disallowed-tools "Bash,Edit,Write,Read,Glob,Grep,Task,WebFetch,WebSearch,NotebookEdit")
printf '\\n${marker}%s\\n' "$(printf '%s' "$title" | base64 -w0)"\r`;
          socket.send(new TextEncoder().encode(command));
        },
        { once: true }
      );
      socket.addEventListener("message", async (event) => {
        output += await terminalMessageText(event.data);
        const match = output.match(new RegExp(`${marker}([A-Za-z0-9+/=]+)`));
        if (!match?.[1]) return;
        try {
          const title = decodeURIComponent(escape(window.atob(match[1]))).replace(/\s+/g, " ").trim().slice(0, 100);
          if (!title) throw new Error("Haiku returned an empty title.");
          finish(resolve, title);
        } catch (error) {
          finish(reject, error instanceof Error ? error : new Error("Could not decode the generated title."));
        }
      });
      socket.addEventListener("error", () => finish(reject, new Error("Could not run the title generator.")), {
        once: true
      });
    });
  }
  async function renameChatWithHaiku(conversationId) {
    const context = await sampledChatContext(conversationId);
    if (!context) throw new Error("This chat has no message context to name.");
    const terminalId = await createTerminalResource(conversationId, "chat-tools");
    const title = await generateChatTitle(conversationId, terminalId, context);
    const headers = await identityRequestHeaders();
    const response = await window.fetch(`/v1/sessions/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response, "Renaming chat"));
    return title;
  }
  async function aiRenameChat(button, conversationId) {
    button.disabled = true;
    button.textContent = "…";
    try {
      const title = await renameChatWithHaiku(conversationId);
      button.title = `Renamed to: ${title}`;
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      button.title = error instanceof Error ? error.message : "Could not rename this chat.";
      button.disabled = false;
      button.textContent = "AI";
    }
  }
  function ensureAiRenameButtons() {
    document.querySelectorAll('section li a[href*="/c/"]').forEach((link) => {
      const row = link.closest("li");
      if (!row || row.querySelector(`[${aiRenameButtonAttribute}]`)) return;
      const match = new URL(link.href, window.location.href).pathname.match(/\/c\/([^/]+)/);
      if (!match?.[1]) return;
      const conversationId = decodeURIComponent(match[1]);
      row.style.position = "relative";
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute(aiRenameButtonAttribute, "");
      button.setAttribute("aria-label", "Rename chat with Haiku");
      button.title = "Rename chat from sampled context with Haiku";
      button.textContent = "AI";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void aiRenameChat(button, conversationId);
      });
      row.append(button);
    });
  }
  function looksLikeDefaultChatTitle(title) {
    if (typeof title !== "string") return true;
    const trimmed = title.trim();
    if (trimmed === "") return true;
    if (/^untitled:/i.test(trimmed)) return true;
    if (/^(new chat|untitled|new session|claude code)$/i.test(trimmed)) return true;
    if (/^(cld|gpt) .+ - \d+$/i.test(trimmed)) return true;
    return trimmed.endsWith("…");
  }
  function readChatRenameQueue() {
    try {
      const value = JSON.parse(window.localStorage.getItem(chatRenameQueueStorageKey) || "[]");
      return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  }
  function writeChatRenameQueue(ids) {
    window.localStorage.setItem(chatRenameQueueStorageKey, JSON.stringify(ids));
  }
  function queueChatsForRename(conversationIds) {
    const queued = [.../* @__PURE__ */ new Set([...readChatRenameQueue(), ...conversationIds])].slice(
      0,
      chatRenameQueueLimit
    );
    writeChatRenameQueue(queued);
  }
  async function drainChatRenameQueue() {
    for (let renamed = 0; renamed < chatRenameQueueLimit; renamed += 1) {
      const [conversationId, ...rest] = readChatRenameQueue();
      if (!conversationId) return;
      writeChatRenameQueue(rest);
      try {
        await renameChatWithHaiku(conversationId);
      } catch {
      }
    }
  }
  function normalizedChatJumpQuery(value) {
    let query = value.trim();
    const quotePairs = [
      ['"', '"'],
      ["'", "'"],
      ["“", "”"],
      ["‘", "’"]
    ];
    for (const [opening, closing] of quotePairs) {
      if (query.length >= 2 && query.startsWith(opening) && query.endsWith(closing)) {
        query = query.slice(opening.length, -closing.length).trim();
        break;
      }
    }
    return query;
  }
  async function jumpToChatByText(form) {
    const input = form.querySelector(`#${chatJumpInputId}`);
    const button = form.querySelector("button");
    const status = form.querySelector(`#${chatJumpStatusId}`);
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement) || !status) return;
    const query = normalizedChatJumpQuery(input.value);
    if (!query) return;
    input.disabled = true;
    button.disabled = true;
    status.textContent = "Searching…";
    try {
      const params = new URLSearchParams({
        limit: "10",
        order: "desc",
        sort_by: "updated_at",
        search_query: query,
        include_archived: "true"
      });
      const headers = await identityRequestHeaders();
      const response = await window.fetch(`/v1/sessions?${params}`, {
        credentials: "same-origin",
        headers
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Searching chats"));
      const body = await response.json();
      const data = body && typeof body === "object" ? body["data"] : null;
      const match = Array.isArray(data) ? data[0] : void 0;
      const matchId = match ? match["id"] : null;
      if (typeof matchId !== "string" || matchId === "") {
        status.textContent = "No matching chat";
        return;
      }
      status.textContent = `Opening ${match?.["title"] || "matching chat"}…`;
      window.location.assign(`/c/${encodeURIComponent(matchId)}`);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Could not search chats";
    } finally {
      input.disabled = false;
      button.disabled = false;
    }
  }
  function ensureChatJumpInput() {
    const existing = document.getElementById(chatJumpFormId);
    const nativeSearch = document.querySelector('[data-testid="sidebar-search-button"]');
    const searchRow = nativeSearch?.parentElement;
    if (!searchRow) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const form = document.createElement("form");
    form.id = chatJumpFormId;
    form.setAttribute("aria-label", "Open chat containing text");
    const input = document.createElement("input");
    input.id = chatJumpInputId;
    input.type = "text";
    input.placeholder = "Paste chat text…";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Text contained in a chat");
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Open";
    const status = document.createElement("span");
    status.id = chatJumpStatusId;
    status.setAttribute("aria-live", "polite");
    form.append(input, button, status);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void jumpToChatByText(form);
    });
    searchRow.before(form);
  }

  // src/scripts/pinned-chats/live-reload.ts
  var liveReloadIntervalMs = 2e3;
  var reloadToastId = "omnigent-reload-toast";
  function ensureBuildBadge() {
    if (document.getElementById(buildBadgeId)) return;
    const hash = typeof window.__omnigentOverlaysBuild === "string" ? window.__omnigentOverlaysBuild : "direct";
    const badge = document.createElement("div");
    badge.id = buildBadgeId;
    badge.textContent = `UI v${scriptVersion} · ${hash}`;
    badge.title = "Local Omnigent userscript build";
    badge.style.cssText = [
      // Bottom-left: the bottom-right corner belongs to the overlay launcher.
      "position:fixed",
      "left:8px",
      "bottom:8px",
      "z-index:2147483647",
      "padding:3px 6px",
      "border:1px solid rgba(127,127,127,.35)",
      "border-radius:5px",
      "background:rgba(20,20,20,.82)",
      "color:#d4d4d4",
      "font:10px/1.2 ui-monospace,monospace",
      "pointer-events:none",
      "opacity:.78"
    ].join(";");
    document.body.append(badge);
  }
  function reloadForNewBuild() {
    const activeField = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isEditable = activeField && (activeField.tagName === "TEXTAREA" || activeField.tagName === "INPUT" || activeField.isContentEditable);
    const fieldContent = isEditable ? activeField.isContentEditable ? activeField.textContent : activeField.value : "";
    if (activeField && fieldContent && fieldContent.trim()) {
      activeField.addEventListener("blur", () => window.location.reload(), { once: true });
      return;
    }
    if (document.body && !document.getElementById(reloadToastId)) {
      const toast = document.createElement("div");
      toast.id = reloadToastId;
      toast.textContent = "↻ New build — refreshing…";
      toast.style.cssText = [
        "position:fixed",
        "left:50%",
        "top:14px",
        "transform:translateX(-50%)",
        "z-index:2147483647",
        "padding:7px 14px",
        "border-radius:999px",
        "background:#141414",
        "color:#f4f2ec",
        "opacity:.96",
        "font:12.5px/1.2 ui-sans-serif,system-ui,sans-serif",
        "box-shadow:0 4px 16px rgba(0,0,0,.32)"
      ].join(";");
      document.body.append(toast);
    }
    window.setTimeout(() => window.location.reload(), 500);
  }
  function startLiveReload() {
    const baseline = window.__omnigentOverlaysBuild;
    if (typeof baseline !== "string") return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/_overlays/build?t=${Date.now()}`, { cache: "no-store" });
        if (response.ok) {
          const build = (await response.text()).trim();
          if (build && build !== baseline) {
            stopped = true;
            reloadForNewBuild();
            return;
          }
        }
      } catch {
      }
      window.setTimeout(poll, liveReloadIntervalMs);
    };
    window.setTimeout(poll, liveReloadIntervalMs);
  }

  // src/scripts/pinned-chats/pins.ts
  var hasCheckedPinnedOrder = false;
  var cachedPinnedIds = [];
  var pinnedCacheGeneration = 0;
  function cachedPinnedConversationIds() {
    return cachedPinnedIds;
  }
  function pinnedConversationCacheGeneration() {
    return pinnedCacheGeneration;
  }
  function readPinSets() {
    try {
      const value = JSON.parse(window.localStorage.getItem(pinSetsStorageKey) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).filter(([slot, ids]) => /^\d+$/.test(slot) && Array.isArray(ids)).map(([slot, ids]) => [
          slot,
          [...new Set(ids.filter((id) => typeof id === "string"))]
        ])
      );
    } catch {
      return {};
    }
  }
  function writePinSets(pinSets) {
    window.localStorage.setItem(pinSetsStorageKey, JSON.stringify(pinSets));
  }
  function samePinSet(left, right) {
    return left.length === right.length && left.every((id) => right.includes(id));
  }
  function pinLabelValue(session) {
    const labels = session.labels;
    if (!labels || typeof labels !== "object") return null;
    const value = labels[pinnedLabelKey];
    return typeof value === "string" ? value : null;
  }
  function pinnedDisplayOrder(sessions) {
    const labelled = sessions.map((session) => session && typeof session === "object" ? session : {}).filter((session) => typeof session.id === "string").filter((session) => pinLabelValue(session) !== null);
    const rank = (session) => {
      const value = Number(pinLabelValue(session) || Number.NaN);
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    };
    return labelled.map((session, index) => ({ session, index })).sort((left, right) => rank(left.session) - rank(right.session) || left.index - right.index).map(({ session }) => ({
      id: session.id,
      updatedAt: Number.isFinite(Number(session["updated_at"])) ? Number(session["updated_at"]) : null,
      title: session["title"]
    }));
  }
  function pinLabelPatches(currentDisplayIds, desiredDisplayIds, base) {
    if (currentDisplayIds.length === desiredDisplayIds.length && currentDisplayIds.every((id, index) => id === desiredDisplayIds[index])) {
      return [];
    }
    const desired = new Set(desiredDisplayIds);
    return [
      ...desiredDisplayIds.map((id, index) => ({ id, value: String(base + index) })),
      ...currentDisplayIds.filter((id) => !desired.has(id)).map((id) => ({ id, value: "" }))
    ];
  }
  async function patchPinLabel(id, value, headers) {
    const response = await window.fetch(`/v1/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ labels: { [pinnedLabelKey]: value } })
    });
    if (!response.ok) throw new Error(`Updating pin failed: ${response.status}`);
  }
  async function fetchPinnedSessions() {
    const headers = await identityRequestHeaders();
    const params = new URLSearchParams({
      order: "desc",
      sort_by: "updated_at",
      limit: "100",
      pinned: "true"
    });
    const response = await window.fetch(`/v1/sessions?${params.toString()}`, {
      credentials: "same-origin",
      headers
    });
    if (!response.ok) throw new Error(`Could not read pinned chats: ${response.status}`);
    const body = await response.json();
    const record = body && typeof body === "object" ? body : {};
    const data = Array.isArray(record["data"]) ? record["data"] : [];
    const pinned = data.filter(
      (session) => session && typeof session === "object" && pinLabelValue(session) !== null
    );
    cachedPinnedIds = pinnedDisplayOrder(pinned).map(({ id }) => id);
    pinnedCacheGeneration += 1;
    return pinned;
  }
  async function applyPinnedConversations(desiredDisplayIds) {
    const current = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
    const patches = pinLabelPatches(current, desiredDisplayIds, Date.now());
    if (patches.length === 0) return false;
    const headers = await identityRequestHeaders();
    await Promise.all(patches.map(({ id, value }) => patchPinLabel(id, value, headers)));
    window.location.reload();
    return true;
  }
  async function fetchSessionsPage(after, headers) {
    const params = new URLSearchParams({ order: "desc", sort_by: "updated_at", limit: "100" });
    if (after) params.set("after", after);
    const response = await window.fetch(`/v1/sessions?${params.toString()}`, {
      credentials: "same-origin",
      headers
    });
    if (!response.ok) throw new Error(`Could not check recent chats: ${response.status}`);
    const body = await response.json();
    const record = body && typeof body === "object" ? body : {};
    return {
      data: Array.isArray(record["data"]) ? record["data"] : [],
      hasMore: record["has_more"] === true,
      lastId: typeof record["last_id"] === "string" && record["last_id"] !== "" ? record["last_id"] : null
    };
  }
  async function recentlyUsedConversationIds(hours) {
    const cutoff = Date.now() / 1e3 - hours * 60 * 60;
    const headers = await identityRequestHeaders();
    const ids = [];
    let after = null;
    for (let page = 0; page < 50; page += 1) {
      const { data, hasMore, lastId } = await fetchSessionsPage(after, headers);
      let reachedCutoff = false;
      for (const conversation of data) {
        const record = conversation && typeof conversation === "object" ? conversation : {};
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
  async function mostRecentConversations(count) {
    const headers = await identityRequestHeaders();
    const conversations = [];
    const seen = /* @__PURE__ */ new Set();
    let after = null;
    for (let page = 0; page < 50 && conversations.length < count; page += 1) {
      const { data, hasMore, lastId } = await fetchSessionsPage(after, headers);
      for (const conversation of data) {
        const record = conversation && typeof conversation === "object" ? conversation : {};
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
  async function sortPinnedConversationsByRecentUse() {
    if (hasCheckedPinnedOrder) return;
    hasCheckedPinnedOrder = true;
    const pinned = await fetchPinnedSessions();
    const desiredDisplayIds = pinned.map((session) => session && typeof session === "object" ? session : {}).map((session) => session.id).filter((id) => typeof id === "string");
    const currentDisplayIds = pinnedDisplayOrder(pinned).map(({ id }) => id);
    const patches = pinLabelPatches(currentDisplayIds, desiredDisplayIds, Date.now());
    if (patches.length === 0) return;
    const headers = await identityRequestHeaders();
    await Promise.all(patches.map(({ id, value }) => patchPinLabel(id, value, headers)));
    window.location.reload();
  }

  // src/scripts/pinned-chats/pin-ui.ts
  function installPinSetStyles() {
    installStyles(
      pinSetControlsStyleId,
      `
      #${pinSetControlsId} {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 28px;
        margin: 2px 0 5px;
        padding: 0 8px;
      }

      #${pinSetControlsId} button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 22px;
        border: 1px solid color-mix(in srgb, var(--border, #888) 80%, transparent);
        border-radius: 4px;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        line-height: 1;
      }

      #${pinSetControlsId} .omnigent-pin-set-restore {
        width: 22px;
      }

      #${pinSetControlsId} .omnigent-pin-set-save {
        width: 15px;
        margin-left: -3px;
        border-left: 0;
        border-radius: 0 4px 4px 0;
        font-size: 13px;
      }

      #${pinSetControlsId} .omnigent-pin-recent {
        min-width: 28px;
        margin-right: 3px;
        font-weight: 700;
      }

      #${pinRecentButtonId},
      #${pinRecentDayButtonId},
      #${pinMostRecentButtonId},
      #${pinUnpinAllButtonId} {
        position: absolute;
        z-index: 2;
        top: 3px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 31px;
        height: 22px;
        padding: 0 6px;
        border: 1px solid color-mix(in srgb, var(--primary, #7c3aed) 70%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, var(--primary, #7c3aed) 18%, transparent);
        color: var(--foreground, #fff);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

      #${pinUnpinAllButtonId} { right: 113px; }
      #${pinRecentDayButtonId} { right: 78px; }
      #${pinRecentButtonId} { right: 43px; }
      #${pinMostRecentButtonId} { right: 8px; }

      #${pinRecentButtonId}:not(:disabled):hover,
      #${pinRecentDayButtonId}:not(:disabled):hover,
      #${pinMostRecentButtonId}:not(:disabled):hover,
      #${pinUnpinAllButtonId}:not(:disabled):hover {
        background: color-mix(in srgb, var(--primary, #7c3aed) 32%, transparent);
      }

      #${pinRecentButtonId}:disabled,
      #${pinRecentDayButtonId}:disabled,
      #${pinMostRecentButtonId}:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      /* Unpin-all is disabled only when there is nothing to unpin — a static
         "nothing to do" state, not the 5h/R buttons' transient loading wait. */
      #${pinUnpinAllButtonId}:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      #${pinSetControlsId} .omnigent-pin-set-restore:not(:disabled):hover,
      #${pinSetControlsId} .omnigent-pin-set-save:hover {
        border-color: color-mix(in srgb, var(--foreground, #fff) 45%, transparent);
        color: var(--foreground, #fff);
      }

      #${pinSetControlsId} .omnigent-pin-set-active {
        border-color: var(--primary, #7c3aed);
        color: var(--primary, #7c3aed);
      }

      #${pinSetControlsId} .omnigent-pin-set-restore:disabled {
        cursor: default;
        opacity: 0.35;
      }

      [${pinOnlyButtonAttribute}] > span {
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }

      [${aiRenameButtonAttribute}] {
        position: absolute;
        z-index: 3;
        top: 50%;
        right: 4.25rem;
        min-width: 1.5rem;
        height: 1.35rem;
        padding: 0 0.2rem;
        transform: translateY(-50%);
        border: 0;
        background: transparent;
        color: var(--muted-foreground, #8b8b8b);
        cursor: pointer;
        font: 700 0.625rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      [${aiRenameButtonAttribute}]:hover:not(:disabled) {
        color: var(--primary, #7c3aed);
      }

      [${aiRenameButtonAttribute}]:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      #${chatJumpFormId} {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.75rem;
      }

      #${chatJumpInputId} {
        min-width: 0;
        flex: 1;
        height: 2rem;
        padding: 0 0.65rem;
        border: 1px solid var(--input, var(--border, #888));
        border-radius: 999px;
        background: transparent;
        color: var(--foreground, currentColor);
        font: inherit;
        font-size: 0.75rem;
      }

      #${chatJumpInputId}::placeholder {
        color: var(--muted-foreground, #8b8b8b);
      }

      #${chatJumpFormId} button {
        height: 2rem;
        padding: 0 0.6rem;
        border: 1px solid var(--input, var(--border, #888));
        border-radius: 999px;
        background: transparent;
        color: var(--foreground, currentColor);
        cursor: pointer;
        font: inherit;
        font-size: 0.7rem;
        font-weight: 700;
      }

      #${chatJumpFormId} button:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      #${chatJumpStatusId} {
        position: absolute;
        margin-top: 3.15rem;
        color: var(--muted-foreground, #8b8b8b);
        font-size: 0.65rem;
      }

    `
    );
  }
  function sidebarSection(title) {
    return [...document.querySelectorAll("section")].find(
      (section) => [...section.querySelectorAll("button")].some(
        (button) => (button.textContent || "").replace(/\s+/g, " ").trim() === title
      )
    );
  }
  function sectionHeaderButton(section, title) {
    return [...section.querySelectorAll("button")].find(
      (button) => (button.textContent || "").replace(/\s+/g, " ").trim() === title
    );
  }
  function pinnedHeader() {
    const pinned = sidebarSection("Pinned");
    if (!pinned) return null;
    const button = sectionHeaderButton(pinned, "Pinned");
    if (!button) return null;
    const heading = button.closest("h2");
    const container = heading?.parentElement ?? null;
    return { button, container };
  }
  function pinSetInsertionPoint() {
    const pinned = sidebarSection("Pinned");
    if (pinned) {
      const header = pinnedHeader();
      return { parent: pinned, after: header?.container || header?.button || null };
    }
    const fallback = sidebarSection("Projects") || sidebarSection("Chats");
    return fallback ? { parent: fallback.parentElement, after: fallback.previousElementSibling } : null;
  }
  function ensurePinSetControls() {
    installPinSetStyles();
    const cacheGeneration = String(pinnedConversationCacheGeneration());
    const existingControls = document.getElementById(pinSetControlsId);
    if (existingControls?.getAttribute("data-pin-cache-generation") === cacheGeneration) return;
    existingControls?.remove();
    const insertionPoint = pinSetInsertionPoint();
    if (!insertionPoint?.parent) return;
    const currentPins = cachedPinnedConversationIds();
    const pinSets = readPinSets();
    const controls = document.createElement("div");
    controls.id = pinSetControlsId;
    controls.setAttribute("data-pin-cache-generation", cacheGeneration);
    controls.setAttribute("aria-label", "Pinned chat sets");
    for (let slot = 1; slot <= pinSetCount; slot += 1) {
      const slotKey = String(slot);
      const savedPins = pinSets[slotKey] || [];
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "omnigent-pin-set-restore";
      restore.textContent = String(slot);
      restore.title = savedPins.length ? `Use pinned chat set ${slot}` : `Pinned chat set ${slot} is empty`;
      restore.setAttribute("aria-label", restore.title);
      restore.disabled = savedPins.length === 0;
      if (savedPins.length && samePinSet(currentPins, savedPins)) {
        restore.classList.add("omnigent-pin-set-active");
      }
      restore.addEventListener("click", () => void applyPinnedConversations([...savedPins]));
      const save = document.createElement("button");
      save.type = "button";
      save.className = "omnigent-pin-set-save";
      save.textContent = "+";
      save.title = savedPins.length ? `Replace pinned chat set ${slot} with the current pins` : `Save current pins to chat set ${slot}`;
      save.setAttribute("aria-label", save.title);
      save.addEventListener("click", () => {
        const nextSets = readPinSets();
        nextSets[slotKey] = cachedPinnedConversationIds();
        writePinSets(nextSets);
        controls.remove();
        ensurePinSetControls();
      });
      controls.append(restore, save);
    }
    if (insertionPoint.after) {
      insertionPoint.after.after(controls);
    } else {
      insertionPoint.parent.prepend(controls);
    }
  }
  async function pinRecentConversations(button, hours) {
    button.disabled = true;
    button.textContent = "...";
    try {
      const recentIds = await recentlyUsedConversationIds(hours);
      const currentIds = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
      const nextIds = [.../* @__PURE__ */ new Set([...recentIds, ...currentIds])];
      if (await applyPinnedConversations(nextIds)) return;
      button.title = `No additional chats used in the last ${hours} hours`;
    } catch (error) {
      button.title = error instanceof Error ? error.message : "Could not check recent chats.";
    } finally {
      button.disabled = false;
      button.textContent = `${hours}h`;
    }
  }
  async function pinMostRecentConversations(button) {
    button.disabled = true;
    button.textContent = "...";
    try {
      const recent = await mostRecentConversations(mostRecentPinCount);
      const currentIds = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
      const nextIds = [.../* @__PURE__ */ new Set([...recent.map(({ id }) => id), ...currentIds])];
      if (await applyPinnedConversations(nextIds)) {
        queueChatsForRename(
          recent.filter(({ title }) => looksLikeDefaultChatTitle(title)).map(({ id }) => id)
        );
        return;
      }
      button.title = `The ${mostRecentPinCount} most recent chats are already pinned`;
    } catch (error) {
      button.title = error instanceof Error ? error.message : "Could not check recent chats.";
    } finally {
      button.disabled = false;
      button.textContent = "R";
    }
  }
  async function unpinAllConversations(button) {
    button.disabled = true;
    try {
      await applyPinnedConversations([]);
    } catch (error) {
      button.title = error instanceof Error ? error.message : "Could not unpin chats.";
    } finally {
      button.disabled = cachedPinnedConversationIds().length === 0;
    }
  }
  function ensurePinRecentButton() {
    const existing = document.getElementById(pinRecentButtonId);
    const existingRecentDay = document.getElementById(pinRecentDayButtonId);
    const existingMostRecent = document.getElementById(pinMostRecentButtonId);
    const existingUnpinAll = document.getElementById(pinUnpinAllButtonId);
    const header = pinnedHeader();
    if (!header?.container) {
      existing?.remove();
      existingRecentDay?.remove();
      existingMostRecent?.remove();
      existingUnpinAll?.remove();
      return;
    }
    if (existingUnpinAll instanceof HTMLButtonElement) {
      existingUnpinAll.disabled = cachedPinnedConversationIds().length === 0;
    } else {
      const button = document.createElement("button");
      button.id = pinUnpinAllButtonId;
      button.type = "button";
      button.textContent = "U";
      button.title = "Unpin all chats";
      button.setAttribute("aria-label", button.title);
      button.disabled = cachedPinnedConversationIds().length === 0;
      button.addEventListener("click", () => void unpinAllConversations(button));
      header.container.append(button);
    }
    if (!existing) {
      const button = document.createElement("button");
      button.id = pinRecentButtonId;
      button.type = "button";
      button.textContent = `${recentPinWindowHours}h`;
      button.title = `Pin chats used in the last ${recentPinWindowHours} hours`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => void pinRecentConversations(button, recentPinWindowHours));
      header.container.append(button);
    }
    if (!existingRecentDay) {
      const button = document.createElement("button");
      button.id = pinRecentDayButtonId;
      button.type = "button";
      button.textContent = `${recentPinDayWindowHours}h`;
      button.title = `Pin chats used in the last ${recentPinDayWindowHours} hours`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => void pinRecentConversations(button, recentPinDayWindowHours));
      header.container.append(button);
    }
    if (!existingMostRecent) {
      const button = document.createElement("button");
      button.id = pinMostRecentButtonId;
      button.type = "button";
      button.textContent = "R";
      button.title = `Pin the ${mostRecentPinCount} most recent chats`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => void pinMostRecentConversations(button));
      header.container.append(button);
    }
  }
  function conversationIdForPinButton(pinButton) {
    const link = pinButton.closest("li")?.querySelector('a[href*="/c/"]');
    if (!link) return null;
    const match = new URL(link.href, window.location.href).pathname.match(/\/c\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
  function ensurePinOnlyButtons() {
    document.querySelectorAll('button[data-testid="quick-pin-conversation"]').forEach((pinButton) => {
      if (pinButton.hasAttribute(pinOnlyButtonAttribute)) return;
      if (pinButton.parentElement?.querySelector(`[${pinOnlyButtonAttribute}]`)) return;
      const conversationId = conversationIdForPinButton(pinButton);
      if (!conversationId) return;
      const onlyButton = pinButton.cloneNode(false);
      onlyButton.removeAttribute("data-testid");
      onlyButton.setAttribute(pinOnlyButtonAttribute, "");
      onlyButton.setAttribute("aria-label", "Pin only this conversation");
      onlyButton.title = "Pin only this conversation";
      onlyButton.style.right = "7.65rem";
      onlyButton.innerHTML = "<span>1</span>";
      onlyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void applyPinnedConversations([conversationId]);
      });
      pinButton.after(onlyButton);
    });
  }

  // src/scripts/pinned-chats/repo-prefs.ts
  function readUserHiddenRepoNames() {
    try {
      const value = JSON.parse(
        window.localStorage.getItem(userHiddenRepoNamesStorageKey) || "[]"
      );
      return new Set(
        Array.isArray(value) ? value.filter((name) => typeof name === "string" && name.trim() !== "") : []
      );
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function readUserPinnedRepoNames() {
    try {
      const value = JSON.parse(
        window.localStorage.getItem(userPinnedRepoNamesStorageKey) || "[]"
      );
      return Array.isArray(value) ? [...new Set(value.filter((name) => typeof name === "string" && name.trim() !== ""))] : [];
    } catch {
      return [];
    }
  }
  var userHiddenRepoNames = readUserHiddenRepoNames();
  var userPinnedRepoNames = readUserPinnedRepoNames();
  function writeUserHiddenRepoNames() {
    window.localStorage.setItem(
      userHiddenRepoNamesStorageKey,
      JSON.stringify([...userHiddenRepoNames].sort())
    );
  }
  function writeUserPinnedRepoNames() {
    window.localStorage.setItem(userPinnedRepoNamesStorageKey, JSON.stringify(userPinnedRepoNames));
  }
  function pinnedRepoNames() {
    return userPinnedRepoNames;
  }
  function userHiddenRepoCount() {
    return userHiddenRepoNames.size;
  }
  function hideRepoName(name) {
    userHiddenRepoNames.add(name);
    writeUserHiddenRepoNames();
    userPinnedRepoNames = userPinnedRepoNames.filter((pinnedName) => pinnedName !== name);
    writeUserPinnedRepoNames();
  }
  function resetUserHiddenRepoNames() {
    userHiddenRepoNames.clear();
    writeUserHiddenRepoNames();
  }
  function toggleRepoNamePin(name) {
    const index = userPinnedRepoNames.indexOf(name);
    userPinnedRepoNames = index === -1 ? [name, ...userPinnedRepoNames] : userPinnedRepoNames.filter((pinnedName) => pinnedName !== name);
    writeUserPinnedRepoNames();
  }
  function readProjectFocus() {
    try {
      const value = JSON.parse(window.localStorage.getItem(projectFocusStorageKey) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, names: [] };
      const record = value;
      const rawNames = record["names"];
      const names = Array.isArray(rawNames) ? [...new Set(rawNames.filter((name) => typeof name === "string" && name !== ""))] : [];
      return { enabled: record["enabled"] === true && names.length > 0, names };
    } catch {
      return { enabled: false, names: [] };
    }
  }
  function writeProjectFocus(state) {
    try {
      const names = [...new Set(state.names)];
      window.localStorage.setItem(
        projectFocusStorageKey,
        JSON.stringify({ enabled: state.enabled && names.length > 0, names })
      );
    } catch {
    }
  }
  function focusedRepoNames() {
    return readProjectFocus().names.filter(isVisibleRepoName);
  }
  function toggleRepoNameFocus(name) {
    if (!isVisibleRepoName(name)) return;
    const state = readProjectFocus();
    const names = state.names.includes(name) ? state.names.filter((current) => current !== name) : [...state.names, name];
    const firstPick = state.names.length === 0;
    writeProjectFocus({
      enabled: names.length === 0 ? false : firstPick ? true : state.enabled,
      names
    });
  }
  function repoPickerMode() {
    if (focusedRepoNames().length === 0) return "all";
    return window.localStorage.getItem(repoPickerModeStorageKey) === "all" ? "all" : "focus";
  }
  function setRepoPickerMode(mode) {
    window.localStorage.setItem(repoPickerModeStorageKey, mode);
  }
  function isVisibleRepoName(name) {
    return name !== "" && !name.startsWith("_") && !hiddenRepoNames.has(name) && !userHiddenRepoNames.has(name);
  }
  function isAllowedWorkspacePath(path) {
    if (typeof path !== "string") return false;
    const normalized = path.replace(/\/+$/, "");
    if (!normalized.startsWith(`${reposRoot}/`)) return false;
    const name = normalized.slice(reposRoot.length + 1);
    return !name.includes("/") && isVisibleRepoName(name);
  }
  function workspacePathForRepo(name) {
    return `${reposRoot}/${name}`;
  }
  function filterRecentWorkspaces() {
    try {
      const raw = window.localStorage.getItem(recentWorkspacesStorageKey);
      if (!raw) return;
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const filtered = Object.fromEntries(
        Object.entries(value).map(([hostId, paths]) => [
          hostId,
          Array.isArray(paths) ? paths.filter(isAllowedWorkspacePath) : []
        ])
      );
      window.localStorage.setItem(recentWorkspacesStorageKey, JSON.stringify(filtered));
    } catch {
    }
  }

  // src/scripts/pinned-chats/sidebar-resize.ts
  var dragging = false;
  var handlersInstalled = false;
  function installSidebarResizeStyles() {
    installStyles(
      sidebarResizeStyleId,
      `
      @media (min-width: 768px) {
        ${sidebarSelector} {
          width: var(${sidebarUnlockedWidthVar}, var(--sidebar-width)) !important;
          max-width: none !important;
        }
      }
    `
    );
  }
  function persistWidth(value) {
    try {
      window.localStorage.setItem(sidebarUnlockedWidthStorageKey, value);
    } catch {
    }
  }
  function readStoredWidth() {
    try {
      const value = window.localStorage.getItem(sidebarUnlockedWidthStorageKey);
      return value && /^\d+(?:\.\d+)?px$/.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  function setWidth(value, persist) {
    document.documentElement.style.setProperty(sidebarUnlockedWidthVar, value);
    if (persist) persistWidth(value);
  }
  function applyStoredSidebarWidth() {
    const stored = readStoredWidth();
    if (stored) document.documentElement.style.setProperty(sidebarUnlockedWidthVar, stored);
  }
  function currentWidthPx() {
    const own = parseFloat(document.documentElement.style.getPropertyValue(sidebarUnlockedWidthVar));
    if (Number.isFinite(own)) return own;
    const sidebar = document.querySelector(sidebarSelector);
    const measured = sidebar ? parseFloat(getComputedStyle(sidebar).width) : Number.NaN;
    return Number.isFinite(measured) ? measured : sidebarMinWidthPx;
  }
  function installSidebarResizeHandlers() {
    if (handlersInstalled) return;
    handlersInstalled = true;
    document.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(sidebarResizeHandleSelector)) dragging = true;
      },
      true
    );
    document.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      setWidth(`${Math.max(sidebarMinWidthPx, Math.round(event.clientX))}px`, false);
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      const width = document.documentElement.style.getPropertyValue(sidebarUnlockedWidthVar);
      if (width) persistWidth(width);
    };
    document.addEventListener("mouseup", endDrag, true);
    document.addEventListener(
      "keydown",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest(sidebarResizeHandleSelector)) return;
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = Math.max(sidebarMinWidthPx, currentWidthPx() + (event.key === "ArrowRight" ? 20 : -20));
        setWidth(`${Math.round(next)}px`, true);
      },
      true
    );
  }

  // src/scripts/pinned-chats/workspace-picker.ts
  function installWorkspacePickerStyles() {
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
    `
    );
  }
  function setControlledInputValue(input, value) {
    setNativeValue(input, value, new Event("input", { bubbles: true }));
  }
  function entriesFingerprint(picker) {
    return [...picker.querySelectorAll('[data-testid^="workspace-picker-entry-"]')].map((entry) => entry.getAttribute("data-testid")).join("|");
  }
  function pickerShowsReposRoot(picker) {
    const pathInput = picker.querySelector('[data-testid="workspace-picker-path-input"]');
    if (!(pathInput instanceof HTMLInputElement)) return false;
    if (pathInput.value.replace(/\/+$/, "") !== reposRoot) return false;
    const fingerprint = entriesFingerprint(picker);
    if (fingerprint === "") return false;
    const preRoot = picker.dataset["omnigentPreRootEntries"];
    if (preRoot === void 0 || fingerprint !== preRoot) return true;
    const navigationStartedAt = Number(
      picker.dataset["omnigentReposNavigationStartedAt"] || ""
    );
    return Number.isFinite(navigationStartedAt) && Date.now() - navigationStartedAt >= 500;
  }
  function repoNameForPickerEntry(entry) {
    const testId = entry.getAttribute("data-testid") || "";
    const prefix = "workspace-picker-entry-";
    return testId.startsWith(prefix) ? testId.slice(prefix.length) : "";
  }
  function hideRepoFromPicker(name) {
    if (!isVisibleRepoName(name)) return;
    hideRepoName(name);
    if (window.localStorage.getItem(selectedWorkspaceStorageKey) === workspacePathForRepo(name)) {
      window.localStorage.removeItem(selectedWorkspaceStorageKey);
    }
    filterRecentWorkspaces();
    constrainWorkspacePickers();
  }
  function togglePinnedRepo(name) {
    if (!isVisibleRepoName(name)) return;
    toggleRepoNamePin(name);
    constrainWorkspacePickers();
  }
  function toggleFocusedRepo(name) {
    toggleRepoNameFocus(name);
    constrainWorkspacePickers();
  }
  function ensureModeToggle(toolbar, mode, focusCount) {
    let toggle = toolbar.querySelector(`[${repoPickerModeToggleAttribute}]`);
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.setAttribute(repoPickerModeToggleAttribute, "");
      toggle.setAttribute("role", "switch");
      const focusLabel2 = document.createElement("span");
      focusLabel2.setAttribute("data-part", "label");
      focusLabel2.setAttribute("data-side", "focus");
      const track = document.createElement("span");
      track.setAttribute("data-part", "track");
      const knob = document.createElement("span");
      knob.setAttribute("data-part", "knob");
      track.append(knob);
      const allLabel = document.createElement("span");
      allLabel.setAttribute("data-part", "label");
      allLabel.setAttribute("data-side", "all");
      allLabel.textContent = "All";
      toggle.append(focusLabel2, track, allLabel);
      toolbar.prepend(toggle);
    }
    const focused = mode === "focus";
    toggle.setAttribute("aria-checked", String(focused));
    toggle.setAttribute("data-empty", String(focusCount === 0));
    const focusLabel = toggle.querySelector('[data-side="focus"]');
    if (focusLabel) focusLabel.textContent = focusCount === 0 ? "Focus" : `Focus ${focusCount}`;
    const title = focusCount === 0 ? "No focused projects yet — focus one with the ◉ beside a repository, or from the sidebar Projects list." : focused ? `Showing the ${focusCount} focused projects. Click for every repository.` : `Showing every repository, pinned first. Click for the ${focusCount} focused projects.`;
    toggle.setAttribute("aria-label", title);
    toggle.title = title;
  }
  function ensureRepoPickerToolbar(picker, mode, focusCount) {
    const hiddenCount = userHiddenRepoCount();
    let toolbar = picker.querySelector(`[${repoPickerToolbarAttribute}]`);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.setAttribute(repoPickerToolbarAttribute, "");
      picker.firstElementChild?.after(toolbar);
    }
    ensureModeToggle(toolbar, mode, focusCount);
    let button = toolbar.querySelector(`[${resetHiddenReposButtonAttribute}]`);
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
  function ensureHideRepoButton(picker, entry, name) {
    const existing = [...picker.querySelectorAll(`[${hideRepoButtonAttribute}]`)].find(
      (button2) => button2.getAttribute(hideRepoButtonAttribute) === name
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
  function ensurePinRepoButton(picker, entry, name) {
    const existing = [...picker.querySelectorAll(`[${pinRepoButtonAttribute}]`)].find(
      (button2) => button2.getAttribute(pinRepoButtonAttribute) === name
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
    const sourceIcon = document.querySelector('button[data-testid="quick-pin-conversation"][aria-label="Pin conversation"] svg') || document.querySelector('button[data-testid="quick-pin-conversation"] svg');
    if (sourceIcon instanceof SVGElement) {
      const icon = sourceIcon.cloneNode(true);
      icon.removeAttribute("class");
      button.append(icon);
    } else {
      button.textContent = "*";
    }
    list.style.position = "relative";
    entry.after(button);
  }
  function ensureFocusRepoButton(picker, entry, name, focused) {
    const existing = [...picker.querySelectorAll(`[${focusRepoButtonAttribute}]`)].find(
      (button2) => button2.getAttribute(focusRepoButtonAttribute) === name
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
  function positionRepoActions(picker, entry, name, mode) {
    const top = `${entry.offsetTop + Math.max(0, (entry.offsetHeight - 20) / 2)}px`;
    const rights = {
      [hideRepoButtonAttribute]: "6px",
      [focusRepoButtonAttribute]: "30px",
      [pinRepoButtonAttribute]: "54px"
    };
    for (const [attribute, right] of Object.entries(rights)) {
      const button = [...picker.querySelectorAll(`[${attribute}]`)].find(
        (candidate) => candidate.getAttribute(attribute) === name
      );
      if (!(button instanceof HTMLElement)) continue;
      button.style.top = top;
      button.style.right = right;
    }
  }
  function orderPickerEntries(picker, mode) {
    const entries = [...picker.querySelectorAll('[data-testid^="workspace-picker-entry-"]')];
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
  function forcePickerToReposRoot(picker) {
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
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    }, 0);
    window.setTimeout(constrainWorkspacePickers, 550);
  }
  function decorateReposPicker(picker) {
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
    picker.querySelectorAll('[data-testid^="workspace-picker-entry-"]').forEach((entry) => {
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
      picker.querySelectorAll(`[${attribute}]`).forEach((button) => {
        const name = button.getAttribute(attribute) || "";
        const rowShown = isVisibleRepoName(name) && (mode === "all" || focusedSet.has(name));
        const offered = attribute !== pinRepoButtonAttribute || mode === "all";
        button.hidden = !rowShown || !offered;
      });
    }
    orderPickerEntries(picker, mode);
  }
  function constrainWorkspacePickers() {
    installWorkspacePickerStyles();
    document.querySelectorAll('[data-testid="workspace-picker"]').forEach((picker) => {
      if (picker.dataset["omnigentSelectedRepo"]) return;
      forcePickerToReposRoot(picker);
      decorateReposPicker(picker);
    });
  }
  function projectNameForNewSessionButton(button) {
    const section = button.closest("section");
    const name = section?.querySelector("h2 button > span")?.textContent?.trim() || "";
    return name;
  }
  function ensureProjectRepoSessionButtons() {
    document.querySelectorAll('[data-testid="project-new-session"]').forEach((button) => {
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
  function applyPendingProjectRepoSelection() {
    if (window.location.pathname !== "/") return;
    const name = window.localStorage.getItem(pendingProjectRepoStorageKey) || "";
    if (!isVisibleRepoName(name)) {
      if (name !== "") window.localStorage.removeItem(pendingProjectRepoStorageKey);
      return;
    }
    const chip = document.querySelector('[data-testid="new-chat-landing-workspace-chip"]');
    if (!chip) return;
    const chipLabel = chip.querySelector("span")?.textContent?.trim() || "";
    if (chipLabel === name && selectedWorkspaceMatchesChip()) {
      window.localStorage.removeItem(pendingProjectRepoStorageKey);
      return;
    }
    const picker = document.querySelector('[data-testid="workspace-picker"]');
    if (!picker) {
      window.setTimeout(() => {
        if (!document.querySelector('[data-testid="workspace-picker"]')) chip.click();
      }, 0);
      return;
    }
    if (picker.getAttribute(workspacePickerStateAttribute) !== "ready") return;
    if (picker.dataset["omnigentPendingProjectRepoClicked"] === name) return;
    const entry = [...picker.querySelectorAll('[data-testid^="workspace-picker-entry-"]')].find(
      (candidate) => repoNameForPickerEntry(candidate) === name
    );
    if (!entry) {
      window.localStorage.removeItem(pendingProjectRepoStorageKey);
      return;
    }
    picker.dataset["omnigentPendingProjectRepoClicked"] = name;
    entry.click();
  }
  function selectedWorkspaceMatchesChip() {
    const selectedWorkspace = window.localStorage.getItem(selectedWorkspaceStorageKey) || "";
    if (!isAllowedWorkspacePath(selectedWorkspace)) return false;
    const chip = document.querySelector('[data-testid="new-chat-landing-workspace-chip"]');
    const label = chip?.querySelector("span")?.textContent?.trim() || "";
    return label === selectedWorkspace.slice(reposRoot.length + 1);
  }
  function openWorkspacePicker() {
    if (document.querySelector('[data-testid="workspace-picker"]')) return;
    document.querySelector('[data-testid="new-chat-landing-workspace-chip"]')?.click();
  }
  function closeWorkspacePickerAfterSelection(picker, name) {
    picker.dataset["omnigentSelectedRepo"] = name;
    let checks = 0;
    const checkWorkspace = () => {
      if (!document.contains(picker) || picker.dataset["omnigentSelectedRepo"] !== name) return;
      const chip = document.querySelector('[data-testid="new-chat-landing-workspace-chip"]');
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
  function installWorkspaceSelectionHandlers() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const projectRepoSessionButton = target?.closest(`[${projectRepoSessionButtonAttribute}]`);
        if (projectRepoSessionButton instanceof HTMLElement) {
          event.preventDefault();
          event.stopPropagation();
          const name2 = projectRepoSessionButton.getAttribute(projectRepoSessionButtonAttribute) || "";
          if (!isVisibleRepoName(name2)) return;
          window.localStorage.setItem(pendingProjectRepoStorageKey, name2);
          window.localStorage.setItem(selectedWorkspaceStorageKey, workspacePathForRepo(name2));
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
        if (!picker?.hasAttribute(workspacePickerAttribute) || picker.getAttribute(workspacePickerStateAttribute) !== "ready") {
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
        closeWorkspacePickerAfterSelection(picker, name);
      },
      true
    );
    const blockUnselectedWorkspace = (event) => {
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
      true
    );
    document.addEventListener(
      "submit",
      (event) => {
        if (event.target instanceof Element && event.target.closest('[data-testid="new-chat-landing"]')) {
          blockUnselectedWorkspace(event);
        }
      },
      true
    );
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === projectFocusStorageKey) constrainWorkspacePickers();
    });
  }

  // src/scripts/pinned-chats/index.ts
  (function() {
    "use strict";
    window.localStorage.removeItem("omnigent:manual-pinned-order");
    function applyAll() {
      ensurePinRecentButton();
      ensurePinSetControls();
      ensurePinOnlyButtons();
      ensureAiRenameButtons();
      ensureChatJumpInput();
      constrainWorkspacePickers();
      ensureProjectRepoSessionButtons();
      applyPendingProjectRepoSelection();
      ensureBuildBadge();
    }
    function start() {
      document.documentElement.setAttribute(activationAttribute, "active");
      void sortPinnedConversationsByRecentUse().then(() => {
        ensurePinRecentButton();
        ensurePinSetControls();
      }).catch(() => {
      });
      void drainChatRenameQueue();
      installPinSetStyles();
      installWorkspacePickerStyles();
      installSidebarResizeStyles();
      applyStoredSidebarWidth();
      installWorkspaceSelectionHandlers();
      installSidebarResizeHandlers();
      startLiveReload();
      observeAndApply(applyAll);
    }
    filterRecentWorkspaces();
    onDocumentReady(start);
  })();
})();
