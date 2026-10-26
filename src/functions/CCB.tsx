import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { fmtBig, fmtNum } from '../core/format';
import { calendarAvailable, earningsCalendar, requestListings, tickerKey, type Listing } from '../data/live/earnings-calendar';
import { nasdaqSymbol } from '../data/live/nasdaq-company';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * CCB, the company classification browser: every US-listed company on Nasdaq's stock list by sector and industry
 * (Nasdaq's classification), with the number of companies and their market value at each level, and the companies of
 * an industry largest first. Typed with a stock, it opens on that stock's sector and industry.
 */

export interface ListedCompany extends Listing {
  symbol: string;
}

export interface Group {
  name: string;
  count: number;
  /** Market value added up, USD (companies without one count as none). */
  cap: number;
}

export const UNCLASSIFIED = 'Not classified';
const sectorOf = (l: Listing) => l.sector.trim() || UNCLASSIFIED;
const industryOf = (l: Listing) => l.industry?.trim() || UNCLASSIFIED;

function groups(list: ListedCompany[], key: (l: ListedCompany) => string): Group[] {
  const by = new Map<string, Group>();
  for (const l of list) {
    const k = key(l);
    const g = by.get(k) ?? { name: k, count: 0, cap: 0 };
    g.count++;
    if (l.cap > 0) g.cap += l.cap;
    by.set(k, g);
  }
  // Largest market value first; the unclassified last.
  return [...by.values()].sort((a, b) => Number(a.name === UNCLASSIFIED) - Number(b.name === UNCLASSIFIED) || b.cap - a.cap || a.name.localeCompare(b.name));
}

export function companiesOf(listings: Map<string, Listing> | undefined): ListedCompany[] {
  return [...(listings ?? new Map<string, Listing>())].map(([symbol, l]) => ({ ...l, symbol }));
}

export const sectorsOf = (list: ListedCompany[]) => groups(list, sectorOf);
export const industriesOf = (list: ListedCompany[], sector: string) => groups(list.filter((l) => sectorOf(l) === sector), industryOf);
export const inIndustry = (list: ListedCompany[], sector: string, industry: string) =>
  list.filter((l) => sectorOf(l) === sector && industryOf(l) === industry).sort((a, b) => (b.cap > 0 ? b.cap : -1) - (a.cap > 0 ? a.cap : -1) || a.symbol.localeCompare(b.symbol));

export function CCB({ sec }: FnProps) {
  const panel = usePanelId();
  useEffect(() => requestListings(), []);
  const part = earningsCalendar.use((s) => s.listings);
  const list = useMemo(() => companiesOf(part?.data), [part?.data]);
  const symbol = nasdaqSymbol(sec);
  const mine = symbol ? list.find((l) => l.symbol === tickerKey(symbol)) : undefined;
  const [sector, setSector] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // A stock typed in the panel opens on its own sector and industry.
  useEffect(() => {
    setSector(null);
    setIndustry(null);
    setSearch('');
  }, [sec?.id]);
  const sectors = sectorsOf(list);
  const s = sector ?? (mine ? sectorOf(mine) : sectors[0]?.name) ?? '';
  const industries = industriesOf(list, s);
  const i = (industry && industries.some((x) => x.name === industry) ? industry : null) ?? (mine && sectorOf(mine) === s ? industryOf(mine) : industries[0]?.name) ?? '';
  const typed = search.trim().toUpperCase();
  const companies = typed
    ? list.filter((l) => l.symbol.includes(typed) || l.name.toUpperCase().includes(typed)).sort((a, b) => (b.cap > 0 ? b.cap : -1) - (a.cap > 0 ? a.cap : -1)).slice(0, 200)
    : inIndustry(list, s, i);
  const total = sectors.reduce((a, g) => a + g.cap, 0);
  const columns: Column<ListedCompany>[] = [
    { key: 'sym', label: 'Ticker', render: (l) => <span className={l.symbol === mine?.symbol ? 'yellow' : 'amber'}>{l.symbol}</span>, sort: (l) => l.symbol },
    { key: 'name', label: 'Company', render: (l) => l.name, sort: (l) => l.name },
    ...(typed ? [{ key: 'cls', label: 'Sector / industry', render: (l: ListedCompany) => `${sectorOf(l)} / ${industryOf(l)}`, sort: (l: ListedCompany) => `${sectorOf(l)}/${industryOf(l)}`, hideM: true }] : []),
    { key: 'cap', label: 'Market value', num: true, render: (l) => (l.cap > 0 ? fmtBig(l.cap, 2) : ''), sort: (l) => l.cap, cls: () => 'white' },
    { key: 'px', label: 'Price', num: true, render: (l) => (Number.isFinite(l.price) ? fmtNum(l.price!, 2) : ''), sort: (l) => l.price ?? NaN, hideM: true },
    { key: 'country', label: 'Country', render: (l) => l.country, sort: (l) => l.country, hideN: true },
  ];
  const csv = () => [['Ticker', 'Company', 'Sector', 'Industry', 'Market value', 'Price', 'Country'], ...companies.map((l) => [l.symbol, l.name, sectorOf(l), industryOf(l), l.cap, l.price ?? '', l.country])];
  const pick = (g: Group, on: boolean, click: () => void, of: number) => (
    <tr key={g.name} className={`click${on ? ' sel' : ''}`} aria-selected={on} onClick={click}>
      <td className={on ? 'yellow' : 'amber'}>{g.name}</td>
      <td className="num">{g.count}</td>
      <td className="num">{fmtBig(g.cap, 1)}</td>
      <td className="num muted hide-m">{of > 0 ? `${fmtNum((g.cap / of) * 100, 1)}%` : ''}</td>
    </tr>
  );
  const status = !calendarAvailable()
    ? 'The classification is read from Nasdaq’s stock list in the desktop app. The browser demo has none, and none is generated.'
    : !list.length
      ? part?.state === 'error' || part?.state === 'needs-key' || part?.state === 'off' ? `Nasdaq’s stock list did not load: ${part.message ?? 'no answer'}.` : 'Loading Nasdaq’s stock list…'
      : '';
  const sectorCap = sectors.find((g) => g.name === s)?.cap ?? 0;
  return (
    <div>
      <FnHeader
        code="CLASSIFICATION"
        title="Company Classification Browser"
        sec={sec}
        sub={<><RealBadge /> Nasdaq stock list: {list.length ? `${fmtNum(list.length, 0)} US-listed companies` : 'sectors and industries'}</>}
        actions={exportActions(panel, `CCB_${(typed || i).replace(/\W+/g, '_')}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <input className="inp" aria-label="Find a company" placeholder="Ticker or name" value={search} onChange={(e) => setSearch(e.target.value)} />
            {!typed && list.length > 0 && <span className="muted">{s} › {i}</span>}
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        <div className="ccb">
          {!typed && (
            <>
              <table className="tbl ccb-sectors" aria-label="Sectors">
                <thead>
                  <tr><th>Sector</th><th className="num">Companies</th><th className="num">Market value</th><th className="num hide-m">Share</th></tr>
                </thead>
                <tbody>{sectors.map((g) => pick(g, g.name === s, () => { setSector(g.name); setIndustry(null); }, total))}</tbody>
              </table>
              <table className="tbl ccb-industries" aria-label="Industries">
                <thead>
                  <tr><th>Industry</th><th className="num">Companies</th><th className="num">Market value</th><th className="num hide-m">Of sector</th></tr>
                </thead>
                <tbody>{industries.map((g) => pick(g, g.name === i, () => setIndustry(g.name), sectorCap))}</tbody>
              </table>
            </>
          )}
          <div className="ccb-companies">
            <DataTable
              columns={columns}
              rows={companies}
              rowKey={(l) => l.symbol}
              onRowClick={(l) => execute(panel, `${l.symbol.replace('.', '/')} US EQUITY PROFILE`)}
              numbered={10}
              empty={typed ? 'No US-listed company matches.' : 'No company in this industry.'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
