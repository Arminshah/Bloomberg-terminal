import { useState } from 'react';
import { useSize } from './useSize';
import { fmtNum, fmtPct } from '../core/format';
import { heatColour, useColourScheme } from '../terminal/palette';

/**
 * A heat map as a treemap, the market map's way: groups (sectors), their sub-groups (industry groups) and the members,
 * each sized by its weight and coloured by its change, red to green, full colour at ±`scale`%. Group and sub-group
 * headers name them with their weighted change; a member shows its ticker and change when its tile has room.
 */

export interface HeatLeaf {
  key: string;
  /** The tile's label (a ticker). */
  label: string;
  pct: number;
  /** Its size: index weight or market value (any positive unit). */
  weight: number;
  /** Lines for the tooltip. */
  info: string[];
  onClick?: () => void;
}

export interface HeatSub {
  /** Empty for a group without sub-groups. */
  name: string;
  leaves: HeatLeaf[];
}

export interface HeatGroup {
  name: string;
  subs: HeatSub[];
}

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

/** Red to green (or the colour scheme's fall and rise), full colour at ±scale%; dark grey without a change. */
export function heatFill(pct: number, scale = 3): string {
  return heatColour(pct, scale);
}

/** The weight-weighted change of some members, over those that have one. */
export function weightedChange(leaves: HeatLeaf[]): number {
  let w = 0;
  let s = 0;
  for (const l of leaves) {
    if (!Number.isFinite(l.pct) || !(l.weight > 0)) continue;
    w += l.weight;
    s += l.pct * l.weight;
  }
  return w > 0 ? s / w : NaN;
}

const sumW = (leaves: HeatLeaf[]) => leaves.reduce((a, l) => a + (l.weight > 0 ? l.weight : 0), 0);
const GROUP_HEAD = 15;
const SUB_HEAD = 12;

interface Placed {
  group: HeatGroup;
  r: Rect;
  pct: number;
  head: boolean;
  subs: { sub: HeatSub; r: Rect; pct: number; head: boolean; leaves: { leaf: HeatLeaf; r: Rect }[] }[];
}

/** Where every group, sub-group and member goes in a box of the given size. */
export function layoutHeatmap(groups: HeatGroup[], w: number, h: number): Placed[] {
  const sized = groups.map((g) => ({ v: g.subs.reduce((a, s) => a + sumW(s.leaves), 0), item: g })).filter((g) => g.v > 0);
  return squarify(sized, { x: 0, y: 0, w, h }).map(({ r, item: group }) => {
    const head = r.w > 60 && r.h > 34;
    const inner = { x: r.x + 1, y: r.y + (head ? GROUP_HEAD : 1), w: r.w - 2, h: r.h - (head ? GROUP_HEAD + 1 : 2) };
    const subsSized = group.subs.map((s) => ({ v: sumW(s.leaves), item: s })).filter((s) => s.v > 0);
    const subs = squarify(subsSized, inner).map(({ r: sr, item: sub }) => {
      const subHead = !!sub.name && group.subs.length > 1 && sr.w > 70 && sr.h > 40;
      const box = { x: sr.x + 1, y: sr.y + (subHead ? SUB_HEAD : 1), w: sr.w - 2, h: sr.h - (subHead ? SUB_HEAD + 1 : 2) };
      const leaves = squarify(sub.leaves.filter((l) => l.weight > 0).map((l) => ({ v: l.weight, item: l })), box).map(({ r: lr, item: leaf }) => ({ leaf, r: lr }));
      return { sub, r: sr, pct: weightedChange(sub.leaves), head: subHead, leaves };
    });
    return { group, r, pct: weightedChange(group.subs.flatMap((s) => s.leaves)), head, subs };
  });
}

const pctText = (p: number) => (Number.isFinite(p) ? `${p >= 0 ? '+' : ''}${fmtNum(p, 2)}%` : '');

/**
 * Label sizes for a tile: the ticker between 8 and 15 px (a little larger on large tiles, never so large it shouts),
 * the change 86% of it, each shown only when it fits whole.
 */
export function tileText(label: string, w: number, h: number): { fs: number; pfs: number; showLabel: boolean; showPct: boolean } {
  const em = 0.6; // average character width of the sans type, in ems
  const fit = Math.min((w - 6) / (Math.max(label.length, 3) * em), (h - 4) / 1.3);
  const fs = Math.round(Math.min(15, 10 + Math.sqrt(Math.max(0, w * h)) / 40, fit) * 2) / 2;
  const pfs = Math.round(Math.min(13, fs * 0.86) * 2) / 2;
  const showLabel = fs >= 8;
  const showPct = showLabel && h >= fs + pfs + 8 && w - 6 >= 6 * pfs * em;
  return { fs, pfs, showLabel, showPct };
}

export function HeatTreemap({ groups, scale = 3, height, onGroup, period = 'd' }: { groups: HeatGroup[]; scale?: number; height?: number; onGroup?: (name: string) => void; period?: string }) {
  // Heat colours follow the colour scheme.
  useColourScheme();
  const [box, size] = useSize<HTMLDivElement>();
  const W = Math.max(240, size.w);
  const H = height ?? Math.max(360, size.h);
  const placed = layoutHeatmap(groups, W, H);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const clip = (text: string, w: number, px: number) => {
    const fit = Math.floor((w - 6) / (px * 0.6));
    return fit >= text.length ? text : fit > 3 ? `${text.slice(0, fit - 1)}…` : '';
  };
  return (
    <div className="heatmap">
      <div ref={box} className="heatmap-box" style={height ? { height } : undefined} onMouseLeave={() => setTip(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Heat map">
          {placed.map((g) => (
            <g key={g.group.name}>
              <rect x={g.r.x} y={g.r.y} width={g.r.w} height={g.r.h} fill="#140a0d" stroke="#000" strokeWidth={2} />
              {g.head && (
                <text
                  x={g.r.x + 4}
                  y={g.r.y + 11}
                  className={`heatmap-group${onGroup ? ' click' : ''}`}
                  onClick={onGroup ? () => onGroup(g.group.name) : undefined}
                >
                  {clip(`${g.group.name} (${period}) ${pctText(g.pct)}`, g.r.w, 10)}
                </text>
              )}
              {g.subs.map((s) => (
                <g key={s.sub.name || 'all'}>
                  {s.head && (
                    <text x={s.r.x + 3} y={s.r.y + 9} className="heatmap-sub">
                      {clip(`${s.sub.name} (${period})`, s.r.w, 8)}
                    </text>
                  )}
                  {s.leaves.map(({ leaf, r }) => {
                    // The terminal's own type, small and nearly even across tiles: it grows a little with the tile (to
                    // 15 px) and shrinks to fit; a label that does not fit at 8 px is left to the tooltip, not cut.
                    const { fs, pfs, showLabel, showPct } = tileText(leaf.label, r.w, r.h);
                    return (
                      <g
                        key={leaf.key}
                        className={leaf.onClick ? 'click' : undefined}
                        onClick={leaf.onClick}
                        onMouseMove={(e) => {
                          const host = box.current?.getBoundingClientRect();
                          if (host) setTip({ x: e.clientX - host.left, y: e.clientY - host.top, lines: leaf.info });
                        }}
                      >
                        <rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={heatFill(leaf.pct, scale)} stroke="#000" strokeWidth={r.w > 6 ? 1 : 0.4} />
                        {showLabel && (
                          <text x={r.x + r.w / 2} y={r.y + r.h / 2 + (showPct ? -2 : fs * 0.35)} textAnchor="middle" className="heatmap-tick" fontSize={fs}>
                            {leaf.label}
                          </text>
                        )}
                        {showLabel && showPct && (
                          <text x={r.x + r.w / 2} y={r.y + r.h / 2 + pfs + 1} textAnchor="middle" className="heatmap-pct" fontSize={pfs}>
                            {fmtPct(leaf.pct, 2)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
          ))}
        </svg>
        {tip && (
          <div className="heatmap-tip" style={{ left: Math.min(tip.x + 12, W - 220), top: tip.y + 14 }}>
            {tip.lines.filter(Boolean).map((l, i) => (i === 0 ? <b key={l}>{l}</b> : <div key={l}>{l}</div>))}
          </div>
        )}
      </div>
      <div className="heatmap-legend" aria-label={`Colour scale from -${scale}% to +${scale}%`}>
        <span>-{scale}</span>
        <i style={{ background: `linear-gradient(90deg, ${heatFill(-scale, scale)}, ${heatFill(-scale / 2, scale)}, ${heatFill(-0.0001, scale)}, #262626, ${heatFill(0.0001, scale)}, ${heatFill(scale / 2, scale)}, ${heatFill(scale, scale)})` }} />
        <span>+{scale}</span>
      </div>
    </div>
  );
}
