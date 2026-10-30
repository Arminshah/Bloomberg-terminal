import type { ReactNode } from 'react';
import { loadCompanyFacts, resolveFiler, secAvailable, secTicker, useSecLoad, type CompanyFacts } from '../data/live/sec';
import { shareCountConflict, type ShareCountConflict } from '../data/live/share-check';
import type { SecurityDef } from '../data/types';
import { engine } from '../data/market';
import { observedShareBasis } from '../data/live/share-basis';

/** The company's filings, for the share count on its cover (the same load as MARKETCAP's). */
export function useCoverFacts(sec: SecurityDef | undefined): CompanyFacts | null {
  const ticker = sec?.eq ? secTicker(sec) : null;
  const facts = useSecLoad<CompanyFacts>(secAvailable() && ticker ? `facts:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadCompanyFacts(c.data.cik, force);
  });
  return facts.result?.ok ? facts.result.data : null;
}

/**
 * A market value or share count as the screens show it, or "Sources disagree" (both counts on hover) where the
 * app's current count and the company's latest cover page differ by more than 2%.
 */
interface MarketValueProps {
  sec: SecurityDef;
  children?: ReactNode;
  measure?: 'market-cap' | 'shares';
  currency?: string;
}

/** Candidate market values are sensitivities to each dated count, never a resolution of the share-definition conflict. */
export function MarketValueConflict({ sec, evidence, measure = 'market-cap', currency }: MarketValueProps & { evidence: ShareCountConflict }) {
  const quotedCurrency = sec.ccy === 'GBp' ? 'GBP' : sec.ccy;
  const targetCurrency = currency ?? quotedCurrency;
  const quote = engine.quote(sec.id);
  const price = quote ? quote.last / (sec.minor ? 100 : 1) : NaN;
  const fx = targetCurrency === quotedCurrency ? 1 : engine.usdValue(quotedCurrency) / engine.usdValue(targetCurrency);
  const origin = evidence.basis;
  const candidates = [
    {
      source: origin ? `${origin.source} ${origin.method === 'current-market-cap-pair' ? 'market-implied' : 'reported'} shares` : 'Current app share count (source unknown)',
      shares: evidence.current, method: origin?.method ?? 'unknown', observedAt: origin?.observedAt ?? null, sourceTime: origin?.sourceTime ?? null,
      ...(origin?.marketCap != null ? { sourceMarketCap: origin.marketCap } : {}),
      ...(origin?.price != null ? { sourcePriceQuoted: origin.price } : {}),
      ...(origin?.currency ? { sourceCurrency: origin.currency } : {}),
      ...(origin?.classMultiplier != null ? { classMultiplier: origin.classMultiplier } : {}),
    },
    { source: `SEC ${evidence.form} cover shares`, shares: evidence.cover, sharesAsOf: evidence.asOf, filed: evidence.filed, sourceUrl: evidence.sourceUrl },
  ].map((row) => ({
    ...row,
    value: measure === 'shares' ? row.shares : row.shares * price * fx,
    measure, ...(measure === 'market-cap' ? { currency: targetCurrency, price, priceTime: quote?.time, basis: 'Current price multiplied by each share count; share definitions remain unresolved' } : {}),
  }));
  return <span className="amber" title={evidence.message} data-testid="mcap-disagree" data-source-conflict="shares-outstanding" data-source-candidates={JSON.stringify(candidates)}>Sources disagree</span>;
}

export function MarketValue({ sec, children, measure, currency }: MarketValueProps) {
  const disagree = shareCountConflict(sec.eq?.shares ?? NaN, useCoverFacts(sec), Date.now(), observedShareBasis(sec));
  if (disagree)
    return <MarketValueConflict sec={sec} evidence={disagree} measure={measure} currency={currency} />;
  return <>{children}</>;
}
