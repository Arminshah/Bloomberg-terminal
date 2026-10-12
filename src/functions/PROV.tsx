import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { useInterval } from '../data/market';
import { feedStatus } from '../data/live/status';
import { PROVIDERS, providersAvailable, providerState, useProviderReport, type Credential, type ProviderReport, type ProviderState } from '../data/providers';
import { reloadFred } from '../data/live/fred';
import type { FnProps } from '../terminal/types';

const STATE_LABEL: Record<ProviderState, string> = {
  live: 'LIVE',
  ok: 'ANSWERING',
  idle: 'NOT ASKED YET',
  error: 'ERROR',
  'not-configured': 'NOT CONFIGURED',
  planned: 'NOT CONNECTED',
  disabled: 'DISABLED',
};

const STATE_CLASS: Record<ProviderState, string> = {
  live: 'live',
  ok: 'live',
  idle: 'sim',
  error: 'hot',
  'not-configured': 'sim',
  planned: 'sim',
  disabled: 'sim',
};

const KIND_LABEL: Record<string, string> = {
  timeout: 'timed out',
  network: 'network error',
  'not-entitled': 'refused (not entitled or blocked)',
  'rate-limited': 'rate limited',
  'provider-error': 'provider error',
  'no-data': 'no data',
  'schema-changed': 'format changed',
  'missing-credentials': 'missing credentials',
};

/** "12 s ago", "4 min ago", or the time of day for older events. */
function ago(t: number | null | undefined, now: number): string {
  if (!t) return '--';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString();
}

/**
 * PROV: every data provider with its state, what it serves, the kind of data
 * it is, its recent requests and errors, and the official pages its terms come
 * from. Credentials are entered here and kept by the desktop app's main process.
 */
export function PROV(_: FnProps) {
  useInterval(1000);
  const [report, refresh] = useProviderReport();
  const feeds = feedStatus.use((f) => f);
  const now = Date.now();
  const desktop = providersAvailable();
  return (
    <div>
      <FnHeader code="PROV" title="Data Providers & Status" sub={desktop ? 'What each source serves, how it is doing, and the terms that apply' : 'Desktop app only: this browser build has no backend to reach the providers'} />
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
              <th>Serves</th>
              <th className="hide-m">Data</th>
              <th>Last answer</th>
              <th>Last problem</th>
              <th className="num hide-m">Requests, last min</th>
              <th className="hide-m">Terms and official pages</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDERS.map((p) => {
              const s = report?.providers[p.id];
              const state = desktop || !p.desktop ? providerState(p, report, p.feed ? feeds[p.feed] : undefined) : p.policy === 'disabled' ? 'disabled' : 'idle';
              return (
                <tr key={p.id}>
                  <td className="amber">{p.name}</td>
                  <td>
                    <span className={`badge ${STATE_CLASS[state]}`}>{desktop || !p.desktop ? STATE_LABEL[state] : 'DESKTOP ONLY'}</span>
                  </td>
                  <td>{p.serves}</td>
                  <td className="hide-m muted">{p.dataClass}</td>
                  <td title={s?.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : undefined}>{ago(s?.lastSuccessAt, now)}</td>
                  <td title={s?.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : undefined}>
                    {s?.lastErrorAt ? (
                      <>
                        {KIND_LABEL[s.lastErrorKind ?? ''] ?? s.lastErrorKind}: <span className="muted">{s.lastError}</span> ({ago(s.lastErrorAt, now)})
                      </>
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
      {desktop && <Credentials report={report} onChange={refresh} />}
      <div className="note">
        States: LIVE and ANSWERING mean the provider answered its last request; NOT ASKED YET means no screen has needed it since the app started; NOT CONFIGURED means it needs a key; NOT CONNECTED means the adapter is planned but not built; DISABLED means it is switched off by policy. An error is shown until the next successful answer.
      </div>
    </div>
  );
}

const CREDENTIALS: { name: Credential; help: string; secret: boolean; placeholder: string }[] = [
  { name: 'FRED_API_KEY', help: 'Free key from your FRED account (fredaccount.stlouisfed.org).', secret: true, placeholder: '32 lowercase letters and digits' },
  { name: 'MASSIVE_API_KEY', help: 'Key from your Massive account; the free Stocks Basic plan gives end-of-day US data.', secret: true, placeholder: 'API key' },
  { name: 'SEC_USER_AGENT', help: 'The SEC asks every client to name itself and give a contact email it can reach, for example: Armin Terminal your-address@your-domain', secret: false, placeholder: 'Application name and your email' },
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
