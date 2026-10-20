import { setDateOrder, type DateOrder } from '../core/format';
import { createStore } from '../core/store';

export type ClickAction = 'auto' | 'PROFILE' | 'CHART' | 'QUOTE';

export interface Settings {
  flash: boolean;
  tickMs: number;
  size: 'S' | 'M' | 'L';
  tz: string;
  newsFlashes: boolean;
  sound: boolean;
  finnhubKey: string;
  liveCrypto: boolean;
  liveFx: boolean;
  clickAction: ClickAction;
  tape: boolean;
  userName: string;
  mnemonics: boolean;
  /** DD/MM/YYYY (European, the default) or MM/DD/YYYY, for every date shown or typed. */
  dateOrder: DateOrder;
}

/** The single-file build runs where network requests are blocked; feeds start off there. */
const embedded = import.meta.env.MODE === 'single';

export const settings = createStore<Settings>(
  {
    flash: true,
    tickMs: 1000,
    size: 'M',
    tz: 'local',
    newsFlashes: true,
    sound: false,
    finnhubKey: '',
    liveCrypto: !embedded,
    liveFx: !embedded,
    clickAction: 'auto',
    tape: true,
    userName: 'TRADER',
    mnemonics: true,
    dateOrder: 'DMY',
  },
  'settings',
  1,
);

// Dates follow the chosen order before anything renders with it.
setDateOrder(settings.get().dateOrder === 'MDY' ? 'MDY' : 'DMY');
settings.subscribe(() => setDateOrder(settings.get().dateOrder === 'MDY' ? 'MDY' : 'DMY'));

// The click action saved by an earlier version names an old code.
{
  const old: Record<string, ClickAction> = { DES: 'PROFILE', GP: 'CHART', BQ: 'QUOTE' };
  const saved = settings.get().clickAction as string;
  if (old[saved]) settings.set((s) => ({ ...s, clickAction: old[saved] }));
}

// Finnhub is switched off and keys no longer live in the browser: drop one saved by an earlier version.
if (settings.get().finnhubKey) settings.set((s) => ({ ...s, finnhubKey: '' }));
