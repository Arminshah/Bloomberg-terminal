import { fmtBig, fmtDay } from '../../core/format';
import { COVER_SHARES, type CompanyFacts } from './sec';
import type { ShareBasis } from './share-basis';

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
}

/**
 * Where the share count behind a stock's market value and the
 * company's own count on its latest filing's cover differ by more than 2%: both in words, for "Sources disagree" in
 * place of the market value. Eli Lilly on 28 October 2026: the market-implied count was 891.4M while its 10-Q
 * cover gave 941.4M. The earlier employee-benefit-trust explanation has no retained primary quotation here;
 * the share definitions remain unresolved. Nothing for a company whose cover lists several
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
  return {
    message: `${currentDescription}; the company's ${latest.form} filed ${day(latest.filed)} gives ${fmtBig(latest.val)} on its cover, as of ${day(latest.end)}.`,
    current, ...(origin ? { basis: origin } : {}), cover: latest.val, asOf: latest.end, filed: latest.filed, form: latest.form,
    sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(facts!.cik).padStart(10, '0')}.json`,
  };
}

export function shareCountDisagreement(currentMillions: number, facts: CompanyFacts | null, now = Date.now(), basis?: ShareBasis): string | undefined {
  return shareCountConflict(currentMillions, facts, now, basis)?.message;
}
