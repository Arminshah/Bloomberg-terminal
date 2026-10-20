import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { fmtDateTime } from '../core/format';
import { useInterval } from '../data/market';
import { feedStatus } from '../data/live/status';
import { PROVIDERS, providersAvailable, providerState, useProviderReport, type Credential, type ProviderDef, type ProviderReport, type ProviderState, type SettingName } from '../data/providers';
import { reloadFred } from '../data/live/fred';
import { retryAnalysts } from '../data/live/analysts';
import { retryIex } from '../data/live/alpaca';
import { ResearchAccessCheck } from '../components/ResearchAccessCheck';
import { retryFinnhub } from '../data/live/finnhub';
import type { FnProps } from '../terminal/types';

const STATE_LABEL: Record<ProviderState, string> = {
  live: 'LIVE',
  connecting: 'CONNECTING',
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
  connecting: 'sim',
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
  return fmtDateTime(t);
}

/** The switch and key a provider depends on, and where their values come from. */
function Requirement({ p, report }: { p: ProviderDef; report: ProviderReport | null }) {
  if (!p.setting && !p.credential) return <span className="muted">no key needed</span>;
  const sw = p.setting ? report?.settings?.[p.setting] : undefined;
  return (
    <>
      {p.setting ? (
        <div title={sw?.label}>
          {p.setting} {sw ? (sw.value ? 'on' : 'off') : '--'}
          {sw?.source ? <span className="muted"> ({sw.source})</span> : null}
        </div>
      ) : null}
      {[p.credential, p.credential2].filter((c): c is Credential => !!c).map((c) => {
        const k = report?.credentials[c];
        return (
          <div key={c}>
            {c} {k?.configured ? (k.valid ? 'set' : 'set, wrong format') : 'not set'}
            {k?.source ? <span className="muted"> ({k.source})</span> : null}
          </div>
        );
      })}
    </>
  );
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
  // A key or switch changed: refresh the table, and let open screens ask again for what needed it.
  const changed = () => {
    refresh();
    retryAnalysts();
    retryFinnhub();
    retryIex();
  };
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
      {desktop && <SelfTest onDone={refresh} />}
      {report?.providers.finnhub?.lastErrorKind === 'not-entitled' && /401|invalid.*key/i.test(report.providers.finnhub.lastError ?? '') && <div className="note amber" role="status">Finnhub rejected its configured API key. Older builds could shorten some 40-character keys. Paste the complete REST API key from the Finnhub dashboard into its credential field again, then retry. Use the source shown here if an environment variable overrides the saved field.</div>}
      {desktop && <ResearchAccessCheck />}
      <Section title="Providers">
        <div className="provider-table-scroll" tabIndex={0} role="region" aria-label="Provider status and diagnostics">
        <table className="tbl zebra provider-table">
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
              <th className="num hide-m" title="Requests sent today (UTC), against the app's daily ceiling; the provider's own daily limit on hover">Today</th>
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
                  <td className="provider-description">{p.serves}</td>
                  <td className="hide-m muted provider-description">{p.dataClass}</td>
                  <td title={p.feed === 'stream' ? 'Direct WebSocket connection: state comes from socket events, not an HTTP request' : s?.lastAttemptAt ? new Date(s.lastAttemptAt).toISOString() : undefined}>{p.feed === 'stream' ? 'Socket events' : ago(s?.lastAttemptAt, now)}</td>
                  <td title={p.feed === 'stream' ? feeds.detail.stream : s?.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : undefined}>
                    {p.feed === 'stream' ? (feed === 'live' ? 'Connected' : '--') : ago(s?.lastSuccessAt, now)}
                    {s?.lastLatencyMs != null && s.lastSuccessAt ? <span className="muted"> · {s.lastLatencyMs} ms</span> : null}
                  </td>
                  <td className="hide-m" title={p.feed ? feeds.detail[p.feed] : undefined}>
                    {updated ? ago(updated, now) : '--'}
                  </td>
                  <td className="provider-description provider-problem" title={s?.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : undefined}>
                    {state === 'stale' && !errorIsLatest ? (
                      <>Stale data: no answer for {ago(s?.lastSuccessAt, now).replace(' ago', '')}</>
                    ) : p.feed === 'stream' && feed === 'error' ? (
                      feeds.detail.stream
                    ) : p.id === 'treasury' && feed === 'error' ? (
                      feeds.detail.rates
                    ) : s?.lastErrorAt ? (
                      <>
                        {!errorIsLatest && <span className="faint">Previous problem · </span>}
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
                  <td className="num hide-m" title={s?.dayLimit ? `The provider allows ${s.dayLimit} a day; the app stops at ${s.dayCap}` : undefined}>
                    {s?.today ?? '--'}
                    {s?.dayCap ? <span className={s.today != null && s.today >= s.dayCap * 0.9 ? 'dn' : 'muted'}> / {s.dayCap}</span> : null}
                  </td>
                  <td className="hide-m">
                    <details className="provider-terms"><summary>Terms &amp; source links</summary>
                    <span className="muted">{p.terms}</span>{' '}
                    {p.docs.map((d) => (
                      <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="amber" style={{ marginRight: 6 }}>
                        {d.label}
                      </a>
                    ))}
                    <span className="faint">checked {p.checked}</span>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Section>
      {desktop && <Switches report={report} onChange={changed} />}
      {desktop && <Credentials report={report} onChange={changed} />}
      <div className="note">
        States: LIVE and ANSWERING mean the provider answered its last request; the streaming row uses the actual socket connection, and its data time changes only when a trade update arrives. CONNECTING means a connection or initial load is pending. STALE means a provider the app asks continually has not answered for several rounds; NOT ASKED YET means no screen has needed it since the app started; NOT
        CONFIGURED means it needs a key; SWITCHED OFF means its switch is off; NOT CONNECTED means the adapter is planned but not built; DISABLED means it is switched off by policy. A configured key is not proof that a provider works: the
        state comes from the answers to real requests. An error is shown until the next successful answer.
      </div>
    </div>
  );
}

const SWITCHES: { name: SettingName; help: string }[] = [
  { name: 'YAHOO_PRICES_ENABLED', help: 'Yahoo Finance prices, history and company data, for personal use. Off stops every request to Yahoo and its streaming socket.' },
  { name: 'YAHOO_RESEARCH_ENABLED', help: 'Use Yahoo price targets, recommendation counts, rating actions and annual estimates when the primary research provider cannot supply them. Requires Yahoo enabled. Sources, retrieval times and unavailable fields stay explicit; target-history averages are not invented.' },
  { name: 'KRAKEN_ENABLED', help: "Kraken's public market data for the crypto lines. Off hands them back to Yahoo, when Yahoo is on." },
  { name: 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED', help: 'Twelve Data\'s free plan is for internal, non-display use. Switch this on only if your Twelve Data plan allows displaying its data; until then nothing is sent to Twelve Data.' },
  { name: 'MARKETWATCH_RSS_ENABLED', help: "MarketWatch's top stories feed on MARKETNEWS. Dow Jones's terms bar automated access to its content, RSS feeds included, without written consent: switch it on only if you accept that risk for your own use." },
  { name: 'FMP_ENABLED', help: 'Analyst price targets, ratings and estimates from Financial Modeling Prep (ANALYSTS, EARNINGS), while FMP_API_KEY is set. Off stops every request to FMP.' },
  { name: 'FINNHUB_ENABLED', help: 'Finnhub profiles/ratios fallback, monthly recommendations, quarterly EPS comparisons, next-report calendar and news. Use the REST API key, not the webhook secret.' },
  { name: 'TIPRANKS_ENABLED', help: 'TipRanks analyst consensus, average price target and rating actions on ANALYSTS, only when you click. Free plan: 50 calls a month for the whole account; the app stops at 45. Answers stay in memory for an hour, as TipRanks\' terms allow. Data by TipRanks.' },
  { name: 'EQUIBLES_ENABLED', help: 'Read-only Equibles company research on ANALYSTS. One estimate report can load as a fallback; other datasets are manual. Free account: 100 calls/day shared with REST/MCP clients. No trading or portfolio writes.' },
  { name: 'CLAUDE_HELPDESK_ENABLED', help: 'With ANTHROPIC_API_KEY set, Claude answers the help desk\'s questions (MESSAGES), reading prices, earnings, filings, analysts and news through the app\'s own sources. Your questions and the figures it looks up go to Anthropic. Off, or without the key, the built-in assistant answers.' },
  { name: 'MARKETAUX_ENABLED', help: 'Ticker-tagged news with sentiment from Marketaux, while MARKETAUX_API_TOKEN is set. Its free plan allows 100 requests a day.' },
  { name: 'ALPACA_ENABLED', help: "Alpaca's IEX quotes on QUOTE, and Benzinga's news through Alpaca on MARKETNEWS, COMPANYNEWS and QUOTE, while both Alpaca keys are set. Market data only: the app never calls a trading endpoint." },
  { name: 'ALPACA_IEX_PRICES_ENABLED', help: 'Use IEX-only prices for US stocks across watchlists and panels. Requires Alpaca enabled and both keys. Reload to apply. History is limited to the previous/current IEX bars and snapshots observed while the app is open; long Yahoo price history is not combined with this feed. IEX is one exchange, with its own volume and daily changes.' },
  { name: 'TIINGO_ENABLED', help: "Tiingo's end-of-day closes on CROSSCHECK, while TIINGO_API_KEY is set." },
  { name: 'YAHOO_RSS_ENABLED', help: "Yahoo Finance's headline feed for the stock on screen (COMPANYNEWS, QUOTE), any market Yahoo lists. No key. Yahoo's RSS terms allow showing the feed as given, with attribution and a link." },
  { name: 'EURONEXT_RSS_ENABLED', help: "Euronext's feed of the latest company press releases on MARKETNEWS. No key." },
  { name: 'GOOGLE_NEWS_RSS_ENABLED', help: "Google News's search for the day's market news (US and UK editions) on MARKETNEWS, and a search for the company on screen in its market's languages (COMPANYNEWS, QUOTE). No key. Google's feeds are for a personal feed reader, for personal, non-commercial use." },
  { name: 'MASSIVE_NEWS_ENABLED', help: "Massive's market and ticker news on MARKETNEWS and COMPANYNEWS, while MASSIVE_API_KEY is set. Its free plan's 5 calls a minute are shared with CROSSCHECK; switch this off to keep them for the closes." },
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
  { name: 'MASSIVE_API_KEY', help: 'Key from your Massive account; the free Stocks Basic plan gives end-of-day US data (CROSSCHECK).', secret: true, placeholder: 'API key' },
  { name: 'ALPHA_VANTAGE_API_KEY', help: 'Free key from alphavantage.co: 25 requests a day, personal non-commercial use. Fills past quarters\' expected revenue and EPS on EARNINGS (kept three days per company) and checks closes on CROSSCHECK.', secret: true, placeholder: 'API key' },
  { name: 'TWELVE_DATA_API_KEY', help: 'Key from your Twelve Data account (CROSSCHECK); nothing is sent until the TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED switch is on.', secret: true, placeholder: 'API key' },
  { name: 'TIINGO_API_KEY', help: 'Token from your Tiingo account: end-of-day closes for CROSSCHECK.', secret: true, placeholder: 'API token' },
  { name: 'FMP_API_KEY', help: 'FMP research key. A remaining daily quota does not unlock premium endpoints or all symbols; HTTP 402 means the request needs a different entitlement.', secret: true, placeholder: 'API key' },
  { name: 'FINNHUB_API_KEY', help: 'Paste the complete Finnhub REST API key. Older builds could shorten some 40-character keys: if requests return HTTP 401, save the full dashboard key again. The X-Finnhub-Secret webhook signing secret is separate.', secret: true, placeholder: 'Complete REST API key' },
  { name: 'EQUIBLES_API_KEY', help: 'Equibles dashboard API key for manual company research on ANALYSTS. Stored in the main process; no key is bundled in the app.', secret: true, placeholder: 'eq_…' },
  { name: 'MARKETAUX_API_TOKEN', help: 'Token from your Marketaux account: news tagged with tickers and sentiment. Free plan: 100 requests a day.', secret: true, placeholder: 'API token' },
  { name: 'ALPACA_API_KEY_ID', help: 'Key ID from your Alpaca account (paper keys start with PK): IEX quotes on QUOTE. Used for market data only, never for trading.', secret: true, placeholder: 'Key ID' },
  { name: 'ALPACA_API_SECRET_KEY', help: 'The secret that goes with the Alpaca key ID.', secret: true, placeholder: 'Secret key' },
  { name: 'ANTHROPIC_API_KEY', help: 'API key from console.anthropic.com for the Claude help desk (MESSAGES). Billed by Anthropic per use: a question costs about 1 to 8 requests to Claude Opus 5.5 ($4 per million tokens in, $20 out); the app stops at 400 requests a day.', secret: true, placeholder: 'sk-ant-…' },
  { name: 'TIPRANKS_API_KEY', help: 'TipRanks MCP key (tr_live_…) for analyst consensus, targets and rating actions on ANALYSTS. Each click costs one of the account\'s monthly calls (50 on the free plan).', secret: true, placeholder: 'tr_live_…' },
];

/** A list of keys pasted at once, in the form you keep them ("FINNHUB_API_KEY: …", "Tiingo.com: …"). */
function ImportKeys({ onChange }: { onChange: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<string>('');
  const run = async () => {
    try {
      const res = await window.arminDesktop!.providersImport!(text);
      if (!res.ok) setResult(res.error ?? 'Nothing was saved.');
      else {
        // Lines that name no provider (headings, instructions, a webhook URL) are counted, not listed.
        const unnamed = res.skipped.filter((x) => !x.name && x.reason === 'no provider named').length;
        const skipped = res.skipped.filter((x) => x.name || x.reason !== 'no provider named').map((x) => `${x.line ? `line ${x.line}${x.name ? ` (${x.name})` : ''}` : x.name}: ${x.reason}`);
        const notes = (res.notes ?? []).map((x) => `${x.name}: ${x.note}`);
        setResult(
          [
            res.saved.length ? `Saved ${res.saved.length}: ${res.saved.join(', ')}.` : 'Nothing was saved.',
            ...notes.map((n) => `Note: ${n}.`),
            ...skipped.map((n) => `Not saved, ${n}.`),
            unnamed ? `${unnamed} other line${unnamed === 1 ? '' : 's'} named no provider and ${unnamed === 1 ? 'was' : 'were'} ignored.` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
        if (res.saved.includes('FRED_API_KEY')) reloadFred();
      }
    } catch {
      setResult('Nothing was saved: the text was refused (at most 10,000 characters).');
    } finally {
      // The text is cleared either way: the keys live only in the main process.
      setText('');
    }
    onChange();
  };
  return (
    <div className="pad">
      <div className="faint">
        Paste several keys at once, one per line, as you keep them: the variable name or the provider&apos;s name, then the key. Each recognised key is checked and saved like the fields below; nothing is shown back.
      </div>
      <textarea
        className="inp"
        aria-label="Keys to save"
        autoComplete="off"
        spellCheck={false}
        rows={5}
        style={{ width: '100%', fontFamily: 'inherit', WebkitTextSecurity: 'disc' } as React.CSSProperties}
        value={text}
        placeholder={'FINNHUB_API_KEY: …\nTiingo.com: …\nALPACA_API_SECRET_KEY = …'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => void run()}>
        Save these keys
      </button>
      {result ? (
        <div className="muted" style={{ whiteSpace: 'pre-line' }}>
          {result}
        </div>
      ) : null}
    </div>
  );
}

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
      <ImportKeys onChange={onChange} />
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

type SelfTestRun = Awaited<ReturnType<NonNullable<NonNullable<Window['arminDesktop']>['providersSelfTest']>>>;

/**
 * Tries every source once, from this computer and with the saved keys, and shows what each answered. The
 * report can be copied and sent to whoever looks into a problem: it holds no key and no URL.
 */
function SelfTest({ onDone }: { onDone: () => void }) {
  const [run, setRun] = useState<SelfTestRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const go = async () => {
    setBusy(true);
    setCopied('');
    try {
      setRun(await window.arminDesktop!.providersSelfTest!());
    } finally {
      setBusy(false);
      onDone();
    }
  };
  const copy = async () => {
    if (!run) return;
    try {
      await navigator.clipboard.writeText(run.report);
      setCopied('Copied.');
    } catch {
      setCopied('Could not copy: select the text below instead.');
    }
  };
  const passed = run?.results.filter((r) => r.state === 'pass').length ?? 0;
  const failed = run?.results.filter((r) => r.state === 'fail').length ?? 0;
  return (
    <Section title="Self-test" right={run ? `${passed} passed, ${failed} failed` : undefined}>
      <div className="pad">
        <button type="button" className="btn primary" disabled={busy || !window.arminDesktop?.providersSelfTest} onClick={() => void go()}>
          {busy ? 'Testing every source…' : 'Test every source'}
        </button>{' '}
        {run ? (
          <button type="button" className="btn" onClick={() => void copy()}>
            Copy report
          </button>
        ) : null}{' '}
        <span className="muted">{copied || 'One small request to each source with your keys, from this computer. Takes up to a minute. The report has no keys in it.'}</span>
      </div>
      {run ? (
        <>
          <table className="tbl zebra">
            <thead>
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th className="num">HTTP</th>
                <th className="num">ms</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map((r) => (
                <tr key={r.id}>
                  <td className="white">{r.label}</td>
                  <td className={r.state === 'pass' ? 'up' : r.state === 'fail' ? 'dn' : 'muted'}>{r.state === 'pass' ? 'PASS' : r.state === 'fail' ? 'FAIL' : r.state === 'off' ? 'OFF' : 'SKIPPED'}</td>
                  <td className="num">{r.status || ''}</td>
                  <td className="num">{r.ms ?? ''}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <textarea className="inp" readOnly aria-label="Self-test report" rows={6} style={{ width: '100%', fontFamily: 'inherit' }} value={run.report} onKeyDown={(e) => e.stopPropagation()} />
        </>
      ) : null}
    </Section>
  );
}
