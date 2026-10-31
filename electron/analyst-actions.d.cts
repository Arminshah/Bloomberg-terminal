// Types for analyst-actions.cjs, for the tests that import it.
export interface RatingRow { date: string; firm: string; analyst: string; action: string; rating: string; from: number; to: number }
export function forecastUrl(symbol: unknown): string | null;
export function parseRatings(html: unknown): RatingRow[] | null;
