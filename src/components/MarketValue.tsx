import type { ReactNode } from 'react';
import { loadCompanyFacts, resolveFiler, secAvailable, secTicker, useSecLoad, type CompanyFacts } from '../data/live/sec';
import { shareCountDisagreement } from '../data/live/share-check';
import type { SecurityDef } from '../data/types';

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
 * A market value or share count as the screens show it, or "Sources disagree" (both counts on hover) where Yahoo
 * Finance's count and the company's latest cover page differ by more than 2%.
 */
export function MarketValue({ sec, children }: { sec: SecurityDef; children: ReactNode }) {
  const disagree = shareCountDisagreement(sec.eq?.shares ?? NaN, useCoverFacts(sec));
  if (disagree)
    return (
      <span className="amber" title={disagree} data-testid="mcap-disagree">
        Sources disagree
      </span>
    );
  return <>{children}</>;
}
