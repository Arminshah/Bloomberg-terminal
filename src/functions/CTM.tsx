import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { fmtDay, fmtInt, fmtNum, fmtPct } from '../core/format';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { desktopData } from '../data/live/yahoo';
import { frontContract, useYahooQuotes } from '../data/live/yquotes';
import { CURVE_COMMODITIES } from '../data/live/futures-curve';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * CTM, the exchange contracts the app carries: every commodity, rate and equity index future, found by sector,
 * exchange or name, with its contract (size or multiplier, price unit or tick, listed months) and, in the desktop app,
 * Yahoo's front month with its expiry, price, change and open interest. A commodity opens on its forward curve (CCRV).
 */

export interface ContractLine {
  def: SecurityDef;
  sector: string;
  exchange: string;
  size: string;
  unit: string;
  months: string;
}

/** The futures in the app, with their contract terms as defined there. */
export function contractLines(defs: SecurityDef[]): ContractLine[] {
  const out: ContractLine[] = [];
  for (const d of defs) {
    if (d.cls === 'commodity' && d.cmd) out.push({ def: d, sector: d.cmd.group, exchange: d.cmd.exch, size: d.cmd.size, unit: d.cmd.unit, months: d.cmd.months });
    else if (d.cls === 'future' && d.fut)
      out.push({ def: d, sector: 'Equity index', exchange: d.fut.exch, size: `${fmtNum(d.fut.multiplier, 0)} ${d.ccy} × index`, unit: `Tick ${fmtNum(d.fut.tick, d.fut.tick < 1 ? 2 : 0)}`, months: d.fut.monthly ? 'All months' : 'H,M,U,Z' });
  }
  return out;
}

/** The lines matching a sector, an exchange and some words (in the ticker, name or exchange). */
export function findContracts(lines: ContractLine[], sector: string, exchange: string, words: string): ContractLine[] {
  const w = words.trim().toUpperCase();
  return lines.filter(
    (l) =>
      (!sector || l.sector === sector) &&
      (!exchange || l.exchange === exchange) &&
      (!w || l.def.ticker.toUpperCase().includes(w) || l.def.name.toUpperCase().includes(w) || l.exchange.toUpperCase().includes(w) || (l.def.alias ?? []).some((a) => a.includes(w))),
  );
}

const CURVES = new Set(CURVE_COMMODITIES.map((c) => c.id));

export function CTM({ route, sec }: FnProps) {
  const panel = usePanelId();
  const all = contractLines(engine.securities);
  const [sector, setSector] = useState('');
  const [exchange, setExchange] = useState('');
  // "CTM CRUDE" names crude oil's future: the list opens on it.
  const [words, setWords] = useState(route.args ?? sec?.ticker ?? '');
  const lines = findContracts(all, sector, exchange, words);
  const quotes = useYahooQuotes(desktopData() ? [...new Set(all.map((l) => l.def.yahoo).filter((y): y is string => !!y))] : []);
  const sectors = [...new Set(all.map((l) => l.sector))];
  const exchanges = [...new Set(all.map((l) => l.exchange))].sort();
  const quoteOf = (l: ContractLine) => (l.def.yahoo ? quotes.get(l.def.yahoo) : undefined);
  const columns: Column<ContractLine>[] = [
    { key: 't', label: 'Ticker', render: (l) => <span className="amber">{l.def.ticker}</span>, sort: (l) => l.def.ticker },
    { key: 'n', label: 'Contract', render: (l) => l.def.name.replace(/^Generic 1st '[^']*' Future( · )?/, '') || l.def.alias?.[0] || l.def.name, sort: (l) => l.def.name },
    { key: 's', label: 'Sector', render: (l) => l.sector, sort: (l) => l.sector, hideM: true },
    { key: 'x', label: 'Exchange', render: (l) => l.exchange, sort: (l) => l.exchange },
    { key: 'z', label: 'Size', render: (l) => l.size, sort: (l) => l.size, hideN: true },
    { key: 'u', label: 'Unit', render: (l) => l.unit, sort: (l) => l.unit, hideN: true },
    { key: 'm', label: 'Months', render: (l) => l.months, sort: (l) => l.months, hideM: true },
    { key: 'f', label: 'Front', render: (l) => frontContract(quoteOf(l))?.month ?? '', sort: (l) => frontContract(quoteOf(l))?.expiry ?? NaN },
    { key: 'e', label: 'Expiry', num: true, render: (l) => { const f = frontContract(quoteOf(l)); return f ? fmtDay(f.expiry) : ''; }, sort: (l) => frontContract(quoteOf(l))?.expiry ?? NaN, hideM: true },
    { key: 'p', label: 'Last', num: true, render: (l) => { const v = Number(quoteOf(l)?.regularMarketPrice); return Number.isFinite(v) ? fmtNum(v, l.def.dec) : ''; }, sort: (l) => Number(quoteOf(l)?.regularMarketPrice), cls: () => 'white' },
    { key: 'c', label: 'Chg %', num: true, render: (l) => { const v = Number(quoteOf(l)?.regularMarketChangePercent); return Number.isFinite(v) ? fmtPct(v, 2) : ''; }, sort: (l) => Number(quoteOf(l)?.regularMarketChangePercent), cls: (l) => { const v = Number(quoteOf(l)?.regularMarketChangePercent); return v > 0 ? 'up' : v < 0 ? 'dn' : ''; } },
    { key: 'o', label: 'Open int.', num: true, render: (l) => { const f = frontContract(quoteOf(l)); return f && Number.isFinite(f.openInterest) ? fmtInt(f.openInterest) : ''; }, sort: (l) => frontContract(quoteOf(l))?.openInterest ?? NaN, hideN: true },
  ];
  const csv = () => [['Ticker', 'Name', 'Sector', 'Exchange', 'Size', 'Unit', 'Months', 'Front', 'Expiry', 'Last'], ...lines.map((l) => { const f = frontContract(quoteOf(l)); return [l.def.ticker, l.def.name, l.sector, l.exchange, l.size, l.unit, l.months, f?.month ?? '', f ? new Date(f.expiry).toISOString().slice(0, 10) : '', quoteOf(l)?.regularMarketPrice ?? '']; })];
  return (
    <div>
      <FnHeader
        code="CONTRACTS"
        title="Exchange Contracts"
        sub={<><RealBadge /> Contract terms as the app defines them{desktopData() ? '; front months and prices from Yahoo Finance' : ''}</>}
        actions={exportActions(panel, 'CTM_contracts.csv', csv)}
        controls={
          <div className="chart-tools">
            <input className="inp" aria-label="Find a contract" placeholder="Ticker or name" value={words} onChange={(e) => setWords(e.target.value)} />
            <label className="fld">
              Sector
              <select className="sel-inp" aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              Exchange
              <select className="sel-inp" aria-label="Exchange" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                <option value="">All</option>
                {exchanges.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <span className="muted">{lines.length} of {all.length} contracts</span>
          </div>
        }
      />
      <DataTable
        columns={columns}
        rows={lines}
        rowKey={(l) => l.def.id}
        onRowClick={(l) => execute(panel, `${l.def.id} ${CURVES.has(l.def.id) ? 'FUTURESCURVE' : 'PROFILE'}`)}
        numbered={10}
        empty="No contract matches."
      />
      <div className="note">
        The futures the app carries, with their terms as the app defines them. In the desktop app the front month, its expiry, price and open interest are
        Yahoo Finance&apos;s for the continuous contract; the equity index futures have no such quote. A commodity opens on its forward curve.
      </div>
    </div>
  );
}
