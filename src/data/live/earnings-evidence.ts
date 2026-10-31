// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { createStore } from '../../core/store';
import { zonedToUtc } from '../../core/format';

export type EpsBasis = 'gaap' | 'adjusted' | 'unknown';
export type EstimateProvenance = 'provider-history' | 'pre-announcement-snapshot' | 'unknown';

/** The definition and age of an observation survive a successful or failed refresh. */
export interface EarningsMeta {
  basis?: EpsBasis;
  shareBasis?: 'listing' | 'ordinary' | 'unknown';
  epsType?: 'basic' | 'diluted' | 'unknown';
  unit?: 'per-share' | 'currency';
  /** A provider's declared adjustment convention, not an inferred split ratio. */
  splitBasis?: string;
  scope?: string;
  dataset?: string;
  sourceUrl?: string;
  observedAt?: number;
  publishedAt?: number;
  attemptedAt?: number;
  lastSuccessfulAt?: number;
  revisionId?: string;
  stale?: boolean;
  error?: string;
  estimateProvenance?: EstimateProvenance;
  estimateObservedAt?: number;
  estimatePublishedAt?: number;
}

export interface EarningsObservation extends EarningsMeta {
  id: string;
  security: string;
  periodEnd: string;
  fiscalLabel: string;
  metric: 'eps' | 'revenue';
  role: 'estimate' | 'actual';
  value: number;
  currency?: string;
  source: string;
  /** Local knowledge time; absent for migrated records with no reliable time. */
  observedAt?: number;
  recordedAt: number;
  announcedAt?: number;
  revisionOf?: string;
}

export type ObservationInput = Omit<EarningsObservation, 'id' | 'recordedAt' | 'revisionOf'>;

/** An observation journal, separate from bounded, replaceable HTTP caches. */
export const earningsArchiveHealth = createStore<{ state: 'pending' | 'saved' | 'memory-only' }>({ state: 'pending' });
export const earningsEvidence = createStore<{ by: Record<string, EarningsObservation[]> }>({ by: {} }, 'earnings-observations', 1, {
  onPersist: (saved) => earningsArchiveHealth.set({ state: saved ? 'saved' : 'memory-only' }),
});

const finite = (v: number | undefined): v is number => v != null && Number.isFinite(v);
const key = (o: Pick<EarningsObservation, 'periodEnd' | 'fiscalLabel' | 'metric' | 'role' | 'source' | 'dataset'>) =>
  `${o.periodEnd || o.fiscalLabel}|${o.metric}|${o.role}|${o.source}|${o.dataset ?? ''}`;
const content = (o: ObservationInput) => JSON.stringify([
  o.value, o.basis ?? 'unknown', o.currency, o.shareBasis ?? 'unknown', o.epsType, o.unit, o.splitBasis, o.scope,
  o.publishedAt, o.estimateProvenance ?? 'unknown', o.sourceUrl,
]);
const hash = (s: string) => {
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619);
  return (n >>> 0).toString(36);
};

/** Unchanged checks do not create revisions; changed values append and never erase their predecessor. */
export function appendEarningsEvidence(security: string, input: ObservationInput[], now = Date.now()): void {
  const valid = input.filter((o) => o.security === security && Number.isFinite(o.value) && !!o.source && (!!o.periodEnd || !!o.fiscalLabel));
  if (!valid.length) return;
  earningsEvidence.set((s) => {
    const kept = s.by[security] ?? [];
    const next = [...kept];
    for (const o of valid) {
      const prior = next.filter((p) => key(p) === key(o)).sort((a, b) => (b.observedAt ?? b.recordedAt) - (a.observedAt ?? a.recordedAt))[0];
      if (prior && content(prior) === content(o)) continue;
      // Replayed cached versions retain their original knowledge time and are deduplicated as well.
      if (next.some((p) => key(p) === key(o) && p.observedAt === o.observedAt && content(p) === content(o))) continue;
      const id = `earn-${hash(`${security}|${key(o)}|${o.observedAt ?? now}|${content(o)}|${next.length}`)}`;
      next.push({ ...o, id, recordedAt: now, ...(prior ? { revisionOf: prior.id } : {}) });
    }
    return next.length === kept.length ? s : { by: { ...s.by, [security]: next } };
  });
}

export type EarningsHistoryView = 'latest' | 'first-observed' | 'as-of';

/** An as-of view is local knowledge history, never an invented original-report vintage. */
export function earningsVersions(security: string, view: EarningsHistoryView = 'latest', asOf = Infinity): EarningsObservation[] {
  return selectEarningsVersions(earningsEvidence.get().by[security] ?? [], view, asOf);
}

export function selectEarningsVersions(records: EarningsObservation[], view: EarningsHistoryView, asOf = Infinity): EarningsObservation[] {
  const eligible = records.filter((o) => view !== 'as-of' || (finite(o.observedAt) && o.observedAt <= asOf && (!finite(o.publishedAt) || o.publishedAt <= asOf)));
  const groups = new Map<string, EarningsObservation[]>();
  for (const o of eligible) groups.set(key(o), [...(groups.get(key(o)) ?? []), o]);
  return [...groups.values()].map((list) => {
    list.sort((a, b) => (a.observedAt ?? a.recordedAt) - (b.observedAt ?? b.recordedAt) || a.recordedAt - b.recordedAt);
    return view === 'first-observed' ? list[0] : list[list.length - 1];
  });
}

export interface AnnouncementCutoff { at: number; kind: 'source-time' | 'session-boundary' | 'date-only' }

/** Date-only means before that date; an after-close boundary permits safe same-day observations before 16:00 NY. */
export function announcementCutoff(date: number | undefined, timing?: string, exactAt?: number, tz = 'America/New_York'): AnnouncementCutoff | undefined {
  if (finite(exactAt)) return { at: exactAt, kind: 'source-time' };
  if (!finite(date)) return undefined;
  const d = new Date(date);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (timing === 'Aft-mkt') return { at: zonedToUtc(y, m, day, 16, 0, tz), kind: 'session-boundary' };
  // With no exact release time, a same-day pre-market or during-market estimate cannot be certified pre-release.
  return { at: zonedToUtc(y, m, day, 0, 0, tz), kind: 'date-only' };
}

export const epsBasisLabel = (basis: EpsBasis | undefined) => basis === 'adjusted' ? 'Adjusted' : basis === 'gaap' ? 'GAAP' : 'Provider basis';

/** Only compare providers when their definitions are stated and compatible. */
export function sameEpsDefinition(a: EarningsMeta & { ccy?: string }, b: EarningsMeta & { ccy?: string }): boolean {
  return !!a.basis && a.basis !== 'unknown' && a.basis === b.basis && !!a.ccy && a.ccy === b.ccy &&
    !!a.shareBasis && a.shareBasis !== 'unknown' && a.shareBasis === b.shareBasis &&
    !!a.splitBasis && a.splitBasis === b.splitBasis && !!a.scope && a.scope === b.scope &&
    a.epsType === b.epsType && a.unit === b.unit;
}

export interface EpsPeriod extends EarningsMeta { end: string; value: number; ccy?: string; source?: string }

/** Four consecutive fiscal quarters, one declared basis and one provider adjustment convention. */
export function consecutiveEps(periods: EpsPeriod[], end?: string): { value: number; basis: EpsBasis; ccy?: string; source?: string; reason?: string } {
  const no = (reason: string) => ({ value: NaN, basis: 'unknown' as const, reason });
  const q = periods.filter((p) => Number.isFinite(p.value) && /^\d{4}-\d{2}-\d{2}$/.test(p.end) && (!end || p.end <= end))
    .sort((a, b) => b.end.localeCompare(a.end)).slice(0, 4);
  if (q.length !== 4 || new Set(q.map((p) => p.end)).size !== 4) return no('Four distinct fiscal quarters are required.');
  if (end && Math.abs(Date.parse(q[0].end) - Date.parse(end)) > 20 * 86_400_000) return no('The latest fiscal quarter is missing.');
  for (let i = 1; i < 4; i++) {
    const days = (Date.parse(q[i - 1].end) - Date.parse(q[i].end)) / 86_400_000;
    if (days < 70 || days > 110) return no('The four fiscal quarters are not consecutive.');
  }
  const first = q[0];
  if (!first.basis || first.basis === 'unknown' || !first.ccy || !first.shareBasis || first.shareBasis === 'unknown' || !first.splitBasis || !first.scope) return no('EPS methodology, currency, share or adjustment basis is not stated.');
  if (q.some((p) => p.basis !== first.basis || p.ccy !== first.ccy || p.source !== first.source || p.dataset !== first.dataset ||
    p.shareBasis !== first.shareBasis || p.splitBasis !== first.splitBasis || p.scope !== first.scope || p.epsType !== first.epsType || p.unit !== first.unit)) return no('The quarters have different EPS definitions or sources.');
  return { value: q.reduce((sum, p) => sum + p.value, 0), basis: first.basis, ccy: first.ccy, source: first.source };
}
