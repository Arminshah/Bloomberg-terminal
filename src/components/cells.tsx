import type { MouseEvent, ReactNode } from 'react';
import { engine, useQuote } from '../data/market';
import { fmtBp, fmtDay, fmtNum, fmtPct, fmtSigned, signClass } from '../core/format';
import { DAY_MS } from '../data/calendar';
import type { Quote } from '../data/types';
import { freshnessOf, type FreshnessLabel } from '../data/freshness';
import { defaultFnFor, usePanelId } from '../terminal/panel';
import { LAYOUT_PANELS, navigate, terminal } from '../terminal/state';
import { settings } from '../terminal/settings';
import { Flash } from './Flash';

/** Opens a security: plain click in this panel, shift-click in the next panel. */
export function openSecurity(panel: number, id: string, e?: MouseEvent, fn?: string) {
  const def = engine.get(id);
  if (!def) return;
  const pref = settings.get().clickAction;
  const code = fn ?? (pref === 'auto' ? defaultFnFor(def) : def.cls === 'bond' && pref !== 'PROFILE' ? 'BONDCALC' : pref);
  let target = panel;
  if (e?.shiftKey) {
    const n = LAYOUT_PANELS[terminal.get().layout];
    target = (panel + 1) % Math.max(n, 2);
  }
  navigate(target, { fn: code, sec: id });
}

export function SecLink({ id, children, fn, className }: { id: string; children?: ReactNode; fn?: string; className?: string }) {
  const panel = usePanelId();
  return (
    <button
      type="button"
      className={`sec-link ${className ?? ''}`}
      title={`${id} — click to open, shift-click for next panel`}
      onClick={(e) => {
        e.stopPropagation();
        openSecurity(panel, id, e, fn);
      }}
    >
      {children ?? id}
    </button>
  );
}

export function Chg({ v, dec = 2, pct, bp, plain }: { v: number; dec?: number; pct?: boolean; bp?: boolean; plain?: boolean }) {
  const text = bp ? fmtBp(v) : pct ? fmtPct(v, dec) : fmtSigned(v, dec);
  return <span className={plain ? '' : signClass(v)}>{text}</span>;
}

const UNVERIFIED = 'Not verified: no previous daily bar to check the previous close against yet';
const NO_PREV = "No verified previous close: the source's readings disagree with the daily bars, or it gave none";

/** Where a verified change comes from, for its tooltip: "Against the close of 12 Oct 2026: 24,271.20". */
function prevTitle(q: Quote, dec: number): string | undefined {
  if (q.chgCheck !== 'verified' || !Number.isFinite(q.prevClose)) return undefined;
  const on = q.prevCloseDay !== undefined ? ` of ${fmtDay(q.prevCloseDay * DAY_MS)}` : '';
  return `Against the close${on}: ${fmtNum(q.prevClose, dec)}`;
}

/**
 * A quote's change on the day. Greyed and marked "?" while its previous close is
 * unverified; "--" when there is none (or the sources conflict); otherwise
 * coloured, with the previous close and its date on hover. `bp` shows a yield's
 * change in basis points, `unit` adds a suffix such as "bp".
 */
export function DayChg({ q, pct, bp, dec = 2, unit = '' }: { q: Quote; pct?: boolean; bp?: boolean; dec?: number; unit?: string }) {
  const v = pct ? q.pct : q.chg;
  if (!Number.isFinite(v)) {
    const real = q.src !== 'SIM' && q.src !== 'NONE';
    return (
      <span className="muted" title={real ? NO_PREV : undefined}>
        --
      </span>
    );
  }
  const text = (bp ? fmtBp(v) : pct ? fmtPct(v, dec) : fmtSigned(v, dec)) + unit;
  if (q.chgCheck === 'unverified') {
    return (
      <span className="muted" title={UNVERIFIED}>
        {text}?
      </span>
    );
  }
  return (
    <span className={signClass(v)} title={prevTitle(q, dec)}>
      {text}
    </span>
  );
}

const MARK_CLASS: Partial<Record<FreshnessLabel, string>> = {
  DELAYED: 'delayed-px',
  'END OF DAY': 'eod-px',
  REFERENCE: 'ref-px',
  STALE: 'stale-px',
  'DEMO DATA': 'sim-px',
  'UNKNOWN FRESHNESS': 'unk-px',
};

/** Live last price with tick flash, marked with its freshness (no mark for real time). */
export function LivePx({ id, dec }: { id: string; dec?: number }) {
  const q = useQuote(id);
  const def = engine.get(id);
  if (!q || !def) return <span>--</span>;
  const px = <Flash value={q.last}>{fmtNum(q.last, dec ?? def.dec)}</Flash>;
  const f = freshnessOf(q, def, Date.now());
  const cls = f ? MARK_CLASS[f.label] : undefined;
  if (!f || !cls) return f ? <span title={f.why}>{px}</span> : px;
  return (
    <span className={cls} title={`${f.label}: ${f.why}`}>
      {px}
    </span>
  );
}

export function LiveChg({ id, mode = 'pct' }: { id: string; mode?: 'pct' | 'net' }) {
  const q = useQuote(id);
  const def = engine.get(id);
  if (!q || !def) return <span>--</span>;
  if (def.quote === 'yield') return <DayChg q={q} bp />;
  return mode === 'pct' ? <DayChg q={q} pct /> : <DayChg q={q} dec={def.dec} />;
}

export function Section({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sect ${className ?? ''}`}>
      <div className="sect-h">
        {title}
        {right && <span className="right">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => [
        <dt key={`k${i}`}>{k}</dt>,
        <dd key={`v${i}`}>{v}</dd>,
      ])}
    </dl>
  );
}

/** Horizontal bar, signed values grow from the centre line. */
export function HBar({ value, max, signed, color }: { value: number; max: number; signed?: boolean; color?: string }) {
  const w = Math.min(1, Math.abs(value) / (max || 1));
  const c = color ?? (value >= 0 ? 'var(--up)' : 'var(--dn)');
  if (!signed) {
    return (
      <div className="bar-track">
        <div className="bar-fill" style={{ left: 0, width: `${w * 100}%`, background: c }} />
      </div>
    );
  }
  return (
    <div className="bar-track">
      <div className="bar-fill" style={value >= 0 ? { left: '50%', width: `${w * 50}%`, background: c } : { right: '50%', width: `${w * 50}%`, background: c }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--line-2)' }} />
    </div>
  );
}

/** Heat colour for a percent change. */
export function heat(pct: number, scale = 3): string {
  if (!Number.isFinite(pct)) return '#1a1a1a';
  const a = Math.min(1, Math.abs(pct) / scale);
  if (pct >= 0) return `rgb(${Math.round(16 + 10 * a)}, ${Math.round(40 + 120 * a)}, ${Math.round(24 + 40 * a)})`;
  return `rgb(${Math.round(50 + 150 * a)}, ${Math.round(22 + 8 * a)}, ${Math.round(24 + 10 * a)})`;
}
