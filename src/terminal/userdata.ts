import { createStore } from '../core/store';

export interface Watchlist {
  name: string;
  ids: string[];
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

export interface Position {
  id: string;
  qty: number;
  cost: number;
}

export const portfolio = createStore<{ name: string; positions: Position[]; benchmark: string; cash: number }>(
  {
    name: 'Sample Growth Portfolio',
    benchmark: 'SPX Index',
    cash: 250_000,
    positions: [
      { id: 'AAPL US Equity', qty: 1500, cost: 228.4 },
      { id: 'MSFT US Equity', qty: 900, cost: 415.1 },
      { id: 'NVDA US Equity', qty: 2600, cost: 128.6 },
      { id: 'AMZN US Equity', qty: 1400, cost: 186.2 },
      { id: 'GOOGL US Equity', qty: 1300, cost: 171.3 },
      { id: 'JPM US Equity', qty: 800, cost: 245.0 },
      { id: 'LLY US Equity', qty: 250, cost: 780.5 },
      { id: 'XOM US Equity', qty: 1200, cost: 112.7 },
      { id: 'COST US Equity', qty: 200, cost: 905.0 },
      { id: 'ASML NA Equity', qty: 180, cost: 690.0 },
      { id: 'GC1 Comdty', qty: 2, cost: 3350.0 },
      { id: 'XBTUSD Curncy', qty: 3, cost: 71200 },
    ],
  },
  'portfolio',
  1,
);

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
}

export const alerts = createStore<{ list: PriceAlert[]; seq: number; unseen: number }>(
  { list: [], seq: 1, unseen: 0 },
  'alerts',
  1,
);

export interface ChatMessage {
  id: number;
  from: string;
  text: string;
  at: number;
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
