import { zonedToUtc } from '../core/format';
import type { PolicyDecision } from './live/policy-decisions';
import type { PolicyRates, PolicySeries } from './live/policy';
import { POLICY_SOURCE } from './live/policy';
import type { DatasetHealth } from './live/provenance';

/** Announcements and effective observations have different clocks. These helpers do not invent a decision. */
export const BANK_CLOCKS: Record<string, { tz: string; hour: number; minute: number; timeKnown?: boolean }> = {
  FED: { tz: 'America/New_York', hour: 14, minute: 0 },
  ECB: { tz: 'Europe/Berlin', hour: 14, minute: 15 },
  BOE: { tz: 'Europe/London', hour: 12, minute: 0 },
  // The BOJ publishes after its meeting concludes, without a fixed announcement hour.
  BOJ: { tz: 'Asia/Tokyo', hour: 23, minute: 59, timeKnown: false },
  BOC: { tz: 'America/Toronto', hour: 9, minute: 45 },
  RBA: { tz: 'Australia/Sydney', hour: 14, minute: 30 },
  SNB: { tz: 'Europe/Zurich', hour: 9, minute: 30 },
  BCB: { tz: 'America/Sao_Paulo', hour: 18, minute: 30 },
  // Rates the app reads from the BIS's compilation; their announcement times are not verified here.
  PBOC: { tz: 'Asia/Shanghai', hour: 23, minute: 59, timeKnown: false },
  RBI: { tz: 'Asia/Kolkata', hour: 23, minute: 59, timeKnown: false },
  BANXICO: { tz: 'America/Mexico_City', hour: 23, minute: 59, timeKnown: false },
};

/** A conservative end-of-day boundary is used when the bank publishes no fixed release time. */
export function scheduledPolicyAt(bank: string, date: string): number {
  const clock = BANK_CLOCKS[bank];
  const [y, m, d] = date.split('-').map(Number);
  return clock ? zonedToUtc(y, m - 1, d, clock.hour, clock.minute, clock.tz) : Date.parse(`${date}T23:59:59Z`);
}

/** Publication times are required for intraday knowledge. Date-only records become usable when first retrieved. */
export function visibleDecisions(decisions: readonly PolicyDecision[], bank: string, now: number): PolicyDecision[] {
  const by = new Map<string, PolicyDecision>();
  for (const d of decisions) {
    if (d.bank !== bank || (d.announcedAt ?? d.retrievedAt) > now || d.retrievedAt > now) continue;
    const prev = by.get(d.id);
    if (!prev || prev.retrievedAt < d.retrievedAt) by.set(d.id, d);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.announcedAt ?? a.retrievedAt) - (b.announcedAt ?? b.retrievedAt));
}

export function latestPolicyDecision(rates: PolicyRates, bank: string, now: number): PolicyDecision | undefined {
  return visibleDecisions(rates.decisions ?? [], bank, now).at(-1);
}

export function policyMeetingState(bank: string, meetings: readonly string[], decisions: readonly PolicyDecision[], now: number): {
  next?: { date: string; scheduledAt: number; status: 'scheduled' };
  awaiting?: { date: string; scheduledAt: number; status: 'awaiting-publication' };
  horizon?: string;
  horizonExpired: boolean;
} {
  const sorted = [...new Set(meetings)].sort();
  const confirmed = visibleDecisions(decisions, bank, now);
  const nextDate = sorted.find((date) => scheduledPolicyAt(bank, date) > now && !confirmed.some((d) => d.date === date));
  const lastDue = sorted.filter((date) => scheduledPolicyAt(bank, date) <= now).at(-1);
  const unresolved = lastDue && !confirmed.some((d) => d.date === lastDue);
  const horizon = sorted.at(-1);
  return {
    ...(nextDate ? { next: { date: nextDate, scheduledAt: scheduledPolicyAt(bank, nextDate), status: 'scheduled' as const } } : {}),
    ...(unresolved ? { awaiting: { date: lastDue, scheduledAt: scheduledPolicyAt(bank, lastDue), status: 'awaiting-publication' as const } } : {}),
    horizon,
    horizonExpired: !horizon || scheduledPolicyAt(bank, horizon) <= now,
  };
}

/** Do not extend a value into time before it took effect, even if the publisher sends an announced future row. */
export function effectivePolicySeries(series: PolicySeries | undefined, today: string): PolicySeries | undefined {
  if (!series) return undefined;
  const changes = series.changes.filter(([d]) => d <= today);
  if (!changes.length) return undefined;
  return { ...series, changes, last: changes.at(-1)![1], asOf: series.asOf < today ? series.asOf : today };
}

export function bankDate(bank: string, now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BANK_CLOCKS[bank]?.tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export function policyEffectiveAt(bank: string, date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return zonedToUtc(y, m - 1, d, 0, 0, BANK_CLOCKS[bank]?.tz ?? 'UTC');
}

export function currentPolicyTarget(rates: PolicyRates, bank: string, series: PolicySeries | undefined, now: number): {
  value: number; lower?: number; effectiveDate?: string; sourceAsOf?: string; sourceUrl?: string;
  source: 'statement' | 'observations'; conflict?: string;
} {
  const effective = effectivePolicySeries(series, bankDate(bank, now));
  const lower = bank === 'FED' ? effectivePolicySeries(rates.fedLower, bankDate(bank, now)) : undefined;
  const event = visibleDecisions(rates.decisions ?? [], bank, now).filter((d) => d.effectiveDate && policyEffectiveAt(bank, d.effectiveDate) <= now).sort((a, b) => a.effectiveDate!.localeCompare(b.effectiveDate!) || (a.announcedAt ?? a.retrievedAt) - (b.announcedAt ?? b.retrievedAt)).at(-1);
  const observedChange = effective?.changes.at(-1)?.[0];
  // A later observed change can supersede an older statement; its decision confirmation stays separate.
  if (event?.effectiveDate && (!observedChange || observedChange <= event.effectiveDate)) {
    const conflict = effective && effective.asOf >= event.effectiveDate && (effective.last !== event.upper || (event.lower != null && lower && lower.asOf >= event.effectiveDate && lower.last !== event.lower));
    return { value: event.upper, lower: event.lower, effectiveDate: event.effectiveDate, sourceAsOf: event.date, sourceUrl: event.sourceUrl, source: 'statement', ...(conflict ? { conflict: 'The effective target in the official statement differs from the dated daily observation; both are retained.' } : {}) };
  }
  return { value: effective?.last ?? NaN, ...(lower ? { lower: lower.last } : {}), effectiveDate: observedChange, sourceAsOf: effective?.asOf, source: 'observations' };
}

/** Select the checks for the actual displayed evidence, including its implementation note. */
export function policyTargetHealth(rates: PolicyRates, bank: string, key: keyof PolicyRates, now: number): DatasetHealth | undefined {
  const current = currentPolicyTarget(rates, bank, rates[key] as PolicySeries | undefined, now);
  if (current.source !== 'statement') {
    const source = POLICY_SOURCE[key];
    return source ? rates.health?.[source] : undefined;
  }
  const document = (source: 'fedStatement' | 'fedImplementation') => rates.documentHealth?.[`${source}:${current.sourceAsOf}`] ?? (rates.health?.[source]?.sourceDate === current.sourceAsOf ? rates.health?.[source] : undefined);
  const statement = document('fedStatement');
  const note = document('fedImplementation');
  if (!statement) return undefined;
  const checkedAt = statement.checkedAt != null && note?.checkedAt != null ? Math.min(statement.checkedAt, note.checkedAt) : undefined;
  const errors = [statement.error, note?.error ?? (!note ? 'No implementation-note check accompanies the effective target.' : undefined)].filter(Boolean);
  return { ...statement, attemptedAt: Math.max(statement.attemptedAt, note?.attemptedAt ?? 0), checkedAt, state: errors.length ? 'error' : statement.state === 'cached' || note?.state === 'cached' ? 'cached' : 'current', error: errors.length ? errors.join(' ') : undefined };
}

/** Effective target history, including explicit statement evidence ahead of a lagging daily observation. */
export function effectivePolicyHistory(rates: PolicyRates, bank: string, series: PolicySeries | undefined, now: number): PolicySeries | undefined {
  const effective = effectivePolicySeries(series, bankDate(bank, now));
  const events = visibleDecisions(rates.decisions ?? [], bank, now).filter((d) => d.effectiveDate && policyEffectiveAt(bank, d.effectiveDate) <= now).sort((a, b) => a.effectiveDate!.localeCompare(b.effectiveDate!) || (a.announcedAt ?? a.retrievedAt) - (b.announcedAt ?? b.retrievedAt));
  if (!events.length) return effective;
  const levels = new Map<string, number>(effective?.changes ?? []);
  const supportedThrough = effective?.asOf ? [effective.asOf] : [];
  // The dated statement governs its explicit effective date. Later observed changes retain their own dates.
  for (const d of events) {
    const before = [...levels].filter(([date]) => date <= d.effectiveDate!).sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1];
    // An unchanged statement cannot date a missing earlier move in an incomplete observation window.
    // Keep that target as separate announcement evidence rather than fabricate a cut/hike on the HOLD date.
    if (before != null && before !== d.upper && (d.action === 'hold' || d.action === 'unknown')) continue;
    levels.set(d.effectiveDate!, d.upper);
    supportedThrough.push(d.effectiveDate!);
  }
  const changes: [string, number][] = [];
  for (const [date, value] of [...levels].sort(([a], [b]) => a.localeCompare(b))) {
    if (!changes.length || changes.at(-1)![1] !== value) changes.push([date, value]);
  }
  return { changes, last: changes.at(-1)![1], asOf: supportedThrough.sort().at(-1)! };
}

export function policyDecisionLabel(d: PolicyDecision): string {
  return d.action === 'hold' ? 'Unchanged, 0 bp' : `${d.action === 'hike' ? 'Raised' : d.action === 'cut' ? 'Cut' : 'Target announced'}${d.changeBp == null ? '' : `, ${d.changeBp > 0 ? '+' : ''}${d.changeBp} bp`}`;
}
