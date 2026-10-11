import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, SecLink, Section, KV } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { clearPersisted } from '../core/store';
import { engine } from '../data/market';
import { CLASS_LABEL, searchSecurities } from '../data/registry';
import { COUNTRY_NAMES } from '../data/eco';
import { feedStatus } from '../data/live/status';
import { SNAPSHOT_AS_OF } from '../data/universe';
import type { AssetClass } from '../data/types';
import { execute } from '../terminal/exec';
import { lookupFn } from '../terminal/registry';
import { flash, usePanelId } from '../terminal/panel';
import { settings, type ClickAction } from '../terminal/settings';
import { applyPreset, defaultTerminal, terminal } from '../terminal/state';
import { PRESETS } from '../components/TopBar';
import type { FnProps } from '../terminal/types';

const CLASSES: { n: number; label: string; cls?: AssetClass }[] = [
  { n: 1, label: 'All' },
  { n: 2, label: 'Equity', cls: 'equity' },
  { n: 3, label: 'Index', cls: 'index' },
  { n: 4, label: 'Currency', cls: 'fx' },
  { n: 5, label: 'Crypto', cls: 'crypto' },
  { n: 6, label: 'Commodity', cls: 'commodity' },
  { n: 7, label: 'Rates', cls: 'rate' },
  { n: 8, label: 'Govt', cls: 'bond' },
];

export function SECF({ route }: FnProps) {
  const panel = usePanelId();
  const [q, setQ] = useState(route.args ?? '');
  const [tab, setTab] = useState(1);
  const cls = CLASSES[tab - 1].cls;
  const rows = useMemo(() => {
    if (q.trim()) return searchSecurities(q, 60, (d) => !cls || d.cls === cls).map((h) => h.def);
    return engine.securities.filter((d) => !cls || d.cls === cls);
  }, [q, cls]);
  return (
    <div>
      <FnHeader code="SECF" title="Security Finder" sub={`${rows.length} securities`} tabs={CLASSES.map((c) => ({ n: c.n, label: c.label }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <label className="fld" htmlFor={`secf-${panel}`}>
          Search
        </label>
        <input id={`secf-${panel}`} className="inp" style={{ width: 260 }} autoFocus value={q} placeholder="Ticker, name or alias (e.g. gold, tsmc, bund)" onChange={(e) => setQ(e.target.value)} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(d) => d.id}
        columns={[
          { key: 'id', label: 'Security', render: (d) => <SecLink id={d.id}>{d.id}</SecLink>, sort: (d) => d.id },
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
      <FnHeader code="LAST" title="Recently Used" sub="Securities and functions from this browser" />
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

export function LPAD(_: FnProps) {
  return (
    <div>
      <FnHeader code="LPAD" title="Launchpad Workspaces" sub="Apply a preset layout to all panels" />
      <table className="tbl">
        <tbody>
          {PRESETS.map((p, i) => (
            <tr key={p.name} className="click" onClick={() => applyPreset(p.routes, p.layout)}>
              <td className="amber" style={{ width: 40 }}>
                {i + 1})
              </td>
              <td className="white b">{p.name}</td>
              <td className="muted">{p.routes.map((r) => (r.sec ? `${r.sec.split(' ')[0]} ${r.fn}` : r.fn)).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const panel = usePanelId();
  const s = settings.use((x) => x);
  const feeds = feedStatus.use((f) => f);
  const [key, setKey] = useState(s.finnhubKey);
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
      <FnHeader code="PDFU" title="Personal Defaults & Data Sources" sub="Settings are stored in this browser" />
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
            <label className="fld" htmlFor="pdfu-click">
              Clicking a security opens
              <select id="pdfu-click" className="sel-inp" value={s.clickAction} onChange={(e) => set('clickAction', e.target.value as ClickAction)}>
                <option value="auto">DES for stocks, GP otherwise</option>
                <option value="DES">DES Description</option>
                <option value="GP">GP Price graph</option>
                <option value="BQ">BQ Quote</option>
              </select>
            </label>
            {(
              [
                ['flash', 'Flash prices on every tick'],
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
              {feedRow('Simulator', 'live', `Calibrated to closes as of ${SNAPSHOT_AS_OF}; runs every instrument`)}
              {feedRow('Crypto (Coinbase)', feeds.crypto, feeds.detail.crypto)}
              {feedRow('FX fixings (ECB via Frankfurter)', feeds.fx, feeds.detail.fx)}
              {feedRow('US equities (Finnhub)', feeds.equities, feeds.detail.equities)}
              {feedRow('Headlines (Finnhub)', feeds.news, feeds.detail.news)}
            </tbody>
          </table>
          <div className="pad" style={{ display: 'grid', gap: 8 }}>
            <label className="fld" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={s.liveCrypto} onChange={(e) => set('liveCrypto', e.target.checked)} /> Stream real crypto prices
            </label>
            <label className="fld" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={s.liveFx} onChange={(e) => set('liveFx', e.target.checked)} /> Use real ECB FX history
            </label>
            <label className="fld" htmlFor="pdfu-key">
              Finnhub API key
              <input id="pdfu-key" className="inp" style={{ width: 230 }} type="password" autoComplete="off" value={key} placeholder="free key from finnhub.io" onChange={(e) => setKey(e.target.value.trim())} />
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  set('finnhubKey', key);
                  flash(panel, key ? 'Connecting to Finnhub…' : 'Finnhub disconnected', 'info');
                }}
              >
                {key ? 'Connect' : 'Disconnect'}
              </button>
            </label>
            <div className="note" style={{ padding: 0 }}>
              With a key, US stocks quote live and real headlines join the news feed. The key never leaves this browser except in requests to Finnhub.
            </div>
          </div>
        </Section>
        <Section title="Workspace">
          <KV items={[['Panels', String(terminal.get().panels.length)], ['Layout', terminal.get().layout]]} />
          <div className="pad row">
            <button type="button" className="btn" onClick={() => terminal.set(defaultTerminal())}>
              Reset panels
            </button>
            {confirmReset ? (
              <>
                <span className="dn">Erase watchlists, portfolio, alerts and chats?</span>
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
        <p className="prose">
          Amber Terminal is an independent, Bloomberg-style market terminal that runs entirely in the browser. It is not affiliated with Bloomberg L.P. Prices are
          simulated by a calibrated factor model unless a live feed is connected and marked LIVE; fundamentals, analyst views, holders, news and economic
          figures are generated for demonstration and are not investment advice.
        </p>
      </Section>
    </div>
  );
}
