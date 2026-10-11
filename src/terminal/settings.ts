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

export const settings = createStore<Settings>(
  {
    flash: true,
    tickMs: 1000,
    size: 'M',
    tz: 'local',
    newsFlashes: true,
    sound: false,
    finnhubKey: '',
    liveCrypto: true,
    liveFx: true,
    clickAction: 'auto',
    tape: true,
    userName: 'TRADER',
  },
  'settings',
  1,
);
