import type { Holder } from './fundamentals';

/** These are position dates supplied by the holder provider, not SEC filing dates. */
export function holdingDates(holders: Holder[]): number[] {
  return [...new Set(holders.map((h) => h.filed).filter((date) => Number.isFinite(date) && date > 0))].sort((a, b) => b - a);
}

/** A saved 'latest' selection follows newly received positions without selecting an obsolete date. */
export function filterHoldings(holders: Holder[], period: string): Holder[] {
  if (period === 'all') return holders;
  const date = period === 'latest' ? holdingDates(holders)[0] : Number(period);
  return Number.isFinite(date) && date > 0 ? holders.filter((h) => h.filed === date) : [];
}

/** Percent against today's shares outstanding when available, otherwise the provider's reported percentage. */
export function holdingPercent(holder: Holder, sharesOutMillions: number): number {
  if (sharesOutMillions > 0 && Number.isFinite(sharesOutMillions) && Number.isFinite(holder.shares) && holder.shares >= 0) return (holder.shares / (sharesOutMillions * 1e6)) * 100;
  return holder.pct;
}
