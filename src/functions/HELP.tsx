import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CLASS_LABEL, searchSecurities } from '../data/registry';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import { exampleCommand, FUNCTIONS, lookupFn } from '../terminal/registry';
import type { FnCategory, FnDef, FnProps } from '../terminal/types';
import { primaryMnemonic } from '../terminal/legacy';
import { settings } from '../terminal/settings';

const ORDER: FnCategory[] = [
  'Equity', 'Charts', 'News', 'Markets', 'FX & Crypto', 'Rates & Credit', 'Commodities', 'Economics', 'Derivatives',
  'Portfolio & Tools', 'Communication', 'System',
];

const SHORTCUTS: [string, string][] = [
  ['Type anywhere', 'Goes to the active panel command line'],
  ['Enter / GO', 'Run the command'],
  ['Esc / CANCEL', 'Clear the command line'],
  ['Backspace (empty line)', 'Previous screen (BACK)'],
  ['Alt+End / MENU', 'Related functions; press again to move up the menu hierarchy'],
  ['Alt+1 … Alt+6', 'Switch panel'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous panel'],
  ['Alt+← / Alt+→', 'Back / forward'],
  ['F1 / HELP', 'Help for the current function; press twice for the local help assistant'],
  ['DES F1', 'Help on the mnemonic typed first; words typed first search the help'],
  ['F2 F3 F4 F5 F6 F7', 'GOVT CORP MTGE M-MKT MUNI PFD market sector keys'],
  ['F8 F9 F10 F11 F12', 'EQUITY CMDTY INDEX CRNCY PORT market sector keys'],
  ['PgUp / PgDn', 'PAGE BACK / PAGE FWD: the previous or next page; the function bar shows Page 2/5'],
  ['13 PgDn', 'A number typed first moves that many pages'],
  ['EQUITY', 'Market sector menu'],
  ['IBM CORP', "An issuer's bonds"],
  ['↑ ↓ Tab', 'Move through and complete suggestions'],
  ['↑ ↓ (suggestions closed)', 'Recall commands within this panel; Ctrl+↑ / Ctrl+↓ also works with suggestions open'],
  ['3', 'Pick numbered item 3) on the screen: a tab, an action, a monitor row or a headline'],
  ['GP?', 'Help on a function'],
  ['Colored panel selector', 'Match colors to share a security across compatible visible panels; monitors keep their lists'],
];

const EXAMPLES: [string, string][] = [
  ['AAPL US EQUITY BQ', 'Quote for Apple'],
  ['NVDA US EQUITY GP', 'Price chart for Nvidia'],
  ['NVDA US EQUITY GIP', "Today's intraday chart"],
  ['GPC AAPL', 'Candlestick chart; GPO draws open-high-low-close bars'],
  ['HP AAPL 1Y W', 'A year of weekly prices'],
  ['MSFT US EQUITY DES', 'Company description'],
  ['FLDS AAPL', 'Search available data fields, sources and timestamps'],
  ['FILINGS MSFT', 'SEC filings and reported figures'],
  ['W TECH', 'Open the watchlist named Tech'],
  ['WEI US', 'World equity indices, Americas'],
  ['EXCH', 'Exchange hours: which markets are open and when they next open or close'],
  ['CRYP BTC', 'Bitcoin on the crypto monitor'],
  ['AAPL', 'Related functions menu for Apple'],
  ['$APLD', 'Cashtags work too'],
  ['SOFI', 'Any US stock: looked up online if not built in'],
  ['CHART AAPL', 'Descriptive names and function-first commands also work'],
  ['GC', 'Yield curves'],
  ['TOP', 'Top market news (MARKETNEWS); HEADLINES has the official announcements'],
  ['FIRST', 'Breaking news: the last hour from every source (BREAKING); FIRST FAV for your favourites'],
  ['FAV', 'Your favourites with prices and news; ☆ beside a name stars it'],
  ['N CB', 'Central bank announcements'],
];

function Directory({ filter, sec, start = 1 }: { filter: string; sec?: SecurityDef; start?: number }) {
  const panel = usePanelId();
  const mnemonics = settings.use((s) => s.mnemonics);
  const groups = useMemo(() => {
    const terms = filter.trim().toUpperCase().split(/\s+/).filter(Boolean);
    let n = start;
    return ORDER.map((cat) => ({
      cat,
      fns: FUNCTIONS.filter((fn) => fn.category === cat && terms.every((term) =>
        [fn.code, fn.name, fn.desc, fn.category, ...(fn.aliases ?? [])].join(' ').toUpperCase().includes(term),
      )).map((fn) => ({ fn, n: n++ })),
    })).filter((g) => g.fns.length);
  }, [filter, start]);
  const command = (fn: FnDef) => {
    const accepts = sec && (!fn.classes || fn.classes.includes(sec.cls));
    if (fn.needsSec && !accepts) return `HELP ${fn.code}`;
    return accepts && (fn.needsSec || fn.classes) ? exampleCommand(fn, sec, mnemonics) : fn.code;
  };
  useMenu('help-directory', groups.flatMap((g) => g.fns.map(({ fn, n }) => ({ n, label: fn.name, run: () => execute(panel, command(fn)) }))));
  if (!groups.length) return <div className="empty">No functions match “{filter}”. Search a mnemonic, function name or topic.</div>;
  return (
    <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
      {groups.map((g) => (
        <section key={g.cat} className="sect">
          <div className="sect-h">
            {g.cat}
            <span className="right">{g.fns.length}</span>
          </div>
          <table className="tbl">
            <tbody>
              {g.fns.map(({ fn, n }) => (
                <tr key={fn.code} className="click" title={`${command(fn)} <GO>`} onClick={() => execute(panel, command(fn))}>
                  <td className="num yellow b" style={{ width: 34 }}>{n})</td>
                  <td style={{ width: 64 }} title={fn.code}>
                    <span className="amber b">{mnemonics ? primaryMnemonic(fn.code) : fn.code}</span>
                  </td>
                  <td className={engine.realOnly && fn.unavailable ? 'muted' : 'white'} title={engine.realOnly && fn.unavailable ? `Not available: ${fn.unavailable}` : undefined}>
                    {fn.name}
                    {engine.realOnly && fn.unavailable ? ' (not available)' : ''}
                  </td>
                  <td className="muted ellipsis hide-m" style={{ maxWidth: 260 }}>
                    {fn.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function FunctionHelp({ code, sec }: { code: string; sec?: SecurityDef }) {
  const panel = usePanelId();
  const mnemonics = settings.use((s) => s.mnemonics);
  const fn = lookupFn(code)!;
  const example = exampleCommand(fn, sec, mnemonics);
  const related = FUNCTIONS.filter((x) => x.category === fn.category && x.code !== fn.code && (!sec || !x.classes || x.classes.includes(sec.cls))).slice(0, 10);
  useMenu('help-related', related.map((r, i) => ({ n: i + 1, label: r.name, run: () => execute(panel, `HELP ${r.code}`) })));
  return (
    <div className="cols">
      <section className="sect">
        <div className="sect-h">
          {mnemonics ? primaryMnemonic(fn.code) : fn.code} — {fn.name}
          {mnemonics && primaryMnemonic(fn.code) !== fn.code && <span className="muted" style={{ marginLeft: 'auto' }}>{fn.code}</span>}
        </div>
        <p className="prose">{fn.desc}</p>
        <dl className="kv">
          {engine.realOnly && fn.unavailable && (
            <>
              <dt>Desktop app</dt>
              <dd className="amber">Not available: {fn.unavailable}</dd>
            </>
          )}
          <dt>Category</dt>
          <dd>{fn.category}</dd>
          <dt>Needs security</dt>
          <dd>{fn.needsSec ? 'Yes' : 'No'}</dd>
          <dt>Works with</dt>
          <dd>{fn.classes ? fn.classes.map((c) => CLASS_LABEL[c]).join(', ') : 'All'}</dd>
          {sec && (
            <>
              <dt>Loaded security</dt>
              <dd className="yellow">{sec.id}{fn.classes && !fn.classes.includes(sec.cls) ? ' (incompatible)' : ''}</dd>
            </>
          )}
          {fn.aliases && (
            <>
              <dt>Also typed as</dt>
              <dd>{fn.aliases.join(', ')}</dd>
            </>
          )}
          <dt>Example</dt>
          <dd className="yellow" data-testid="function-example">{example}</dd>
        </dl>
        <div className="pad row">
          <button type="button" className="btn primary" onClick={() => execute(panel, example)}>
            Run example
          </button>
          <button type="button" className="btn" onClick={() => execute(panel, 'HELP')}>
            All functions
          </button>
        </div>
      </section>
      <section className="sect">
        <div className="sect-h">Related in {fn.category}</div>
        <table className="tbl">
          <tbody>
            {related.map((r, i) => (
              <tr key={r.code} className="click" onClick={() => execute(panel, `HELP ${r.code}`)}>
                <td className="num yellow b" style={{ width: 34 }}>{i + 1})</td>
                <td className="amber b" style={{ width: 64 }}>
                  {mnemonics ? primaryMnemonic(r.code) : r.code}
                </td>
                <td>{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function HELP({ route, sec }: FnProps) {
  const panel = usePanelId();
  const [filter, setFilter] = useState('');
  const topic = route.args?.trim().toUpperCase() ?? '';
  const fnTopic = topic ? lookupFn(topic) : undefined;
  const secHits = useMemo(() => (topic && !fnTopic ? searchSecurities(topic, 12) : []), [topic, fnTopic]);
  useMenu('help-securities', secHits.map(({ def }, i) => ({ n: i + 1, label: def.name, run: () => execute(panel, def.id) })));
  return (
    <div>
      <FnHeader code="HELP" title={fnTopic ? `Help: ${fnTopic.name}` : topic ? `Search: ${topic}` : 'Function Directory'} sec={sec} sub={`${FUNCTIONS.length} functions`} />
      {fnTopic ? (
        <FunctionHelp code={fnTopic.code} sec={sec} />
      ) : (
        <>
          {!topic && (
            <div className="cols">
              <section className="sect">
                <div className="sect-h">Command syntax</div>
                <table className="tbl">
                  <tbody>
                    {EXAMPLES.map(([cmd, what]) => (
                      <tr key={cmd} className="click" onClick={() => execute(panel, cmd)}>
                        <td className="yellow">{cmd}</td>
                        <td className="muted">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="sect">
                <div className="sect-h">Keyboard</div>
                <table className="tbl">
                  <tbody>
                    {SHORTCUTS.map(([k, what]) => (
                      <tr key={k}>
                        <td className="amber">{k}</td>
                        <td className="muted">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}
          {secHits.length > 0 && (
            <section className="sect">
              <div className="sect-h">Securities matching {topic}</div>
              <table className="tbl">
                <tbody>
                  {secHits.map(({ def }, i) => (
                    <tr key={def.id} className="click" onClick={() => execute(panel, def.id)}>
                      <td className="num yellow b" style={{ width: 34 }}>{i + 1})</td>
                      <td className="yellow">{def.id}</td>
                      <td>{def.name}</td>
                      <td className="muted">{CLASS_LABEL[def.cls]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <div className="pad-s row" style={{ borderBottom: '1px solid var(--line)' }}>
            <label className="fld" htmlFor={`help-filter-${panel}`}>
              Filter
            </label>
            <input id={`help-filter-${panel}`} className="inp" value={filter} placeholder="e.g. GP, yield, option" onChange={(e) => setFilter(e.target.value)} />
            <span className="muted">Enter a numbered item and GO, or click a function.{sec ? ` Analysis uses ${sec.id} where supported.` : ''}</span>
          </div>
          <Directory filter={filter || (secHits.length ? '' : topic)} sec={sec} start={secHits.length + 1} />
        </>
      )}
    </div>
  );
}
