import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { useInterval } from '../data/market';
import { feedStatus } from '../data/live/status';
import { PROVIDERS, providersAvailable, providerState, useProviderReport, type Credential, type ProviderDef, type ProviderReport, type ProviderState, type SettingName } from '../data/providers';
import { reloadFred } from '../data/live/fred';
import type { FnProps } from '../terminal/types';

const STATE_LABEL: Record<ProviderState, string> = {
  live: 'LIVE',
  ok: 'ANSWERING',
  idle: 'NOT ASKED YET',
  error: 'ERROR',
  stale: 'STALE',
  'not-configured': 'NOT CONFIGURED',
  'switched-off': 'SWITCHED OFF',
  planned: 'NOT CONNECTED',
  disabled: 'DISABLED',
};

const STATE_CLASS: Record<ProviderState, string> = {
  live: 'live',
  ok: 'live',
  idle: 'sim',
  error: 'hot',
  stale: 'hot',
  'not-configured': 'sim',
  'switched-off': 'sim',
  planned: 'sim',
  disabled: 'sim',
};

/**
 * What went wrong, in the categories that tell the owner what to do: fix the
 * local setup, the key or entitlement, wait out a rate limit, wait for the
 * provider, or accept that the market or symbol has no data.
 */
const KIND_LABEL: Record<string, string> = {
  'missing-credentials': 'Local configuration: no key set',
  'not-entitled': 'Authentication or entitlement: refused',
  'rate-limited': 'Rate limit',
  timeout: 'Provider outage: timed out',
  network: 'Provider outage or network: no connection',
  'provider-error': 'Provider outage: server error',
  'no-data': 'Unavailable: no data for that market or symbol',
  'schema-changed': 'Provider changed its format',
};

/** "12 s ago", "4 min ago", or the time of day for older events. */
function ago(t: number | null | undefined, now: number): string {
  if (!t) return '--';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString();
}

/** The switch or key a provider depends on, and where its value comes from. */
function Requirement({ p, report }: { p: ProviderDef; report: ProviderReport | null }) {
  if (p.setting) {
    const st = report?.settings?.[p.setting];
    if (!st) return <span className="muted">--</span>;
    return (
      <span title={st.label}>
        {p.setting} {st.value ? 'on' : 'off'} <span className="muted">({st.source})</span>
      </span>
    );
  }
  if (p.credential) {
    const st = report?.credentials[p.credential];
    return (
      <span>
        {p.credential} {st?.configured ? (st.valid ? 'set' : 'set, wrong format') : 'not set'}
        {st?.source ? <span className="muted"> ({st.source})</span> : null}
      </span>
    );
  }
  return <span className="muted">no key needed</span>;
}

/**
 * PROV: every data provider with its state, switch or key, what it serves,
 * the kind of data it is, its recent requests, latency and errors, and the
 * official pages its terms come from. Keys are entered here and kept by the
 * desktop app's main process. Nothing here sends a request of its own: it
 * reports what the screens' requests did.
 */
export function PROV(_: FnProps) {
  useInterval(1000);
  const [report, refresh] = useProviderReport();
  const feeds = feedStatus.use((f) => f);
  const now = Date.now();
  const desktop = providersAvailable();
  return (
    <div>
      <FnHeader code="PROVIDERS" title="Data Providers & Status" sub={desktop ? 'What each source serves, how it is doing, and the terms that apply' : 'Desktop app only: this browser build has no backend to reach the providers'} />
      {!desktop && (
        <div className="note">
          The browser build cannot reach market data providers: their terms and browser security rules rule it out. Every provider request in the desktop app goes out from its main process, which also keeps the keys. The list below is what the desktop app uses.
        </div>
      )}
      <Section title="Providers">
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Provider</th>
              <th>State</th>
              <th className="hide-m">Switch or key</th>
              <th>Serves</th>
              <th className="hide-m">Data and entitlement</th>
              <th title="When the app last sent this provider a request">Last attempt</th>
              <th title="When the provider last answered successfully, and how long that took">Last success</th>
              <th className="hide-m" title="When data from this provider last reached the screens">Data updated</th>
              <th>Last problem</th>
              <th className="num hide-m" title="Requests in the last minute, and the app's own ceiling">Requests / min</th>
              <th className="hide-m">Terms and official pages</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDERS.map((p) => {
              const s = report?.providers[p.id];
              const feed = p.feed ? feeds[p.feed] : undefined;
              const state = desktop || !p.desktop ? providerState(p, report, feed, now) : p.policy === 'disabled' ? 'disabled' : 'idle';
              const updated = p.feed ? feeds.updatedAt[p.feed] : undefined;
              const errorIsLatest = !!s?.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt);
              return (
                <tr key={p.id}>
                  <td className="amber">{p.name}</td>
                  <td>
                    <span className={`badge ${STATE_CLASS[state]}`}>{desktop || !p.desktop ? STATE_LABEL[state] : 'DESKTOP ONLY'}</span>
                  </td>
                  <td className="hide-m">
                    <Requirement p={p} report={report} />
                  </td>
                  <td>{p.serves}</td>
                  <td className="hide-m muted">{p.dataClass}</td>
                  <td title={s?.lastAttemptAt ? new Date(s.lastAttemptAt).toISOString() : undefined}>{ago(s?.lastAttemptAt, now)}</td>
                  <td title={s?.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : undefined}>
                    {ago(s?.lastSuccessAt, now)}
                    {s?.lastLatencyMs != null && s.lastSuccessAt ? <span className="muted"> · {s.lastLatencyMs} ms</span> : null}
                  </td>
                  <td className="hide-m" title={p.feed ? feeds.detail[p.feed] : undefined}>
                    {updated ? ago(updated, now) : '--'}
                  </td>
                  <td title={s?.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : undefined}>
                    {state === 'stale' && !errorIsLatest ? (
                      <>Stale data: no answer for {ago(s?.lastSuccessAt, now).replace(' ago', '')}</>
                    ) : s?.lastErrorAt ? (
                      <>
                        {KIND_LABEL[s.lastErrorKind ?? ''] ?? s.lastErrorKind}: <span className="muted">{s.lastError}</span> ({ago(s.lastErrorAt, now)})
                      </>
                    ) : state === 'not-configured' ? (
                      'Local configuration: no key set'
                    ) : (
                      '--'
                    )}
                  </td>
                  <td className="num hide-m">
                    {s ? s.lastMinute : '--'}
                    {p.limit ? <span className="muted"> / {p.limit}</span> : null}
                  </td>
                  <td className="hide-m">
                    <span className="muted">{p.terms}</span>{' '}
                    {p.docs.map((d) => (
                      <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="amber" style={{ marginRight: 6 }}>
                        {d.label}
                      </a>
                    ))}
                    <span className="faint">checked {p.checked}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      {desktop && <Switches report={report} onChange={refresh} />}
      {desktop && <Credentials report={report} onChange={refresh} />}
      <div className="note">
        States: LIVE and ANSWERING mean the provider answered its last request; STALE means a provider the app asks continually has not answered for several rounds; NOT ASKED YET means no screen has needed it since the app started; NOT
        CONFIGURED means it needs a key; SWITCHED OFF means its switch is off; NOT CONNECTED means the adapter is planned but not built; DISABLED means it is switched off by policy. A configured key is not proof that a provider works: the
        state comes from the answers to real requests. An error is shown until the next successful answer.
      </div>
    </div>
  );
}

const SWITCHES: { name: SettingName; help: string }[] = [
  { name: 'YAHOO_PRICES_ENABLED', help: 'Yahoo Finance prices, history and company data: unofficial, personal use. Off stops every request to Yahoo and its streaming socket.' },
  { name: 'KRAKEN_ENABLED', help: "Kraken's public market data for the crypto lines. Off hands them back to Yahoo, when Yahoo is on." },
];

function Switches({ report, onChange }: { report: ProviderReport | null; onChange: () => void }) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const flip = async (name: SettingName, value: boolean) => {
    const res = await window.arminDesktop!.providersSetting!(name, value);
    setMessages((m) => ({ ...m, [name]: res.ok ? 'Saved. Reload the window to apply it.' : (res.error ?? 'Not saved.') }));
    onChange();
  };
  return (
    <Section title="Switches">
      <table className="tbl">
        <tbody>
          {SWITCHES.map((w) => {
            const st = report?.settings?.[w.name];
            const fixed = st?.source === 'environment' || st?.source === '.env file';
            return (
              <tr key={w.name}>
                <td className="amber" style={{ whiteSpace: 'nowrap' }}>
                  {w.name}
                </td>
                <td>
                  <span className={`badge ${st?.value ? 'live' : 'sim'}`}>{st ? (st.value ? 'ON' : 'OFF') : '--'}</span> <span className="muted">{st?.source ? `from ${st.source}` : ''}</span>
                  <div className="faint">{w.help}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn" disabled={!st || fixed} title={fixed ? `Set by the ${st?.source}: change it there` : undefined} onClick={() => void flip(w.name, !st?.value)}>
                    {st?.value ? 'Switch off' : 'Switch on'}
                  </button>{' '}
                  {messages[w.name] ? (
                    <>
                      <span className="muted">{messages[w.name]}</span>{' '}
                      <button type="button" className="btn" onClick={() => window.location.reload()}>
                        Reload now
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

const CREDENTIALS: { name: Credential; help: string; secret: boolean; placeholder: string }[] = [
  { name: 'FRED_API_KEY', help: 'Free key from your FRED account (fredaccount.stlouisfed.org).', secret: true, placeholder: '32 lowercase letters and digits' },
  { name: 'SEC_USER_AGENT', help: 'The SEC asks every client to name itself and give a contact email it can reach, for example: Armin Terminal your-address@your-domain', secret: false, placeholder: 'Application name and your email' },
  { name: 'COINGECKO_API_KEY', help: "Free Demo key from your CoinGecko developer account: market value and supply of the listed coins, aggregated, with CoinGecko's attribution.", secret: true, placeholder: 'Demo API key' },
  { name: 'MASSIVE_API_KEY', help: 'Key from your Massive account; the free Stocks Basic plan gives end-of-day US data.', secret: true, placeholder: 'API key' },
];

function Credentials({ report, onChange }: { report: ProviderReport | null; onChange: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const save = async (name: Credential) => {
    const res = await window.arminDesktop!.providersSet!(name, values[name] ?? '');
    setMessages((m) => ({ ...m, [name]: res.ok ? 'Saved.' : (res.error ?? 'Not saved.') }));
    if (res.ok) setValues((v) => ({ ...v, [name]: '' }));
    if (res.ok && name === 'FRED_API_KEY') reloadFred();
    onChange();
  };
  const clear = async (name: Credential) => {
    await window.arminDesktop!.providersClear!(name);
    setMessages((m) => ({ ...m, [name]: 'Removed from this app (an environment variable still applies).' }));
    if (name === 'FRED_API_KEY') reloadFred();
    onChange();
  };
  return (
    <Section title="Credentials">
      <div className="note">
        Keys stay in the desktop app&apos;s main process: saved ones are encrypted with your system&apos;s key store, and no screen can read them back. An environment variable of the same name takes precedence.
      </div>
      <table className="tbl">
        <tbody>
          {CREDENTIALS.map((c) => {
            const st = report?.credentials[c.name];
            return (
              <tr key={c.name}>
                <td className="amber" style={{ whiteSpace: 'nowrap' }}>
                  {c.name}
                </td>
                <td>
                  {st?.configured ? (
                    <span className={`badge ${st.valid ? 'live' : 'hot'}`}>{st.valid ? 'CONFIGURED' : 'INVALID FORMAT'}</span>
                  ) : (
                    <span className="badge sim">NOT SET</span>
                  )}{' '}
                  <span className="muted">{st?.source ? `from ${st.source}` : ''}</span>
                  <div className="faint">{c.help}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <input
                    className="inp"
                    type={c.secret ? 'password' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={c.name}
                    placeholder={c.placeholder}
                    value={values[c.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void save(c.name);
                      e.stopPropagation();
                    }}
                    style={{ width: 260 }}
                  />{' '}
                  <button type="button" className="btn" disabled={!(values[c.name] ?? '').trim()} onClick={() => void save(c.name)}>
                    Save
                  </button>{' '}
                  <button type="button" className="btn danger" disabled={st?.source !== 'saved in this app'} onClick={() => void clear(c.name)}>
                    Remove
                  </button>
                  {messages[c.name] ? <div className="muted">{messages[c.name]}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
