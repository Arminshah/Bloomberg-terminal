// Types for kraken.cjs, for the tests that import it.
export function krakenUrl(kind: unknown, arg: unknown, n?: unknown): string | null;
export function krakenErrors(text: string): string[];
export function krakenErrorKind(errors: string[]): string;
export const KRAKEN_PAIRS: string[];
export const PER_SECOND: number;
