// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Dialog } from '../components/Dialog';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { Credits } from '../components/Credits';
import { createStore } from '../core/store';
import { fmtDay, fmtNum } from '../core/format';
import { engine } from '../data/market';
import { COUNTRY_NAMES } from '../data/eco';
import { fredData, type Obs } from '../data/live/fred';
import { ECST_COUNTRIES, currentAndPrevious, ecstTree, history, tickerOf, type StatCategory, type StatDef } from '../data/ecst';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { FredNotice } from './ECO';

/** 95) Custom Views: indicators picked from any country, kept on this computer. */
const ecstViews = createStore<{ rows: { c: string; series: string; label: string }[] }>({ rows: [] }, 'ecstviews', 1);

const nameOf = (c: string) => COUNTRY_NAMES[c] ?? c;
const fmt = (v: number | undefined, dec: number) => (v == null || !Number.isFinite(v) ? '--' : fmtNum(v, dec));

/** Every row of a country, once, for search and the custom view builder. */
function allRows(c: string): StatDef[] {
  const seen = new Map<string, StatDef>();
  for (const cat of ecstTree(c)) for (const s of cat.sections) for (const r of s.rows) seen.set(`${r.series}|${r.calc}`, r);
  return [...seen.values()];
}

function StatRow({ n, def, obs, on, onPick, prefix }: { n: number; def: StatDef; obs: Obs | undefined; on: boolean; onPick: () => void; prefix?: string }) {
  const { cur, prev } = currentAndPrevious(def, obs);
  return (
    <tr className={`click${on ? ' ecst-on' : ''}`} onClick={onPick} title={`${def.source}${def.note ? `. ${def.note}` : ''}`} data-testid="ecst-row">
      <td className="amber">
        <span className="rowno">{n})</span> {prefix ? <span className="white">{prefix} </span> : null}
        {def.label}
      </td>
      <td className="ecst-icon">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 10.5h10M2 8l2.6-3 2 2L10 2.5" /></svg>
      </td>
      <td className="muted ecst-tk">{tickerOf(def.series)}</td>
      <td className="num amber">{fmt(cur?.v, def.dec)}</td>
      <td className="amber">{cur?.period ?? '--'}</td>
      <td className="num amber">{fmt(prev?.v, def.dec)}</td>
      <td className="amber">{prev?.period ?? '--'}</td>
    </tr>
  );
}

/**
 * ECST, World Economic Statistics, as the Quick Start (2020) and Babson (2023) draw it: 91) Search and 92) Settings on
 * the red bar, tabs 94) Standard Views and 95) Custom Views; at the left the country in its amber field with 1) Browse
 * and the categories as a tree; at the right the category's indicators under cyan section heads, numbered, each with
 * its ticker, its current value and date and the previous ones; and the chart of the chosen indicator, which
 * 3) Maximize Chart enlarges. The desktop app reads each figure from its statistics office (or FRED); the browser demo
 * has none.
 */
export function ECST({ route }: FnProps) {
  const panel = usePanelId();
  const real = engine.realOnly;
  const series = fredData.use((x) => x.series);
  const needsKey = fredData.use((x) => x.needsKey);
  const views = ecstViews.use((s) => s.rows);
  const arg = (route.args ?? '').trim().toUpperCase();
  const [tab, setTab] = useState(94);
  const [country, setCountry] = useState(ECST_COUNTRIES.includes(arg) ? arg : 'US');
  const tree = ecstTree(country);
  const [cat, setCat] = useState(0);
  const [open, setOpen] = useState<string[]>([tree[0]?.name ?? '']);
  const [section, setSection] = useState<string | null>(null);
  const [pick, setPick] = useState<{ c: string; def: StatDef } | null>(null);
  const [big, setBig] = useState(false);
  const [dialog, setDialog] = useState<'browse' | 'search' | null>(arg === 'S' ? 'search' : null);
  const category: StatCategory | undefined = tree[Math.min(cat, tree.length - 1)];
  const sections = (category?.sections ?? []).filter((s) => !section || s.title === section);
  const shown = tab === 94 ? sections.flatMap((s) => s.rows.map((def) => ({ c: country, def }))) : views.map((v) => ({ c: v.c, def: allRows(v.c).find((d) => d.series === v.series && d.label === v.label) })).filter((x): x is { c: string; def: StatDef } => !!x.def);
  const chosen = pick ?? shown[0] ?? null;
  const points = useMemo(() => (chosen ? history(chosen.def, series[chosen.def.series]) : []), [chosen, series]);

  const chooseCountry = (c: string) => {
    setCountry(c);
    setCat(0);
    setSection(null);
    setPick(null);
    setOpen([ecstTree(c)[0]?.name ?? '']);
  };
  const csv = () => [
    ['Country', 'Indicator', 'Ticker', 'Current', 'Current Date', 'Previous', 'Previous Date', 'Source'],
    ...shown.map(({ c, def }) => {
      const { cur, prev } = currentAndPrevious(def, series[def.series]);
      return [nameOf(c), def.label, tickerOf(def.series), cur ? fmtNum(cur.v, def.dec) : '', cur?.period ?? '', prev ? fmtNum(prev.v, def.dec) : '', prev?.period ?? '', def.source];
    }),
  ];
  const exp = exportActions(panel, 'world-economic-statistics.csv', csv);
  useMenu('ecst', [
    { n: 1, label: 'Browse', run: () => setDialog('browse') },
    { n: 3, label: big ? 'Restore Chart' : 'Maximize Chart', run: () => setBig((b) => !b) },
    ...shown.map((r, i) => ({ n: 11 + i, label: r.def.label, run: () => setPick(r) })),
  ]);

  let n = 10;
  return (
    <div className="ecst-screen">
      <FnHeader
        code="ECONSTATS"
        title="World Economic Statistics"
        actions={[
          { n: 91, label: 'Search', onClick: () => setDialog('search'), title: 'Find an indicator in any country' },
          {
            n: 92,
            label: 'Settings',
            onClick: () => {},
            menu: [
              ...exp.map((a) => ({ label: a.label === 'Copy' ? 'Copy to Clipboard' : 'Download as CSV', title: a.title, onClick: a.onClick })),
              { label: 'Economic Matrix: Key Figures by Country (ECMX)', sep: true, onClick: () => execute(panel, 'ECMX') },
              ...(chosen?.def.series && !chosen.def.series.includes(':') ? [{ label: `Chart ${chosen.def.series} in ECONCHART`, onClick: () => execute(panel, `ECONCHART ${chosen.def.series}`) }] : []),
            ],
          },
        ]}
        tabs={[
          { n: 94, label: 'Standard Views' },
          { n: 95, label: 'Custom Views' },
        ]}
        tab={tab}
        onTab={setTab}
        plainTabs
      />
      <div className={`ecst${big ? ' ecst-big' : ''}`}>
        {tab === 94 ? (
          <aside className="ecst-tree" aria-label="Categories">
            <div className="ecst-ctry">
              <select className="sel-inp" aria-label="Country" value={country} onChange={(e) => chooseCountry(e.target.value)}>
                {ECST_COUNTRIES.map((c) => <option key={c} value={c}>{nameOf(c)}</option>)}
              </select>
              <button type="button" className="btn-grey" onClick={() => setDialog('browse')}><b>1)</b> Browse</button>
            </div>
            <ul>
              {tree.map((t, i) => {
                const isOpen = open.includes(t.name);
                return (
                  <li key={t.name}>
                    <div className={`ecst-node${i === cat ? ' on' : ''}`}>
                      <button type="button" className="ecst-pm" aria-label={isOpen ? `Collapse ${t.name}` : `Expand ${t.name}`} onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== t.name) : [...o, t.name]))}>{isOpen ? '⊟' : '⊞'}</button>
                      <button type="button" className="ecst-cat" onClick={() => { setCat(i); setSection(null); setPick(null); if (!isOpen) setOpen((o) => [...o, t.name]); }}>{t.name}</button>
                    </div>
                    {isOpen ? (
                      <ul>
                        {t.sections.map((s) => (
                          <li key={s.title}>
                            <button type="button" className={`ecst-sub${i === cat && section === s.title ? ' sel' : ''}`} onClick={() => { setCat(i); setSection(s.title); setPick(null); }}>{s.title}</button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : (
          <CustomBuilder />
        )}
        <section className="ecst-main">
          <div className="ecst-title" data-testid="ecst-title">{tab === 94 ? `${category?.name ?? ''} - ${nameOf(country)}` : 'Custom View'}</div>
          {!big ? (
            <table className="tbl ecst-tbl" data-testid="ecst-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Text</th>
                  <th rowSpan={2} className="ecst-icon" />
                  <th rowSpan={2}>Ticker</th>
                  <th colSpan={2} className="ecst-grp">Current</th>
                  <th colSpan={2} className="ecst-grp">Previous</th>
                </tr>
                <tr>
                  <th className="num">Value</th>
                  <th>Date</th>
                  <th className="num">Value</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {tab === 94
                  ? sections.map((s) => (
                      <SectionRows key={s.title} title={s.title}>
                        {s.rows.map((def) => {
                          n++;
                          return <StatRow key={`${def.series}${def.label}`} n={n} def={def} obs={series[def.series]} on={chosen?.def === def && chosen.c === country} onPick={() => setPick({ c: country, def })} />;
                        })}
                      </SectionRows>
                    ))
                  : shown.map((r) => {
                      n++;
                      return <StatRow key={`${r.c}${r.def.series}${r.def.label}`} n={n} def={r.def} obs={series[r.def.series]} on={chosen === r} onPick={() => setPick(r)} prefix={r.c} />;
                    })}
                {tab === 95 && !shown.length ? (
                  <tr>
                    <td colSpan={7} className="empty">No indicator in your view yet: add one with the builder at the left.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
          <div className="ecst-chart" data-testid="ecst-chart">
            {chosen && points.length > 1 ? (
              <>
                <div className="ecst-chart-h amber">{tab === 95 ? `${nameOf(chosen.c)}: ` : ''}{chosen.def.label} <span className="muted">{chosen.def.source}</span></div>
                <XYChart height={big ? 360 : 150} series={[{ label: chosen.def.label, color: '#45a6ff', points: points.map((p) => ({ x: p.t, y: p.v })) }]} xFormat={(v) => fmtDay(v)} yFormat={(v) => fmtNum(v, chosen.def.dec)} />
              </>
            ) : (
              <div className="muted pad-s">{real ? (chosen ? 'No history of this indicator yet: its source has not answered.' : 'Choose an indicator to chart it.') : 'The browser demo has no statistics: the desktop app reads them from each statistics office.'}</div>
            )}
          </div>
          <div className="ecst-bar">
            <button type="button" className="link-btn" onClick={() => setBig((b) => !b)}><b>3)</b> {big ? 'Restore Chart' : 'Maximize Chart'}</button>
            <span aria-hidden="true">{big ? '︾' : '︽'}</span>
          </div>
        </section>
      </div>
      {real && needsKey ? <div className="note amber">FRED needs your free API key (from fredaccount.stlouisfed.org) for the US figures it serves and for Japan's, Canada's and Australia's growth: add it in PROVIDERS. The rest come from the statistics offices themselves.</div> : null}
      <div className="note">Each figure is its publisher&apos;s, worked out as its label says (a change on the month, quarter or year from the published index where the label says so); the date is the period it covers, and the previous figure the period before. Ticker is the source&apos;s own series code. A figure marked in its date (provisional, estimated) carries the publisher&apos;s flag.</div>
      <Credits ids={['ons', 'eurostat', 'statcan', 'abs']} />
      {real ? <FredNotice /> : null}
      {dialog === 'browse' ? (
        <Dialog title="Browse Countries" onClose={() => setDialog(null)} testId="ecst-browse" buttons={[{ label: 'Close', onClick: () => setDialog(null), primary: true }]}>
          <div className="eco-custom-list">
            {ECST_COUNTRIES.map((c) => <button key={c} type="button" className="link-btn" onClick={() => { chooseCountry(c); setTab(94); setDialog(null); }}>{nameOf(c)}</button>)}
          </div>
        </Dialog>
      ) : null}
      {dialog === 'search' ? <Search onPick={(c, catIdx, def) => { chooseCountry(c); setCat(catIdx); setPick({ c, def }); setTab(94); setDialog(null); }} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function SectionRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="ecst-sec">
        <td colSpan={7}>{title}</td>
      </tr>
      {children}
    </>
  );
}

/** 91) Search: indicators by name in every country, as "ECST S" opens it. */
function Search({ onPick, onClose }: { onPick: (c: string, cat: number, def: StatDef) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? ECST_COUNTRIES.flatMap((c) =>
        ecstTree(c).flatMap((cat, ci) => cat.sections.flatMap((s) => s.rows.map((def) => ({ c, ci, def, text: `${nameOf(c)} ${def.label} ${s.title} ${cat.name}`.toLowerCase() })))),
      )
        .filter((h) => words.every((w) => h.text.includes(w)))
        .filter((h, i, all) => all.findIndex((x) => x.c === h.c && x.def === h.def) === i)
        .slice(0, 30)
    : [];
  return (
    <Dialog title="Search" onClose={onClose} testId="ecst-search" buttons={[{ label: 'Close', onClick: onClose, primary: true }]}>
      <input className="inp" aria-label="Search indicators" placeholder="e.g. germany hicp" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      <ul className="ecst-hits">
        {hits.map((h) => (
          <li key={`${h.c}${h.def.series}${h.def.label}`}>
            <button type="button" className="link-btn" onClick={() => onPick(h.c, h.ci, h.def)}>
              <span className="white">{nameOf(h.c)}</span> {h.def.label}
            </button>
          </li>
        ))}
        {words.length && !hits.length ? <li className="muted">No indicator matches.</li> : null}
      </ul>
    </Dialog>
  );
}

/** 95) Custom Views' builder: a country and one of its indicators, added to the view; each can be taken out. */
function CustomBuilder() {
  const views = ecstViews.use((s) => s.rows);
  const [c, setC] = useState('US');
  const rows = allRows(c);
  const [i, setI] = useState(0);
  const def = rows[Math.min(i, rows.length - 1)];
  const add = () => def && ecstViews.set((s) => ({ rows: [...s.rows.filter((r) => !(r.c === c && r.series === def.series && r.label === def.label)), { c, series: def.series, label: def.label }] }));
  return (
    <aside className="ecst-tree" aria-label="Custom view builder">
      <div className="ecst-ctry">
        <select className="sel-inp" aria-label="Builder country" value={c} onChange={(e) => { setC(e.target.value); setI(0); }}>
          {ECST_COUNTRIES.map((x) => <option key={x} value={x}>{nameOf(x)}</option>)}
        </select>
      </div>
      <div className="ecst-ctry">
        <select className="sel-inp" aria-label="Builder indicator" value={i} onChange={(e) => setI(Number(e.target.value))}>
          {rows.map((r, k) => <option key={`${r.series}${r.label}`} value={k}>{r.label}</option>)}
        </select>
        <button type="button" className="btn-grey" onClick={add}>Add</button>
      </div>
      <ul>
        {views.map((v) => (
          <li key={`${v.c}${v.series}${v.label}`} className="ecst-view">
            <span className="white">{v.c}</span> {v.label}{' '}
            <button type="button" className="link-btn" aria-label={`Remove ${v.label}`} onClick={() => ecstViews.set((s) => ({ rows: s.rows.filter((r) => r !== v) }))}>✕</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
