// Types for eurex.cjs, for the tests that import it.
export function eurexRequest(product: unknown, busdate?: unknown): { url: string; ttl: number } | null;
export function eurexProblem(text: string): string | null;
export const EUREX_PRODUCTS: string[];
