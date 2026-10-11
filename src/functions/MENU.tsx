import { useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Chg, LivePx, SecLink, Section } from '../components/cells';
import { engine, useTick } from '../data/market';
import { marketCapUsd } from '../data/analytics';
import { CLASS_LABEL } from '../data/registry';
import type { AssetClass, SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import { lookupFn } from '../terminal/registry';
import type { FnProps, MenuItem } from '../terminal/types';

/** One menu line: a function code, optionally with its own label and command. */
type Entry = string | { code: string; label?: string; cmd?: string };

interface Group {
  title: string;
  entries: Entry[];
}

const EQUITY: Group[] = [
  { title: 'Company', entries: ['DES', 'CN', 'FA', 'EE', 'ANR', 'DVD', 'HDS', 'RV', 'WACC', 'EVTS'] },
  { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'COMP', 'TRA', 'GF', 'HVT', 'BETA', 'HS'] },
  { title: 'Trading', entries: ['BQ', 'TAS', 'DEPTH', 'VWAP', 'EMSX', 'OMON', 'OVME'] },
  { title: 'Credit', entries: ['SRCH', 'DDIS'] },
  { title: 'Tools', entries: ['ALRT', 'NOTE', 'CORR'] },
];

const MENUS: Record<AssetClass, Group[]> = {
  equity: EQUITY,
  index: [
    { title: 'Index', entries: ['DES', 'MOV', 'IMAP', 'WEI', 'WEIF', 'CN'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'COMP', 'TRA', 'HVT', 'HS'] },
    { title: 'Derivatives', entries: ['OMON', 'OVME'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE', 'CORR'] },
  ],
  future: [
    { title: 'Contract', entries: ['DES', 'WEIF', 'CN'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'HVT', 'HS'] },
    { title: 'Trading', entries: ['BQ', 'TAS', 'DEPTH', 'VWAP', 'EMSX'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE'] },
  ],
  fx: [
    { title: 'Currency', entries: ['DES', 'FXC', 'WCRS', 'FRD', 'OVML', 'CN'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'COMP', 'HVT', 'HS', 'BETA'] },
    { title: 'Trading', entries: ['BQ', 'DEPTH'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE', 'CORR'] },
  ],
  commodity: [
    { title: 'Commodity', entries: ['DES', 'GLCO', 'CN'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'COMP', 'HVT', 'HS', 'BETA'] },
    { title: 'Trading', entries: ['BQ', 'TAS', 'DEPTH', 'VWAP', 'EMSX'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE', 'CORR'] },
  ],
  crypto: [
    { title: 'Digital asset', entries: ['DES', 'CRYP', 'CN'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'COMP', 'HVT', 'HS', 'BETA'] },
    { title: 'Trading', entries: ['BQ', 'TAS', 'DEPTH', 'VWAP', 'EMSX'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE', 'CORR'] },
  ],
  rate: [
    { title: 'Rate', entries: ['DES', 'GC', 'WB', 'BTMM', 'WIRP', 'SWPM', 'CENB'] },
    { title: 'Price and charts', entries: ['GP', 'GIP', 'HP', 'HS'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE'] },
  ],
  bond: [
    { title: 'Bond', entries: ['DES', 'YAS', 'ALLQ', 'DDIS', 'SRCH'] },
    { title: 'Price and charts', entries: ['GP', 'HP', 'GIP'] },
    { title: 'Market', entries: ['BTMM', 'GC', 'WB'] },
    { title: 'Tools', entries: ['ALRT', 'NOTE'] },
  ],
};

/** Market sector menus for a yellow key on its own. */
const SECTORS: Record<string, { title: string; groups: Group[]; list?: (d: SecurityDef) => boolean; rank?: (d: SecurityDef) => number; note?: string }> = {
  GOVT: {
    title: 'Government Securities',
    groups: [
      { title: 'Monitors', entries: ['BTMM', 'WB', 'GC', 'WIRP', 'CENB'] },
      { title: 'Analysis', entries: [{ code: 'SRCH', label: 'Treasury search', cmd: 'T GOVT' }, 'SWPM', 'CDR'] },
    ],
    list: (d) => d.yk === 'Govt',
  },
  CORP: {
    title: 'Corporate Bonds',
    groups: [{ title: 'Search and analysis', entries: [{ code: 'SRCH', cmd: 'SRCH' }, { code: 'DDIS', cmd: 'AAPL CORP DDIS', label: 'Debt distribution (Apple)' }, 'BTMM'] }],
    list: (d) => d.yk === 'Corp',
    rank: (d) => d.bond?.amount ?? 0,
  },
  EQUITY: {
    title: 'Equity',
    groups: [
      { title: 'Markets', entries: ['WEI', 'IMAP', 'MOST', 'MOV', 'EQS', 'EVTS'] },
      { title: 'News and research', entries: ['TOP', 'N', 'READ', 'ECO'] },
      { title: 'Trading and portfolio', entries: ['EMSX', 'PORT', 'W', 'ALRT'] },
    ],
    list: (d) => d.cls === 'equity',
    rank: (d) => marketCapUsd(d.id),
  },
  CMDTY: {
    title: 'Commodities',
    groups: [{ title: 'Markets', entries: ['GLCO', 'WEIF', 'ECO'] }],
    list: (d) => d.cls === 'commodity',
  },
  INDEX: {
    title: 'Indices',
    groups: [{ title: 'Markets', entries: ['WEI', 'WEIF', 'IMAP', 'MOV', 'GC', 'ECST'] }],
    list: (d) => (d.cls === 'index' && d.ticker !== 'VIX') || d.cls === 'future',
  },
  CURNCY: {
    title: 'Currencies',
    groups: [{ title: 'Markets', entries: ['FXC', 'WCRS', 'FRD', 'OVML', 'CRYP', 'CENB'] }],
    list: (d) => d.cls === 'fx' || d.id === 'DXY Curncy',
  },
  MTGE: { title: 'Mortgages', groups: [{ title: 'Related', entries: ['GC', 'BTMM', 'SWPM'] }], note: 'Mortgage-backed securities are not covered by Armin Terminal. The screens below cover the rates that drive them.' },
  'M-MKT': { title: 'Money Markets', groups: [{ title: 'Related', entries: ['BTMM', 'WIRP', 'CENB', 'FRD'] }], note: 'Individual money market instruments are not covered. BTMM shows bills, SOFR and fed funds.' },
  MUNI: { title: 'Municipals', groups: [{ title: 'Related', entries: ['GC', 'BTMM', 'SRCH'] }], note: 'Municipal bonds are not covered by Armin Terminal.' },
  PFD: { title: 'Preferreds', groups: [{ title: 'Related', entries: ['SRCH', 'DVD', 'EQS'] }], note: 'Preferred shares are not covered by Armin Terminal.' },
};

const MAIN: { key: string; label: string }[] = [
  { key: 'GOVT', label: 'Government securities (F2)' },
  { key: 'CORP', label: 'Corporate bonds (F3)' },
  { key: 'MTGE', label: 'Mortgages (F4)' },
  { key: 'M-MKT', label: 'Money markets (F5)' },
  { key: 'MUNI', label: 'Municipals (F6)' },
  { key: 'PFD', label: 'Preferreds (F7)' },
  { key: 'EQUITY', label: 'Equities (F8)' },
  { key: 'CMDTY', label: 'Commodities (F9)' },
  { key: 'INDEX', label: 'Indices and futures (F10)' },
  { key: 'CRNCY', label: 'Currencies (F11)' },
  { key: 'CLIENT', label: 'Portfolio (F12)' },
];

interface Line {
  n: number;
  code: string;
  label: string;
  cmd: string;
}

function linesFor(groups: Group[], sec: SecurityDef | undefined, start = 1): { title: string; lines: Line[] }[] {
  let n = start;
  const issuerRoot = sec?.cls === 'equity' ? sec.ticker.split(' ')[0] : undefined;
  const hasBonds = !!sec && engine.securities.some((d) => d.bond?.issuer === sec.id);
  const out: { title: string; lines: Line[] }[] = [];
  for (const g of groups) {
    const lines: Line[] = [];
    for (const e of g.entries) {
      const entry = typeof e === 'string' ? { code: e } : e;
      const fn = lookupFn(entry.code);
      if (!fn) continue;
      if (sec && fn.classes && !fn.classes.includes(sec.cls)) continue;
      let cmd = entry.cmd ?? (sec && (fn.needsSec || fn.classes || ['CN', 'ALRT', 'NOTE', 'HS', 'CORR', 'COMP', 'EVTS', 'TRA'].includes(fn.code)) ? `${sec.id} ${fn.code}` : fn.code);
      let label = entry.label ?? fn.name;
      if (sec && (fn.code === 'SRCH' || fn.code === 'DDIS') && sec.cls !== 'bond') {
        if (!issuerRoot || !hasBonds) continue;
        cmd = `${issuerRoot} CORP ${fn.code}`;
        label = fn.code === 'SRCH' ? `${issuerRoot} bonds outstanding` : 'Debt distribution';
      }
      if (sec?.cls === 'bond' && (fn.code === 'SRCH' || fn.code === 'DDIS')) {
        const root = sec.yk === 'Govt' ? 'T' : sec.ticker.split(' ')[0];
        cmd = `${root} ${sec.yk.toUpperCase()} ${fn.code}`;
      }
      lines.push({ n: n++, code: fn.code, label, cmd });
    }
    if (lines.length) out.push({ title: g.title, lines });
  }
  return out;
}

function MenuGrid({ groups }: { groups: { title: string; lines: Line[] }[] }) {
  const panel = usePanelId();
  return (
    <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))' }}>
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <table className="tbl menu-tbl">
            <tbody>
              {g.lines.map((l) => (
                <tr key={l.n} className="click" onClick={() => execute(panel, l.cmd)}>
                  <td className="num yellow b" style={{ width: 34 }}>
                    {l.n})
                  </td>
                  <td className="amber b" style={{ width: 58 }}>
                    {l.code}
                  </td>
                  <td className="white">{l.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
    </div>
  );
}

function useMenuItems(owner: string, groups: { lines: Line[] }[], extra: MenuItem[] = []) {
  const panel = usePanelId();
  const items = useMemo(
    () => [...groups.flatMap((g) => g.lines.map((l) => ({ n: l.n, label: l.label, run: () => execute(panel, l.cmd) }))), ...extra],
    [groups, extra, panel],
  );
  useMenu(owner, items);
}

function SecurityMenu({ sec }: { sec: SecurityDef }) {
  const groups = useMemo(() => linesFor(MENUS[sec.cls], sec), [sec]);
  useMenuItems('menu', groups);
  return (
    <div>
      <FnHeader code="MENU" title="Related Functions Menu" sec={sec} sub={`${sec.name} · ${CLASS_LABEL[sec.cls]}`} />
      <QuoteStrip sec={sec} />
      <p className="pad-s muted">Type a number and press GO, or type a function mnemonic. The security stays loaded for every function.</p>
      <MenuGrid groups={groups} />
    </div>
  );
}

function SectorMenu({ yk }: { yk: string }) {
  useTick(3);
  const panel = usePanelId();
  const sector = SECTORS[yk];
  const groups = useMemo(() => linesFor(sector.groups, undefined), [sector]);
  const list = useMemo(() => {
    if (!sector.list) return [];
    const all = engine.securities.filter(sector.list);
    if (sector.rank) all.sort((a, b) => sector.rank!(b) - sector.rank!(a));
    return all.slice(0, 25);
  }, [sector]);
  const start = groups.reduce((s, g) => s + g.lines.length, 0) + 1;
  const extra = useMemo(() => list.map((d, i) => ({ n: start + i, label: d.ticker, run: () => execute(panel, d.id) })), [list, start, panel]);
  useMenuItems(`sector:${yk}`, groups, extra);
  return (
    <div>
      <FnHeader code={yk === 'CURNCY' ? 'CRNCY' : yk} title={sector.title} sub="Market sector menu" />
      {sector.note && <p className="pad-s amber">{sector.note}</p>}
      <MenuGrid groups={groups} />
      {list.length > 0 && (
        <Section title="Securities" right={`${list.length} shown · SECF to search all`}>
          <table className="tbl">
            <tbody>
              {list.map((d, i) => (
                <tr key={d.id}>
                  <td className="num yellow b" style={{ width: 34 }}>
                    {start + i})
                  </td>
                  <td>
                    <SecLink id={d.id} fn="MENU">
                      {d.ticker}
                    </SecLink>
                  </td>
                  <td className="ellipsis hide-m" style={{ maxWidth: 260 }}>
                    {d.name}
                  </td>
                  <td className="num">
                    <LivePx id={d.id} />
                  </td>
                  <td className="num">
                    <Chg v={d.quote === 'yield' ? engine.quote(d.id)!.chg : engine.quote(d.id)!.pct} pct={d.quote !== 'yield'} bp={d.quote === 'yield'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function MainMenu() {
  const panel = usePanelId();
  const items = useMemo(() => MAIN.map((m, i) => ({ n: i + 1, label: m.label, run: () => execute(panel, m.key) })), [panel]);
  useMenu('main-menu', items);
  return (
    <div>
      <FnHeader code="MENU" title="Main Menu" sub="Market sectors" />
      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <Section title="Market sectors">
          <table className="tbl menu-tbl">
            <tbody>
              {MAIN.map((m, i) => (
                <tr key={m.key} className="click" onClick={() => execute(panel, m.key)}>
                  <td className="num yellow b" style={{ width: 34 }}>
                    {i + 1})
                  </td>
                  <td>
                    <span className="ykey">{m.key}</span>
                  </td>
                  <td className="white">{m.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Getting started">
          <p className="prose">
            Load a security with its ticker and yellow key, for example <span className="yellow">IBM US &lt;EQUITY&gt; &lt;GO&gt;</span>, to see every function that applies to it. Type{' '}
            <span className="yellow">HELP</span> for the full function directory or <span className="yellow">HELP HELP</span> to message the help desk.
          </p>
        </Section>
      </div>
    </div>
  );
}

export function MENU({ route, sec }: FnProps) {
  if (sec) return <SecurityMenu sec={sec} />;
  const yk = route.args?.toUpperCase();
  if (yk && SECTORS[yk]) return <SectorMenu yk={yk} />;
  return <MainMenu />;
}
