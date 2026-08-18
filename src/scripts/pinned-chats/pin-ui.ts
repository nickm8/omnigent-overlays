
import { installStyles } from "../../shared/dom";
import {
  aiRenameButtonAttribute,
  chatJumpFormId,
  chatJumpInputId,
  chatJumpStatusId,
  mostRecentPinCount,
  pinMostRecentButtonId,
  pinOnlyButtonAttribute,
  pinRecentButtonId,
  pinRecentDayButtonId,
  pinSetControlsId,
  pinSetControlsStyleId,
  pinSetCount,
  pinUnpinAllButtonId,
  recentPinDayWindowHours,
  recentPinWindowHours,
} from "./config";
import { looksLikeDefaultChatTitle, queueChatsForRename } from "./chat-tools";
import {
  applyPinnedConversations,
  cachedPinnedConversationIds,
  fetchPinnedSessions,
  mostRecentConversations,
  pinnedConversationCacheGeneration,
  pinnedDisplayOrder,
  readPinSets,
  recentlyUsedConversationIds,
  samePinSet,
  writePinSets,
} from "./pins";

export function installPinSetStyles(): void {
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

    `,
  );
}

export function sidebarSection(title: string): HTMLElement | undefined {
  return [...document.querySelectorAll("section")].find((section) =>
    [...section.querySelectorAll("button")].some(
      (button) => (button.textContent || "").replace(/\s+/g, " ").trim() === title,
    ),
  );
}

function sectionHeaderButton(section: HTMLElement, title: string): HTMLButtonElement | undefined {
  return [...section.querySelectorAll("button")].find(
    (button) => (button.textContent || "").replace(/\s+/g, " ").trim() === title,
  );
}

interface PinnedHeader {
  button: HTMLButtonElement;
  container: HTMLElement | null;
}

function pinnedHeader(): PinnedHeader | null {
  const pinned = sidebarSection("Pinned");
  if (!pinned) return null;

  const button = sectionHeaderButton(pinned, "Pinned");
  if (!button) return null;

  const heading = button.closest("h2");
  const container = heading?.parentElement ?? null;
  return { button, container };
}

interface InsertionPoint {
  parent: HTMLElement | null;
  after: Element | null;
}

function pinSetInsertionPoint(): InsertionPoint | null {
  const pinned = sidebarSection("Pinned");
  if (pinned) {
    const header = pinnedHeader();
    return { parent: pinned, after: header?.container || header?.button || null };
  }

  const fallback = sidebarSection("Projects") || sidebarSection("Chats");
  return fallback
    ? { parent: fallback.parentElement, after: fallback.previousElementSibling }
    : null;
}

export function ensurePinSetControls(): void {
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
    restore.title = savedPins.length
      ? `Use pinned chat set ${slot}`
      : `Pinned chat set ${slot} is empty`;
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
    save.title = savedPins.length
      ? `Replace pinned chat set ${slot} with the current pins`
      : `Save current pins to chat set ${slot}`;
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

async function pinRecentConversations(button: HTMLButtonElement, hours: number): Promise<void> {
  button.disabled = true;
  button.textContent = "...";
  try {
    const recentIds = await recentlyUsedConversationIds(hours);
    const currentIds = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
    const nextIds = [...new Set([...recentIds, ...currentIds])];
    if (await applyPinnedConversations(nextIds)) return;
    button.title = `No additional chats used in the last ${hours} hours`;
  } catch (error) {
    button.title = error instanceof Error ? error.message : "Could not check recent chats.";
  } finally {
    button.disabled = false;
    button.textContent = `${hours}h`;
  }
}

async function pinMostRecentConversations(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = "...";
  try {
    const recent = await mostRecentConversations(mostRecentPinCount);
    const currentIds = pinnedDisplayOrder(await fetchPinnedSessions()).map(({ id }) => id);
    const nextIds = [...new Set([...recent.map(({ id }) => id), ...currentIds])];
    if (await applyPinnedConversations(nextIds)) {
      queueChatsForRename(
        recent.filter(({ title }) => looksLikeDefaultChatTitle(title)).map(({ id }) => id),
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

async function unpinAllConversations(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await applyPinnedConversations([]);
  } catch (error) {
    button.title = error instanceof Error ? error.message : "Could not unpin chats.";
  } finally {
    button.disabled = cachedPinnedConversationIds().length === 0;
  }
}

export function ensurePinRecentButton(): void {
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

function conversationIdForPinButton(pinButton: HTMLElement): string | null {
  const link = pinButton.closest("li")?.querySelector<HTMLAnchorElement>('a[href*="/c/"]');
  if (!link) return null;

  const match = new URL(link.href, window.location.href).pathname.match(/\/c\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function ensurePinOnlyButtons(): void {
  document
    .querySelectorAll<HTMLButtonElement>('button[data-testid="quick-pin-conversation"]')
    .forEach((pinButton) => {
      if (pinButton.hasAttribute(pinOnlyButtonAttribute)) return;
      if (pinButton.parentElement?.querySelector(`[${pinOnlyButtonAttribute}]`)) return;

      const conversationId = conversationIdForPinButton(pinButton);
      if (!conversationId) return;

      const onlyButton = pinButton.cloneNode(false) as HTMLButtonElement;
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
