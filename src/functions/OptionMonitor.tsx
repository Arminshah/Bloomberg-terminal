import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { CalcInput, CalcSelect } from '../components/CalcInputs';
import { DataTable, type Column } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { fmtNum } from '../core/format';
import { useInterval } from '../data/market';
import { optionAge, useOptionChain, type OptionSnapshot } from '../data/live/option-chain';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type Pair = { key: string; expiry: string; root: string; strike: number; call?: OptionSnapshot; put?: OptionSnapshot };

/** Actual contract snapshots when configured; never fills missing quotes with a model chain. */
export function OptionMonitor({ sec }: FnProps) {
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
    <QuoteStrip sec={s} />
    <div className="pad-s muted"><span className="badge">INDICATIVE</span> Indicative quotes and delayed trades from Alpaca. These are not OPRA consolidated or executable prices. IV and Greeks are provider fields; missing fields stay blank. Open interest and daily option volume are not supplied by this endpoint.</div>
    {!available || !symbol ? <div className="pad amber" role="status">{!available ? 'Option snapshots need the desktop app and both Alpaca keys on PROVIDERS.' : 'This feed covers US-listed equities, not this underlying. Index options are not connected.'}</div> : <>
      <form className="chart-tools" onSubmit={(event) => { event.preventDefault(); setShownExpiry(''); setPage(0); if (expiryInput === requestExpiry) refresh(); else setRequestExpiry(expiryInput); }}>
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
