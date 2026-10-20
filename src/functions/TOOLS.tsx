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
import { applyPreset, defaultTerminal, LAYOUT_PANELS, linkGroupOf, setSplit, terminal } from '../terminal/state';
import { savedLayouts, type SavedLayout } from '../terminal/userdata';
import { PRESETS } from '../components/TopBar';
import type { SecurityDef } from '../data/types';
import type { FnProps, LayoutId, Route } from '../terminal/types';

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

/** The screen each visible panel shows, for saving; LAYOUTS itself gives way to the screen before it. */
function currentRoutes(): { layout: LayoutId; routes: Route[] } {
  const st = terminal.get();
  const routes = st.panels.slice(0, LAYOUT_PANELS[st.layout]).map((p) => {
    const r = p.history[p.idx];
    return r.fn === 'LAYOUTS' && p.idx > 0 ? p.history[p.idx - 1] : r;
  });
  return { layout: st.layout, routes };
}

const routeText = (routes: Route[]) => routes.map((r) => (r.sec ? `${r.sec.split(' ')[0]} ${r.fn}` : r.args ? `${r.fn} ${r.args}` : r.fn)).join(' · ');

export function LPAD(_: FnProps) {
  const panel = usePanelId();
  const saved = savedLayouts.use((s) => s.list);
  const [name, setName] = useState('');
  const save = () => {
    const n = name.trim();
    if (!n) return flash(panel, 'Name the layout first', 'error');
    const { layout, routes } = currentRoutes();
    const split = terminal.get().sizes?.[layout];
    const linkGroups = terminal.get().panels.slice(0, LAYOUT_PANELS[layout]).map(linkGroupOf);
    // Saving under a name you used before replaces that layout.
    savedLayouts.set((s) => ({ list: [{ name: n, layout, routes, linkGroups, ...(split ? { split } : {}), saved: Date.now() }, ...s.list.filter((x) => x.name.toUpperCase() !== n.toUpperCase())] }));
    setName('');
    flash(panel, `Saved the panels as "${n}"`, 'info');
  };
  const apply = (l: SavedLayout) => {
    applyPreset(l.routes, l.layout, l.linkGroups);
    setSplit(l.layout, l.split);
  };
  return (
    <div>
      <FnHeader code="LAYOUTS" title="Layouts" sub="Save the panels as a workspace and bring it back, or apply a preset" />
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
                <td className="empty">No saved layouts yet. Arrange the panels, then name and save them here.</td>
              </tr>
            )}
            {saved.map((l) => (
              <tr key={l.name} className="click" onClick={() => apply(l)}>
                <td className="white b">{l.name}</td>
                <td className="muted">{LAYOUT_PANELS[l.layout]} panels</td>
                <td className="muted hide-m">{routeText(l.routes)}</td>
                <td className="muted hide-m">{fmtDate(l.saved)}</td>
                <td>
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
      <div className="note">Saved layouts include panel screens, divider positions and security link groups. Choose matching colors beside the panel number to share security selections across visible compatible panels. Linked monitors keep their lists open. Unlinked panels stay independent. Layouts are stored {engine.realOnly ? 'on this computer' : 'in this browser'}.</div>
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
