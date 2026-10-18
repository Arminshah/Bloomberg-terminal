import { useRef, useState } from 'react';
import { engine, useInterval } from '../data/market';
import { feedStatus } from '../data/live/status';
import { execute } from '../terminal/exec';
import { applyPreset, LAYOUT_PANELS, setLayout, setSplit, terminal, type LinkGroup } from '../terminal/state';
import { alerts, chats, savedLayouts } from '../terminal/userdata';
import { contacts } from '../data/chat';
import { MONTHS, WEEKDAYS, zonedParts } from '../core/format';
import { EU_MARKET, fmtCountdown, sessionAt, US_MARKET, type Exchange } from '../data/exchanges';
import type { LayoutId, Route } from '../terminal/types';

/** `fold`: the window width at or below which the button gives way (never while its layout is on). */
const LAYOUTS: { id: LayoutId; cols: number; rows: number; label: string; fold?: 1180 | 900 }[] = [
  { id: '1', cols: 1, rows: 1, label: 'Single panel' },
  { id: '2', cols: 2, rows: 1, label: 'Two panels side by side', fold: 900 },
  { id: '2v', cols: 1, rows: 2, label: 'Two panels stacked', fold: 1180 },
  { id: '3', cols: 2, rows: 2, label: 'Three panels', fold: 1180 },
  { id: '4', cols: 2, rows: 2, label: 'Four panels', fold: 900 },
  { id: '5', cols: 3, rows: 2, label: 'Four panels and a watchlist column' },
  { id: '6', cols: 3, rows: 2, label: 'Six panels', fold: 1180 },
];

export const PRESETS: { name: string; layout: LayoutId; routes: Route[]; linkGroups?: LinkGroup[] }[] = [
  { name: 'Market Overview', layout: '5', routes: [{ fn: 'MARKET' }, { fn: 'CHART', sec: 'SPX Index' }, { fn: 'HEADLINES' }, { fn: 'HEATMAP' }, { fn: 'WATCHLIST' }] },
  { name: 'Linked Security Research', layout: '5', routes: [{ fn: 'PROFILE', sec: 'AAPL US Equity' }, { fn: 'CHART', sec: 'AAPL US Equity' }, { fn: 'FINANCIALS', sec: 'AAPL US Equity' }, { fn: 'FIELDS', sec: 'AAPL US Equity' }, { fn: 'WATCHLIST' }], linkGroups: [1, 1, 1, 1, 1] },
  { name: 'Equity Research', layout: '4', routes: [{ fn: 'PROFILE', sec: 'NVDA US Equity' }, { fn: 'CHART', sec: 'NVDA US Equity' }, { fn: 'FINANCIALS', sec: 'NVDA US Equity' }, { fn: 'EARNINGS', sec: 'NVDA US Equity' }] },
  { name: 'Trading Desk', layout: '6', routes: [{ fn: 'WATCHLIST' }, { fn: 'QUOTE', sec: 'TSLA US Equity' }, { fn: 'INTRADAY', sec: 'TSLA US Equity' }, { fn: 'MOVERS' }, { fn: 'TRADES', sec: 'TSLA US Equity' }, { fn: 'DEPTH', sec: 'TSLA US Equity' }] },
  { name: 'Macro & Rates', layout: '4', routes: [{ fn: 'RELEASES' }, { fn: 'CURVE' }, { fn: 'RATEPROBS' }, { fn: 'BONDS' }] },
  { name: 'FX & Commodities', layout: '4', routes: [{ fn: 'FXMATRIX' }, { fn: 'FXRANK' }, { fn: 'COMMODITIES' }, { fn: 'INTRADAY', sec: 'EURUSD Curncy' }] },
  { name: 'Digital Assets', layout: '4', routes: [{ fn: 'CRYPTO' }, { fn: 'INTRADAY', sec: 'XBTUSD Curncy' }, { fn: 'CHART', sec: 'XETUSD Curncy' }, { fn: 'DEPTH', sec: 'XBTUSD Curncy' }] },
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

/** `fold`: the window width at or below which a clock gives way, so the market timers and status stay in view. */
const CLOCKS: { tz: string; label: string; fold?: 1440 | 1340 | 1300 | 1024 }[] = [
  { tz: 'Europe/Brussels', label: 'BRUSSELS', fold: 1024 },
  { tz: 'America/New_York', label: 'NEW YORK', fold: 1024 },
  { tz: 'Europe/London', label: 'LONDON', fold: 1300 },
  { tz: 'Asia/Tokyo', label: 'TOKYO', fold: 1340 },
  { tz: 'Asia/Hong_Kong', label: 'HONG KONG', fold: 1440 },
];

function Clock({ tz, label, fold }: { tz: string; label: string; fold?: number }) {
  const p = zonedParts(Date.now(), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className={`clock${fold ? ` fold-${fold}` : ''}`}>
      <span className="clock-label">{label}</span>
      <b className="clock-value">
        {pad(p.h)}:{pad(p.mi)}:{pad(p.s)}
      </b>
    </span>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number, tz: string) => {
  const p = zonedParts(ms, tz);
  return `${pad2(p.h)}:${pad2(p.mi)}`;
};
const dayName = (ms: number, tz: string) => {
  const p = zonedParts(ms, tz);
  return `${WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} ${p.d} ${MONTHS[p.mo - 1]}`;
};

/** Time left until a market's regular session opens or closes, from its published hours and holidays. */
function MarketTimer({ ex }: { ex: Exchange }) {
  const now = Date.now();
  const s = sessionAt(ex, now);
  const known = Number.isFinite(s.at);
  const countdown = fmtCountdown(s.at - now);
  const state = known ? s.open ? 'OPEN' : 'CLOSED' : 'UNKNOWN';
  const transition = known ? s.open ? 'CLOSES IN' : 'OPENS IN' : 'NO SESSION';
  const schedule = known ? `${dayName(s.at, ex.tz).slice(0, 3).toUpperCase()} ${hhmm(s.at, ex.tz)}` : '--';
  const local = Number.isFinite(s.at) ? ` (${hhmm(s.at, 'local')} on this computer)` : '';
  const title = [
    `${ex.name}: regular session ${ex.open} to ${ex.close} ${ex.city} time.`,
    !Number.isFinite(s.at)
      ? 'No session found in the next three weeks.'
      : s.open
        ? `Open: closes at ${hhmm(s.at, ex.tz)} ${ex.city} time${local}${s.earlyClose ? ', an early close' : ''}.`
        : `Closed: opens ${dayName(s.at, ex.tz)} at ${hhmm(s.at, ex.tz)} ${ex.city} time${local}${s.earlyClose ? `, and closes early at ${s.earlyClose}` : ''}.`,
    s.today && !s.today.close ? `Closed today: ${s.today.name}.` : '',
    "Pre-market and after-hours trading are not counted. Holidays and early closes follow the exchange's published rules; a closure announced at short notice is not known here. HOLIDAYS shows the calendar.",
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <button
      type="button"
      className={`market-timer hide-m${s.open ? ' is-open' : ''}`}
      aria-label={`${ex.label}: regular session ${state.toLowerCase()}${known ? `, ${s.open ? 'closes' : 'opens'} in ${countdown}, ${dayName(s.at, ex.tz)} at ${hhmm(s.at, ex.tz)} ${ex.city} time` : ', schedule unavailable'}. Open market calendar`}
      title={title}
      onClick={() => execute(terminal.get().active, `HOLIDAYS ${ex.id}`)}
    >
      <span className="market-timer-header" aria-hidden="true">
        <span className="market-timer-name">{ex.label}</span>
        <span className="market-timer-schedule">{schedule}</span>
      </span>
      <span className="market-timer-countdown" aria-hidden="true">
        <span className="market-timer-action">{transition}</span>
        <b className="market-timer-value">{countdown}</b>
      </span>
    </button>
  );
}

function FeedChip() {
  const f = feedStatus.use((s) => s);
  if (engine.realOnly) {
    // Desktop app: real data only. The chip says whether prices are streaming, loading or cut off.
    const lost = f.market === 'error';
    // The chip reports the connection; how fresh each quote is shows beside the quote itself.
    const label = lost ? 'PRICE CONNECTION LOST' : f.market === 'off' ? 'YAHOO PRICES OFF' : f.market === 'live' ? (f.stream === 'live' ? 'PRICES · STREAMING' : 'PRICES · POLLING') : 'LOADING PRICES';
    return (
      <button type="button" className={`status-chip${lost ? ' down' : f.market === 'live' ? ' live' : ''}`} onClick={() => execute(terminal.get().active, 'PROVIDERS')} title={`${f.detail.market ?? 'Price connection'} · This describes Yahoo price transport. Open PROVIDERS for IEX prices, research, news and each provider's access checks.`}>
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
  const saved = savedLayouts.use((s) => s.list);
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
        ARMIN<small className="hide-m fold-860">TERMINAL</small>
      </span>
      <span className="tb-sep hide-m" />
      {LAYOUTS.map((l) => (
        <button key={l.id} type="button" className={`tb-btn hide-m${layout === l.id ? ' on' : l.fold ? ` fold-${l.fold}` : ''}`} title={l.label} aria-label={l.label} onClick={() => setLayout(l.id)}>
          <LayoutIcon cols={l.cols} rows={l.rows} id={l.id} />
        </button>
      ))}
      <span style={{ position: 'relative', display: 'flex' }} className="hide-m">
        <button ref={presetBtn} type="button" className={`tb-btn${presetOpen ? ' on' : ''}`} onClick={() => setPresetOpen((o) => !o)} onBlur={() => setTimeout(() => setPresetOpen(false), 150)} aria-haspopup="menu" aria-expanded={presetOpen}>
          LAYOUTS ▾
        </button>
        {presetOpen && (
          <div className="ac" style={{ position: 'fixed', left: presetAt!.left, top: presetAt!.top, right: 'auto', minWidth: 260 }} role="menu">
            {saved.length > 0 && <div className="ac-head">Your layouts</div>}
            {saved.map((l) => (
              <div
                key={`s:${l.name}`}
                className="ac-item"
                role="menuitem"
                style={{ gridTemplateColumns: '24px 1fr auto' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPreset(l.routes, l.layout, l.linkGroups);
                  setSplit(l.layout, l.split);
                  setPresetOpen(false);
                }}
              >
                <span className="fn">·</span>
                <span>{l.name}</span>
                <span className="tag">{LAYOUT_PANELS[l.layout]} panels</span>
              </div>
            ))}
            <div className="ac-head">Workspace presets</div>
            {PRESETS.map((p, i) => (
              <div
                key={p.name}
                className="ac-item"
                role="menuitem"
                style={{ gridTemplateColumns: '24px 1fr auto' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPreset(p.routes, p.layout, p.linkGroups);
                  setPresetOpen(false);
                }}
              >
                <span className="fn">{i + 1})</span>
                <span>{p.name}</span>
                <span className="tag">{LAYOUT_PANELS[p.layout]} panels</span>
              </div>
            ))}
            <div
              className="ac-item"
              role="menuitem"
              style={{ gridTemplateColumns: '24px 1fr auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                run('LAYOUTS');
                setPresetOpen(false);
              }}
            >
              <span className="fn">+</span>
              <span>Save or manage layouts…</span>
              <span className="tag">LAYOUTS</span>
            </div>
          </div>
        )}
      </span>
      <span className="tb-sep" />
      <button type="button" className="tb-btn fold-820" onClick={() => run('MESSAGES')} title="Help desk messages (MESSAGES)">
        MSG <span className={`count${unreadMsgs ? '' : ' zero'}`}>{unreadMsgs}</span>
      </button>
      <button type="button" className="tb-btn" onClick={() => run('ALERTS')} title="Price and news alerts (ALERTS)">
        ALERTS <span className={`count${unreadAlerts ? '' : ' zero'}`}>{unreadAlerts}</span>
      </button>
      <button type="button" className="tb-btn hide-m fold-1180" onClick={() => run('HELP')} title="Function directory (F1)">
        HELP
      </button>
      <span className="tb-spacer" />
      <MarketTimer ex={EU_MARKET} />
      <MarketTimer ex={US_MARKET} />
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
