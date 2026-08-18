
/** Run fn once the initial document exists — userscripts run at document-start. */
export function onDocumentReady(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

/**
 * Run an idempotent apply-fn now and again after every mutation batch,
 * debounced to one run per animation frame. Omnigent is a React SPA: the
 * target DOM hydrates late and re-renders, so apply-fns must be cheap and
 * marker-guarded (safe to run many times).
 */
export function observeAndApply(fn: () => void): void {
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

/** Install one <style> per id; safe to call repeatedly. */
export function installStyles(id: string, css: string): void {
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.documentElement.append(style);
}

/**
 * React owns its inputs, so plain .value writes are reverted on the next
 * render. Write through the native prototype setter, then dispatch the
 * caller's input event so React state updates for real.
 * Returns false when the native setter is unavailable.
 */
export function setNativeValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  event: Event,
): boolean {
  const prototype =
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;

  setter.call(input, value);
  input.dispatchEvent(event);
  return true;
}
