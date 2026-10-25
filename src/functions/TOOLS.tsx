import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { FavStar } from '../components/FavStar';
import { Chg, LivePx, SecLink, Section, KV } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { clearPersisted } from '../core/store';
import { engine } from '../data/market';
import { CLASS_LABEL, searchSecurities } from '../data/registry';
import { COUNTRY_NAMES } from '../data/eco';
import { feedStatus } from '../data/live/status';
import { coinGecko } from '../data/live/coingecko';
import { fmtDate, fmtTime } from '../core/format';
import { SNAPSHOT_AS_OF } from '../data/universe';
import { execute } from '../terminal/exec';
import { lookupSource, searchOnline, type OnlineHit } from '../data/live/lookup';
import { lookupFn } from '../terminal/registry';
import { flash, usePanelId } from '../terminal/panel';
import { settings, type ClickAction } from '../terminal/settings';
import { applyPreset, closeLayouts, defaultTerminal, layoutReturn, panelCount, rowsOrDefault, terminal, workspaceOf } from '../terminal/state';
import { applySaved, currentRoutes, saveLayout, unsavedLayout } from '../terminal/layouts';
import { fits, MAX_ROWS, MAX_TILES, MAX_TILES_PER_ROW, rowsOf } from '../terminal/rows-layout';
import { parseCommand } from '../terminal/commands';
import { savedLayouts } from '../terminal/userdata';
import { PRESETS, RowsIcon } from '../components/TopBar';
import type { SecurityDef } from '../data/types';
import type { FnProps, Route } from '../terminal/types';

const CLASSES: { n: number; label: string; test?: (d: SecurityDef) => boolean }[] = [
  { n: 1, label: 'All' },
  { n: 2, label: 'Equity', test: (d) => d.cls === 'equity' },
  { n: 3, label: 'Index', test: (d) => d.cls === 'index' },
  { n: 4, label: 'Futures', test: (d) => d.cls === 'future' || d.cls === 'commodity' },
  { n: 5, label: 'Currency', test: (d) => d.cls === 'fx' },
  { n: 6, label: 'Crypto', test: (d) => d.cls === 'crypto' },
  { n: 7, label: 'Rates', test: (d) => d.cls === 'rate' },
  { n: 8, label: 'Govt', test: (d) => d.yk === 'Govt' },
  { n: 9, label: 'Corp', test: (d) => d.yk === 'Corp' },
];

export function SECF({ route }: FnProps) {
  const panel = usePanelId();
  const [q, setQ] = useState(route.args ?? '');
  const [tab, setTab] = useState(1);
  const test = CLASSES[tab - 1].test;
  const count = engine.securities.length;
  const rows = useMemo(() => {
    if (q.trim()) return searchSecurities(q, 60, (d) => !test || test(d)).map((h) => h.def);
    return engine.securities.filter((d) => !test || test(d));
  }, [q, test, count]); // eslint-disable-line react-hooks/exhaustive-deps
  const source = lookupSource();
  const [online, setOnline] = useState<{ q: string; hits: OnlineHit[]; busy: boolean; error?: string }>({ q: '', hits: [], busy: false });
  const searchWeb = () => {
    const query = q.trim();
    if (!query) return;
    setOnline({ q: query, hits: [], busy: true });
    searchOnline(query)
      .then((hits) => setOnline({ q: query, hits, busy: false }))
      .catch((err: unknown) => setOnline({ q: query, hits: [], busy: false, error: err instanceof Error ? err.message : String(err) }));
  };
  return (
    <div>
      <FnHeader code="SEARCH" title="Security Finder" sub={`${rows.length} securities`} tabs={CLASSES.map((c) => ({ n: c.n, label: c.label }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <label className="fld" htmlFor={`secf-${panel}`}>
          Search
        </label>
        <input
          id={`secf-${panel}`}
          className="inp"
          style={{ width: 260 }}
          autoFocus
          value={q}
          placeholder="Ticker, name or alias (e.g. gold, tsmc, bund)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && source && searchWeb()}
        />
        {source ? (
          <button type="button" className="btn" onClick={searchWeb} disabled={!q.trim() || online.busy}>
            Search all US stocks ({source === 'yahoo' ? 'Yahoo Finance' : 'Finnhub'})
          </button>
        ) : (
          <span className="muted hide-m">The desktop app searches every US stock</span>
        )}
      </div>
      {(online.busy || online.hits.length > 0 || online.error || (online.q && !online.busy)) && (
        <Section title={`Online results for "${online.q}"`} right={online.busy ? 'Searching…' : `${online.hits.length} found · click to load`}>
          {online.error && <p className="pad-s dn">{online.error}</p>}
          {!online.busy && !online.error && online.hits.length === 0 && <p className="pad-s muted">No US-listed stocks match.</p>}
          <table className="tbl">
            <tbody>
              {online.hits.map((h) => (
                <tr key={h.symbol} className="click" onClick={() => execute(panel, `${h.symbol} US EQUITY`)}>
                  <td className="yellow" style={{ width: 120 }}>
                    {h.symbol} US
                  </td>
                  <td className="white">{h.name}</td>
                  <td className="muted hide-m">{h.exchange}</td>
                  <td className="muted">{engine.get(`${h.symbol} US Equity`) ? 'Loaded' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <DataTable
        rows={rows}
        rowKey={(d) => d.id}
        columns={[
          { key: 'id', label: 'Security', render: (d) => <span className="nowrap"><FavStar id={d.id} /><SecLink id={d.id}>{d.id}</SecLink></span>, sort: (d) => d.id },
          { key: 'n', label: 'Name', render: (d) => d.name, sort: (d) => d.name },
          { key: 'c', label: 'Class', render: (d) => <span className="muted">{CLASS_LABEL[d.cls]}</span>, sort: (d) => d.cls, hideM: true },
          { key: 'ct', label: 'Country', render: (d) => <span className="muted">{COUNTRY_NAMES[d.country] ?? d.country}</span>, sort: (d) => d.country, hideM: true },
          { key: 'x', label: 'Exchange', render: (d) => <span className="muted">{d.exch ?? d.cmd?.exch ?? ''}</span>, hideM: true },
          { key: 'l', label: 'Last', num: true, render: (d) => <LivePx id={d.id} /> },
          { key: 'p', label: 'Chg', num: true, render: (d) => (d.quote === 'yield' ? <Chg v={engine.quote(d.id)!.chg} bp /> : <Chg v={engine.quote(d.id)!.pct} pct />), sort: (d) => engine.quote(d.id)!.pct },
        ]}
      />
    </div>
  );
}

export function LAST(_: FnProps) {
  const panel = usePanelId();
  const st = terminal.use((s) => s);
  return (
    <div>
      <FnHeader code="RECENT" title="Recently Used" sub={`Securities and functions you opened ${engine.realOnly ? 'on this computer' : 'in this browser'}`} />
      <div className="cols">
        <Section title="Securities">
          <table className="tbl">
            <tbody>
              {st.recentSecs
                .filter((id) => engine.get(id))
                .map((id) => (
                  <tr key={id}>
                    <td>
                      <SecLink id={id}>{id}</SecLink>
                    </td>
                    <td className="muted">{engine.get(id)!.name}</td>
                    <td className="num">
                      <LivePx id={id} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
        <Section title="Functions">
          <table className="tbl">
            <tbody>
              {st.recentFns
                .filter((c) => lookupFn(c))
                .map((c) => (
                  <tr key={c} className="click" onClick={() => execute(panel, c)}>
                    <td className="amber b" style={{ width: 70 }}>
                      {c}
                    </td>
                    <td>{lookupFn(c)!.name}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}

const routeText = (routes: Route[]) => routes.map((r) => (r.sec ? `${r.sec.split(' ')[0]} ${r.fn}` : r.args ? `${r.fn} ${r.args}` : r.fn)).join(' · ');

/** A screen as a command line would name it: "AAPL US Equity CHART", "HEATMAP". */
const commandOf = (r: Route) => [r.sec, r.fn, r.args].filter(Boolean).join(' ');

/**
 * A tile's screen from what was typed, as the command line takes it: a function ("HEATMAP"), a security and a function
 * ("NVDA GP", "AAPL US Equity CHART"), or a security alone (its menu).
 */
export function routeFromCommand(text: string): Route | { error: string } {
  const t = text.trim();
  if (!t) return { error: 'type a screen, e.g. HEATMAP or AAPL CHART' };
  const p = parseCommand(t, lookupFn);
  if (p.kind !== 'route') return { error: p.kind === 'error' ? p.message : `"${t}" is not a screen` };
  const def = lookupFn(p.fn ?? (p.sec ? 'MENU' : 'PROFILE'));
  if (!def) return { error: `"${t}" is not a screen` };
  if (def.needsSec && !p.sec) return { error: `${def.code} needs a security, e.g. AAPL ${def.code}` };
  if (p.sec && def.classes && !def.classes.includes(p.sec.cls)) return { error: `${def.code} is not available for ${CLASS_LABEL[p.sec.cls]} securities` };
  return { fn: def.code, ...(p.sec ? { sec: p.sec.id } : {}), ...(p.args ? { args: p.args } : {}) };
}

/** Row shapes to start from: the tiles in each row, top to bottom. */
const SHAPES: number[][] = [[1], [2], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [3, 3], [2, 2, 2]];
/** Screens offered for a tile; any command works. */
const SUGGESTED = ['HEATMAP', 'MARKETNEWS', 'HEADLINES', 'WATCHLIST', 'MARKET', 'MOVERS', 'EVENTS', 'SPX Index CHART', 'AAPL US Equity CHART', 'AAPL US Equity PROFILE', 'PORTFOLIO', 'FXMATRIX', 'CRYPTO', 'RELEASES'];

/**
 * Builds a layout of your own: the rows and their tiles first, then a screen for each tile, then a name. Making it sets
 * the workspace to it and saves it; dragging the lines between tiles afterwards sizes them, and LAYOUTS ▾ (or the list
 * below) saves the new sizes.
 */
function LayoutBuilder() {
  const panel = usePanelId();
  const [counts, setCounts] = useState<number[]>([1, 2]);
  const total = counts.reduce((a, b) => a + b, 0);
  const [screens, setScreens] = useState<string[]>(() => {
    const now = currentRoutes(workspaceOf(terminal.get())).map(commandOf);
    return Array.from({ length: MAX_TILES }, (_, i) => now[i] ?? SUGGESTED[i]);
  });
  const [name, setName] = useState('');
  const change = (next: number[]) => fits(next) && setCounts(next);
  const make = () => {
    const n = name.trim();
    if (!n) return flash(panel, 'Name the layout first', 'error');
    const routes: Route[] = [];
    for (let i = 0; i < total; i++) {
      const r = routeFromCommand(screens[i]);
      if ('error' in r) return flash(panel, `Tile ${i + 1}: ${r.error}`, 'error');
      routes.push(r);
    }
    applyPreset(routes, 'rows', undefined, rowsOf(counts), n);
    saveLayout(n);
    flash(panel, `Saved "${n}". Drag the lines between tiles to size them; LAYOUTS ▾ saves the new sizes.`, 'info');
  };
  let tile = 0;
  return (
    <Section title="Build a layout" right="rows, then screens, then a name">
      <div className="pad layout-builder">
        <div className="lb-step">
          <div className="lb-h"><span className="amber">1</span> How the rows look</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {SHAPES.map((sh) => (
              <button key={sh.join('+')} type="button" className={`btn lb-shape${sh.join() === counts.join() ? ' on' : ''}`} aria-pressed={sh.join() === counts.join()} title={`${sh.length} ${sh.length === 1 ? 'row' : 'rows'}: ${sh.join(' + ')} ${sh.reduce((a, b) => a + b, 0) === 1 ? 'tile' : 'tiles'}`} onClick={() => setCounts(sh)}>
                <RowsIcon rows={rowsOf(sh)} />
              </button>
            ))}
          </div>
          {counts.map((c, i) => (
            <div key={i} className="row lb-row" style={{ gap: 6 }}>
              <span className="muted" style={{ width: 52 }}>Row {i + 1}</span>
              <button type="button" className="act" aria-label={`Fewer tiles in row ${i + 1}`} disabled={c <= 1} onClick={() => change(counts.map((x, j) => (j === i ? x - 1 : x)))}>−</button>
              <span className="white" style={{ minWidth: 48, textAlign: 'center' }}>{c} {c === 1 ? 'tile' : 'tiles'}</span>
              <button type="button" className="act" aria-label={`More tiles in row ${i + 1}`} disabled={!fits(counts.map((x, j) => (j === i ? x + 1 : x)))} onClick={() => change(counts.map((x, j) => (j === i ? x + 1 : x)))}>+</button>
              {counts.length > 1 ? <button type="button" className="act" aria-label={`Remove row ${i + 1}`} onClick={() => setCounts(counts.filter((_, j) => j !== i))}>×</button> : null}
            </div>
          ))}
          <button type="button" className="btn" disabled={!fits([...counts, 1])} onClick={() => change([...counts, 1])}>+ Add a row</button>
          <div className="muted lb-limit">Up to {MAX_ROWS} rows, {MAX_TILES_PER_ROW} tiles in a row and {MAX_TILES} in all.</div>
        </div>
        <div className="lb-step">
          <div className="lb-h"><span className="amber">2</span> A screen for each tile</div>
          <div className="lb-preview" aria-label="Preview">
            {counts.map((c, i) => (
              <div key={i} className="lb-prow" style={{ gridTemplateColumns: `repeat(${c}, 1fr)` }}>
                {Array.from({ length: c }, () => {
                  const k = tile++;
                  return (
                    <label key={k} className="lb-tile">
                      <span className="amber">{k + 1}</span>
                      <input className="inp" aria-label={`Screen for tile ${k + 1}`} list="layout-screens" value={screens[k]} onChange={(e) => setScreens(screens.map((x, j) => (j === k ? e.target.value : x)))} />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <datalist id="layout-screens">
            {SUGGESTED.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <div className="muted">Type any screen as on the command line: HEATMAP, MARKETNEWS, NVDA GP, AAPL US Equity PROFILE…</div>
        </div>
        <div className="lb-step">
          <div className="lb-h"><span className="amber">3</span> Name it</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="inp" placeholder="Name, e.g. Morning desk" aria-label="New layout name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} />
            <button type="button" className="btn primary" onClick={make}>
              Make and save
            </button>
          </div>
          <div className="muted">Then drag the lines between the tiles to size them: LAYOUTS ▾ offers to save the new sizes, and the layout comes back as you left it.</div>
        </div>
      </div>
    </Section>
  );
}

export function LPAD(_: FnProps) {
  const panel = usePanelId();
  const saved = savedLayouts.use((s) => s.list);
  const workspace = terminal.use((s) => s);
  const cameFrom = layoutReturn.use((s) => s.before);
  const changed = useMemo(() => unsavedLayout(workspace, saved), [workspace, saved, cameFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  // While LAYOUTS fills the window, "current panels" are the ones it was opened from.
  const ws = workspaceOf(workspace, cameFrom);
  const away = ws !== workspace;
  const [name, setName] = useState('');
  const save = () => {
    const n = name.trim();
    if (!n) return flash(panel, 'Name the layout first', 'error');
    // Saving under a name you used before replaces that layout.
    saveLayout(n);
    setName('');
    flash(panel, `Saved the panels as "${n}"`, 'info');
  };
  return (
    <div>
      <FnHeader code="LAYOUTS" title="Layouts" sub="Build a layout of your own, save the panels as a workspace and bring it back, or apply a preset" />
      {away && (
        <div className="pad row lb-away" role="status" style={{ gap: 10 }}>
          <span>
            LAYOUTS has the whole window. Your {panelCount(ws)} panels{ws.layoutName ? ` ("${ws.layoutName}")` : ''} are kept: saving below saves them.
          </span>
          <button type="button" className="btn primary" onClick={closeLayouts}>
            ← Back to your panels
          </button>
        </div>
      )}
      <LayoutBuilder />
      <Section title="Your layouts" right={`${saved.length} saved`}>
        <div className="pad row" style={{ gap: 8 }}>
          <input className="inp" placeholder="Name, e.g. Morning" aria-label="Layout name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button type="button" className="btn primary" onClick={save}>
            Save current panels
          </button>
        </div>
        <table className="tbl">
          <tbody>
            {saved.length === 0 && (
              <tr>
                <td className="empty">No saved layouts yet. Build one above, or arrange the panels, then name and save them here.</td>
              </tr>
            )}
            {saved.map((l) => (
              <tr key={l.name} className="click" onClick={() => applySaved(l)}>
                <td className="white b">
                  {l.rows ? <RowsIcon rows={rowsOrDefault(l.rows)} /> : null} {l.name}
                </td>
                <td className="muted">
                  {panelCount(l)} panels{ws.layoutName === l.name ? <span className="badge" style={{ marginLeft: 6 }}>IN USE</span> : null}
                </td>
                <td className="muted hide-m">{routeText(l.routes)}</td>
                <td className="muted hide-m">{fmtDate(l.saved)}</td>
                <td>
                  {changed?.name === l.name ? (
                    <button
                      type="button"
                      className="btn primary"
                      title="The panels were resized or changed since it was saved"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveLayout(l.name);
                        flash(panel, `Saved the changes to "${l.name}"`, 'info');
                      }}
                    >
                      Save changes
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="act"
                    aria-label={`Delete layout ${l.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      savedLayouts.set((s) => ({ list: s.list.filter((x) => x.name !== l.name) }));
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Presets">
        <table className="tbl">
          <tbody>
            {PRESETS.map((p, i) => (
              <tr key={p.name} className="click" onClick={() => applyPreset(p.routes, p.layout, p.linkGroups)}>
                <td className="amber" style={{ width: 40 }}>
                  {i + 1})
                </td>
                <td className="white b">{p.name}</td>
                <td className="muted">{routeText(p.routes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="note">Saved layouts include their rows and tile sizes, panel screens, divider positions and security link groups. Choose matching colors beside the panel number to share security selections across visible compatible panels. Linked monitors keep their lists open. Unlinked panels stay independent. Layouts are stored {engine.realOnly ? 'on this computer' : 'in this browser'}.</div>
    </div>
  );
}

const TZS = [
  ['local', 'Browser local time'],
  ['America/New_York', 'New York'],
  ['Europe/London', 'London'],
  ['Europe/Berlin', 'Frankfurt'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Asia/Hong_Kong', 'Hong Kong'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
];

export function PDFU(_: FnProps) {
  const s = settings.use((x) => x);
  const feeds = feedStatus.use((f) => f);
  const gecko = coinGecko.use((g) => g);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => settings.set((x) => ({ ...x, [k]: v }));
  const feedRow = (name: string, state: string, detail?: string) => (
    <tr key={name}>
      <td className="amber">{name}</td>
      <td>
        <span className={`badge ${state === 'live' ? 'live' : 'sim'}`}>{state.toUpperCase()}</span>
      </td>
      <td className="muted">{detail ?? ''}</td>
    </tr>
  );
  return (
    <div>
      <FnHeader code="SETTINGS" title="Personal Defaults & Data Sources" sub={engine.realOnly ? 'Settings are stored on this computer' : 'Settings are stored in this browser'} />
      <div className="cols">
        <Section title="Display">
          <div className="pad" style={{ display: 'grid', gap: 8 }}>
            <label className="fld">
              Font size
              <span className="seg">
                {(['S', 'M', 'L'] as const).map((z) => (
                  <button key={z} type="button" className={s.size === z ? 'on' : ''} onClick={() => set('size', z)}>
                    {z === 'S' ? 'Small' : z === 'M' ? 'Medium' : 'Large'}
                  </button>
                ))}
              </span>
            </label>
            <label className="fld" htmlFor="pdfu-tz">
              Time zone
              <select id="pdfu-tz" className="sel-inp" value={s.tz} onChange={(e) => set('tz', e.target.value)}>
                {TZS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={s.dateOrder !== 'MDY'} onChange={(e) => set('dateOrder', e.target.checked ? 'DMY' : 'MDY')} /> European dates, DD/MM/YYYY (off: MM/DD/YYYY)
            </label>
            <label className="fld" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={s.font !== 'mono'} onChange={(e) => set('font', e.target.checked ? 'terminal' : 'mono')} /> Terminal typeface, proportional with even-width figures (off: monospaced)
            </label>
            <label className="fld" htmlFor="pdfu-click">
              Clicking a security opens
              <select id="pdfu-click" className="sel-inp" value={s.clickAction} onChange={(e) => set('clickAction', e.target.value as ClickAction)}>
                <option value="auto">PROFILE for stocks, CHART otherwise</option>
                <option value="PROFILE">PROFILE Company or security profile</option>
                <option value="CHART">CHART Price chart</option>
                <option value="QUOTE">QUOTE Quote</option>
              </select>
            </label>
            {(
              [
                ['flash', 'Flash prices on every tick'],
                ['mnemonics', 'Show short function mnemonics and <GO> cues'],
                ['tape', 'Show the ticker tape'],
                ['newsFlashes', 'Pop up flash headlines'],
                ['sound', 'Beep on alerts'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="fld" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={s[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
              </label>
            ))}
            <label className="fld" htmlFor="pdfu-tick">
              Update interval
              <select id="pdfu-tick" className="sel-inp" value={s.tickMs} onChange={(e) => set('tickMs', Number(e.target.value))}>
                {[250, 500, 1000, 2000, 5000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms < 1000 ? `${ms} ms` : `${ms / 1000} s`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>
        <Section title="Data sources">
          <table className="tbl">
            <tbody>
              {feeds.market !== 'off' && feedRow('Real market data (Yahoo Finance; desktop)', feeds.market, feeds.detail.market)}
              {feeds.rates !== 'off' && feedRow('US Treasury curve (treasury.gov, desktop)', feeds.rates, feeds.detail.rates)}
              {feeds.yields !== 'off' && feedRow('Government yields (central banks, finance ministries)', feeds.yields, feeds.detail.yields)}
              {feeds.policy !== 'off' && feedRow('Central bank rates and calendars (desktop)', feeds.policy, feeds.detail.policy)}
              {feeds.eco !== 'off' && feedRow('US economic releases (FRED, desktop)', feeds.eco, feeds.detail.eco)}
              {feeds.crypto !== 'off' && feedRow('Crypto prices (Kraken, desktop)', feeds.crypto, feeds.detail.crypto)}
              {engine.realOnly &&
                gecko.status !== 'off' &&
                feedRow(
                  'Crypto market values (CoinGecko)',
                  gecko.status === 'ok' ? 'live' : gecko.status === 'needs-key' ? 'off' : 'error',
                  gecko.status === 'ok' ? `Received ${fmtTime(gecko.at, false)}` : gecko.status === 'needs-key' ? 'Needs a free CoinGecko Demo key (PROVIDERS)' : 'CoinGecko did not answer',
                )}
              {engine.realOnly
                ? feedRow('Simulator', 'off', 'Off in the desktop app: every figure comes from a real source, and anything without one is left out')
                : feedRow('Simulator', 'live', `Calibrated to closes as of ${SNAPSHOT_AS_OF}; runs every instrument`)}
              {feedRow('Headlines', feeds.news, feeds.detail.news)}
            </tbody>
          </table>
          <div className="note">Every provider, its state, terms and credentials: type PROVIDERS.</div>
        </Section>
        <Section title="Workspace">
          <KV items={[['Panels', String(terminal.get().panels.length)], ['Layout', terminal.get().layout]]} />
          <div className="pad row">
            <button type="button" className="btn" onClick={() => terminal.set(defaultTerminal())}>
              Reset panels
            </button>
            {confirmReset ? (
              <>
                <span className="dn">Erase everything the app keeps here: watchlists, portfolio (and the saved copy of an older one), alerts, notes, saved layouts, chats and settings? Provider keys are kept.</span>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    clearPersisted();
                    location.reload();
                  }}
                >
                  Erase and reload
                </button>
                <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>
                Reset all data…
              </button>
            )}
          </div>
        </Section>
      </div>
      <Section title="About">
        {engine.realOnly ? (
          <p className="prose">
            Armin Terminal is an independent, keyboard-driven market terminal for private use. It is not affiliated with any terminal maker or data vendor. The desktop app
            shows real data only, from the free public sources listed above, with their delays: anything they do not cover is left out rather than simulated. It is not
            investment advice.
          </p>
        ) : (
          <p className="prose">
            This is the browser demo of Armin Terminal, an independent, keyboard-driven market terminal. It is not affiliated with any terminal maker or data vendor.
            Every price, figure and headline here is simulated and marked DEMO DATA; none of it is market data or investment advice.
          </p>
        )}
      </Section>
    </div>
  );
}
