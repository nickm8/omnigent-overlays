export {};

declare global {
  interface Window {
    /** Injected-script-set hash prepended by the overlay proxy; absent when loaded raw. */
    __omnigentOverlaysBuild?: string;
    /** Overlay control config injected same-origin for the panel; absent when loaded raw. */
    __omnigentOverlays?: { token: string; revision: string; apiBase: string };
    /** Guard so the panel bootstrap initializes once per page. */
    __omnigentOverlaysPanelLoaded?: boolean;
    /** Guard so the palette-swapper overlay initializes once per page. */
    __omnigentPaletteSwapper?: boolean;
    /** Guard so the project-focus overlay initializes once per page. */
    __omnigentProjectFocus?: boolean;
  }
}
