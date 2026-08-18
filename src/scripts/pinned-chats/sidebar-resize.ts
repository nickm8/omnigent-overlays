
import { installStyles } from "../../shared/dom";
import {
  sidebarMinWidthPx,
  sidebarResizeHandleSelector,
  sidebarResizeStyleId,
  sidebarSelector,
  sidebarUnlockedWidthStorageKey,
  sidebarUnlockedWidthVar,
} from "./config";

let dragging = false;
let handlersInstalled = false;

export function installSidebarResizeStyles(): void {
  installStyles(
    sidebarResizeStyleId,
    `
      @media (min-width: 768px) {
        ${sidebarSelector} {
          width: var(${sidebarUnlockedWidthVar}, var(--sidebar-width)) !important;
          max-width: none !important;
        }
      }
    `,
  );
}

function persistWidth(value: string): void {
  try {
    window.localStorage.setItem(sidebarUnlockedWidthStorageKey, value);
  } catch {
  }
}

function readStoredWidth(): string | null {
  try {
    const value = window.localStorage.getItem(sidebarUnlockedWidthStorageKey);
    return value && /^\d+(?:\.\d+)?px$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function setWidth(value: string, persist: boolean): void {
  document.documentElement.style.setProperty(sidebarUnlockedWidthVar, value);
  if (persist) persistWidth(value);
}

/** Re-apply the last unlocked width so a reload keeps the chosen size. */
export function applyStoredSidebarWidth(): void {
  const stored = readStoredWidth();
  if (stored) document.documentElement.style.setProperty(sidebarUnlockedWidthVar, stored);
}

function currentWidthPx(): number {
  const own = parseFloat(document.documentElement.style.getPropertyValue(sidebarUnlockedWidthVar));
  if (Number.isFinite(own)) return own;
  const sidebar = document.querySelector(sidebarSelector);
  const measured = sidebar ? parseFloat(getComputedStyle(sidebar).width) : Number.NaN;
  return Number.isFinite(measured) ? measured : sidebarMinWidthPx;
}

export function installSidebarResizeHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  document.addEventListener(
    "mousedown",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(sidebarResizeHandleSelector)) dragging = true;
    },
    true,
  );

  document.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    setWidth(`${Math.max(sidebarMinWidthPx, Math.round(event.clientX))}px`, false);
  });

  const endDrag = (): void => {
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
    true,
  );
}
