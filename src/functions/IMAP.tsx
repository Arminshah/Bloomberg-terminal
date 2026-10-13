import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { heat, openSecurity } from '../components/cells';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { marketCapUsd, periodChange, type Horizon } from '../data/analytics';
import { shortName } from '../data/news';
import { usePanelId } from '../terminal/panel';
import { useSize } from '../components/useSize';
import type { SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap layout (Bruls et al.). Values must be positive. */
export function squarify<T>(items: { v: number; item: T }[], box: Rect): { r: Rect; item: T }[] {
  const out: { r: Rect; item: T }[] = [];
  const total = items.reduce((a, b) => a + b.v, 0);
  if (total <= 0 || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const rest = [...items].sort((a, b) => b.v - a.v).map((x) => ({ ...x, a: x.v * scale }));
  let r = { ...box };
  while (rest.length) {
    const short = Math.min(r.w, r.h);
    const row: typeof rest = [];
    let worst = Infinity;
    while (rest.length) {
      const cand = [...row, rest[0]];
      const s = cand.reduce((a, b) => a + b.a, 0);
      const max = Math.max(...cand.map((c) => c.a));
      const min = Math.min(...cand.map((c) => c.a));
      const w = Math.max((short * short * max) / (s * s), (s * s) / (short * short * min));
      if (w > worst && row.length) break;
      worst = w;
      row.push(rest.shift()!);
    }
    const s = row.reduce((a, b) => a + b.a, 0);
    const thick = s / short;
    let off = 0;
    for (const c of row) {
      const len = c.a / thick;
      if (r.w >= r.h) out.push({ r: { x: r.x, y: r.y + off, w: thick, h: len }, item: c.item });
      else out.push({ r: { x: r.x + off, y: r.y, w: len, h: thick }, item: c.item });
      off += len;
    }
    r = r.w >= r.h ? { x: r.x + thick, y: r.y, w: r.w - thick, h: r.h } : { x: r.x, y: r.y + thick, w: r.w, h: r.h - thick };
  }
  return out;
}

const REGIONS = [
  { n: 1, label: 'US', f: (d: SecurityDef) => d.country === 'US' },
  { n: 2, label: 'Europe', f: (d: SecurityDef) => d.region === 'EMEA' },
  { n: 3, label: 'Asia Pacific', f: (d: SecurityDef) => d.region === 'APAC' },
  { n: 4, label: 'World', f: () => true },
];
const MEASURES: { n: number; h: Horizon; scale: number }[] = [
  { n: 11, h: '1D', scale: 3 },
  { n: 12, h: '5D', scale: 6 },
  { n: 13, h: '1M', scale: 10 },
  { n: 14, h: 'YTD', scale: 30 },
  { n: 15, h: '1Y', scale: 40 },
];

export function IMAP(_: FnProps) {
  const panel = usePanelId();
  const tick = useTick(2);
  const [region, setRegion] = useState(1);
  const [measure, setMeasure] = useState(11);
  const m = MEASURES.find((x) => x.n === measure)!;
  const [box, size] = useSize<HTMLDivElement>();
  const W = Math.max(200, size.w);
  const H = Math.max(160, size.h);
  const tiles = useMemo(() => {
    // A company is drawn once the source has given its market cap; nothing is sized on a guess.
    const cap = (id: string) => {
      const c = marketCapUsd(id);
      return Number.isFinite(c) && c > 0 ? c : 0;
    };
    const secs = engine.securities.filter((d) => d.cls === 'equity' && REGIONS[region - 1].f(d) && cap(d.id) > 0);
    const bySector = new Map<string, SecurityDef[]>();
    for (const d of secs) {
      const k = d.eq!.sector;
      bySector.set(k, [...(bySector.get(k) ?? []), d]);
    }
    const sectors = [...bySector.entries()].map(([name, list]) => ({ v: list.reduce((a, d) => a + cap(d.id), 0), item: { name, list } }));
    return squarify(sectors, { x: 0, y: 0, w: W, h: H }).map(({ r, item }) => {
      const inner = { x: r.x + 1, y: r.y + 15, w: r.w - 2, h: r.h - 16 };
      const kids = squarify(item.list.map((d) => ({ v: cap(d.id), item: d })), inner);
      // Sector change weighted over the companies that have one for the period.
      let w = 0;
      let sum = 0;
      for (const d of item.list) {
        const pct = periodChange(d.id, m.h);
        if (!Number.isFinite(pct)) continue;
        w += cap(d.id);
        sum += pct * cap(d.id);
      }
      return { r, name: item.name, kids, chg: w > 0 ? sum / w : NaN };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, measure, tick, W, H]);
  return (
    <div className="fn-fill">
      <FnHeader
        code="IMAP"
        title="Intraday Market Map"
        sub={`Sized by market cap (USD) · coloured by ${m.h} % change`}
        tabs={REGIONS.map((r) => ({ n: r.n, label: r.label }))}
        tab={region}
        onTab={setRegion}
        actions={MEASURES.map((x) => ({ n: x.n, label: x.h, on: x.n === measure, onClick: () => setMeasure(x.n) }))}
      />
      <div ref={box} style={{ flex: 1, minHeight: 260, position: 'relative', margin: 4 }}>
        {tiles.length === 0 ? <div className="empty">Waiting for market caps from the source…</div> : null}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {tiles.map((t) => (
            <g key={t.name}>
              <rect x={t.r.x} y={t.r.y} width={t.r.w} height={t.r.h} fill="#0a0a0a" stroke="#000" strokeWidth={2} />
              <text x={t.r.x + 4} y={t.r.y + 11} fill="#ff9e1b" fontSize={10} fontFamily="IBM Plex Mono, monospace">
                {t.r.w > 90 ? `${t.name.toUpperCase()} ${Number.isFinite(t.chg) ? `${t.chg >= 0 ? '+' : ''}${fmtNum(t.chg, 2)}%` : ''}` : ''}
              </text>
              {t.kids.map(({ r, item: d }) => {
                const pct = periodChange(d.id, m.h);
                const big = r.w > 46 && r.h > 26;
                return (
                  <g key={d.id} style={{ cursor: 'pointer' }} onClick={(e) => openSecurity(panel, d.id, e as unknown as React.MouseEvent, 'GP')}>
                    <title>{`${d.name}\n${fmtNum(engine.quote(d.id)!.last, d.dec)} ${d.ccy}  ${fmtPct(pct, 2)}\nMkt cap ${fmtBig(marketCapUsd(d.id))} USD`}</title>
                    <rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={heat(pct, m.scale)} stroke="#000" strokeWidth={1} />
                    {big && (
                      <>
                        <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 2} textAnchor="middle" fill="#fff" fontSize={Math.min(16, Math.max(9, r.w / 7))} fontWeight={600} fontFamily="IBM Plex Mono, monospace">
                          {d.ticker.split(' ')[0]}
                        </text>
                        <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 11} textAnchor="middle" fill="#e8e8e8" fontSize={Math.min(12, Math.max(8, r.w / 9))} fontFamily="IBM Plex Mono, monospace">
                          {fmtPct(pct, 2)}
                        </text>
                        {r.h > 54 && r.w > 90 && (
                          <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 24} textAnchor="middle" fill="#bdbdbd" fontSize={9} fontFamily="IBM Plex Sans, sans-serif">
                            {shortName(d)}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <div className="row pad-s" style={{ justifyContent: 'center', gap: 2 }}>
        {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((k) => (
          <span key={k} style={{ background: heat(k * m.scale, m.scale), padding: '0 10px', fontSize: 10 }}>
            {k > 0 ? '+' : ''}
            {fmtNum(k * m.scale, 1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
