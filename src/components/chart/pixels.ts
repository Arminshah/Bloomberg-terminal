/**
 * Pixel geometry for the canvas charts. The backing store has one pixel per device pixel of the element, and straight
 * lines and filled edges land on whole device pixels, so charts stay sharp at 125% and 150% display scaling, where a
 * CSS pixel is not a whole number of device pixels.
 */

/** The backing store's size: the element's device-pixel box when the browser reports one, else its exact size times the ratio. */
export function backingSize(w: number, h: number, dpr: number, device?: { width: number; height: number }): { width: number; height: number } {
  if (device && device.width > 0 && device.height > 0) return { width: device.width, height: device.height };
  return { width: Math.max(1, Math.round(w * dpr)), height: Math.max(1, Math.round(h * dpr)) };
}

/** The device-pixel box a ResizeObserver entry reports, where the browser supports it (Chromium does). */
export function deviceBox(entry: ResizeObserverEntry | undefined): { width: number; height: number } | undefined {
  const box = entry?.devicePixelContentBoxSize?.[0];
  return box ? { width: box.inlineSize, height: box.blockSize } : undefined;
}

/** Device pixels in a line `css` CSS pixels wide: rounded down, at least one, as browsers draw borders. */
function devicePixels(css: number, scale: number): number {
  return Math.max(1, Math.floor(css * scale + 1e-6));
}

/** A line width, in CSS pixels, that covers whole device pixels. */
export function crispWidth(scale: number, css = 1): number {
  return devicePixels(css, scale) / scale;
}

/** The centre of a straight line at `v` (CSS pixels), moved to the nearest place where it covers whole device pixels. */
export function crispLine(v: number, scale: number, css = 1): number {
  const off = devicePixels(css, scale) % 2 ? 0.5 : 0;
  return (Math.round(v * scale - off) + off) / scale;
}

/** An edge of a filled shape at `v`, moved to the nearest device-pixel boundary. */
export function crispEdge(v: number, scale: number): number {
  return Math.round(v * scale) / scale;
}

/** A dash pattern whose dashes and gaps are whole device pixels. */
export function crispDash(pattern: number[], scale: number): number[] {
  return pattern.map((d) => Math.max(1, Math.round(d * scale)) / scale);
}

/**
 * Calls `onChange` when the device-pixel ratio changes: the window moved to a screen with other scaling, or the zoom
 * changed. That does not always resize the element. Returns a function that stops listening.
 */
export function watchPixelRatio(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  let query: MediaQueryList | null = null;
  function fire() {
    arm();
    onChange();
  }
  function arm() {
    query?.removeEventListener('change', fire);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', fire);
  }
  arm();
  return () => query?.removeEventListener('change', fire);
}
