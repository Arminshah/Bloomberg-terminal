// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { Credits } from '../components/Credits';
import { FnHeader } from '../components/FnHeader';
import { Chg, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { RowNo } from '../components/Numbered';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtNum, fmtDateTime } from '../core/format';
import { meetingsOf } from '../data/eco';
import { policyRates, type PolicyRates, type PolicySeries } from '../data/live/policy';
import { BANK_CLOCKS, bankDate, currentPolicyTarget, effectivePolicyHistory, effectivePolicySeries, latestPolicyDecision, policyDecisionLabel, policyEffectiveAt, policyMeetingState, policyTargetHealth, visibleDecisions } from '../data/policy-state';
import { engine, useTick } from '../data/market';
import { changeSince, movesSince, rateMoves, stepPoints } from '../data/rate-analysis';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * CBRT, Central Bank Rate Analysis (named in the provider's 2020 Quick Start; its screen is not described). Here, in
 * part: each bank's policy rate from its own data with every move over the history read (about four years), its
 * changes over the year and the history, and the meeting that decided each move. Paths priced by futures are on
 * RATEPROBS for the Fed only, as the app has no other banks' rate futures.
 */

interface Bank {
  code: string;
  name: string;
  rate: string;
  key: keyof PolicyRates;
  /** Read from the BIS's compilation rather than the bank's own data service. */
  viaBis?: boolean;
}

export const RATE_BANKS: Bank[] = [
  { code: 'FED', name: 'Federal Reserve', rate: 'Fed funds target, upper bound', key: 'fedUpper' },
  { code: 'ECB', name: 'European Central Bank', rate: 'Deposit facility rate', key: 'ecb' },
  { code: 'BOE', name: 'Bank of England', rate: 'Bank Rate', key: 'boe' },
  { code: 'BOJ', name: 'Bank of Japan', rate: 'Basic loan rate', key: 'bojLoan' },
  { code: 'BOC', name: 'Bank of Canada', rate: 'Target for the overnight rate', key: 'boc' },
  { code: 'RBA', name: 'Reserve Bank of Australia', rate: 'Cash rate target', key: 'rba' },
  { code: 'SNB', name: 'Swiss National Bank', rate: 'SNB policy rate', key: 'snb' },
  { code: 'BCB', name: 'Banco Central do Brasil', rate: 'Selic target', key: 'bcb' },
  { code: 'PBOC', name: "People's Bank of China", rate: '1-year loan prime rate', key: 'pboc', viaBis: true },
  { code: 'RBI', name: 'Reserve Bank of India', rate: 'Policy repo rate', key: 'rbi', viaBis: true },
  { code: 'BANXICO', name: 'Banco de México', rate: 'Target for the overnight interbank rate', key: 'banxico', viaBis: true },
];

const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));
const yearAgo = (now: number) => new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);

export function CBRT(_: FnProps) {
  useTick(30);
  const panel = usePanelId();
  const rates = policyRates.use((r) => r);
  const [chosen, setChosen] = useState('FED');
  const now = engine.now();
  const meetings = (code: string) => (code === 'FED' && rates.fomc?.length ? rates.fomc : meetingsOf(code));
  const rows = RATE_BANKS.map((b) => {
    const observed = effectivePolicySeries(rates[b.key] as PolicySeries | undefined, bankDate(b.code, now));
    const s = effectivePolicyHistory(rates, b.code, observed, now);
    const moves = s ? rateMoves(s, meetings(b.code), visibleDecisions(rates.decisions ?? [], b.code, now)) : [];
    const current = currentPolicyTarget(rates, b.code, observed, now);
    const health = policyTargetHealth(rates, b.code, b.key, now);
    return { b, s, moves, current, health, latest: latestPolicyDecision(rates, b.code, now), calendar: policyMeetingState(b.code, meetings(b.code), rates.decisions ?? [], now), year: s ? changeSince({ ...s, last: current.value }, yearAgo(now)) : NaN, count: movesSince(moves, yearAgo(now)) };
  });
  const nums = useNumberedRows('cbrt-banks', rows, 1, (r) => setChosen(r.b.code), (r) => r.b.name);
  const pick = rows.find((r) => r.b.code === chosen) ?? rows[0];
  const loaded = rows.filter((r) => r.s);
  const decisions = visibleDecisions(rates.decisions ?? [], pick.b.code, now);
  const auditState = { schema: 1, domain: 'policy', capturedAt: now, banks: rows.map((r) => ({ code: r.b.code, rateKey: r.b.key, current: { value: r.current.value, lower: r.current.lower, upper: r.current.value, effectiveAt: r.current.effectiveDate ? policyEffectiveAt(r.b.code, r.current.effectiveDate) : undefined, effectivePrecision: 'date', sourceUrl: r.current.sourceUrl ?? r.health?.source, sourceAsOf: r.current.sourceAsOf, lastSuccessfulAt: r.health?.checkedAt, lastAttemptAt: r.health?.attemptedAt, freshnessState: r.health?.state, stale: r.health?.state === 'cached' || r.health?.state === 'error', error: r.health?.error, conflict: r.current.conflict }, latestDecision: r.latest ? { ...r.latest, outcome: r.latest.action, effectiveAt: r.latest.effectiveDate ? policyEffectiveAt(r.b.code, r.latest.effectiveDate) : undefined, effectivePrecision: 'date' } : undefined, nextDecision: r.calendar.next, awaitingDecision: r.calendar.awaiting, calendarThrough: r.calendar.horizon })) };
  return (
    <div data-audit-state={JSON.stringify(auditState)}>
      <FnHeader code="RATEANALYSIS" title="Central Bank Rate Analysis" sub={engine.realOnly ? <><RealBadge /> each bank&apos;s own data (three via the BIS): its rate and every move over about four years</> : "The banks' rate histories are read by the desktop app"} />
      {!engine.realOnly ? (
        <div className="empty">The banks&apos; rate histories come from their own data services and are read by the desktop app. The browser demo has none, and none are generated.</div>
      ) : (
        <>
          <table className="tbl" data-testid="cbrt-banks">
            <thead>
              <tr>
                <th>Bank</th>
                <th className="hide-m">Rate</th>
                <th className="num">Level</th>
                <th className="num hide-m">Since</th>
                <th className="num">Last nonzero change</th>
                <th>Latest confirmed decision</th>
                <th className="num hide-m">Source as of</th>
                <th className="num" title="Change in the level over the last 365 days">1Y chg</th>
                <th className="num hide-m">Moves in 1Y</th>
                <th className="num hide-m">Next decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const last = r.moves.at(-1);
                return (
                  <tr key={r.b.code} className={`click${r.b.code === pick.b.code ? ' sel' : ''}`} onClick={() => setChosen(r.b.code)}>
                    <td>
                      <RowNo n={nums[i]} />
                      {r.b.name}
                    </td>
                    <td className="hide-m muted">{r.b.rate}{r.b.viaBis ? ' · via BIS' : ''}</td>
                    <td className="num white">{Number.isFinite(r.current.value) ? `${fmtNum(r.current.value, 2)}%` : '--'}</td>
                    <td className="num hide-m">{last ? day(last.date) : '--'}</td>
                    <td className="num">{last ? <><Chg v={last.change * 100} dec={0} /> bp</> : '--'}</td>
                    <td>{r.latest ? <a href={r.latest.sourceUrl} target="_blank" rel="noreferrer noopener">{day(r.latest.date)} · {policyDecisionLabel(r.latest)}</a> : r.calendar.awaiting && r.b.code === 'FED' ? <span className="amber">Awaiting {day(r.calendar.awaiting.date)} statement</span> : <span className="muted">Statement not archived</span>}</td>
                    <td className="num hide-m" title={r.health ? `${r.health.checkedAt ? `Last successful check ${fmtDateTime(r.health.checkedAt)}` : 'No successful check'}${r.health.error ? `; latest attempt failed: ${r.health.error}` : ''}` : 'Confirmation time unavailable'}>{r.current.sourceAsOf ? day(r.current.sourceAsOf) : '--'}{r.health?.state === 'error' ? ' · retained' : ''}</td>
                    <td className="num">{Number.isFinite(r.year) ? <><Chg v={r.year * 100} dec={0} /> bp</> : '--'}</td>
                    <td className="num hide-m">{r.s ? `${r.count.up} up, ${r.count.down} down` : '--'}</td>
                    <td className="num hide-m" title={`${r.b.code === 'BOJ' ? 'Release time varies; date only. ' : ''}Calendar coverage through ${r.calendar.horizon ?? 'unknown'}`}>{r.calendar.next ? <>{day(r.calendar.next.date)} · {r.b.code === 'BOJ' ? 'time varies (Tokyo)' : BANK_CLOCKS[r.b.code]?.timeKnown === false ? 'time not verified' : `${new Intl.DateTimeFormat('en-GB', { timeZone: BANK_CLOCKS[r.b.code]?.tz ?? 'UTC', hour: '2-digit', minute: '2-digit' }).format(r.calendar.next.scheduledAt)} ${BANK_CLOCKS[r.b.code]?.tz.split('/').at(-1)?.replaceAll('_', ' ') ?? 'UTC'}`}</> : r.b.code === 'PBOC' ? <span className="muted">Monthly fixing; dates unavailable</span> : <span className="amber">Calendar exhausted</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Section title={`${pick.b.name}: confirmed decisions`} right={pick.latest ? policyDecisionLabel(pick.latest) : 'Statement evidence unavailable'}>
            <table className="tbl" data-testid="cbrt-decisions">
              <thead><tr><th>Announced</th><th>Decision</th><th className="num">Target (%)</th><th>Effective</th><th>Evidence</th></tr></thead>
              <tbody>
                {[...decisions].reverse().slice(0, 12).map((d) => <tr key={d.id}>
                  <td>{d.announcedAt ? fmtDateTime(d.announcedAt) : `${day(d.date)} · time not provided`}</td>
                  <td>{policyDecisionLabel(d)}</td><td className="num">{d.lower != null ? `${fmtNum(d.lower, 2)} – ` : ''}{fmtNum(d.upper, 2)}</td>
                  <td>{d.effectiveDate ? `${day(d.effectiveDate)}${policyEffectiveAt(d.bank, d.effectiveDate) > now ? ' · announced, not yet effective' : ''}` : 'Effective date not verified'}</td>
                  <td><a href={d.sourceUrl} target="_blank" rel="noreferrer noopener">Statement</a>{d.implementationUrl && <> · <a href={d.implementationUrl} target="_blank" rel="noreferrer noopener">Implementation</a></>}</td>
                </tr>)}
                {!decisions.length && <tr><td colSpan={5} className="empty">{pick.b.code === 'FED' ? 'No confirmed statement has loaded. A calendar date or an unchanged observation does not confirm a decision.' : 'This bank’s statement decisions are not archived here. The dated rate observations remain available below.'}</td></tr>}
              </tbody>
            </table>
            <div className="note">{pick.health?.checkedAt ? `Latest successful source check: ${fmtDateTime(pick.health.checkedAt)}.` : 'No successful source check recorded.'}{pick.health?.error && ` Latest check failed: ${pick.health.error} Retained values keep their original dates.`}{pick.current.conflict && ` ${pick.current.conflict}`}</div>
            {pick.health?.state === 'cached' && <div className="note">The current target uses cached evidence; its successful-check time has not advanced.</div>}
            {pick.b.code === 'FED' && pick.calendar.awaiting && <div className="note amber">Awaiting the official statement for {day(pick.calendar.awaiting.date)}; no outcome is inferred from a flat rate.</div>}
            <div className="note">Calendar coverage through {pick.calendar.horizon ? day(pick.calendar.horizon) : 'unknown'}.{pick.calendar.horizonExpired && ' No later official dates are loaded.'}</div>
          </Section>
          {pick.s ? (
            <div className="cols">
              <Section title={`${pick.b.name}: ${pick.b.rate}`} right={`${pick.moves.length} moves since ${day(pick.s.changes[0][0])}`}>
                <XYChart
                  height={220}
                  series={[{ label: pick.b.rate, color: '#ffb547', points: stepPoints(pick.s, now) }, { label: 'Confirmed announcement target', kind: 'scatter', color: '#00d1c1', points: decisions.map((d) => ({ x: d.announcedAt ?? d.retrievedAt, y: d.upper, label: policyDecisionLabel(d) })) }]}
                  xFormat={(v) => fmtDay(v)}
                  yFormat={(v) => `${fmtNum(v, 2)}%`}
                  legend={false}
                />
                <div className="note">
                  From the start of the history read ({day(pick.s.changes[0][0])}): {(() => {
                    const total = Math.round((pick.s.last - pick.s.changes[0][1]) * 10_000) / 100;
                    return `${total > 0 ? '+' : ''}${fmtNum(total, 0)} bp`;
                  })()}.
                  {pick.b.code === 'BOJ' && " The basic loan rate moves with the Bank's guideline for the overnight call rate, which its statements give."}
                </div>
              </Section>
              <Section title="Moves">
                <table className="tbl" data-testid="cbrt-moves">
                  <thead>
                    <tr>
                      <th>In force from</th>
                      <th className="num">Level</th>
                      <th className="num">Change</th>
                      <th className="num hide-m">Calendar match</th>
                      <th className="num hide-m">Days since the one before</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pick.moves.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty">
                          No move since {day(pick.s.changes[0][0])}.
                        </td>
                      </tr>
                    )}
                    {[...pick.moves].reverse().map((m) => (
                      <tr key={m.date}>
                        <td>{day(m.date)}</td>
                        <td className="num white">{fmtNum(m.level, 2)}%</td>
                        <td className="num">
                          <Chg v={m.change * 100} dec={0} /> bp
                        </td>
                        <td className="num hide-m">{m.meeting ? <a href={m.sourceUrl} target="_blank" rel="noreferrer noopener">{day(m.meeting)} · statement</a> : m.scheduledCandidate ? `${day(m.scheduledCandidate)} · unverified` : '--'}</td>
                        <td className="num hide-m">{Number.isFinite(m.gapDays) ? fmtNum(m.gapDays, 0) : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pick.b.code === 'FED' && (
                  <div className="pad-s">
                    <button type="button" className="act" onClick={() => execute(panel, 'RATEPROBS')}>
                      The next moves priced by fed funds futures (RATEPROBS)
                    </button>
                  </div>
                )}
              </Section>
            </div>
          ) : (
            <div className="empty">{pick.b.name}&apos;s rate has not loaded yet, or its service did not answer.</div>
          )}
          <div className="note">
            Each rate observation keeps its own date. History steps stop at dated effective evidence; chart dots mark announced targets separately. A confirmed HOLD never creates an extra move when earlier rate history is missing. A meeting within eight days of a move is only a calendar match. The loaded history is about four years and calendars have explicit coverage limits. Paths the markets price are on RATEPROBS for the Fed only: the app has no other banks&apos; rate futures.
            {loaded.length < RATE_BANKS.length && ` Not loaded yet: ${rows.filter((r) => !r.s).map((r) => r.b.name).join(', ')}.`}
            {' '}The PBoC, RBI and Banxico rates come from the BIS&apos;s compilation, which follows each bank by days to weeks: Source as of is the date of its latest observation.
          </div>
          <Credits ids={['bis']} />
        </>
      )}
    </div>
  );
}
