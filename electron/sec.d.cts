// Types for sec.cjs, for the tests that import it.
export function cik10(cik: unknown): string | null;
export function secRequest(kind: unknown, arg?: unknown): { url: string; ttl: number } | null;
export class SecCache {
  constructor(maxChars: number);
  maxChars: number;
  size: number;
  get(url: string): { text: string; at: number } | undefined;
  set(url: string, text: string, at: number): void;
}
export const PER_SECOND: number;
export function refusalReason(status: number): string;
export const TICKERS_URL: string;
export const KINDS: Record<string, { url: (arg: string) => string | null; ttl: number }>;
