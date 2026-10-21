// Types for estimate-history.cjs, for the tests that import it.
export interface HistoryQuarter { date: string; period: string; end?: string; label?: string; est: number; actual: number; timing?: 'Bef-mkt' | 'Aft-mkt' | 'During-mkt' }
export interface History { source: 'Finviz' | 'Zacks' | 'MarketBeat'; eps: HistoryQuarter[]; sales: HistoryQuarter[]; gaap?: HistoryQuarter[]; peers?: string[] }
export function finvizPeers(html: unknown): string[];
export function finvizUrl(symbol: unknown): string | null;
export function zacksUrl(symbol: unknown): string | null;
export function marketbeatUrl(symbol: unknown): string | null;
export function tableAfter(html: string, key: string): unknown[] | null;
export function parseFinviz(html: unknown): History | null;
export function parseZacks(html: unknown): History | null;
export function parseMarketBeat(html: unknown): History | null;
export function money(v: unknown, defaultScale?: number): number;
export function isoDate(v: unknown): string | null;
export function historyFresh(entry: { at: number; history: History | null } | undefined, now?: number): boolean;
export function createHistoryStore(file: () => string, max?: number): {
  get(key: string): { at: number; history: History | null } | undefined;
  set(key: string, entry: { at: number; history: History | null }): void;
  flush(): void;
};
