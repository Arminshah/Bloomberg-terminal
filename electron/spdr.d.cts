// Types for spdr.cjs, for the tests that import it.
export interface SpdrHolding { name: string; ticker: string; cusip: string; sedol: string; weight: number; shares: number; currency: string }
export function spdrHoldingsUrl(fund: unknown): string | null;
export function parseSpdrHoldings(buf: Buffer): { fund: string; asOf: string; holdings: SpdrHolding[] } | { error: string };
export const SPDR_FUNDS: string[];
