import { useLayoutEffect, useRef } from 'react';
import { fmtNum } from '../core/format';
import type { RangeView } from '../data/watchlist-columns';
import { crispEdge, watchPixelRatio } from './chart/pixels';

/**
 * A range on one line: the low, a bar with the filled part and a marker at the price, the high. The day's range
 * fills the move from the open; the 52-week range fills today's range.
 */
export function RangeBar({ r, dec, title }: { r: RangeView; dec: number; title: string }) {
  const span = r.high - r.low;
  const pos = (v: number) => (span > 0 ? Math.min(100, Math.max(0, ((v - r.low) / span) * 100)) : 50);
  const from = pos(r.from);
  const to = pos(r.to);
  const at = pos(r.at);
  const track = useRef<HTMLSpanElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const position = useRef(at);
  position.current = at;
  const align = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const element = track.current;
    const mark = marker.current;
    if (!element || !mark) return;
    const update = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = window.devicePixelRatio || 1;
      const style = getComputedStyle(element);
      const sx = box.width / parseFloat(style.width);
      const sy = box.height / parseFloat(style.height);
      // Percent positions and table layout can both land between device pixels.
      // Snap the global edges, keeping the same thin bar at every price and DPI.
      const width = Math.max(1, Math.round(2 * sx * dpr)) / dpr;
      const height = Math.max(1, Math.round(13 * sy * dpr)) / dpr;
      const left = (crispEdge(box.left + box.width * position.current / 100 - width / 2, dpr) - box.left) / sx;
      const top = (crispEdge(box.top + (box.height - height) / 2, dpr) - box.top) / sy;
      // A transform retains sub-CSS-pixel precision at fractional display scales.
      mark.style.transform = `translate(${left}px, ${top}px) scale(${width / (2 * sx)}, ${height / (13 * sy)})`;
    };
    align.current = update;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    const table = element.closest('table');
    if (table) observer.observe(table);
    const stopPixels = watchPixelRatio(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.fonts.addEventListener('loadingdone', update);
    return () => {
      align.current = null;
      observer.disconnect();
      stopPixels();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.fonts.removeEventListener('loadingdone', update);
    };
  }, []);
  // Price changes and row reordering can move the marker without resizing its track.
  useLayoutEffect(() => { align.current?.(); });
  return (
    <span className="rangebar" title={title}>
      <span className="rb-end">{fmtNum(r.low, dec)}</span>
      <span ref={track} className="rb-track" data-testid="range-track">
        <span className="rb-fill" style={{ left: `${from}%`, width: `${Math.max(to - from, 0.5)}%` }} />
        <span ref={marker} className="rb-mark" />
      </span>
      <span className="rb-end">{fmtNum(r.high, dec)}</span>
    </span>
  );
}
