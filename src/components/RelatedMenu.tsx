// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import { createStore } from '../core/store';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { linesFor, MAIN, MENUS, SECTORS, type Line } from '../functions/MENU';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { OVERLAY_MENU, useMenu, usePanelId } from '../terminal/panel';
import { settings } from '../terminal/settings';
import { currentRoute, loadedSecurity, navigate, terminal } from '../terminal/state';

/** The panel whose Related Functions Menu is open, if any (one at a time, as one window shows one). */
export const relatedMenu = createStore<{ panel: number | null }>({ panel: null });

export function toggleRelatedMenu(panel: number) {
  relatedMenu.set((s) => ({ panel: s.panel === panel ? null : panel }));
}

export function closeRelatedMenu() {
  if (relatedMenu.get().panel !== null) relatedMenu.set({ panel: null });
}

/** How many of a group's functions the menu lists before its ">" opens the rest. */
const PER_GROUP = 4;

/** The breadcrumb's name for a market sector (TE01 02:53 reads "Equities"). */
const SECTOR_NAME: Record<string, string> = { EQUITY: 'Equities' };

interface Row {
  n: number;
  /** A group's heading ("Company Overview >"), which opens the whole group. */
  group?: string;
  line?: Line;
  sector?: string;
}

/** Numbers run through headings and functions alike, down the first column and on into the second. */
function rowsFor(groups: { title: string; lines: Line[] }[], open: string | null): Row[] {
  const rows: Row[] = [];
  let n = 1;
  for (const g of groups) {
    if (open && g.title !== open) continue;
    if (!open) rows.push({ n: n++, group: g.title });
    for (const line of open ? g.lines : g.lines.slice(0, PER_GROUP)) rows.push({ n: n++, line });
  }
  return rows;
}

/** Splits the rows into two columns at a group boundary, the first a little longer when they cannot be equal. */
function twoColumns(rows: Row[]): [Row[], Row[]] {
  const starts = rows.map((r, i) => (r.group ? i : -1)).filter((i) => i > 0);
  if (!starts.length) {
    const half = Math.ceil(rows.length / 2);
    return [rows.slice(0, half), rows.slice(half)];
  }
  const at = starts.reduce((best, i) => (Math.abs(i - rows.length / 2) < Math.abs(best - rows.length / 2) ? i : best), starts[0]);
  return [rows.slice(0, at), rows.slice(at)];
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
      <path d="M7 0.8 0.8 6.2h1.9V11.2h3.2V8h2.2v3.2h3.2V6.2h1.9z" fill="currentColor" />
    </svg>
  );
}

/**
 * The Related Functions Menu as the 2024 frames draw it (TE01 02:53, TE01 03:35): a panel laid over the screen under
 * the toolbar, the screen still showing at its right; "<Cancel> X" at the top right; a home mark and a blue italic
 * path ending in the page in white italics; two columns of numbered headings ("1) Company Overview >") and functions
 * (grey number, white mnemonic, amber title), the numbers running on from the first column into the second. A heading
 * opens its whole group; a number and GO, or a click, runs the function. MENU <GO> still opens the full menu page.
 */
export function RelatedMenu() {
  const panel = usePanelId();
  const open = relatedMenu.use((s) => s.panel === panel);
  const route = terminal.use((s) => currentRoute(s, panel));
  const loaded = terminal.use((s) => loadedSecurity(s, panel));
  const mnemonics = settings.use((s) => s.mnemonics);
  const [group, setGroup] = useState<string | null>(null);
  const sec: SecurityDef | undefined = loaded ? engine.get(loaded) : undefined;
  const groups = useMemo(() => (sec ? linesFor(MENUS[sec.cls], sec) : []), [sec]);
  const rows = useMemo((): Row[] => {
    if (sec) return rowsFor(groups, group);
    // No security loaded: the market sectors, as the main menu lists them.
    return MAIN.map((m, i) => ({ n: i + 1, sector: m.key, line: { n: i + 1, code: m.key, label: m.label, cmd: m.key } }));
  }, [sec, groups, group]);
  const close = () => {
    setGroup(null);
    closeRelatedMenu();
  };
  const run = (r: Row) => {
    if (r.group) return setGroup(r.group);
    if (r.line) {
      close();
      execute(panel, r.line.cmd);
    }
  };
  // While open, a number and GO runs the menu's line, ahead of the screen's own numbers.
  useMenu(OVERLAY_MENU, open ? rows.map((r) => ({ n: r.n, label: r.group ?? r.line?.label ?? '', run: () => run(r) })) : []);
  // Another screen, or Escape, closes it.
  const key = `${route.fn}|${route.sec ?? ''}|${route.args ?? ''}`;
  useEffect(() => {
    setGroup(null);
    closeRelatedMenu();
  }, [key]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setGroup(null);
      closeRelatedMenu();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  const sectorKey = sec ? (sec.yk.toUpperCase() === 'COMDTY' ? 'CMDTY' : sec.yk.toUpperCase()) : undefined;
  const sector = sectorKey ? SECTORS[sectorKey] : undefined;
  const [left, right] = twoColumns(rows);
  const column = (list: Row[]) => (
    <div className="rfm-col">
      {list.map((r) =>
        r.group ? (
          <button key={r.n} type="button" className="rfm-row rfm-group" onClick={() => run(r)}>
            <span className="rfm-n">{r.n})</span>
            <span className="rfm-gt">{r.group} <span aria-hidden="true">&gt;</span></span>
          </button>
        ) : (
          <button key={r.n} type="button" className={`rfm-row${r.line?.none ? ' none' : ''}`} title={r.line?.none ? `Not available: ${r.line.none}` : `${r.line?.cmd} <GO>`} onClick={() => run(r)}>
            <span className="rfm-n">{r.n})</span>
            <span className="rfm-mn">{r.sector ?? (mnemonics ? primaryMnemonic(r.line!.code) : r.line!.code)}</span>
            <span className="rfm-t">{r.line?.label}</span>
          </button>
        ),
      )}
    </div>
  );
  return (
    <div className="rfm" role="dialog" aria-label="Related Functions Menu">
      <div className="rfm-top">
        <button type="button" className="rfm-cancel" onClick={close}>&lt;Cancel&gt; X</button>
      </div>
      <nav className="rfm-path" aria-label="Menu path">
        <span className="rfm-home"><HomeIcon /></span>
        <button type="button" className="rfm-link" onClick={() => { close(); navigate(panel, { fn: 'MENU' }); }}>Main Menu</button>
        {sec && sector ? (
          <>
            <span className="rfm-sep" aria-hidden="true">&gt;</span>
            <button type="button" className="rfm-link" onClick={() => { close(); navigate(panel, { fn: 'MENU', args: sectorKey }); }}>{SECTOR_NAME[sectorKey!] ?? sector.title}</button>
            <span className="rfm-sep" aria-hidden="true">&gt;</span>
            {group ? (
              <>
                <button type="button" className="rfm-link" onClick={() => setGroup(null)}>Analyze {sec.name.toUpperCase()} {sec.yk}</button>
                <span className="rfm-sep" aria-hidden="true">&gt;</span>
                <span className="rfm-here" aria-current="page">{group}</span>
              </>
            ) : (
              <span className="rfm-here" aria-current="page">Analyze {sec.name.toUpperCase()} {sec.yk}</span>
            )}
          </>
        ) : null}
      </nav>
      <div className="rfm-cols">
        {column(left)}
        {column(right)}
      </div>
    </div>
  );
}
