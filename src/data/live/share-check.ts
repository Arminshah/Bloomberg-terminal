import { fmtBig, fmtDay } from '../../core/format';
import { COVER_SHARES, type CompanyFacts } from './sec';

export interface ShareCountConflict {
  message: string;
  yahoo: number;
  cover: number;
  asOf: string;
  filed: string;
  form: string;
  sourceUrl: string;
}

/**
 * Where the share count behind a stock's market value (Yahoo Finance's, its market value over its price) and the
 * company's own count on its latest filing's cover differ by more than 2%: both in words, for "Sources disagree" in
 * place of the market value. Eli Lilly on 28 October 2026: Yahoo counted 891.4M shares, leaving out the 50M its
 * employee benefit trust holds; its 10-Q of 5 August gave 941.4M. Nothing for a company whose cover lists several
 * classes (each class's count is a different figure), or whose latest cover is more than 200 days old.
 */
export function shareCountConflict(yahooMillions: number, facts: CompanyFacts | null, now = Date.now()): ShareCountConflict | undefined {
  const rows = facts?.facts[COVER_SHARES]?.shares;
  if (!rows?.length || !Number.isFinite(yahooMillions) || !(yahooMillions > 0)) return undefined;
  const eligible = rows.filter((r) => Date.parse(`${r.end}T00:00:00Z`) <= now && Date.parse(`${r.filed}T00:00:00Z`) <= now);
  const latest = [...eligible].sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed)).pop();
  if (!latest || eligible.filter((r) => r.accn === latest.accn && r.end === latest.end).length > 1) return undefined;
  const asOf = Date.parse(`${latest.end}T00:00:00Z`);
  const filed = Date.parse(`${latest.filed}T00:00:00Z`);
  if (!Number.isFinite(latest.val) || !(latest.val > 0) || !Number.isFinite(asOf) || !Number.isFinite(filed) || asOf > now || filed > now || now - asOf > 200 * 86_400_000) return undefined;
  const yahoo = yahooMillions * 1e6;
  if (Math.abs(yahoo - latest.val) / latest.val <= 0.02) return undefined;
  const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));
  return {
    message: `Yahoo Finance's market value counts ${fmtBig(yahoo)} shares; the company's ${latest.form} filed ${day(latest.filed)} gives ${fmtBig(latest.val)} on its cover, as of ${day(latest.end)}.`,
    yahoo, cover: latest.val, asOf: latest.end, filed: latest.filed, form: latest.form,
    sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(facts!.cik).padStart(10, '0')}.json`,
  };
}

export function shareCountDisagreement(yahooMillions: number, facts: CompanyFacts | null, now = Date.now()): string | undefined {
  return shareCountConflict(yahooMillions, facts, now)?.message;
}
