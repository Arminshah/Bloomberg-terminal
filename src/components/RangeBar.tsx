import { fmtNum } from '../core/format';
import type { RangeView } from '../data/watchlist-columns';

/**
 * A range on one line: the low, a bar with the filled part and a marker at the price, the high. The day's range
 * fills the move from the open; the 52-week range fills today's range.
 */
export function RangeBar({ r, dec, title }: { r: RangeView; dec: number; title: string }) {
  const span = r.high - r.low;
  const pos = (v: number) => (span > 0 ? Math.min(100, Math.max(0, ((v - r.low) / span) * 100)) : 50);
  const from = pos(r.from);
  const to = pos(r.to);
  return (
    <span className="rangebar" title={title}>
      <span className="rb-end">{fmtNum(r.low, dec)}</span>
      <span className="rb-track" data-testid="range-track">
        <span className="rb-fill" style={{ left: `${from}%`, width: `${Math.max(to - from, 0.5)}%` }} />
        <span className="rb-mark" style={{ left: `${pos(r.at)}%` }} />
      </span>
      <span className="rb-end">{fmtNum(r.high, dec)}</span>
    </span>
  );
}
