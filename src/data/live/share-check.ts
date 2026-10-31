import { fmtBig, fmtDay } from '../../core/format';
import { COVER_SHARES, type CompanyFacts, type XbrlFact } from './sec';
import type { ShareBasis } from './share-basis';

export interface ShareDefinitionEvidence {
  label: 'Possible definitional difference';
  status: 'historical-trust-holding-current-count-unconfirmed';
  trustShares: number;
  observedGap: number;
  gapPrecisionShares: number;
  trustAsOf: string[];
  filed: string;
  sourceUrl: string;
  coverSourceUrl: string;
  quote: string;
  limitation: string;
}

export interface ShareCountConflict {
  message: string;
  current: number;
  /** The observation used by the app, only when it still matches this count. */
  basis?: ShareBasis;
  cover: number;
  asOf: string;
  filed: string;
  form: string;
  sourceUrl: string;
  definition?: ShareDefinitionEvidence;
}

/** A retained filing explains the historical definition, not today's trust holding. */
function lillyTrustDefinition(facts: CompanyFacts, cover: XbrlFact, current: number, origin: ShareBasis | undefined): ShareDefinitionEvidence | undefined {
  if (facts.cik !== 59478 || cover.accn !== '0000059478-26-000108' || cover.form !== '10-Q'
    || cover.end !== '2026-10-26' || cover.filed !== '2026-10-29' || cover.val !== 940_745_031
    || !origin || origin.method !== 'current-market-cap-pair'
    || !['Yahoo Finance quote', 'Yahoo Finance company summary'].includes(origin.source)
    || origin.observedAt < Date.parse('2026-10-29T00:00:00Z')
    || (origin.sourceTime !== undefined && origin.sourceTime < Date.parse('2026-10-29T00:00:00Z'))
    || !(origin.marketCap! > 0) || !Number.isFinite(origin.marketCap) || !(origin.price! > 0) || !Number.isFinite(origin.price)
    || (origin.currency !== undefined && origin.currency !== 'USD')
    || (origin.classMultiplier !== undefined && origin.classMultiplier !== 1)
    // Integer market-cap rounding can move the implied count by a fraction of one share.
    || Math.abs(origin.marketCap! / origin.price! - current) > 0.5
    // Label-only precision: the observed gap must round to 50.00 million shares.
    // This does not change either source's count or a comparison tolerance.
    || Math.round((cover.val - current) / 10_000) !== 5_000) return undefined;
  return {
    label: 'Possible definitional difference',
    status: 'historical-trust-holding-current-count-unconfirmed',
    trustShares: 50_000_000, observedGap: cover.val - current, gapPrecisionShares: 10_000,
    trustAsOf: ['2025-12-31', '2024-12-31'], filed: '2026-02-12',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/59478/000005947826000013/0000059478-26-000013-index.html',
    coverSourceUrl: 'https://www.sec.gov/Archives/edgar/data/59478/000005947826000108/0000059478-26-000108-index.html',
    quote: 'We have an employee benefit trust that held 50 million shares of our common stock at both December 31, 2025 and 2024, to provide a source of funds to assist us in meeting our obligations under various employee benefit plans. The cost basis of the shares held in the trust was $3.0 billion at both December 31, 2025 and 2024, and is shown as a reduction of shareholders\' equity. Any dividend transactions between us and the trust are eliminated. Stock held by the trust is not considered outstanding in the computation of EPS.',
    limitation: 'The observed gap rounds to 50.00 million shares at 0.01 million-share precision and is consistent with the trust holding disclosed for December 31, 2025 and 2024. The current trust holding and Yahoo\'s current treatment are unconfirmed. The unchanged September 2026 dollar cost basis does not establish the current share count. Both observed counts are retained; neither is selected from this arithmetic.',
  };
}

/**
 * Where the share count behind a stock's market value and the
 * company's own count on its latest filing's cover differ by more than 2%: both in words, for "Sources disagree" in
 * place of the market value. Eli Lilly on 28 October 2026: the market-implied count was 891.4M while its 10-Q
 * cover gave 941.4M. A narrowly matched Lilly observation carries a dated historical trust explanation;
 * its current holding remains unconfirmed. Nothing for a company whose cover lists several
 * classes (each class's count is a different figure), or whose latest cover is more than 200 days old.
 */
export function shareCountConflict(currentMillions: number, facts: CompanyFacts | null, now = Date.now(), basis?: ShareBasis): ShareCountConflict | undefined {
  const rows = facts?.facts[COVER_SHARES]?.shares;
  if (!rows?.length || !Number.isFinite(currentMillions) || !(currentMillions > 0)) return undefined;
  const eligible = rows.filter((r) => Date.parse(`${r.end}T00:00:00Z`) <= now && Date.parse(`${r.filed}T00:00:00Z`) <= now);
  const latest = [...eligible].sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed)).pop();
  if (!latest || eligible.filter((r) => r.accn === latest.accn && r.end === latest.end).length > 1) return undefined;
  const asOf = Date.parse(`${latest.end}T00:00:00Z`);
  const filed = Date.parse(`${latest.filed}T00:00:00Z`);
  if (!Number.isFinite(latest.val) || !(latest.val > 0) || !Number.isFinite(asOf) || !Number.isFinite(filed) || asOf > now || filed > now || now - asOf > 200 * 86_400_000) return undefined;
  const current = currentMillions * 1e6;
  if (Math.abs(current - latest.val) / latest.val <= 0.02) return undefined;
  const origin = basis?.shares === currentMillions && Number.isFinite(basis.observedAt) && basis.observedAt <= now
    && (basis.sourceTime === undefined || (Number.isFinite(basis.sourceTime) && basis.sourceTime <= now)) ? { ...basis } : undefined;
  const currentDescription = origin
    ? origin.method === 'current-market-cap-pair'
      ? `${origin.source}'s market value counts ${fmtBig(current)} shares`
      : `${origin.source} reports ${fmtBig(current)} shares`
    : `The current app count is ${fmtBig(current)} shares (source unknown)`;
  const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));
  const definition = lillyTrustDefinition(facts!, latest, current, origin);
  return {
    message: `${currentDescription}; the company's ${latest.form} filed ${day(latest.filed)} gives ${fmtBig(latest.val)} on its cover, as of ${day(latest.end)}.${definition ? ` ${definition.label}. ${definition.limitation} Lilly 2025 10-K, filed ${day(definition.filed)}: "${definition.quote}" ${definition.sourceUrl} Cover: ${definition.coverSourceUrl}` : ''}`,
    current, ...(origin ? { basis: origin } : {}), cover: latest.val, asOf: latest.end, filed: latest.filed, form: latest.form,
    sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(facts!.cik).padStart(10, '0')}.json`,
    ...(definition ? { definition } : {}),
  };
}

export function shareCountDisagreement(currentMillions: number, facts: CompanyFacts | null, now = Date.now(), basis?: ShareBasis): string | undefined {
  return shareCountConflict(currentMillions, facts, now, basis)?.message;
}
