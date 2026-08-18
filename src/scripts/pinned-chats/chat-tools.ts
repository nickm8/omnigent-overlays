
import {
  apiErrorMessage,
  createTerminalResource,
  identityRequestHeaders,
  terminalAttachUrl,
  terminalMessageText,
} from "../../shared/omnigent-api";
import {
  aiRenameButtonAttribute,
  chatJumpFormId,
  chatJumpInputId,
  chatJumpStatusId,
  chatRenameQueueLimit,
  chatRenameQueueStorageKey,
} from "./config";

function chatMessageText(item: unknown): string {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
  if (!record || record["type"] !== "message" || typeof record["role"] !== "string") return "";
  if (!["user", "assistant"].includes(record["role"])) return "";
  if (record["is_meta"] === true || !Array.isArray(record["content"])) return "";
  return record["content"]
    .filter((block): block is { text: string } =>
      Boolean(block && typeof (block as Record<string, unknown>)["text"] === "string"),
    )
    .map((block) => block.text)
    .join("\n")
    .replace(/\u0001/g, "")
    .trim();
}

async function sampledChatContext(conversationId: string): Promise<string> {
  const headers = await identityRequestHeaders();
  const requestPage = async (order: "asc" | "desc"): Promise<unknown[]> => {
    const params = new URLSearchParams({ limit: "30", order });
    const response = await window.fetch(
      `/v1/sessions/${encodeURIComponent(conversationId)}/items?${params}`,
      { credentials: "same-origin", headers },
    );
    if (!response.ok) throw new Error(await apiErrorMessage(response, "Reading chat context"));
    const body: unknown = await response.json();
    const data =
      body && typeof body === "object" ? (body as Record<string, unknown>)["data"] : null;
    return Array.isArray(data) ? data : [];
  };

  const [oldestItems, newestItems] = await Promise.all([requestPage("asc"), requestPage("desc")]);
  const normalize = (items: unknown[]) =>
    items
      .map((item) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return { id: record["id"], role: String(record["role"] ?? ""), text: chatMessageText(item) };
      })
      .filter((item) => item.text !== "");
  const opening = normalize(oldestItems).slice(0, 4);
  const recent = normalize(newestItems).slice(0, 6).reverse();
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const item of [...opening, ...recent]) {
    const key = typeof item.id === "string" ? item.id : `${item.role}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(`${item.role.toUpperCase()}: ${item.text.slice(0, 1_200)}`);
  }
  return selected.join("\n\n").slice(0, 8_000);
}

function generateChatTitle(conversationId: string, terminalId: string, context: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = terminalAttachUrl(conversationId, terminalId);
    const marker = `__OMNIGENT_TITLE_${Math.random().toString(36).slice(2)}__`;
    const prompt = [
      "Write a concise title for this chat based on the sampled context below.",
      "Use 3-8 plain-language words. Capture the actual task or outcome, not generic words like chat or help.",
      "Output only the title: no quotes, markdown, punctuation suffix, or explanation.",
      "",
      context,
    ].join("\n");
    const encodedPrompt = window.btoa(unescape(encodeURIComponent(prompt)));
    const socket = new WebSocket(url);
    let output = "";
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("Timed out generating a chat title."));
    }, 30_000);
    const finish = <T>(callback: (value: T) => void, value: T): void => {
      window.clearTimeout(timeout);
      socket.close();
      callback(value);
    };

    socket.addEventListener(
      "open",
      () => {
        const command =
          `title=$(printf '%s' '${encodedPrompt}' | base64 -d | command claude -p --model haiku ` +
          `--no-session-persistence --disallowed-tools "Bash,Edit,Write,Read,Glob,Grep,Task,WebFetch,WebSearch,NotebookEdit")\n` +
          `printf '\\n${marker}%s\\n' "$(printf '%s' "$title" | base64 -w0)"\r`;
        socket.send(new TextEncoder().encode(command));
      },
      { once: true },
    );
    socket.addEventListener("message", async (event) => {
      output += await terminalMessageText(event.data);
      const match = output.match(new RegExp(`${marker}([A-Za-z0-9+/=]+)`));
      if (!match?.[1]) return;
      try {
        const title = decodeURIComponent(escape(window.atob(match[1])))
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100);
        if (!title) throw new Error("Haiku returned an empty title.");
        finish(resolve, title);
      } catch (error) {
        finish(reject, error instanceof Error ? error : new Error("Could not decode the generated title."));
      }
    });
    socket.addEventListener("error", () => finish(reject, new Error("Could not run the title generator.")), {
      once: true,
    });
  });
}

/** Sample the chat, ask Haiku for a title, persist it, and return that title. */
export async function renameChatWithHaiku(conversationId: string): Promise<string> {
  const context = await sampledChatContext(conversationId);
  if (!context) throw new Error("This chat has no message context to name.");
  const terminalId = await createTerminalResource(conversationId, "chat-tools");
  const title = await generateChatTitle(conversationId, terminalId, context);
  const headers = await identityRequestHeaders();
  const response = await window.fetch(`/v1/sessions/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Renaming chat"));
  return title;
}

async function aiRenameChat(button: HTMLButtonElement, conversationId: string): Promise<void> {
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

export function ensureAiRenameButtons(): void {
  document.querySelectorAll<HTMLAnchorElement>('section li a[href*="/c/"]').forEach((link) => {
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

/**
 * Whether a title is still the one Omnigent (or the chat-organizer) assigned,
 * so renaming it destroys nothing the user wrote. Matches, in order: no title
 * at all; the store's `untitled:<id>` sentinel; the generic sidebar labels; the
 * `Cld/GPT <folder> - <n>` bulk titles from `scripts/omnigent_chats.py
 * organize`; and a first-user-message title truncated by the server's 60-char
 * `synthesize_conversation_title`, which always ends in an ellipsis.
 */
export function looksLikeDefaultChatTitle(title: unknown): boolean {
  if (typeof title !== "string") return true;
  const trimmed = title.trim();
  if (trimmed === "") return true;
  if (/^untitled:/i.test(trimmed)) return true;
  if (/^(new chat|untitled|new session|claude code)$/i.test(trimmed)) return true;
  if (/^(cld|gpt) .+ - \d+$/i.test(trimmed)) return true;
  return trimmed.endsWith("…");
}

function readChatRenameQueue(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(chatRenameQueueStorageKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeChatRenameQueue(ids: string[]): void {
  window.localStorage.setItem(chatRenameQueueStorageKey, JSON.stringify(ids));
}

/** Hand conversations to the next page load; capped so one pin can't queue dozens. */
export function queueChatsForRename(conversationIds: string[]): void {
  const queued = [...new Set([...readChatRenameQueue(), ...conversationIds])].slice(
    0,
    chatRenameQueueLimit,
  );
  writeChatRenameQueue(queued);
}

/**
 * Drain the queue one chat at a time (never a burst of terminal sessions).
 * Every entry is removed before its rename runs, so a failure is dropped
 * rather than retried forever, and no failure surfaces to the user.
 */
export async function drainChatRenameQueue(): Promise<void> {
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

export function normalizedChatJumpQuery(value: string): string {
  let query = value.trim();
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];
  for (const [opening, closing] of quotePairs) {
    if (query.length >= 2 && query.startsWith(opening) && query.endsWith(closing)) {
      query = query.slice(opening.length, -closing.length).trim();
      break;
    }
  }
  return query;
}

async function jumpToChatByText(form: HTMLFormElement): Promise<void> {
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
      include_archived: "true",
    });
    const headers = await identityRequestHeaders();
    const response = await window.fetch(`/v1/sessions?${params}`, {
      credentials: "same-origin",
      headers,
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response, "Searching chats"));
    const body: unknown = await response.json();
    const data = body && typeof body === "object" ? (body as Record<string, unknown>)["data"] : null;
    const match = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
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

export function ensureChatJumpInput(): void {
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
