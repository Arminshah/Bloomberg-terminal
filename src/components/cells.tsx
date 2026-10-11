import type { MouseEvent, ReactNode } from 'react';
import { engine, useQuote } from '../data/market';
import { fmtBp, fmtNum, fmtPct, fmtSigned, signClass } from '../core/format';
import { defaultFnFor, usePanelId } from '../terminal/panel';
import { LAYOUT_PANELS, navigate, terminal } from '../terminal/state';
import { settings } from '../terminal/settings';
import { Flash } from './Flash';

/** Opens a security: plain click in this panel, shift-click in the next panel. */
export function openSecurity(panel: number, id: string, e?: MouseEvent, fn?: string) {
  const def = engine.get(id);
  if (!def) return;
  const pref = settings.get().clickAction;
  const code = fn ?? (pref === 'auto' ? defaultFnFor(def) : def.cls === 'bond' && pref !== 'DES' ? 'YAS' : pref);
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

/** Live last price with tick flash. */
export function LivePx({ id, dec }: { id: string; dec?: number }) {
  const q = useQuote(id);
  const def = engine.get(id);
  if (!q || !def) return <span>--</span>;
  return <Flash value={q.last}>{fmtNum(q.last, dec ?? def.dec)}</Flash>;
}

export function LiveChg({ id, mode = 'pct' }: { id: string; mode?: 'pct' | 'net' }) {
  const q = useQuote(id);
  const def = engine.get(id);
  if (!q || !def) return <span>--</span>;
  if (def.quote === 'yield') return <Chg v={q.chg} bp />;
  return mode === 'pct' ? <Chg v={q.pct} pct /> : <Chg v={q.chg} dec={def.dec} />;
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
