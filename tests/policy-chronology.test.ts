import { afterEach, describe, expect, it } from 'vitest';
import { fomcRows } from '../src/data/fomc';
import { loadPolicyRates, mergeDecisionVersions, parseNyFed, parseNyFedLatest, parseValet, policyRates, toChanges, type PolicyRates, type PolicySeries } from '../src/data/live/policy';
import { parseFedDecision, type PolicyDecision } from '../src/data/live/policy-decisions';
import type { OfficialAnswer } from '../src/data/live/official';
import { bankDate, currentPolicyTarget, effectivePolicyHistory, latestPolicyDecision, policyMeetingState, policyTargetHealth, visibleDecisions } from '../src/data/policy-state';
import { movesSince, rateMoves } from '../src/data/rate-analysis';

// Every policy level/document in these chronological replays is synthetic, not a claim about actual Fed policy.
const URL = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm';
const RELEASE = Date.parse('2026-10-28T18:00:00Z');
const OBS: PolicySeries = { changes: [['2026-01-01', 4.25], ['2026-09-17', 4]], last: 4, asOf: '2026-10-27' };
const statement = (body = 'The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.') => `<p class="article__time">October 28, 2026</p><p>For release at 2:00 p.m. EDT</p><p>${body}</p>`;
const implementation = (date = 'October 29, 2026', range = '3-3/4 to 4') => `<p class="article__time">October 28, 2026</p><p>Effective ${date}, the Federal Open Market Committee directs the Desk to:</p><p>Maintain the federal funds rate in a target range of ${range} percent.</p>`;
const hold = (at = RELEASE + 60_000) => parseFedDecision(statement(), implementation(), URL, at)!;
const rates = (decision = hold()): PolicyRates => ({ fedUpper: OBS, fedLower: { changes: [['2026-01-01', 4], ['2026-09-17', 3.75]], last: 3.75, asOf: OBS.asOf }, decisions: [decision] });
afterEach(() => policyRates.set({}));

describe('policy event chronology', () => {
  it('passes the scheduled instant without inventing an actual and confirms HOLD only after the statement is retrieved', () => {
    const prior = fomcRows(['2026-10-28'], undefined, OBS, '2026-10-28', [], RELEASE - 1)[0];
    expect(prior).toMatchObject({ status: 'today', scheduled: true });
    const delayed = fomcRows(['2026-10-28'], undefined, OBS, '2026-10-28', [], RELEASE + 1)[0];
    expect(delayed.status).toBe('awaiting');
    expect(delayed.upper).toBeNaN();
    expect(latestPolicyDecision(rates(), 'FED', RELEASE + 1)).toBeUndefined();
    const confirmed = fomcRows(['2026-10-28'], undefined, OBS, '2026-10-28', [hold()], RELEASE + 60_000)[0];
    expect(confirmed).toMatchObject({ status: 'confirmed', lower: 3.75, upper: 4, changeBp: 0, decision: { action: 'hold' } });
    expect(latestPolicyDecision(rates(), 'FED', RELEASE + 60_000)).toEqual(confirmed.decision);
  });

  it('preserves last nonzero change and move counts after a confirmed HOLD', () => {
    const history = effectivePolicyHistory(rates(), 'FED', OBS, Date.parse('2026-10-29T12:00:00Z'))!;
    expect(history.changes).toEqual(OBS.changes);
    const moves = rateMoves(history, ['2026-09-16', '2026-10-28'], [hold()]);
    expect(moves.at(-1)).toMatchObject({ date: '2026-09-17', change: -0.25 });
    expect(movesSince(moves, '2026-01-01')).toEqual({ up: 0, down: 1 });
    expect(latestPolicyDecision(rates(), 'FED', Date.parse('2026-10-29T12:00:00Z'))).toMatchObject({ date: '2026-10-28', action: 'hold', changeBp: 0 });
  });

  it('never turns a HOLD into a missing historical move when its dated observation window is incomplete', () => {
    const stale = { ...OBS, changes: [['2026-01-01', 4.25] as [string, number]], last: 4.25 };
    const history = effectivePolicyHistory(rates(), 'FED', stale, Date.parse('2026-10-29T12:00:00Z'))!;
    expect(history).toEqual(stale);
    expect(rateMoves(history, ['2026-10-28'], [hold()])).toEqual([]);
    expect(currentPolicyTarget(rates(), 'FED', stale, Date.parse('2026-10-29T12:00:00Z')).value).toBe(4);
  });

  it('does not use a future daily observation to infer a same-day result', () => {
    const future = { changes: [['2026-09-17', 4], ['2026-10-29', 3.75]] as [string, number][], last: 3.75, asOf: '2026-10-29' };
    const row = fomcRows(['2026-10-28'], undefined, future, '2026-10-28', [], RELEASE + 120_000)[0];
    expect(row.status).toBe('awaiting');
    expect(row.upper).toBeNaN();
    expect(row.changeBp).toBeNaN();
  });

  it('applies an announced change only on its explicit effective date in the bank timezone', () => {
    const cut = parseFedDecision(statement('The Committee decided to lower the target range for the federal funds rate by 1/4 percentage point to 3-1/2 to 3-3/4 percent.'), implementation('November 2, 2026', '3-1/2 to 3-3/4'), URL, RELEASE + 60_000)!;
    const r = rates(cut);
    expect(currentPolicyTarget(r, 'FED', OBS, Date.parse('2026-11-02T04:59:59Z'))).toMatchObject({ value: 4, source: 'observations' });
    expect(effectivePolicyHistory(r, 'FED', OBS, Date.parse('2026-11-02T04:59:59Z'))!.changes).toEqual(OBS.changes);
    expect(currentPolicyTarget(r, 'FED', OBS, Date.parse('2026-11-02T05:00:00Z'))).toMatchObject({ value: 3.75, lower: 3.5, source: 'statement', effectiveDate: '2026-11-02', sourceUrl: URL });
    expect(effectivePolicyHistory(r, 'FED', OBS, Date.parse('2026-11-02T05:00:00Z'))!.changes.at(-1)).toEqual(['2026-11-02', 3.75]);
    const firstKnownLevel = effectivePolicyHistory({ decisions: [cut] }, 'FED', undefined, Date.parse('2026-11-02T05:00:00Z'))!;
    expect(rateMoves(firstKnownLevel, [], [cut])[0]).toMatchObject({ date: '2026-11-02', change: -0.25, meeting: '2026-10-28', sourceUrl: URL });
  });

  it('confirms a target without inventing an effective date when implementation evidence is unavailable', () => {
    const d = parseFedDecision(statement('The Committee decided to lower the target range for the federal funds rate by 1/4 percentage point to 3-1/2 to 3-3/4 percent.'), '', URL, RELEASE + 60_000)!;
    expect(latestPolicyDecision(rates(d), 'FED', RELEASE + 120_000)).toMatchObject({ upper: 3.75, action: 'cut' });
    expect(currentPolicyTarget(rates(d), 'FED', OBS, Date.parse('2026-11-02T12:00:00Z'))).toMatchObject({ value: 4, source: 'observations' });
  });

  it('retains a source conflict with both dates instead of silently replacing the statement', () => {
    const d = hold();
    const contradictory = { ...OBS, changes: [['2026-01-01', 4.25] as [string, number]], last: 4.25, asOf: '2026-10-29' };
    const target = currentPolicyTarget(rates(d), 'FED', contradictory, Date.parse('2026-10-29T12:00:00Z'));
    expect(target).toMatchObject({ value: 4, source: 'statement', effectiveDate: '2026-10-29' });
    expect(target.conflict).toContain('differs');
    expect(contradictory.last).toBe(4.25);
  });

  it('keeps corrected statement versions and replays the version first seen by the cutoff', () => {
    const original = hold();
    const correction: PolicyDecision = { ...original, upper: 4.1, retrievedAt: RELEASE + 120_000 };
    const archive = mergeDecisionVersions([original], [correction, { ...correction, retrievedAt: RELEASE + 180_000 }]);
    expect(archive).toEqual([original, correction]);
    expect(visibleDecisions(archive, 'FED', RELEASE + 90_000)).toEqual([original]);
    expect(visibleDecisions(archive, 'FED', RELEASE + 150_000)).toEqual([correction]);
  });

  it('binds current-target freshness to the exact statement and implementation documents', () => {
    const old = { ...hold(), id: 'FED:2026-09-16', date: '2026-09-16', effectiveDate: '2026-09-17' };
    const future = { ...hold(), effectiveDate: '2026-11-02', upper: 3.75, lower: 3.5, action: 'cut' as const, changeBp: -25 };
    const r: PolicyRates = { ...rates(), decisions: [old, future], health: { fedStatement: { state: 'current', attemptedAt: RELEASE + 60_000, checkedAt: RELEASE + 60_000, sourceDate: '2026-10-28' } }, documentHealth: {
      'fedStatement:2026-09-16': { state: 'current', attemptedAt: RELEASE - 120_000, checkedAt: RELEASE - 120_000, sourceDate: '2026-09-16' },
      'fedImplementation:2026-09-16': { state: 'error', error: 'Synthetic failed implementation recheck', attemptedAt: RELEASE, checkedAt: RELEASE - 180_000, sourceDate: '2026-09-16' },
    } };
    expect(policyTargetHealth(r, 'FED', 'fedUpper', RELEASE + 120_000)).toMatchObject({ state: 'error', checkedAt: RELEASE - 180_000, error: 'Synthetic failed implementation recheck', sourceDate: '2026-09-16' });
  });

  it('does not attach an emergency weekend statement to a nearby scheduled meeting', () => {
    const emergency: PolicyDecision = { ...hold(), id: 'FED:2020-03-15', date: '2020-03-15', effectiveDate: '2020-03-16', announcedAt: Date.parse('2020-03-15T21:00:00Z'), retrievedAt: Date.parse('2020-03-15T21:01:00Z'), action: 'cut', changeBp: -100, upper: 0.25, lower: 0, sourceUrl: URL.replace('20261028', '20200315') };
    const s: PolicySeries = { changes: [['2020-03-01', 1.25], ['2020-03-16', 0.25]], last: 0.25, asOf: '2020-03-17' };
    expect(rateMoves(s, ['2020-03-10', '2020-03-18'], [emergency])[0]).toMatchObject({ meeting: '2020-03-15', scheduledCandidate: '2020-03-10', sourceUrl: emergency.sourceUrl });
    const rows = fomcRows(['2020-03-18'], undefined, s, '2020-03-17', [emergency], Date.parse('2020-03-17T12:00:00Z'));
    expect(rows[0]).toMatchObject({ date: '2020-03-15', scheduled: false, status: 'confirmed' });
    expect(rows[1]).toMatchObject({ date: '2020-03-18', status: 'scheduled' });
  });

  it('uses local release clocks, retains pending decisions and reports an exhausted calendar', () => {
    const meetings = ['2026-10-28', '2026-12-09'];
    expect(policyMeetingState('FED', meetings, [], RELEASE - 1).next?.date).toBe('2026-10-28');
    expect(policyMeetingState('FED', meetings, [], RELEASE + 1)).toMatchObject({ awaiting: { date: '2026-10-28' }, next: { date: '2026-12-09' }, horizon: '2026-12-09', horizonExpired: false });
    expect(policyMeetingState('FED', meetings, [hold()], RELEASE + 60_000).awaiting).toBeUndefined();
    expect(policyMeetingState('FED', meetings, [hold()], Date.parse('2027-01-30T00:00:00Z'))).toMatchObject({ awaiting: { date: '2026-12-09' }, horizon: '2026-12-09', horizonExpired: true });
    expect(policyMeetingState('FED', meetings, [], Date.parse('2027-01-30T00:00:00Z')).next).toBeUndefined();
    expect(bankDate('FED', Date.parse('2026-10-29T01:00:00Z'))).toBe('2026-10-28');
    expect(bankDate('BOJ', Date.parse('2026-10-29T01:00:00Z'))).toBe('2026-10-29');
    expect(policyMeetingState('BOJ', ['2026-10-30'], [], Date.parse('2026-10-30T05:00:00Z')).next?.date).toBe('2026-10-30');
  });

  it('rejects invalid dates, contradictory same-day rows and future current observations', () => {
    expect(toChanges([['2026-02-30', 4]], '2026-10-29')).toBeUndefined();
    expect(toChanges([['2026-10-28', 4], ['2026-10-28', 3.75]], '2026-10-29')).toBeUndefined();
    expect(toChanges([['2026-11-02', 3.75]], '2026-10-29')).toBeUndefined();
    expect(toChanges([['2026-10-27', 4], ['2026-11-02', 3.75]], '2026-10-29')).toEqual({ changes: [['2026-10-27', 4]], last: 4, asOf: '2026-10-27', future: [['2026-11-02', 3.75]] });
    expect(parseNyFed('{"refRates":{}}')).toEqual({ rate: [], lower: [], upper: [] });
    expect(parseNyFedLatest('{"refRates":{}}')).toEqual([]);
    expect(parseValet('{"observations":[{"d":"2026-10-27","V39079":{"v":null}}]}', 'V39079')).toEqual([]);
  });
});

describe('policy source refresh chronology', () => {
  it('retains values and successful-check time on failure; a successful unchanged source advances only that clock', async () => {
    const t1 = RELEASE + 60_000;
    const answer = (text: string, at: number, status = 200): OfficialAnswer => ({ status, text, attemptedAt: at, receivedAt: at, ...(status === 200 ? { checkedAt: at } : { error: 'Synthetic source failure' }) });
    const nyfed = JSON.stringify({ refRates: [{ effectiveDate: '2026-10-27', percentRate: 3.9, targetRateFrom: 3.75, targetRateTo: 4 }] });
    const index = `<a href="${URL}">Synthetic statement fixture</a>`;
    const request = (at: number, fail = false) => async (source: string) => {
      if (source === 'effr') return answer(fail ? '' : nyfed, at, fail ? 503 : 200);
      if (source === 'fomc') return answer(index, at);
      if (source === 'fedStatement') return answer(statement(), at);
      if (source === 'fedImplementation') return answer(implementation(), at);
      return answer('', at, 503);
    };
    const first = await loadPolicyRates(request(t1), t1);
    expect(first).toEqual({ answered: 1, failures: 7 });
    const oldSeries = policyRates.get().fedUpper;
    expect(policyRates.get().health?.effr).toMatchObject({ state: 'current', checkedAt: t1, sourceDate: '2026-10-27' });
    expect(policyRates.get().health?.ecb?.state).toBe('error');
    expect(latestPolicyDecision(policyRates.get(), 'FED', t1)).toMatchObject({ action: 'hold', changeBp: 0 });
    await loadPolicyRates(request(t1 + 120_000, true), t1 + 120_000);
    expect(policyRates.get().fedUpper).toBe(oldSeries);
    expect(policyRates.get().health?.effr).toMatchObject({ state: 'error', attemptedAt: t1 + 120_000, checkedAt: t1 });
    await loadPolicyRates(request(t1 + 240_000), t1 + 240_000);
    expect(policyRates.get().fedUpper).toEqual(oldSeries);
    expect(policyRates.get().health?.effr).toMatchObject({ state: 'current', checkedAt: t1 + 240_000, sourceDate: '2026-10-27' });
    expect(latestPolicyDecision(policyRates.get(), 'FED', t1 + 240_000)?.retrievedAt).toBe(t1);
    // If calendar and RSS fail too, known displayed documents must still be checked and marked retained.
    const outage = t1 + 86_400_000;
    await loadPolicyRates(async () => answer('', outage, 503), outage);
    expect(policyRates.get().documentHealth?.['fedStatement:2026-10-28']).toMatchObject({ state: 'error', attemptedAt: outage, checkedAt: t1 + 240_000 });
    expect(policyTargetHealth(policyRates.get(), 'FED', 'fedUpper', outage)).toMatchObject({ state: 'error', checkedAt: t1 + 240_000 });
  });
});
