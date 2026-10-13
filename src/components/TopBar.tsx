import { useRef, useState } from 'react';
import { engine, useInterval } from '../data/market';
import { feedStatus } from '../data/live/status';
import { execute } from '../terminal/exec';
import { applyPreset, LAYOUT_PANELS, setLayout, terminal } from '../terminal/state';
import { alerts, chats } from '../terminal/userdata';
import { contacts } from '../data/chat';
import { zonedParts } from '../core/format';
import type { LayoutId, Route } from '../terminal/types';

const LAYOUTS: { id: LayoutId; cols: number; rows: number; label: string }[] = [
  { id: '1', cols: 1, rows: 1, label: 'Single panel' },
  { id: '2', cols: 2, rows: 1, label: 'Two panels side by side' },
  { id: '2v', cols: 1, rows: 2, label: 'Two panels stacked' },
  { id: '3', cols: 2, rows: 2, label: 'Three panels' },
  { id: '4', cols: 2, rows: 2, label: 'Four panels' },
  { id: '5', cols: 3, rows: 2, label: 'Four panels and a watchlist column' },
  { id: '6', cols: 3, rows: 2, label: 'Six panels' },
];

export const PRESETS: { name: string; layout: LayoutId; routes: Route[] }[] = [
  { name: 'Market Overview', layout: '5', routes: [{ fn: 'MARKET' }, { fn: 'CHART', sec: 'SPX Index' }, { fn: 'HEADLINES' }, { fn: 'HEATMAP' }, { fn: 'WATCHLIST' }] },
  { name: 'Equity Research', layout: '4', routes: [{ fn: 'PROFILE', sec: 'NVDA US Equity' }, { fn: 'CHART', sec: 'NVDA US Equity' }, { fn: 'FINANCIALS', sec: 'NVDA US Equity' }, { fn: 'ANALYSTS', sec: 'NVDA US Equity' }] },
  { name: 'Trading Desk', layout: '6', routes: [{ fn: 'WATCHLIST' }, { fn: 'QUOTE', sec: 'TSLA US Equity' }, { fn: 'INTRADAY', sec: 'TSLA US Equity' }, { fn: 'MOVERS' }, { fn: 'TRADES', sec: 'TSLA US Equity' }, { fn: 'DEPTH', sec: 'TSLA US Equity' }] },
  { name: 'Macro & Rates', layout: '4', routes: [{ fn: 'RELEASES' }, { fn: 'CURVE' }, { fn: 'RATEPROBS' }, { fn: 'BONDS' }] },
  { name: 'FX & Commodities', layout: '4', routes: [{ fn: 'FXMATRIX' }, { fn: 'FXRANK' }, { fn: 'COMMODITIES' }, { fn: 'INTRADAY', sec: 'EURUSD Curncy' }] },
  { name: 'Digital Assets', layout: '4', routes: [{ fn: 'CRYPTO' }, { fn: 'INTRADAY', sec: 'XBTUSD Curncy' }, { fn: 'CHART', sec: 'XETUSD Curncy' }, { fn: 'NEWS', args: 'CRYPTO' }] },
  { name: 'Portfolio & Risk', layout: '4', routes: [{ fn: 'PORTFOLIO' }, { fn: 'CORRELATION' }, { fn: 'ALERTS' }, { fn: 'EVENTS' }] },
];

function LayoutIcon({ cols, rows, id }: { cols: number; rows: number; id: LayoutId }) {
  const cells = id === '3' ? 3 : id === '5' ? 5 : cols * rows;
  // Layout 3: the first panel spans both rows; layout 5: the fifth, a narrow column on the right.
  const span = (i: number) => (id === '3' && i === 0 ? { gridRow: 'span 2' } : id === '5' && i === 4 ? { gridColumn: '3', gridRow: '1 / span 2' } : undefined);
  return (
    <span className="layout-icon" style={{ gridTemplateColumns: id === '5' ? '1fr 1fr 0.6fr' : `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} style={span(i)} />
      ))}
    </span>
  );
}

const CLOCKS = [
  { tz: 'Europe/Brussels', label: 'BRUSSELS' },
  { tz: 'America/New_York', label: 'NEW YORK' },
  { tz: 'Europe/London', label: 'LONDON' },
  { tz: 'Asia/Tokyo', label: 'TOKYO' },
  { tz: 'Asia/Hong_Kong', label: 'HONG KONG', secondary: true },
];

function Clock({ tz, label, secondary }: { tz: string; label: string; secondary?: boolean }) {
  const p = zonedParts(Date.now(), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className={`clock${secondary ? ' secondary hide-m' : ''}`}>
      <b>
        {pad(p.h)}:{pad(p.mi)}:{pad(p.s)}
      </b>
      <span>{label}</span>
    </span>
  );
}

function FeedChip() {
  const f = feedStatus.use((s) => s);
  if (engine.realOnly) {
    // Desktop app: real data only. The chip says whether prices are streaming, loading or cut off.
    const lost = f.market === 'error';
    // The chip reports the connection; how fresh each quote is shows beside the quote itself.
    const label = lost ? 'CONNECTION LOST' : f.market === 'live' ? (/streaming/.test(f.detail.market ?? '') ? 'CONNECTED · STREAMING' : 'CONNECTED · POLLING') : 'LOADING DATA';
    return (
      <button type="button" className={`status-chip${lost ? ' down' : ' live'}`} onClick={() => execute(terminal.get().active, 'PROVIDERS')} title={`${f.detail.market ?? 'Data providers'} · PROVIDERS for every provider's state`}>
        <span className="dot" />
        {label}
      </button>
    );
  }
  const live = [f.crypto === 'live' && 'CRYPTO', f.fx === 'live' && 'FX', f.equities === 'live' && 'EQUITY', f.news === 'live' && 'NEWS'].filter(Boolean);
  const isLive = live.length > 0;
  return (
    <button type="button" className={`status-chip${isLive ? ' live' : ''}`} onClick={() => execute(terminal.get().active, 'SETTINGS')} title="Data sources (SETTINGS)">
      <span className="dot" />
      {isLive ? `LIVE ${live.join('·')}` : 'DEMO DATA'}
      {isLive && <span className="muted hide-m">+DEMO</span>}
    </button>
  );
}

export function TopBar() {
  useInterval(1000);
  const layout = terminal.use((s) => s.layout);
  const unreadAlerts = alerts.use((a) => a.unseen);
  const unreadMsgs = chats.use((c) => {
    const allowed = new Set(contacts().map((x) => x.id));
    return c.rooms.reduce((n, r) => n + (allowed.has(r.id) ? r.unread : 0), 0);
  });
  const [presetAt, setPresetAt] = useState<{ left: number; top: number } | null>(null);
  const presetOpen = presetAt != null;
  const setPresetOpen = (open: boolean | ((o: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(presetOpen) : open;
    if (!next) return setPresetAt(null);
    const r = presetBtn.current?.getBoundingClientRect();
    setPresetAt(r ? { left: r.left, top: r.bottom } : { left: 8, top: 32 });
  };
  const presetBtn = useRef<HTMLButtonElement>(null);
  const run = (cmd: string) => execute(terminal.get().active, cmd);
  return (
    <div className="topbar" role="banner">
      <span className="brand" title="Armin Terminal">
        <span className="brand-mark" aria-hidden="true" />
        ARMIN<small className="hide-m">TERMINAL</small>
      </span>
      <span className="tb-sep hide-m" />
      {LAYOUTS.map((l) => (
        <button key={l.id} type="button" className={`tb-btn hide-m${layout === l.id ? ' on' : ''}`} title={l.label} aria-label={l.label} onClick={() => setLayout(l.id)}>
          <LayoutIcon cols={l.cols} rows={l.rows} id={l.id} />
        </button>
      ))}
      <span style={{ position: 'relative', display: 'flex' }} className="hide-m">
        <button ref={presetBtn} type="button" className={`tb-btn${presetOpen ? ' on' : ''}`} onClick={() => setPresetOpen((o) => !o)} onBlur={() => setTimeout(() => setPresetOpen(false), 150)} aria-haspopup="menu" aria-expanded={presetOpen}>
          LAYOUTS ▾
        </button>
        {presetOpen && (
          <div className="ac" style={{ position: 'fixed', left: presetAt!.left, top: presetAt!.top, right: 'auto', minWidth: 260 }} role="menu">
            <div className="ac-head">Workspace presets</div>
            {PRESETS.map((p, i) => (
              <div
                key={p.name}
                className="ac-item"
                role="menuitem"
                style={{ gridTemplateColumns: '24px 1fr auto' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPreset(p.routes, p.layout);
                  setPresetOpen(false);
                }}
              >
                <span className="fn">{i + 1})</span>
                <span>{p.name}</span>
                <span className="tag">{LAYOUT_PANELS[p.layout]} panels</span>
              </div>
            ))}
          </div>
        )}
      </span>
      <span className="tb-sep" />
      <button type="button" className="tb-btn" onClick={() => run('MESSAGES')} title="Help desk messages (MESSAGES)">
        MSG <span className={`count${unreadMsgs ? '' : ' zero'}`}>{unreadMsgs}</span>
      </button>
      <button type="button" className="tb-btn" onClick={() => run('ALERTS')} title="Price and news alerts (ALERTS)">
        ALERTS <span className={`count${unreadAlerts ? '' : ' zero'}`}>{unreadAlerts}</span>
      </button>
      <button type="button" className="tb-btn hide-m" onClick={() => run('HELP')} title="Function directory (F1)">
        HELP
      </button>
      <span className="tb-spacer" />
      {CLOCKS.map((c) => (
        <Clock key={c.tz} {...c} />
      ))}
      <FeedChip />
      <button type="button" className="tb-btn" onClick={() => run('SETTINGS')} title="Settings (SETTINGS)" aria-label="Settings">
        ⚙
      </button>
    </div>
  );
}
