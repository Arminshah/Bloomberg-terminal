// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { RealBadge, SimBadge } from '../components/Source';
import { fmtDateTime, fmtNum } from '../core/format';
import { centralBanks, meetingsOf, newYorkDate } from '../data/eco';
import { fomcRows, fomcYears } from '../data/fomc';
import { policyRates } from '../data/live/policy';
import { currentPolicyTarget, latestPolicyDecision, policyEffectiveAt, policyMeetingState, policyTargetHealth } from '../data/policy-state';
import { engine, useTick } from '../data/market';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "January 28", as the terminal's FOMC table writes its announcement dates. */
function longDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

const RELATED: [string, string][] = [
  ['RATEPROBS', 'Fed funds futures implied probabilities'],
  ['CENTRALBANKS', 'Central bank rates and next decisions'],
  ['MONEYMARKET', 'Treasury and money markets'],
  ['RELEASES', 'Economic calendar'],
  ['NEWS CB', 'Central bank announcements'],
];

/**
 * Scheduled meetings and official statement decisions share a timeline; daily rate observations keep their own
 * status and never confirm a HOLD or identify an announcement by calendar proximity.
 */
export function FOMC(_: FnProps) {
  useTick(30);
  const panel = usePanelId();
  const fed = centralBanks().find((b) => b.code === 'FED');
  const rates = policyRates.use((r) => r);
  const meetings = rates.fomc ?? fed?.meetings ?? meetingsOf('FED');
  const years = fomcYears([...meetings, ...(rates.decisions ?? []).filter((d) => d.bank === 'FED').map((d) => d.date)]);
  const now = engine.now();
  const today = newYorkDate(now);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(years.includes(thisYear) ? thisYear : (years[years.length - 1] ?? thisYear));
  // A handful of meetings a year: worked out on every render, so a newly loaded rate series shows at once.
  const rows = fomcRows(meetings.filter((m) => m.startsWith(String(year))), rates.fedLower, rates.fedUpper, today, (rates.decisions ?? []).filter((d) => d.date.startsWith(String(year))), now);
  const calendar = policyMeetingState('FED', meetings, rates.decisions ?? [], now);
  const current = currentPolicyTarget(rates, 'FED', rates.fedUpper, now);
  const latest = latestPolicyDecision(rates, 'FED', now);
  const health = policyTargetHealth(rates, 'FED', 'fedUpper', now);
  const auditState = { schema: 1, domain: 'policy', capturedAt: now, banks: [{ code: 'FED', current: { value: current.value, upper: current.value, lower: current.lower, effectiveAt: current.effectiveDate ? policyEffectiveAt('FED', current.effectiveDate) : undefined, sourceAsOf: current.sourceAsOf, sourceUrl: current.sourceUrl ?? health?.source, lastSuccessfulAt: health?.checkedAt, lastAttemptAt: health?.attemptedAt, freshnessState: health?.state, stale: health?.state === 'cached' || health?.state === 'error', error: health?.error }, latestDecision: latest ? { ...latest, outcome: latest.action } : undefined, nextDecision: calendar.next, awaitingDecision: calendar.awaiting, calendarThrough: calendar.horizon }] };
  const items: MenuItem[] = useMemo(() => RELATED.map(([cmd, label], i) => ({ n: 21 + i, label, run: () => execute(panel, cmd) })), [panel]);
  useMenu('fomc-related', items);
  const real = !!rates.fedUpper || !!latest;
  const range = (lo: number, hi: number) => (Number.isFinite(hi) ? (Number.isFinite(lo) && lo !== hi ? `${fmtNum(lo, 2)} - ${fmtNum(hi, 2)}` : fmtNum(hi, 2)) : '');
  return (
    <div data-audit-state={JSON.stringify(auditState)}>
      <FnHeader
        code="FEDMEETINGS"
        title="FOMC Announcement Dates"
        sub={
          real ? (
            <>
              <RealBadge /> Board calendar and confirmed statements · separately dated New York Fed observations
            </>
          ) : engine.realOnly ? (
            'Federal Reserve Board calendar · loading the target range from the New York Fed…'
          ) : (
            <>
              <SimBadge /> meeting calendar only; the browser demo has no record of past decisions
            </>
          )
        }
        tabs={years.map((y, i) => ({ n: i + 1, label: String(y) }))}
        tab={years.indexOf(year) + 1}
        onTab={(n) => setYear(years[n - 1])}
      />
      <table className="tbl" data-testid="fomc-decisions">
        <thead>
          <tr>
            <th>Announcement Date</th>
            <th>Time</th>
            <th className="num" title="Announced target range for confirmed statements; separately labelled daily-series levels otherwise">
              Rate (%)
            </th>
            <th className="num" title="Official statement change, or a separately labelled upper-bound series comparison">
              Change (bp)
            </th>
            <th>Status</th>
            <th>Effective date</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                {engine.realOnly ? 'Loading the meeting calendar from the Federal Reserve Board…' : 'No meetings listed for this year.'}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.date} data-policy-date={r.date} data-policy-status={r.status} className={(r.status === 'confirmed' || r.status === 'observed') ? '' : 'eco-ahead'}>
              <td className={(r.status === 'confirmed' || r.status === 'observed') ? 'white' : 'amber'}>
                {longDate(r.date)}
              </td>
              <td>{r.decision ? r.decision.announcedAt ? `${new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(r.decision.announcedAt)} ET` : 'Time not provided' : '14:00 ET (scheduled)'}</td>
              <td className="num white">{range(r.lower, r.upper)}</td>
              <td className="num">
                {Number.isFinite(r.changeBp) ? <span className={r.changeBp > 0 ? 'up' : r.changeBp < 0 ? 'dn' : ''}>{r.changeBp > 0 ? `+${r.changeBp}` : r.changeBp}</span> : null}
              </td>
              <td className={r.status === 'today' ? 'yellow' : 'muted'}>{r.status === 'confirmed' ? <a href={r.decision!.sourceUrl} target="_blank" rel="noreferrer noopener">Confirmed{r.decision!.action === 'hold' ? ': unchanged' : ''}{!r.scheduled ? ' (unscheduled)' : ''}</a> : r.status === 'observed' ? 'Series observation; statement not archived' : r.status === 'awaiting' ? 'Awaiting statement' : r.status === 'today' ? 'Scheduled today' : 'Scheduled'}</td>
              <td>{r.decision?.effectiveDate ? <>{r.decision.effectiveDate}{policyEffectiveAt('FED', r.decision.effectiveDate) > now ? ' (announced, not yet effective)' : ''}</> : r.decision ? 'Not verified' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Section title="Related Information">
        <div className="des-related" style={{ borderTop: 0 }}>
          {RELATED.map(([cmd, label], i) => (
            <button key={cmd} type="button" className="des-link" onClick={() => execute(panel, cmd)}>
              <b className="des-n">{21 + i})</b> {label}
            </button>
          ))}
        </div>
      </Section>
      <div className="note">
        Scheduled announcements are at 2:00 p.m. Eastern time. Confirmed statement records include unscheduled releases discovered in the Board's calendar or announcements. Series-derived rows are observations, not verified announcement outcomes. The related functions open with 21) to 25).
        {rates.fedUpper ? ` The target range series reaches ${rates.fedUpper.asOf}.` : ''}
        {` Calendar coverage through ${calendar.horizon ?? 'unknown'}.`}{calendar.horizonExpired && ' No later official meeting dates are loaded.'}
        {rates.health?.fomc?.error && ` Calendar refresh failed: ${rates.health.fomc.error}`}
        {rates.health?.fedStatement?.checkedAt ? ` Latest successful statement check: ${fmtDateTime(rates.health.fedStatement.checkedAt)}.` : ' No successful statement check recorded.'}
        {rates.health?.fedStatement?.error && ` Latest statement check failed: ${rates.health.fedStatement.error} Retained decisions keep their dates.`}
        {health?.state === 'cached' && ' The current target uses cached evidence; its successful-check time has not advanced.'}
      </div>
    </div>
  );
}
