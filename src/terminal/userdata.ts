import { createStore, loadJson, removeKey, saveJson, type Store } from '../core/store';
import type { LayoutId, Route } from './types';
import type { LinkGroup } from './state';
import type { RowsLayout } from './rows-layout';
import { withExtendedColumns, type WatchlistSort } from '../data/watchlist-columns';

export interface Watchlist {
  name: string;
  ids: string[];
  /** Local field IDs in display order. Older lists retain the default columns. */
  columns?: string[];
  sort?: WatchlistSort;
}

export const watchlists = createStore<{ lists: Watchlist[]; active: number }>(
  {
    lists: [
      {
        name: 'Core',
        ids: [
          'SPX Index', 'CCMP Index', 'INDU Index', 'VIX Index', 'AAPL US Equity', 'MSFT US Equity', 'NVDA US Equity',
          'AMZN US Equity', 'GOOGL US Equity', 'META US Equity', 'TSLA US Equity', 'JPM US Equity', 'EURUSD Curncy',
          'USDJPY Curncy', 'USGG10YR Index', 'CL1 Comdty', 'GC1 Comdty', 'XBTUSD Curncy',
        ],
      },
      {
        name: 'Semis',
        ids: ['NVDA US Equity', 'AMD US Equity', 'AVGO US Equity', 'MU US Equity', 'INTC US Equity', 'QCOM US Equity', '2330 TT Equity', 'ASML NA Equity', '005930 KS Equity'],
      },
      {
        name: 'Global Banks',
        ids: ['JPM US Equity', 'BAC US Equity', 'C US Equity', 'WFC US Equity', 'GS US Equity', 'MS US Equity', 'HSBA LN Equity', 'RY CN Equity', 'CBA AU Equity'],
      },
      {
        name: 'Macro',
        ids: ['DXY Curncy', 'EURUSD Curncy', 'USDJPY Curncy', 'GBPUSD Curncy', 'USDCNH Curncy', 'USGG2YR Index', 'USGG10YR Index', 'GDBR10 Index', 'GJGB10 Index', 'CL1 Comdty', 'GC1 Comdty', 'HG1 Comdty', 'XBTUSD Curncy'],
      },
    ],
    active: 0,
  },
  'watchlists',
  1,
);

// Once per installation: lists saved with their own columns receive the pre-market and after-hours columns.
if (typeof localStorage !== 'undefined' && !loadJson('armin:ext-hours-columns')) {
  watchlists.set((s) => ({ ...s, lists: s.lists.map((l) => (l.columns?.length ? { ...l, columns: withExtendedColumns(l.columns) } : l)) }));
  saveJson('armin:ext-hours-columns', 1);
}

// Once per installation: lists saved with their own columns receive the one-year change beside the year-to-date one.
if (typeof localStorage !== 'undefined' && !loadJson('armin:1y-column')) {
  watchlists.set((s) => ({ ...s, lists: s.lists.map((l) => (l.columns?.includes('ARMIN_YTD') && !l.columns.includes('ARMIN_1Y') ? { ...l, columns: l.columns.flatMap((c) => (c === 'ARMIN_YTD' ? [c, 'ARMIN_1Y'] : [c])) } : l)) }));
  saveJson('armin:1y-column', 1);
}

/** A worksheet (W): rows of securities, columns of market and fundamental fields, a sort. Kept apart from watchlists. */
export interface Worksheet {
  name: string;
  ids: string[];
  columns: string[];
  sort?: WatchlistSort;
}

export const DEFAULT_WORKSHEET_COLUMNS = ['NAME', 'PX_LAST', 'CHG_PCT_1D', 'ARMIN_MKT_CAP_USD', 'ARMIN_EV_USD', 'ARMIN_PE', 'ARMIN_EV_EBITDA', 'ARMIN_DIV_YLD', 'ARMIN_ROE', 'ARMIN_YTD'];

export const worksheets = createStore<{ sheets: Worksheet[]; active: number }>(
  {
    sheets: [{ name: 'Sheet 1', ids: ['AAPL US Equity', 'MSFT US Equity', 'NVDA US Equity', 'AMZN US Equity', 'GOOGL US Equity', 'META US Equity', 'JPM US Equity'], columns: DEFAULT_WORKSHEET_COLUMNS }],
    active: 0,
  },
  'worksheets',
  1,
);

export interface Position {
  id: string;
  qty: number;
  cost: number;
  /**
   * Units of the portfolio's base currency per unit of the position's currency when it was entered, and that
   * base. Positions entered before 2.8.0 have none: their FX gain or loss since entry is unknown.
   */
  entryFx?: number;
  entryBase?: string;
  /** Where the entry rate comes from: "ECB reference rate of 2026-06-30", the market rate when entered, an average. */
  entryFxNote?: string;
}

/**
 * Earlier versions opened with a sample portfolio and booked paper-trading fills into it. Neither was your
 * data: the portfolio now starts empty and holds only what you enter. What was saved before is kept aside
 * under armin:portfolio-v1-backup, never deleted.
 */
(function setAsideOldPortfolio() {
  const key = 'armin:portfolio';
  const old = loadJson<{ v: number }>(key);
  if (old && old.v === 1) {
    if (loadJson('armin:portfolio-v1-backup') === undefined) saveJson('armin:portfolio-v1-backup', old);
    removeKey(key);
  }
  // The paper-trading blotter is gone with paper trading.
  removeKey('armin:orders');
})();

/** Cash is held in the base currency; a portfolio saved before 2.8.0 is in USD. */
export interface Portfolio {
  name: string;
  positions: Position[];
  benchmark: string;
  cash: number;
  base: string;
}

export const MAX_PORTFOLIOS = 12;

/** An empty portfolio, in the currency and against the benchmark of the one it is opened beside. */
export function emptyPortfolio(name: string, beside?: Portfolio): Portfolio {
  return { name, benchmark: beside?.benchmark ?? 'SPX Index', cash: 0, positions: [], base: beside?.base ?? 'USD' };
}

/**
 * The one portfolio earlier versions kept becomes the first tab. Its saved copy under armin:portfolio is read,
 * never changed or deleted.
 */
function earlierPortfolio(): Portfolio {
  const saved = loadJson<{ v: number; s: Partial<Portfolio> }>('armin:portfolio');
  const s = saved?.v === 2 && saved.s && typeof saved.s === 'object' ? saved.s : {};
  return { ...emptyPortfolio('My portfolio'), ...s };
}

/** Every portfolio, shown as tabs on PORTFOLIO; `active` is the one on screen there. Shared by every window. */
export const portfolios = createStore<{ list: Portfolio[]; active: number }>({ list: [earlierPortfolio()], active: 0 }, 'portfolios', 1);

// A damaged list (edited storage) falls back to the earlier portfolio, a portfolio missing fields gets their
// defaults, and an active tab past the end is the first.
{
  const p = portfolios.get();
  const whole = (x: Partial<Portfolio>, i: number): Portfolio => ({ ...emptyPortfolio(`Portfolio ${i + 1}`), ...x, positions: Array.isArray(x?.positions) ? x.positions : [] });
  if (!Array.isArray(p.list) || !p.list.length) portfolios.set({ list: [earlierPortfolio()], active: 0 });
  else {
    const list = p.list.some((x) => !x || typeof x.name !== 'string' || !Array.isArray(x.positions)) ? p.list.map((x, i) => whole(x && typeof x === 'object' ? x : {}, i)) : p.list;
    const active = Number.isInteger(p.active) && p.active >= 0 && p.active < list.length ? p.active : 0;
    if (list !== p.list || active !== p.active) portfolios.set({ list, active });
  }
}

const onScreen = (s: { list: Portfolio[]; active: number }): Portfolio => s.list[s.active] ?? s.list[0];

/**
 * The portfolio on screen on PORTFOLIO: its holdings, cash and benchmark. Performance, risk, EVTS and the other
 * screens read and change this one; `portfolios` holds them all.
 */
export const portfolio: Store<Portfolio> = {
  get: () => onScreen(portfolios.get()),
  set(next) {
    portfolios.set((s) => {
      const cur = onScreen(s);
      const value = typeof next === 'function' ? next(cur) : next;
      if (Object.is(value, cur)) return s;
      const i = s.list.indexOf(cur);
      return { ...s, list: s.list.map((p, j) => (j === i ? value : p)) };
    });
  },
  subscribe: (fn) => portfolios.subscribe(fn),
  use<S>(selector: (s: Portfolio) => S): S {
    return portfolios.use((s) => selector(onScreen(s)));
  },
};

/**
 * Starred securities, in the order they were starred: the command line offers them as soon as it is clicked,
 * FAVOURITES lists them with their prices and news, and BREAKING can keep to their stories.
 */
export const favourites = createStore<{ ids: string[] }>({ ids: [] }, 'favourites', 1);

/** Stars a security, or takes its star off; true when it is now a favourite. */
export function toggleFavourite(id: string): boolean {
  const on = !favourites.get().ids.includes(id);
  favourites.set((s) => ({ ids: on ? [...s.ids.filter((x) => x !== id), id] : s.ids.filter((x) => x !== id) }));
  return on;
}

export type AlertCond = 'above' | 'below' | 'pctUp' | 'pctDn';

export interface PriceAlert {
  id: number;
  sec: string;
  cond: AlertCond;
  value: number;
  active: boolean;
  created: number;
  triggered?: number;
  triggeredPx?: number;
  note?: string;
  /** When the alert lapses unfired (epoch ms); none means it stays until it fires. */
  expires?: number;
  /** It lapsed at `expires` without firing. */
  expired?: boolean;
}

export const alerts = createStore<{ list: PriceAlert[]; seq: number; unseen: number }>(
  { list: [], seq: 1, unseen: 0 },
  'alerts',
  1,
);

export interface NewsAlert {
  id: number;
  keyword: string;
  active: boolean;
  hits: number;
  created: number;
  lastHit?: number;
  lastHeadline?: string;
}

export const newsAlerts = createStore<{ list: NewsAlert[]; seq: number }>({ list: [], seq: 1 }, 'newsalerts', 1);

export interface ChatMessage {
  id: number;
  from: string;
  text: string;
  at: number;
  /** Screens the help desk offers with its answer, as terminal commands. */
  commands?: { label: string; command: string }[];
  /** Documents and stories the answer cites. */
  links?: { label: string; url: string }[];
}

export interface ChatRoom {
  id: string;
  name: string;
  who: string;
  messages: ChatMessage[];
  unread: number;
}

export const chats = createStore<{ rooms: ChatRoom[]; active: string; seq: number }>(
  { rooms: [], active: '', seq: 1 },
  'chats',
  1,
);

export const notes = createStore<Record<string, string>>({}, 'notes', 1);

/** A workspace saved on LAYOUTS: the layout, each visible panel's screen and the divider positions. */
export interface SavedLayout {
  name: string;
  layout: LayoutId;
  routes: Route[];
  split?: { cols: number[]; rows: number[] };
  /** A layout of your own: its rows, tiles and their sizes. */
  rows?: RowsLayout;
  linkGroups?: LinkGroup[];
  saved: number;
}

export const savedLayouts = createStore<{ list: SavedLayout[] }>({ list: [] }, 'layouts', 1);
