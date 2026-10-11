import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CLASS_LABEL, searchSecurities } from '../data/registry';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { FUNCTIONS, lookupFn } from '../terminal/registry';
import type { FnCategory, FnProps } from '../terminal/types';

const ORDER: FnCategory[] = [
  'Equity', 'Charts', 'News', 'Markets', 'FX & Crypto', 'Rates & Credit', 'Commodities', 'Economics', 'Derivatives',
  'Portfolio & Tools', 'Communication', 'System',
];

const SHORTCUTS: [string, string][] = [
  ['Type anywhere', 'Goes to the active panel command line'],
  ['Enter / GO', 'Run the command'],
  ['Esc / CANCEL', 'Clear the command line'],
  ['Backspace (empty line)', 'Previous screen (MENU)'],
  ['Alt+1 … Alt+6', 'Switch panel'],
  ['Alt+← / Alt+→', 'Back / forward'],
  ['F1 (twice: help desk)', 'HELP'],
  ['F2 F3 F4 F5 F6 F7', 'GOVT CORP MTGE M-MKT MUNI PFD yellow keys'],
  ['F8 F9 F10 F11 F12', 'EQUITY CMDTY INDEX CRNCY CLIENT yellow keys'],
  ['PgUp / PgDn', 'PAGE BACK / PAGE FWD'],
  ['EQUITY <GO>', 'Market sector menu'],
  ['IBM <CORP> <GO>', "An issuer's bonds"],
  ['↑ ↓ Tab', 'Move through and complete suggestions'],
  ['3 <GO>', 'Pick numbered item 3) on the screen'],
  ['GP?', 'Help on a function'],
];

const EXAMPLES: [string, string][] = [
  ['AAPL US <EQUITY> <GO>', 'Related functions menu for Apple'],
  ['AAPL US <EQUITY> GP <GO>', 'Price graph for Apple'],
  ['NVDA DES', 'Ticker shorthand plus function'],
  ['EURUSD <CRNCY> GIP', 'Intraday EUR-USD'],
  ['USGG10YR <INDEX> GP', 'US 10-year yield history'],
  ['CT10 <GOVT> YAS', 'Yield analysis, current 10-year Treasury'],
  ['TOP', 'Top news'],
  ['N CRYPTO', 'News search'],
  ['WEI', 'World equity indices'],
];

function Directory({ filter }: { filter: string }) {
  const panel = usePanelId();
  const f = filter.toUpperCase();
  const groups = ORDER.map((cat) => ({
    cat,
    fns: FUNCTIONS.filter(
      (fn) =>
        fn.category === cat &&
        (!f || fn.code.includes(f) || fn.name.toUpperCase().includes(f) || fn.desc.toUpperCase().includes(f) || (fn.aliases ?? []).some((a) => a.includes(f))),
    ),
  })).filter((g) => g.fns.length);
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
              {g.fns.map((fn) => (
                <tr key={fn.code} className="click" onClick={() => execute(panel, fn.needsSec ? `HELP ${fn.code}` : fn.code)}>
                  <td style={{ width: 64 }}>
                    <span className="amber b">{fn.code}</span>
                  </td>
                  <td className="white">{fn.name}</td>
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

function FunctionHelp({ code }: { code: string }) {
  const panel = usePanelId();
  const fn = lookupFn(code)!;
  const related = FUNCTIONS.filter((x) => x.category === fn.category && x.code !== fn.code).slice(0, 10);
  return (
    <div className="cols">
      <section className="sect">
        <div className="sect-h">
          {fn.code} — {fn.name}
        </div>
        <p className="prose">{fn.desc}</p>
        <dl className="kv">
          <dt>Category</dt>
          <dd>{fn.category}</dd>
          <dt>Needs security</dt>
          <dd>{fn.needsSec ? 'Yes' : 'No'}</dd>
          <dt>Works with</dt>
          <dd>{fn.classes ? fn.classes.map((c) => CLASS_LABEL[c]).join(', ') : 'All'}</dd>
          {fn.aliases && (
            <>
              <dt>Also typed as</dt>
              <dd>{fn.aliases.join(', ')}</dd>
            </>
          )}
          <dt>Example</dt>
          <dd className="yellow">{fn.example ?? (fn.needsSec ? `AAPL US <EQUITY> ${fn.code} <GO>` : `${fn.code} <GO>`)}</dd>
        </dl>
        <div className="pad row">
          <button type="button" className="btn primary" onClick={() => execute(panel, fn.example?.replace(/<|>|GO/g, ' ') ?? (fn.needsSec ? `AAPL US EQUITY ${fn.code}` : fn.code))}>
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
            {related.map((r) => (
              <tr key={r.code} className="click" onClick={() => execute(panel, `HELP ${r.code}`)}>
                <td className="amber b" style={{ width: 64 }}>
                  {r.code}
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

export function HELP({ route }: FnProps) {
  const panel = usePanelId();
  const [filter, setFilter] = useState('');
  const topic = route.args?.trim().toUpperCase() ?? '';
  const fnTopic = topic ? lookupFn(topic) : undefined;
  const secHits = useMemo(() => (topic && !fnTopic ? searchSecurities(topic, 12) : []), [topic, fnTopic]);
  return (
    <div>
      <FnHeader code="HELP" title={fnTopic ? `Help: ${fnTopic.name}` : topic ? `Search: ${topic}` : 'Function Directory'} sub={`${FUNCTIONS.length} functions`} />
      {fnTopic ? (
        <FunctionHelp code={fnTopic.code} />
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
                  {secHits.map(({ def }) => (
                    <tr key={def.id} className="click" onClick={() => execute(panel, def.id)}>
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
            <input id={`help-filter-${panel}`} className="inp" value={filter} placeholder="e.g. yield, news, option" onChange={(e) => setFilter(e.target.value)} />
            <span className="muted">Click a function to open it.</span>
          </div>
          <Directory filter={filter || (secHits.length ? '' : topic)} />
        </>
      )}
    </div>
  );
}
