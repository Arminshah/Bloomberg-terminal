// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { CapLink } from '../components/CapLink';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { Sparkline } from '../components/Sparkline';
import { NotConnected } from '../components/NotConnected';
import { openSecurity } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { desktopData } from '../data/live/yahoo';
import { lookupSecurity } from '../data/live/lookup';
import { MOVER_LISTS, moverVolume, useMoverList, type Mover, type MoverList } from '../data/live/stock-movers';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * Stock movers as Yahoo Finance's markets pages list them (desktop app): most active, trending now, the day's top
 * gainers and losers, and the 52-week gainers and losers, with each stock's day path, price and change, volume against
 * its three-month average, market value, P/E and where it trades in its 52-week range. TOPMOVERS GAINERS (or typing
 * GAINERS, LOSERS, TRENDING) opens a list.
 */

const tabFor = (args?: string): number => {
  const a = (args ?? '').trim().toUpperCase();
  return MOVER_LISTS.find((l) => l.arg === a || l.label.toUpperCase() === a || l.id.toUpperCase() === a)?.n ?? 1;
};

const sign = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const signed = (v: number, dec = 2) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, dec)}` : '');

/** The ticker, opening the security (looked up first when the app does not hold it yet). */
function Ticker({ symbol }: { symbol: string }) {
  const panel = usePanelId();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="sec-link"
      title={`${symbol} US — click to open, shift-click for the next panel`}
      onClick={(e) => {
        e.stopPropagation();
        const id = `${symbol.replace('-', '/')} US Equity`;
        const shift = e.shiftKey;
        if (engine.get(id)) return openSecurity(panel, id, e);
        setBusy(true);
        void lookupSecurity(symbol, false).then((r) => {
          setBusy(false);
          if (r.ok) openSecurity(panel, r.def.id, { shiftKey: shift } as unknown as Parameters<typeof openSecurity>[2]);
        });
      }}
    >
      {symbol}
      {busy ? '…' : ''}
    </button>
  );
}

/** Where the price stands in its 52-week range: low and high under a bar with the price marked. */
function Range52({ m }: { m: Mover }) {
  if (!(m.high52 > m.low52)) return null;
  const at = Math.min(1, Math.max(0, (m.price - m.low52) / (m.high52 - m.low52)));
  return (
    <span className="mv-range" title={`52-week low ${fmtNum(m.low52, 2)}, high ${fmtNum(m.high52, 2)}; the price is ${fmtNum(at * 100, 0)}% of the way up`}>
      <span className="mv-range-bar">
        <span className="mv-range-dot" style={{ left: `${at * 100}%` }} />
      </span>
      <span className="mv-range-lo">{fmtNum(m.low52, 2)}</span>
      <span className="mv-range-hi">{fmtNum(m.high52, 2)}</span>
    </span>
  );
}

export function TOPMOVERS({ route }: FnProps) {
  const [tab, setTab] = useState(() => tabFor(route.args));
  const list = MOVER_LISTS.find((l) => l.n === tab) ?? MOVER_LISTS[0];
  const { entry, paths, settled } = useMoverList(list.id as MoverList);
  const header = (
    <FnHeader
      code="TOPMOVERS"
      title="Stock Movers"
      sub={
        entry?.state === 'ok' || entry?.rows.length
          ? `${list.about} · ${entry.rows.length}${Number.isFinite(entry.total) && entry.total > entry.rows.length ? ` of ${fmtNum(entry.total, 0)}` : ''} stocks · Yahoo Finance · ${fmtDay(entry.at)} ${fmtTime(entry.at, false)}${entry.state === 'error' ? ` · ${entry.message}` : ''}`
          : entry?.state === 'error'
            ? `Yahoo Finance: ${entry.message}`
            : `${list.about} · loading from Yahoo Finance…`
      }
      tabs={MOVER_LISTS.map((l) => ({ n: l.n, label: l.label }))}
      tab={tab}
      onTab={setTab}
    />
  );
  if (!desktopData()) {
    return (
      <div>
        {header}
        <NotConnected what="Yahoo Finance's lists of the most active, trending, gaining and losing US stocks." why="The desktop app reads them from Yahoo Finance; the browser has no data source." needs="the desktop app." />
      </div>
    );
  }
  const rows = entry?.rows ?? [];
  return (
    <div>
      {header}
      <DataTable
        className="mv-table"
        rows={rows}
        rowKey={(m) => m.symbol}
        numbered
        empty={entry?.state === 'error' ? `No list from Yahoo Finance: ${entry.message}` : 'Loading…'}
        columns={[
          { key: 's', label: 'Symbol', render: (m) => <Ticker symbol={m.symbol} />, sort: (m) => m.symbol },
          { key: 'n', label: 'Name', render: (m) => <span className="ellipsis mv-name" title={m.name}>{m.name}</span>, sort: (m) => m.name },
          { key: 'd', label: 'Today', render: (m) => (paths[m.symbol]?.c.length ? <Sparkline values={paths[m.symbol].c} width={72} height={16} color={m.change >= 0 ? 'var(--up)' : 'var(--dn)'} /> : null), hideM: true },
          { key: 'p', label: 'Price', num: true, render: (m) => <span className="white">{fmtNum(m.price, 2)}</span>, sort: (m) => m.price },
          { key: 'c', label: 'Change', num: true, render: (m) => <span className={sign(m.change)}>{signed(m.change)}</span>, sort: (m) => m.change },
          { key: 'pc', label: 'Change %', num: true, render: (m) => <span className={sign(m.pct)}>{Number.isFinite(m.pct) ? `${signed(m.pct)}%` : ''}</span>, sort: (m) => m.pct },
          {
            key: 'v',
            label: 'Volume',
            num: true,
            render: (m) => {
              const v = moverVolume(m, settled);
              return v.volume > 0 ? <span title={v.settled ? "Nasdaq's consolidated volume of all US venues for the finished session" : "Yahoo Finance's screener figure; after the close it can be a few percent short of the consolidated total"}>{fmtBig(v.volume)}{v.settled ? '' : <span className="muted">*</span>}</span> : '';
            },
            sort: (m) => moverVolume(m, settled).volume,
          },
          { key: 'av', label: 'Avg Vol (3M)', num: true, title: "Average daily volume over three months (Yahoo Finance)", render: (m) => (m.avgVolume3m > 0 ? fmtBig(m.avgVolume3m) : ''), sort: (m) => m.avgVolume3m, hideN: true },
          { key: 'mc', label: 'Market Cap', num: true, render: (m) => (m.marketCap > 0 ? <CapLink id={`${m.symbol.replace('.', '/')} US Equity`} symbol={m.symbol}>{fmtBig(m.marketCap)}</CapLink> : ''), sort: (m) => m.marketCap },
          { key: 'pe', label: 'P/E (TTM)', num: true, render: (m) => (m.pe > 0 ? fmtNum(m.pe, 2) : <span className="muted" title="Not meaningful: trailing 12-month earnings are a loss or not given">NM</span>), sort: (m) => m.pe, hideN: true },
          { key: 'y', label: '52 Wk Change %', num: true, render: (m) => <span className={sign(m.change52w)}>{Number.isFinite(m.change52w) ? `${signed(m.change52w)}%` : ''}</span>, sort: (m) => m.change52w },
          { key: 'r', label: '52 Wk Range', render: (m) => <Range52 m={m} />, hideW: true },
        ]}
      />
      <div className="note">
        Yahoo Finance&apos;s lists, asked again every minute while open. Prices are Nasdaq&apos;s real-time last sale where Yahoo has it (others delayed 15 minutes). Volume marked * is Yahoo&apos;s screener figure; from 16:10 New York time the first 30 rows show Nasdaq&apos;s consolidated volume of all US venues for the finished session instead (hover a figure for its source). Click a symbol to open the stock; shift-click for the next panel.
      </div>
    </div>
  );
}
