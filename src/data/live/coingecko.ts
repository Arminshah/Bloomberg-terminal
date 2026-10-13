import { createStore } from '../../core/store';

/**
 * Market capitalisation and circulating supply for the listed coins from
 * CoinGecko's free Demo plan, with the owner's own key (COINGECKO_API_KEY).
 * These are aggregated across exchanges and are shown as reference figures
 * next to the exchange's own prices, never as a price. CoinGecko requires the
 * attribution "Powered by CoinGecko" wherever its data appears.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const COINGECKO_ATTRIBUTION = 'Powered by CoinGecko';

/** CoinGecko's coin ids for the app's crypto lines. */
export const COINGECKO_IDS: Record<string, string> = {
  'XBTUSD Curncy': 'bitcoin',
  'XETUSD Curncy': 'ethereum',
  'SOLUSD Curncy': 'solana',
  'XRPUSD Curncy': 'ripple',
  'ADAUSD Curncy': 'cardano',
  'DOGEUSD Curncy': 'dogecoin',
  'AVAXUSD Curncy': 'avalanche-2',
  'LINKUSD Curncy': 'chainlink',
  'LTCUSD Curncy': 'litecoin',
  'DOTUSD Curncy': 'polkadot',
};

export interface CoinFigures {
  marketCap: number;
  supply: number;
  /** Volume across the exchanges CoinGecko tracks, 24 hours, USD. */
  volume24h: number;
  /** CoinGecko's own update time (epoch ms). */
  updated: number;
}

export interface CoinGeckoState {
  coins: Record<string, CoinFigures>;
  /** When the app received the figures. */
  at: number;
  /** 'needs-key' until COINGECKO_API_KEY is set. */
  status: 'off' | 'needs-key' | 'ok' | 'error';
}

export const coinGecko = createStore<CoinGeckoState>({ coins: {}, at: 0, status: 'off' });

/** coins/markets: [{id, market_cap, circulating_supply, total_volume, last_updated, ...}]. */
export function parseMarkets(text: string): Record<string, CoinFigures> {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return {};
  }
  if (!Array.isArray(json)) return {};
  const byCoin = new Map<string, string>(Object.entries(COINGECKO_IDS).map(([line, coin]) => [coin, line]));
  const out: Record<string, CoinFigures> = {};
  for (const c of json) {
    const line = byCoin.get(String(c?.id ?? ''));
    if (!line) continue;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : NaN);
    const updated = Date.parse(String(c.last_updated ?? ''));
    out[line] = { marketCap: n(c.market_cap), supply: n(c.circulating_supply), volume24h: n(c.total_volume), updated: Number.isFinite(updated) ? updated : NaN };
  }
  return out;
}

const REFRESH_MS = 10 * 60_000;

/** Loads the figures now and every 10 minutes while a key is set; a no-op outside the desktop app. */
export function startCoinGecko(): () => void {
  if (typeof window === 'undefined' || typeof window.arminDesktop?.coingecko !== 'function') return () => undefined;
  let stopped = false;
  const load = async () => {
    try {
      const res = await window.arminDesktop!.coingecko!();
      if (stopped) return;
      if (res.missing) {
        coinGecko.set((s) => ({ ...s, status: 'needs-key' }));
        return;
      }
      const coins = res.text ? parseMarkets(res.text) : {};
      if (!Object.keys(coins).length) throw new Error(`HTTP ${res.status}`);
      coinGecko.set({ coins, at: Date.now(), status: 'ok' });
    } catch {
      // Figures fetched earlier stay, with their time; the status says the refresh failed.
      if (!stopped) coinGecko.set((s) => ({ ...s, status: 'error' }));
    }
  };
  void load();
  const timer = setInterval(() => void load(), REFRESH_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
