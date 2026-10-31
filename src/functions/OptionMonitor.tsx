import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect } from '../components/CalcInputs';
import { DataTable, type Column } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { fmtInt, fmtNum, fmtSigned, zonedToUtc } from '../core/format';
import { engine, useInterval, useTick } from '../data/market';
import { optionAge, useOptionChain, type OptionSnapshot } from '../data/live/option-chain';
import { useNasdaqChain } from '../data/live/nasdaq-options';
import { equityExpiryTimestamp, expiryLabel } from '../data/options';
import { chainImplied, standardRoot, type ContractImplied } from '../finance/option-chain-analytics';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type Pair = { key: string; expiry: string; root: string; strike: number; call?: OptionSnapshot; put?: OptionSnapshot };

type Source = 'nasdaq' | 'alpaca';

/** Actual contract quotes; never fills missing quotes with a model chain. Nasdaq's composite chain first, Alpaca's indicative feed on request. */
export function OptionMonitor(props: FnProps) {
  const nasdaq = typeof window !== 'undefined' && !!window.arminDesktop?.nasdaqOptions;
  const [source, setSource] = useState<Source>(nasdaq ? 'nasdaq' : 'alpaca');
  const picker = <CalcSelect label="Source" value={source} onChange={(v) => setSource(v as Source)}>
    <option value="nasdaq">Nasdaq composite (delayed)</option><option value="alpaca">Alpaca indicative</option>
  </CalcSelect>;
  return source === 'nasdaq' ? <NasdaqMonitor {...props} picker={picker} /> : <AlpacaMonitor {...props} picker={picker} />;
}

function AlpacaMonitor({ sec, picker }: FnProps & { picker: ReactNode }) {
  const s = sec!;
  const panel = usePanelId();
  const [expiryInput, setExpiryInput] = useState('');
  const [requestExpiry, setRequestExpiry] = useState('');
  const [shownExpiry, setShownExpiry] = useState('');
  const [view, setView] = useState(1);
  const [page, setPage] = useState(0);
  const { symbol, available, result, refresh } = useOptionChain(s, requestExpiry);
  useInterval(30_000); // Age the source events without repainting thousands of cells every second.
  const rows = result.contracts.filter((c) => !shownExpiry || c.expiry === shownExpiry);
  const pairs = new Map<string, Pair>();
  for (const c of rows) {
    const key = `${c.expiry}:${c.root}:${c.strike}`;
    const pair = pairs.get(key) ?? { key, expiry: c.expiry, root: c.root, strike: c.strike };
    if (c.type === 'C') pair.call = c; else pair.put = c;
    pairs.set(key, pair);
  }
  const paired = [...pairs.values()].sort((a, b) => a.expiry.localeCompare(b.expiry) || a.root.localeCompare(b.root) || a.strike - b.strike);
  const count = view === 1 ? paired.length : rows.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(count / 100) - 1));
  const offset = currentPage * 100;
  const quote = (c: OptionSnapshot | undefined, field: 'bid' | 'ask' | 'last') => {
    const age = optionAge(c ? field === 'last' ? c.tradeAt : c.quoteAt : NaN);
    return <span className={c && age.startsWith('STALE') ? 'stale-px' : undefined} title={c ? `${c.symbol} · ${field === 'last' ? 'delayed trade' : 'indicative quote'} · ${age} · source ${Number.isFinite(field === 'last' ? c.tradeAt : c.quoteAt) ? new Date(field === 'last' ? c.tradeAt : c.quoteAt).toISOString() : 'unknown'}` : undefined}>{fmtNum(c?.[field] ?? NaN, 2)}</span>;
  };
  const columns: Column<Pair>[] = [
    { key: 'expiry', label: 'Expiry', render: (p) => p.expiry, sort: (p) => p.expiry },
    { key: 'root', label: 'Root', render: (p) => p.root, sort: (p) => p.root },
    ...(['bid', 'ask', 'last'] as const).map((field): Column<Pair> => ({ key: `c-${field}`, label: `Call ${field}`, num: true, render: (p) => quote(p.call, field), sort: (p) => p.call?.[field] ?? NaN })),
    { key: 'c-iv', label: 'Call IV %', num: true, render: (p) => fmtNum((p.call?.iv ?? NaN) * 100, 2), sort: (p) => p.call?.iv ?? NaN },
    { key: 'strike', label: 'Strike', num: true, cls: () => 'amber', render: (p) => fmtNum(p.strike, 3), sort: (p) => p.strike },
    { key: 'p-iv', label: 'Put IV %', num: true, render: (p) => fmtNum((p.put?.iv ?? NaN) * 100, 2), sort: (p) => p.put?.iv ?? NaN },
    ...(['bid', 'ask', 'last'] as const).map((field): Column<Pair> => ({ key: `p-${field}`, label: `Put ${field}`, num: true, render: (p) => quote(p.put, field), sort: (p) => p.put?.[field] ?? NaN })),
  ];
  const greekColumns: Column<OptionSnapshot>[] = [
    { key: 'symbol', label: 'Contract', render: (c) => c.symbol, sort: (c) => c.symbol },
    { key: 'iv', label: 'Provider IV %', num: true, render: (c) => fmtNum(c.iv * 100, 2), sort: (c) => c.iv },
    ...(['delta', 'gamma', 'theta', 'vega', 'rho'] as const).map((field): Column<OptionSnapshot> => ({ key: field, label: `Provider ${field}`, num: true, render: (c) => fmtNum(c[field], 5), sort: (c) => c[field] })),
    { key: 'quoteAt', label: 'Indicative quote age', render: (c) => optionAge(c.quoteAt), sort: (c) => c.quoteAt },
    { key: 'tradeAt', label: 'Delayed trade age', render: (c) => optionAge(c.tradeAt), sort: (c) => c.tradeAt },
  ];
  const iso = (at: number) => Number.isFinite(at) ? new Date(at).toISOString() : '';
  const exportRows = () => [
    ['Source', 'Alpaca indicative options; indicative quotes and delayed trades, not OPRA or executable prices'],
    ['Underlying', symbol], ['Requested expiry', requestExpiry || 'All'], ['Shown expiry', shownExpiry || 'All loaded'],
    ['Partial', result.partial ? 'yes' : 'no'], ['Stale response', result.stale ? 'yes' : 'no'], ['Pages', result.pages], ['Rejected records', result.rejected], ['Oldest page retrieved', result.at ? iso(result.at) : ''],
    ['Contract', 'Root', 'Expiry', 'Type', 'Strike', 'Indicative bid', 'Indicative ask', 'Bid size (provider units)', 'Ask size (provider units)', 'Quote source time', 'Delayed last', 'Trade size (provider units)', 'Trade source time', 'Provider IV decimal', 'Provider delta', 'Provider gamma', 'Provider theta', 'Provider vega', 'Provider rho'],
    ...rows.map((c) => [c.symbol, c.root, c.expiry, c.type, c.strike, c.bid, c.ask, c.bidSize, c.askSize, iso(c.quoteAt), c.last, c.lastSize, iso(c.tradeAt), c.iv, c.delta, c.gamma, c.theta, c.vega, c.rho]),
  ];
  return <div>
    <FnHeader code="OPTIONS" title="Option Monitor" sec={s} sub="Alpaca indicative feed · listed US equity contracts"
      tabs={[{ n: 1, label: 'Chain' }, { n: 2, label: 'Greeks & times' }]} tab={view} onTab={(n) => { setView(n); setPage(0); }}
      actions={[{ n: 3, label: 'Refresh', onClick: refresh }, { n: 4, label: 'Strategy', onClick: () => execute(panel, `${s.id} OPTIONSTRATEGY`) }, ...(rows.length ? exportActions(panel, 'option-chain.csv', exportRows) : [])]} />
    <div className="pad-s muted"><span className="badge">INDICATIVE</span> Indicative quotes and delayed trades from Alpaca. These are not OPRA consolidated or executable prices. IV and Greeks are provider fields; missing fields stay blank. Open interest and daily option volume are not supplied by this endpoint.</div>
    {!available || !symbol ? <><div className="chart-tools">{picker}</div><div className="pad amber" role="status">{!available ? 'Option snapshots need the desktop app and both Alpaca keys on PROVIDERS.' : "Alpaca's feed covers US-listed equities, not this underlying."}</div></> : <>
      <form className="chart-tools" onSubmit={(event) => { event.preventDefault(); setShownExpiry(''); setPage(0); if (expiryInput === requestExpiry) refresh(); else setRequestExpiry(expiryInput); }}>
        {picker}
        <CalcInput label="Request expiry (optional)" type="date" value={expiryInput} onChange={setExpiryInput} />
        <button className="btn" type="submit">Load chain</button>
        <CalcSelect label="Shown expiry" value={shownExpiry} onChange={(v) => { setShownExpiry(v); setPage(0); }}><option value="">All loaded</option>{[...new Set(result.contracts.map((c) => c.expiry))].sort().map((e) => <option key={e} value={e}>{e}</option>)}</CalcSelect>
        <span className="muted">{result.contracts.length} contracts · {result.pages} pages{result.at ? ` · retrieved ${new Date(result.at).toLocaleTimeString()}` : ''}</span>
      </form>
      {result.state === 'ok' && count > 100 && <div className="chart-tools">
        <button className="btn" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous rows</button>
        <span className="muted">Rows {offset + 1}–{Math.min(offset + 100, count)} of {count}</span>
        <button className="btn" type="button" disabled={offset + 100 >= count} onClick={() => setPage(currentPage + 1)}>Next rows</button>
      </div>}
      {(result.partial || result.stale || result.message || !!result.rejected) && <div className="pad-s amber" role="status">{result.partial ? 'PARTIAL CHAIN. ' : ''}{result.stale ? 'STALE RESPONSE. ' : ''}{result.message} {result.rejected ? `${result.rejected} malformed, unrelated or mismatched records omitted.` : ''}</div>}
      {result.state === 'loading' ? <div className="pad muted" role="status">Loading indicative option snapshots…</div> : result.state !== 'ok' ? <div className="pad amber">Use PROVIDERS to check credentials, the Alpaca switch and any entitlement error, then refresh.</div> :
        <div className="pad-s" style={{ overflowX: 'auto' }} data-testid="option-chain">{view === 1 ? <DataTable rows={paired} page={{ index: currentPage, size: 100 }} rowKey={(p) => p.key} columns={columns} empty="No contracts returned for this underlying and expiry." /> : <DataTable rows={rows} page={{ index: currentPage, size: 100 }} rowKey={(c) => c.symbol} columns={greekColumns} empty="No contracts returned." />}</div>}
    </>}
    <p className="pad-s muted">Refresh is manual; each request follows at most five pages. Tables show 100 rows per page; sorting and CSV cover all filtered records. Expiry choices reflect loaded records only. Request an exact date if partial. Adjusted roots remain separate; multipliers/deliverables are not inferred. Provider access depends on account entitlement.</p>
  </div>;
}

/** The Treasury par curve the app carries (end of day): the discount rate for each expiry, as OMON's "R". */
const TENORS: [number, string][] = [[0.25, 'USGG3M Index'], [0.5, 'USGG6M Index'], [1, 'USGG12M Index'], [2, 'USGG2YR Index'], [3, 'USGG3YR Index'],
  [5, 'USGG5YR Index'], [7, 'USGG7YR Index'], [10, 'USGG10YR Index'], [20, 'USGG20YR Index'], [30, 'USGG30YR Index']];
const treasuryCurve = () => TENORS.map(([years, id]) => ({ years, pct: !engine.realOnly || engine.isExternal(id) ? engine.quote(id)?.last ?? NaN : NaN }));

/** NDX's monthly options settle on the opening prints of expiry day (its PM-settled weeklies are NDXP); the rest at the close. */
export function optionExpiryAt(expiry: string, root: string): number {
  if (root !== 'NDX') return equityExpiryTimestamp(expiry);
  const [y, m, d] = expiry.split('-').map(Number);
  return zonedToUtc(y, m - 1, d, 9, 30, 'America/New_York');
}

/**
 * When the quotes are from. Nasdaq gives only the underlying's "as of" date: on a later day the quotes are that
 * session's close; on the day itself, no later than when they arrived.
 */
export function quotesTime(underlying: { asOf?: string; time?: string }, received: number): number {
  if (!underlying.asOf) return received;
  const [y, m, d] = underlying.asOf.split('-').map(Number);
  const [hh, mm] = underlying.time ? underlying.time.split(':').map(Number) : [16, 0];
  const stamp = zonedToUtc(y, m - 1, d, hh, mm, 'America/New_York');
  return Number.isFinite(received) ? Math.min(received, stamp) : stamp;
}

/** OMON's ticker: root, expiry as MM/DD/YY, C or P and the strike ("MSFT 11/20/26 C472.5"). */
export const optionTicker = (c: { root: string; expiry: string; type: string; strike: number }) =>
  `${c.root} ${c.expiry.slice(5, 7)}/${c.expiry.slice(8, 10)}/${c.expiry.slice(2, 4)} ${c.type}${+c.strike.toFixed(3)}`;

type Side = { c?: OptionSnapshot; implied?: ContractImplied };
type Line = { strike: number; call: Side; put: Side };

function NasdaqMonitor({ sec, picker }: FnProps & { picker: ReactNode }) {
  const s = sec!;
  const panel = usePanelId();
  const [view, setView] = useState(1);
  const [expiry, setExpiry] = useState('');
  const [strikes, setStrikes] = useState('10');
  const [center, setCenter] = useState('');
  const { symbol, available, result, refresh } = useNasdaqChain(s, true);
  // The Treasury curve can arrive after the chain; a look every five seconds picks it up.
  useTick(5);
  const valuedAt = result.at ? quotesTime(result.underlying, result.at) : NaN;
  const curveKey = treasuryCurve().map((p) => p.pct).join(',');
  const implied = useMemo(() => chainImplied(result.contracts, { underlying: symbol ?? '', valuedAt, spot: result.underlying.price, curve: treasuryCurve(), expiryAt: optionExpiryAt }),
    [result.contracts, symbol, valuedAt, result.underlying.price, curveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const out = new Map<string, OptionSnapshot[]>();
    for (const c of result.contracts) out.set(`${c.expiry}|${c.root}`, [...(out.get(`${c.expiry}|${c.root}`) ?? []), c]);
    return [...out].sort(([a], [b]) => a.localeCompare(b));
  }, [result.contracts]);
  const expiryKeys = groups.map(([k]) => k);
  const shown = expiry === 'all' ? expiryKeys : [expiryKeys.includes(expiry) ? expiry : expiryKeys.find((k) => Number.isFinite(implied.expiries.find((e) => e.key === k)?.forward)) ?? expiryKeys[0]].filter(Boolean);
  const byKey = new Map(implied.expiries.map((e) => [e.key, e]));
  const lines = (key: string): Line[] => {
    const list = groups.find(([k]) => k === key)?.[1] ?? [];
    const at = new Map<number, Line>();
    for (const c of list) {
      const line = at.get(c.strike) ?? { strike: c.strike, call: {}, put: {} };
      line[c.type === 'C' ? 'call' : 'put'] = { c, implied: implied.contracts.get(c.symbol) };
      at.set(c.strike, line);
    }
    const all = [...at.values()].sort((a, b) => a.strike - b.strike);
    const count = strikes === 'all' ? all.length : Number(strikes);
    if (all.length <= count) return all;
    // Centred on the strike you give, else the one nearest the implied forward, else the underlying's price.
    const typed = Number(center);
    const pivot = center.trim() && typed > 0 ? typed : Number.isFinite(byKey.get(key)?.forward ?? NaN) ? byKey.get(key)!.forward : result.underlying.price;
    if (!Number.isFinite(pivot)) return all.slice(0, count);
    const nearest = all.reduce((best, l, k) => Math.abs(l.strike - pivot) < Math.abs(all[best].strike - pivot) ? k : best, 0);
    const start = Math.max(0, Math.min(all.length - count, nearest - Math.floor(count / 2)));
    return all.slice(start, start + count);
  };
  const heading = (key: string) => {
    const e = byKey.get(key);
    const [exp, root] = key.split('|');
    const standard = standardRoot(root, symbol ?? '');
    const parts = [`${expiryLabel(optionExpiryAt(exp, root), valuedAt)}`];
    if (root !== symbol?.replace(/\./g, '')) parts[0] += ` ${root}`;
    if (standard) parts.push('CSize 100');
    if (e && Number.isFinite(e.ratePct)) parts.push(`R ${fmtNum(e.ratePct, 2)}`);
    if (e && Number.isFinite(e.forward)) parts.push(`IFwd ${fmtNum(e.forward, 2)}`);
    return parts.join('; ');
  };
  const cell = (v: number, dec: number) => fmtNum(v, dec);
  const sideCells = (side: Side, which: 'chain' | 'greeks') => which === 'chain' ? [
    <td key="t">{side.c ? optionTicker(side.c) : ''}</td>,
    <td key="b" className="num">{cell(side.c?.bid ?? NaN, 2)}</td>,
    <td key="a" className="num">{cell(side.c?.ask ?? NaN, 2)}</td>,
    <td key="l" className="num">{cell(side.c?.last ?? NaN, 2)}</td>,
    <td key="i" className="num">{cell((side.implied?.iv ?? NaN) * 100, 2)}</td>,
    <td key="v" className="num">{fmtInt(side.c?.volume ?? NaN)}</td>,
    <td key="o" className="num">{fmtInt(side.c?.openInterest ?? NaN)}</td>,
  ] : [
    <td key="t">{side.c ? optionTicker(side.c) : ''}</td>,
    <td key="i" className="num">{cell((side.implied?.iv ?? NaN) * 100, 2)}</td>,
    <td key="d" className="num">{cell(side.implied?.delta ?? NaN, 3)}</td>,
    <td key="g" className="num">{cell(side.implied?.gamma ?? NaN, 4)}</td>,
    <td key="v" className="num">{cell(side.implied?.vega ?? NaN, 3)}</td>,
    <td key="c" className="num">{fmtSigned(side.c?.change ?? NaN, 2)}</td>,
  ];
  const sideHeads = view === 1 ? ['Ticker', 'Bid', 'Ask', 'Last', 'IVM', 'Volm', 'OInt'] : ['Ticker', 'IVM', 'DM', 'Gamma', 'Vega', 'Chg'];
  const width = 2 * (sideHeads.length + 1);
  const iso = (t: number) => Number.isFinite(t) ? new Date(t).toISOString() : '';
  const exportRows = () => [
    ['Source', 'Nasdaq option chain: composite quotes from all US option exchanges, delayed; Nasdaq states no quote time'],
    ['Underlying', symbol ?? '', 'Last', result.underlying.price, 'As of', result.underlying.asOf ?? ''],
    ['Retrieved', iso(result.at ?? NaN), 'Quotes taken as of', iso(valuedAt)],
    ['IVM, delta, gamma, vega', "The app's calculation: Black's formula on the expiry's implied forward (put-call parity at the money), discounted at the Treasury par yield for the maturity"],
    ['Expiry', 'Root', 'Years', 'Treasury par yield %', 'Discount factor', 'Implied forward', 'Pairs used'],
    ...implied.expiries.map((e) => [e.expiry, e.root, e.years, e.ratePct, e.discount, e.forward, e.pairs]),
    ['Contract', 'Root', 'Expiry', 'Type', 'Strike', 'Bid', 'Ask', 'Last', 'Change', 'Volume', 'Open interest', 'IVM decimal', 'Delta', 'Gamma', 'Vega per vol point'],
    ...result.contracts.map((c) => { const x = implied.contracts.get(c.symbol); return [c.symbol, c.root, c.expiry, c.type, c.strike, c.bid, c.ask, c.last, c.change, c.volume, c.openInterest, x?.iv ?? NaN, x?.delta ?? NaN, x?.gamma ?? NaN, x?.vega ?? NaN]; }),
  ];
  const totals = (type: 'C' | 'P', field: 'volume' | 'openInterest') => result.contracts.filter((c) => c.type === type && shown.includes(`${c.expiry}|${c.root}`)).reduce((t, c) => t + (Number.isFinite(c[field]) ? c[field]! : 0), 0);
  return <div>
    <FnHeader code="OPTIONS" title="Option Monitor" sec={s} sub="Nasdaq composite option quotes · delayed"
      tabs={[{ n: 1, label: 'Calls/Puts' }, { n: 2, label: 'Greeks' }]} tab={view} onTab={setView}
      actions={[{ n: 3, label: 'Refresh', onClick: refresh }, { n: 4, label: 'Strategy', onClick: () => execute(panel, `${s.id} OPTIONSTRATEGY`) }, ...(result.contracts.length ? exportActions(panel, 'option-chain.csv', exportRows) : [])]} />
    <div className="pad-s muted"><span className="badge">DELAYED</span> Composite bid, ask and last from all US option exchanges, as nasdaq.com shows them; Nasdaq gives no time for the quotes. Volm is the day's volume, OInt the open interest at the start of the day. IVM, DM, gamma and vega are the app's calculation from each contract's mid.</div>
    <form className="chart-tools" onSubmit={(event) => { event.preventDefault(); refresh(); }}>
      {picker}
      <CalcSelect label="Expiry" value={shown.length === 1 && expiry !== 'all' ? shown[0] : expiry} onChange={setExpiry}>
        {expiryKeys.map((k) => { const [exp, root] = k.split('|'); return <option key={k} value={k}>{expiryLabel(optionExpiryAt(exp, root), valuedAt)}{root !== symbol?.replace(/\./g, '') ? ` ${root}` : ''}</option>; })}<option value="all">All expiries</option>
      </CalcSelect>
      <CalcSelect label="Strikes" value={strikes} onChange={setStrikes}>{['6', '10', '16', '20', '30'].map((n) => <option key={n} value={n}>{n}</option>)}<option value="all">All</option></CalcSelect>
      <CalcInput label="Center strike" value={center} onChange={setCenter} placeholder="at the money" />
      <button className="btn" type="submit">Refresh</button>
      <span className="muted">{symbol ? `${symbol} ${fmtNum(result.underlying.price, 2)}${result.underlying.asOf ? ` as of ${result.underlying.asOf}` : ''}` : ''}{result.at ? ` · retrieved ${new Date(result.at).toLocaleTimeString()}` : ''}</span>
    </form>
    {!available ? <div className="pad amber" role="status">Option chains need the desktop app.</div>
      : !symbol ? <div className="pad amber" role="status">Nasdaq lists options for US stocks and ETFs and for the NDX and XND indices, not for this security. SPX, RUT and VIX options are Cboe's, whose terms forbid automated download.</div>
        : result.state === 'loading' ? <div className="pad muted" role="status">Loading the option chain from Nasdaq…</div>
          : result.state !== 'ok' ? <div className="pad amber" role="status">{result.message}</div> : <>
            {(result.stale || !!result.rejected) && <div className="pad-s amber" role="status">{result.stale ? `STALE RESPONSE. ${result.message ?? ''} ` : ''}{result.rejected ? `${result.rejected} rows whose link and strike disagree were left out.` : ''}</div>}
            {!implied.expiries.some((e) => Number.isFinite(e.ratePct)) && <div className="pad-s amber" role="status">No Treasury par yield in the app yet, so IVM and the Greeks stay blank.</div>}
            <div className="pad-s" style={{ overflowX: 'auto' }}>
              <table className="tbl omon" data-testid="nasdaq-chain">
                <thead>
                  <tr><th colSpan={width / 2}>Calls</th><th colSpan={width / 2}>Puts</th></tr>
                  <tr>{[...['Strike', ...sideHeads], ...['Strike', ...sideHeads]].map((h, k) => <th key={k} className={h === 'Ticker' ? undefined : 'num'}>{h}</th>)}</tr>
                </thead>
                {shown.map((key) => <tbody key={key}>
                  <tr className="group"><td colSpan={width}>{heading(key)}</td></tr>
                  {lines(key).map((l) => <tr key={l.strike}>
                    <td className="num amber">{fmtNum(l.strike, 2)}</td>{sideCells(l.call, view === 1 ? 'chain' : 'greeks')}
                    <td className="num amber">{fmtNum(l.strike, 2)}</td>{sideCells(l.put, view === 1 ? 'chain' : 'greeks')}
                  </tr>)}
                </tbody>)}
              </table>
            </div>
            <div className="pad-s muted" data-testid="chain-totals">Shown expiries: call volume {fmtInt(totals('C', 'volume'))}, put volume {fmtInt(totals('P', 'volume'))}, put/call {fmtNum(totals('P', 'volume') / totals('C', 'volume'), 2)}; call open interest {fmtInt(totals('C', 'openInterest'))}, put open interest {fmtInt(totals('P', 'openInterest'))}.</div>
          </>}
    <p className="pad-s muted">IVM: the volatility at which Black's formula, on the expiry's implied forward and discounted at the Treasury par yield (R) for its maturity, gives the mid. The implied forward (IFwd) is put-call parity at the three strikes nearest the money, so it carries the dividends and borrow the market expects. These are European values: close to other vendors' out of the money, less reliable deep in the money, where spreads are widest and early exercise of an American contract has value. DM and gamma are per unit of the underlying at its last price; vega per volatility point. Adjusted roots (deliverables other than 100 shares) are listed without IVM or CSize. Quotes are taken as of the underlying's date: the close on a later day.</p>
  </div>;
}
