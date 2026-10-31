// Types for refresh.cjs, for the tests that import it.
export interface Refresh {
  mark(): number;
  at(): number;
  expired(provider: string, keptAt: number): boolean;
}

export const WINDOW_MS: number;
export const KEEP_MS: number;
export function createRefresh(options?: { capped?: (provider: string) => boolean; now?: () => number }): Refresh;
