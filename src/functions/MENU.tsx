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
import { primaryMnemonic } from '../terminal/legacy';
import { settings } from '../terminal/settings';
import { navigate } from '../terminal/state';
import type { FnProps, MenuItem } from '../terminal/types';

/** One menu line: a function code, optionally with its own label and command. */
type Entry = string | { code: string; label?: string; cmd?: string };

interface Group {
  title: string;
  entries: Entry[];
}

const EQUITY: Group[] = [
  // The terminal's own grouping when a stock is loaded: overview, analysis, research, comparison, charts,
  // surveillance, trading data and derivatives.
  { title: 'Company Overview', entries: ['PROFILE', 'COMPANYNEWS', 'MANAGEMENT'] },
  { title: 'Company Analysis', entries: ['FINANCIALS', 'HOLDERS', 'DIVIDENDS', 'CORPACTIONS', 'BUYBACKS', 'WACC'] },
  { title: 'Research & Estimates', entries: ['ESTIMATES', 'EARNINGS', 'ANALYSTS', 'FILINGS', 'DOCSEARCH'] },
  { title: 'Comparative Analytics', entries: ['PEERS', 'SUPPLYCHAIN'] },
  { title: 'Charting & Reporting', entries: ['CHART', 'FUNDCHART', 'INTRADAY', 'HISTORY', 'RETURNS', 'TOTALRETURN', 'SPREAD', 'BETA', 'VOLATILITY'] },
  { title: 'Security Surveillance', entries: ['EVENTS', 'QUOTE', 'ALERTS'] },
  { title: 'Trade Analytics', entries: ['TRADES', 'DEPTH', 'VWAP'] },
  { title: 'Derivatives', entries: ['OPTIONS', 'OPTIONCALC', 'OPTIONSTRATEGY'] },
  { title: 'Credit', entries: ['BONDSEARCH', 'DEBTPROFILE'] },
  { title: 'Tools', entries: ['NOTES', 'CORRELATION', 'CROSSCHECK'] },
];

const MENUS: Record<AssetClass, Group[]> = {
  equity: EQUITY,
  index: [
    { title: 'Index', entries: ['PROFILE', 'CONTRIB', 'MEMBERS', 'MOVERS', 'RANKEDRETURNS', 'GROUPRETURNS', 'HEATMAP', 'MARKET', 'INDEXFUTURES', 'COMPANYNEWS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'RETURNS', 'TOTALRETURN', 'VOLATILITY', 'SPREAD'] },
    { title: 'Derivatives', entries: ['OPTIONS', 'OPTIONCALC', 'OPTIONSTRATEGY'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES', 'CORRELATION'] },
  ],
  future: [
    { title: 'Contract', entries: ['PROFILE', 'INDEXFUTURES', 'COMPANYNEWS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'VOLATILITY', 'SPREAD'] },
    { title: 'Quotes and trading data', entries: ['QUOTE', 'TRADES', 'DEPTH', 'VWAP'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES'] },
  ],
  fx: [
    { title: 'Currency', entries: ['PROFILE', 'FXMATRIX', 'FXRANK', 'FXFORWARD', 'FXOPTION', 'COMPANYNEWS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'RETURNS', 'VOLATILITY', 'SPREAD', 'BETA'] },
    { title: 'Trading', entries: ['QUOTE', 'DEPTH'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES', 'CORRELATION'] },
  ],
  commodity: [
    { title: 'Commodity', entries: ['PROFILE', 'COMMODITIES', 'COMPANYNEWS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'RETURNS', 'VOLATILITY', 'SPREAD', 'BETA'] },
    { title: 'Quotes and trading data', entries: ['QUOTE', 'TRADES', 'DEPTH', 'VWAP'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES', 'CORRELATION'] },
  ],
  crypto: [
    { title: 'Digital asset', entries: ['PROFILE', 'CRYPTO', 'COMPANYNEWS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'RETURNS', 'VOLATILITY', 'SPREAD', 'BETA'] },
    { title: 'Quotes and trading data', entries: ['QUOTE', 'TRADES', 'DEPTH', 'VWAP'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES', 'CORRELATION'] },
  ],
  rate: [
    { title: 'Rate', entries: ['PROFILE', 'CURVE', 'BONDS', 'MONEYMARKET', 'RATEPROBS', 'SWAPCALC', 'CENTRALBANKS'] },
    { title: 'Price and charts', entries: ['CHART', 'INTRADAY', 'HISTORY', 'SPREAD'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES'] },
  ],
  bond: [
    { title: 'Bond', entries: ['PROFILE', 'BONDCALC', 'DEALERQUOTES', 'DEBTPROFILE', 'BONDSEARCH'] },
    { title: 'Price and charts', entries: ['CHART', 'HISTORY', 'INTRADAY'] },
    { title: 'Market', entries: ['MONEYMARKET', 'CURVE', 'BONDS'] },
    { title: 'Tools', entries: ['ALERTS', 'NOTES'] },
  ],
};

/** Market sector menus for a sector word on its own (EQUITY, GOVT, CRNCY). */
const SECTORS: Record<string, { title: string; groups: Group[]; list?: (d: SecurityDef) => boolean; rank?: (d: SecurityDef) => number; note?: string }> = {
  GOVT: {
    title: 'Government Securities',
    groups: [
      { title: 'Monitors', entries: ['MONEYMARKET', 'BONDS', 'BONDFUTURES', 'CURVE', 'RATEPROBS', 'FEDMEETINGS', 'CENTRALBANKS', 'MACRO'] },
      { title: 'Analysis', entries: [{ code: 'BONDSEARCH', label: 'Treasury search', cmd: 'T GOVT' }, 'SWAPCALC', 'HOLIDAYS'] },
    ],
    list: (d) => d.yk === 'Govt',
  },
  CORP: {
    title: 'Corporate Bonds',
    groups: [{ title: 'Search and analysis', entries: [{ code: 'BONDSEARCH', cmd: 'BONDSEARCH' }, { code: 'DEBTPROFILE', cmd: 'AAPL CORP DEBTPROFILE', label: 'Debt distribution (Apple)' }, 'MONEYMARKET'] }],
    list: (d) => d.yk === 'Corp',
    rank: (d) => d.bond?.amount ?? 0,
  },
  EQUITY: {
    title: 'Equity',
    groups: [
      { title: 'Markets', entries: ['MARKET', 'HEATMAP', 'MOVERS', 'TOPMOVERS', 'CONTRIB', 'SCREEN', 'EVENTS', 'IPOS', 'EXCHANGES'] },
      { title: 'News and research', entries: ['MARKETNEWS', 'BREAKING', 'HEADLINES', 'NEWS', 'FILINGS', 'RELEASES', 'MACRO'] },
      { title: 'Portfolio and monitors', entries: ['PORTFOLIO', 'WATCHLIST', 'FAVOURITES', 'ALERTS'] },
    ],
    list: (d) => d.cls === 'equity',
    rank: (d) => marketCapUsd(d.id),
  },
  CMDTY: {
    title: 'Commodities',
    groups: [{ title: 'Markets', entries: ['COMMODITIES', 'INDEXFUTURES', 'RELEASES'] }],
    list: (d) => d.cls === 'commodity',
  },
  INDEX: {
    title: 'Indices',
    groups: [{ title: 'Markets', entries: ['MARKET', 'INDEXFUTURES', 'BONDFUTURES', 'HEATMAP', 'CONTRIB', 'EXCHANGES', 'CURVE', 'ECONSTATS', 'MACRO'] }],
    list: (d) => (d.cls === 'index' && d.ticker !== 'VIX') || d.cls === 'future',
  },
  CURNCY: {
    title: 'Currencies',
    groups: [{ title: 'Markets', entries: ['FXMATRIX', 'FXRANK', 'FXFORWARD', 'FXOPTION', 'CRYPTO', 'CENTRALBANKS'] }],
    list: (d) => d.cls === 'fx' || d.id === 'DXY Curncy',
  },
  MTGE: { title: 'Mortgages', groups: [{ title: 'Related', entries: ['CURVE', 'MONEYMARKET', 'SWAPCALC'] }], note: 'Mortgage-backed securities are not covered by Armin Terminal. The screens below cover the rates that drive them.' },
  'M-MKT': { title: 'Money Markets', groups: [{ title: 'Related', entries: ['MONEYMARKET', 'RATEPROBS', 'FEDMEETINGS', 'CENTRALBANKS', 'FXFORWARD'] }], note: 'Individual money market instruments are not covered. MONEYMARKET shows bills, SOFR and fed funds.' },
  MUNI: { title: 'Municipals', groups: [{ title: 'Related', entries: ['CURVE', 'MONEYMARKET', 'BONDSEARCH'] }], note: 'Municipal bonds are not covered by Armin Terminal.' },
  PFD: { title: 'Preferreds', groups: [{ title: 'Related', entries: ['BONDSEARCH', 'DIVIDENDS', 'SCREEN'] }], note: 'Preferred shares are not covered by Armin Terminal.' },
  NEWS: {
    title: 'News & Research',
    groups: [
      { title: 'News', entries: ['MARKETNEWS', 'BREAKING', 'NEWS', 'HEADLINES'] },
      { title: 'Company research', entries: ['SEARCH', 'SCREEN', 'FILINGS', 'EVENTS'] },
      { title: 'Economics', entries: ['RELEASES', 'ECONSTATS', 'MACRO', 'CENTRALBANKS', 'FEDMEETINGS'] },
    ],
  },
  TOOLS: {
    title: 'Portfolio & Tools',
    groups: [
      { title: 'Portfolio and monitors', entries: ['WATCHLIST', 'FAVOURITES', 'PORTFOLIO', 'ALERTS', 'CORRELATION'] },
      { title: 'Workspace', entries: ['SEARCH', 'RECENT', 'LAYOUTS', 'NOTES'] },
      { title: 'Help and preferences', entries: ['HELP', 'PROVIDERS', 'SETTINGS', 'MESSAGES'] },
    ],
  },
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

const WORKFLOWS = [
  { n: 12, label: 'News & Research', cmd: 'MENU NEWS' },
  { n: 13, label: 'Portfolio & Tools', cmd: 'MENU TOOLS' },
  { n: 14, label: 'Function directory', cmd: 'HELP' },
];

function MenuPath({ sector, sec }: { sector?: string; sec?: SecurityDef }) {
  const panel = usePanelId();
  const rawSector = sector ?? (sec ? sec.yk.toUpperCase() : undefined);
  const sectorKey = rawSector === 'COMDTY' ? 'CMDTY' : rawSector;
  const sectorMenu = sectorKey ? SECTORS[sectorKey] : undefined;
  return (
    <nav className="pad-s row menu-path" aria-label="Menu path" style={{ borderBottom: '1px solid var(--line)' }}>
      <button type="button" className="btn" onClick={() => navigate(panel, { fn: 'MENU' })}>Main Menu</button>
      {sectorMenu && (
        <>
          <span className="muted" aria-hidden="true">›</span>
          {sec ? (
            <button type="button" className="btn" onClick={() => navigate(panel, { fn: 'MENU', args: sectorKey })}>{sectorMenu.title}</button>
          ) : <span className="white" aria-current="page">{sectorMenu.title}</span>}
        </>
      )}
      {sec && <><span className="muted" aria-hidden="true">›</span><span className="white" aria-current="page">Analyze {sec.name.toUpperCase()} {sec.yk}</span></>}
    </nav>
  );
}

interface Line {
  n: number;
  code: string;
  label: string;
  cmd: string;
  /** Why the desktop app shows no data there, when it shows none. */
  none?: string;
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
      let cmd = entry.cmd ?? (sec && (fn.needsSec || fn.classes || ['COMPANYNEWS', 'ALERTS', 'NOTES', 'SPREAD', 'CORRELATION', 'RETURNS', 'EVENTS', 'TOTALRETURN'].includes(fn.code)) ? `${sec.id} ${fn.code}` : fn.code);
      let label = entry.label ?? fn.name;
      if (sec && (fn.code === 'BONDSEARCH' || fn.code === 'DEBTPROFILE') && sec.cls !== 'bond') {
        if (!issuerRoot || !hasBonds) continue;
        cmd = `${issuerRoot} CORP ${fn.code}`;
        label = fn.code === 'BONDSEARCH' ? `${issuerRoot} bonds outstanding` : 'Debt distribution';
      }
      if (sec?.cls === 'bond' && (fn.code === 'BONDSEARCH' || fn.code === 'DEBTPROFILE')) {
        const root = sec.yk === 'Govt' ? 'T' : sec.ticker.split(' ')[0];
        cmd = `${root} ${sec.yk.toUpperCase()} ${fn.code}`;
      }
      lines.push({ n: n++, code: fn.code, label, cmd, ...(engine.realOnly && fn.unavailable ? { none: fn.unavailable } : {}) });
    }
    if (lines.length) out.push({ title: g.title, lines });
  }
  return out;
}

function MenuGrid({ groups }: { groups: { title: string; lines: Line[] }[] }) {
  const panel = usePanelId();
  const mnemonics = settings.use((s) => s.mnemonics);
  return (
    <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))' }}>
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <table className="tbl menu-tbl">
            <tbody>
              {g.lines.map((l) => (
                <tr key={l.n} className="click" title={`${l.cmd} <GO>`} onClick={() => execute(panel, l.cmd)}>
                  <td className="num white" style={{ width: 34 }}>
                    {l.n})
                  </td>
                  <td className="white" style={{ width: 58 }} title={l.code}>
                    {mnemonics ? primaryMnemonic(l.code) : l.code}
                  </td>
                  <td className={l.none ? 'muted' : 'amber'} title={l.none ? `Not available: ${l.none}` : undefined}>
                    {l.label}
                    {l.none ? ' (not available)' : ''}
                  </td>
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
  const groups = useMemo(() => linesFor([...MENUS[sec.cls], { title: 'Data definitions', entries: ['FIELDS'] }], sec), [sec]);
  useMenuItems('menu', groups);
  return (
    <div>
      <FnHeader code="MENU" title="Related Functions Menu" sec={sec} sub={CLASS_LABEL[sec.cls]} />
      <MenuPath sec={sec} />
      <QuoteStrip sec={sec} />
      <p className="pad-s muted">Enter a number and press GO, or type a function mnemonic such as {primaryMnemonic('PROFILE')}. Analysis functions use the loaded security.</p>
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
      <FnHeader code={['NEWS', 'TOOLS'].includes(yk) ? 'MENU' : yk === 'CURNCY' ? 'CRNCY' : yk} title={sector.title} sub={['NEWS', 'TOOLS'].includes(yk) ? 'Functions menu' : 'Market sector menu'} />
      <MenuPath sector={yk} />
      {sector.note && <p className="pad-s amber">{sector.note}</p>}
      <MenuGrid groups={groups} />
      {list.length > 0 && (
        <Section title="Securities" right={`${list.length} shown · SEARCH to search all`}>
          <table className="tbl">
            <tbody>
              {list.map((d, i) => (
                <tr key={d.id}>
                  <td className="num white" style={{ width: 34 }}>
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
  const items = useMemo(() => [
    ...MAIN.map((m, i) => ({ n: i + 1, label: m.label, run: () => execute(panel, m.key) })),
    ...WORKFLOWS.map((m) => ({ n: m.n, label: m.label, run: () => execute(panel, m.cmd) })),
  ], [panel]);
  useMenu('main-menu', items);
  return (
    <div>
      <FnHeader code="MENU" title="Main Menu" sub="Markets, news and analysis" />
      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <Section title="Market sectors">
          <table className="tbl menu-tbl">
            <tbody>
              {MAIN.map((m, i) => (
                <tr key={m.key} className="click" onClick={() => execute(panel, m.key)}>
                  <td className="num white" style={{ width: 34 }}>
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
        <Section title="News, research and tools">
          <table className="tbl menu-tbl">
            <tbody>
              {WORKFLOWS.map((m) => (
                <tr key={m.n} className="click" onClick={() => execute(panel, m.cmd)} title={`${m.cmd} <GO>`}>
                  <td className="num white" style={{ width: 34 }}>{m.n})</td>
                  <td className="white">{m.label} <span className="muted">›</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Getting started">
          <p className="prose">
            Type a ticker, for example <span className="yellow">IBM</span>, to explore its analysis functions, or a function and a ticker, such as{' '}
            <span className="yellow">IBM US EQUITY GP</span>. Type{' '}
            <span className="yellow">HELP</span> for the full function directory or <span className="yellow">HELP HELP</span> to open the local help assistant.
          </p>
        </Section>
      </div>
    </div>
  );
}

export function MENU({ route, sec }: FnProps) {
  if (sec) return <SecurityMenu sec={sec} />;
  const rawSector = route.args?.toUpperCase();
  const yk = rawSector === 'COMDTY' ? 'CMDTY' : rawSector;
  if (yk && SECTORS[yk]) return <SectorMenu yk={yk} />;
  return <MainMenu />;
}
