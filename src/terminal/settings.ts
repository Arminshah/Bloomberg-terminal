import { createStore } from '../core/store';

export type ClickAction = 'auto' | 'DES' | 'GP' | 'BQ';

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
  },
  'settings',
  1,
);
