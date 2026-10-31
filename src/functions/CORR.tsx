// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useHistoryVersion } from '../data/market';
import { alignedReturns, correlationSearch } from '../data/analytics';
import type { AssetClass } from '../data/types';
import { correlation } from '../finance/stats';
import { resolveSecurity } from '../data/registry';
import type { FnProps } from '../terminal/types';

const DEFAULT = ['SPX Index', 'NDX Index', 'SX5E Index', 'NKY Index', 'EURUSD Curncy', 'USDJPY Curncy', 'USGG10YR Index', 'CL1 Comdty', 'GC1 Comdty', 'XBTUSD Curncy'];
const PERIODS = [
  { n: 1, label: '3M', bars: 63 },
  { n: 2, label: '6M', bars: 126 },
  { n: 3, label: '1Y', bars: 252 },
  { n: 4, label: '3Y', bars: 756 },
];

/** Where the search looks: every line the app holds, or one kind. */
const AMONG: { id: string; label: string; classes?: AssetClass[] }[] = [
  { id: 'all', label: 'All asset classes' },
  { id: 'equity', label: 'Stocks', classes: ['equity'] },
  { id: 'index', label: 'Indices', classes: ['index'] },
  { id: 'fx', label: 'Currencies', classes: ['fx'] },
  { id: 'commodity', label: 'Commodities and futures', classes: ['commodity', 'future'] },
  { id: 'rate', label: 'Rates', classes: ['rate'] },
  { id: 'crypto', label: 'Crypto', classes: ['crypto'] },
];
type Order = 'high' | 'low' | 'abs';
const SHOW = 25;

function color(c: number): string {
  if (!Number.isFinite(c)) return '#111';
  const a = Math.min(1, Math.abs(c));
  // The scheme's colours (--up, --dn), so a colour-blind scheme applies here too.
  return `color-mix(in srgb, var(${c >= 0 ? '--up' : '--dn'}) ${Math.round((0.12 + a * 0.75) * 100)}%, transparent)`;
}

export function CORR({ sec }: FnProps) {
  const [ids, setIds] = useState<string[]>(() => (sec && !DEFAULT.includes(sec.id) ? [sec.id, ...DEFAULT.slice(0, 9)] : DEFAULT));
  const [tab, setTab] = useState(3);
  const [text, setText] = useState('');
  const [view, setView] = useState<'matrix' | 'search'>('matrix');
  const [target, setTarget] = useState<string>(() => sec?.id ?? ids[0]);
  const [targetText, setTargetText] = useState('');
  const [among, setAmong] = useState('all');
  const [order, setOrder] = useState<Order>('high');
  // Recomputed when daily history arrives, which can be after the screen opens.
  const history = useHistoryVersion();
  const { matrix, dates } = useMemo(() => {
    const { dates, rets } = alignedReturns(ids, PERIODS[tab - 1].bars);
    return { dates, matrix: ids.map((_, i) => ids.map((__, j) => correlation(rets[i], rets[j]))) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, tab, history]);
  // The lines that moved most closely with one, among the app's lines of the kind chosen.
  const search = useMemo(() => {
    if (view !== 'search' || !engine.get(target)) return null;
    const classes = AMONG.find((a) => a.id === among)?.classes;
    const pool = engine.securities.filter((d) => d.cls !== 'bond' && (!classes || classes.includes(d.cls))).map((d) => d.id);
    const { hits, short } = correlationSearch(target, pool, PERIODS[tab - 1].bars);
    const key = (h: { corr: number }) => (order === 'high' ? -h.corr : order === 'low' ? h.corr : -Math.abs(h.corr));
    return { hits: hits.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id)), short, pool: pool.length - (pool.includes(target) ? 1 : 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, target, among, order, tab, history]);
  const spine = ids.find((id) => engine.get(id)?.cls !== 'crypto') ?? ids[0];
  const providers = [...new Set(ids.map((id) => engine.quote(id)?.provider).filter(Boolean))];
  return (
    <div>
      <FnHeader code="CORRELATION" title="Correlation Matrix" sub="Daily returns (yield changes for rates)" tabs={PERIODS.map((p) => ({ n: p.n, label: p.label }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="View">
          <button type="button" className={view === 'matrix' ? 'on' : ''} aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>
            Matrix
          </button>
          <button type="button" className={view === 'search' ? 'on' : ''} aria-pressed={view === 'search'} onClick={() => setView('search')}>
            Most correlated
          </button>
        </span>
      </div>
      {view === 'search' ? (
        <SearchView
          target={target}
          targetText={targetText}
          setTargetText={setTargetText}
          onTarget={setTarget}
          among={among}
          setAmong={setAmong}
          order={order}
          setOrder={setOrder}
          period={PERIODS[tab - 1]}
          search={search}
          onMatrix={(list) => {
            setIds([target, ...list.filter((x) => x !== target)].slice(0, 14));
            setView('matrix');
          }}
        />
      ) : (
        <Matrix ids={ids} setIds={setIds} text={text} setText={setText} matrix={matrix} dates={dates} spine={spine} providers={providers} />
      )}
    </div>
  );
}

interface MatrixProps {
  ids: string[];
  setIds: (ids: string[]) => void;
  text: string;
  setText: (s: string) => void;
  matrix: number[][];
  dates: number[];
  spine: string;
  providers: unknown[];
}

function Matrix({ ids, setIds, text, setText, matrix, dates, spine, providers }: MatrixProps) {
  return (
    <>
      <div className="chart-tools">
        <input
          className="inp"
          placeholder="+ Add security (Enter)"
          aria-label="Add security"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const r = resolveSecurity(text);
              if (r && !ids.includes(r.id)) setIds([...ids, r.id].slice(-14));
              setText('');
            }
          }}
        />
        <span className="muted">Click × to drop a row. Green = moves together, red = moves opposite.</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl" style={{ width: 'auto' }}>
          <thead>
            <tr>
              <th />
              {ids.map((id) => (
                <th key={id} className="num" style={{ minWidth: 64 }}>
                  {engine.get(id)!.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => (
              <tr key={id}>
                <td>
                  <button type="button" className="act" aria-label={`Remove ${id}`} onClick={() => setIds(ids.filter((x) => x !== id))}>
                    ×
                  </button>
                  <SecLink id={id}>{engine.get(id)!.ticker}</SecLink>
                </td>
                {matrix[i].map((c, j) => (
                  <td key={j} className="num" style={{ background: i === j ? '#1a1a1a' : color(c), color: '#fff' }}>
                    {fmtNum(c, 2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        {dates.length > 1
          ? `${dates.length} daily return intervals ending ${fmtDay(dates[0])} through ${fmtDay(dates[dates.length - 1])}, on the trading days of ${engine.get(spine)?.ticker ?? spine}: each line's close on or before each day, so a market closed that day counts as unchanged. Pearson correlation needs at least three observations and nonzero variance; rates use yield changes.`
          : ids.length ? 'Waiting for daily history from the sources.' : 'Add securities to compare their daily returns.'}
        {providers.length ? ` Daily closes from ${providers.join(', ')}.` : ''}
      </div>
    </>
  );
}

interface SearchProps {
  target: string;
  targetText: string;
  setTargetText: (s: string) => void;
  onTarget: (id: string) => void;
  among: string;
  setAmong: (s: string) => void;
  order: Order;
  setOrder: (o: Order) => void;
  period: (typeof PERIODS)[number];
  search: { hits: ReturnType<typeof correlationSearch>['hits']; short: number; pool: number } | null;
  onMatrix: (ids: string[]) => void;
}

function SearchView({ target, targetText, setTargetText, onTarget, among, setAmong, order, setOrder, period, search, onMatrix }: SearchProps) {
  const t = engine.get(target);
  const shown = search?.hits.slice(0, SHOW) ?? [];
  return (
    <>
      <div className="chart-tools">
        <span className="amber">{t ? `${t.ticker} · ${t.name}` : target}</span>
        <input
          className="inp"
          placeholder="Another security (Enter)"
          aria-label="Search from"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const r = resolveSecurity(targetText);
              if (r) onTarget(r.id);
              setTargetText('');
            }
          }}
        />
        <label className="fld">
          Among
          <select className="sel-inp" aria-label="Among" value={among} onChange={(e) => setAmong(e.target.value)}>
            {AMONG.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          Order
          <select className="sel-inp" aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as Order)}>
            <option value="high">Most correlated</option>
            <option value="low">Most opposite</option>
            <option value="abs">Strongest either way</option>
          </select>
        </label>
        <button type="button" className="btn" disabled={!shown.length} onClick={() => onMatrix(shown.slice(0, 9).map((h) => h.id))}>
          Compare the first 9 in the matrix
        </button>
      </div>
      <table className="tbl zebra" data-testid="corr-search">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Security</th>
            <th className="hide-m">Name</th>
            <th className="hide-m">Class</th>
            <th className="num">Correlation</th>
            <th className="num" title={`Its beta to ${t?.ticker ?? target}: the slope of its daily returns on ${t?.ticker ?? target}'s`}>
              Beta
            </th>
            <th className="num hide-m" title="Daily return intervals the two have in common">
              Days
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((h, i) => {
            const d = engine.get(h.id)!;
            return (
              <tr key={h.id}>
                <td className="num muted">{i + 1}</td>
                <td>
                  <SecLink id={h.id}>{d.ticker}</SecLink>
                </td>
                <td className="hide-m">{d.name}</td>
                <td className="hide-m muted">{d.cls}</td>
                <td className="num" style={{ background: color(h.corr), color: '#fff' }}>
                  {fmtNum(h.corr, 2)}
                </td>
                <td className="num">{fmtNum(h.beta, 2)}</td>
                <td className="num hide-m">{h.n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">
        {search
          ? `${search.hits.length} of ${search.pool} lines ranked by the correlation of their daily returns with ${t?.ticker ?? target}'s over ${period.label} (about ${period.bars} trading days), each pair on the days both have a close; rates use yield changes.${search.short ? ` ${search.short} with less than 60% of the period in common (or no history yet) are not ranked.` : ''} The first ${Math.min(SHOW, search.hits.length)} are shown. Correlation says how closely two lines moved together, not that one drives the other.`
          : 'Choose a security to search from.'}
      </div>
    </>
  );
}
