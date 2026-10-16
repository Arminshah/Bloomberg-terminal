// Types for alpaca.cjs, for the tests that import it.
export const TRADING_HOSTS: string[];
export function alpacaRequest(kind: unknown, symbols: unknown): string | null;
export function alpacaHeaders(id: string, secret: string): Record<string, string>;
