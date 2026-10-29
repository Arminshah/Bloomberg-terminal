import { FnHeader } from '../components/FnHeader';
import { Chg, KV, Section } from '../components/cells';
import { RowNo } from '../components/Numbered';
import { RealBadge, SimBadge } from '../components/Source';
import { fmtDateTime, fmtDay, fmtNum, fmtTime } from '../core/format';
import { centralBanks, meetingsOf } from '../data/eco';
import { policyRates } from '../data/live/policy';
import { currentPolicyTarget, effectivePolicyHistory, latestPolicyDecision, policyDecisionLabel, policyEffectiveAt, policyMeetingState, policyTargetHealth, visibleDecisions } from '../data/policy-state';
import { rateMoves } from '../data/rate-analysis';
import { engine, useTick } from '../data/market';
import { news } from '../data/news';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/** The Board's own pages: its decisions, publications, speeches and an introduction to the Fed. */
export const FED_PAGES: { label: string; url: string }[] = [
  { label: 'FOMC calendars, statements and minutes', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
  { label: 'Press releases', url: 'https://www.federalreserve.gov/newsevents/pressreleases.htm' },
  { label: 'Speeches and testimony', url: 'https://www.federalreserve.gov/newsevents/speeches-testimony.htm' },
  { label: 'Beige Book', url: 'https://www.federalreserve.gov/monetarypolicy/publications/beige-book-default.htm' },
  { label: 'Monetary Policy Report', url: 'https://www.federalreserve.gov/monetarypolicy/publications/mpr_default.htm' },
  { label: 'H.15 Selected Interest Rates', url: 'https://www.federalreserve.gov/releases/h15/' },
  { label: 'About the Fed', url: 'https://www.federalreserve.gov/aboutthefed.htm' },
];

/** The app's screens on the Fed and US rates. */
export const FED_FUNCTIONS: { label: string; command: string }[] = [
  { label: 'FOMC announcement dates and decisions', command: 'FEDMEETINGS' },
  { label: 'Rate probabilities priced by futures', command: 'RATEPROBS' },
  { label: 'Treasury and money markets', command: 'MONEYMARKET' },
  { label: 'US Treasury curve', command: 'CURVE US' },
  { label: 'Central bank monitor', command: 'CENTRALBANKS' },
  { label: 'US economic releases', command: 'RELEASES' },
  { label: 'Macro dashboard', command: 'MACRO' },
];

/**
 * FED: a portal on the Federal Reserve, as the terminal's FED is (V04): the policy rate, the meetings, the Board's
 * announcements, its publications, and the app's screens on US rates.
 */
export function FED(_: FnProps) {
  useTick(30);
  const panel = usePanelId();
  const rates = policyRates.use((r) => r);
  const stories = news.use((n) => n.stories);
  const now = engine.now();
  const fed = centralBanks(now).find((b) => b.code === 'FED');
  const upper = rates.fedUpper;
  const real = engine.realOnly;
  const meetings = rates.fomc ?? meetingsOf('FED');
  const current = currentPolicyTarget(rates, 'FED', upper, now);
  const history = effectivePolicyHistory(rates, 'FED', upper, now);
  const range = real ? Number.isFinite(current.value) ? `${Number.isFinite(current.lower) ? `${fmtNum(current.lower!, 2)} - ` : ''}${fmtNum(current.value, 2)}%` : '--' : `${fmtNum(fed?.rate ?? NaN, 2)}% (upper bound, reference)`;
  const latest = latestPolicyDecision(rates, 'FED', now);
  const lastMove = history ? rateMoves(history, meetings, visibleDecisions(rates.decisions ?? [], 'FED', now)).at(-1) : undefined;
  const calendar = policyMeetingState('FED', meetings, rates.decisions ?? [], now);
  const health = policyTargetHealth(rates, 'FED', 'fedUpper', now);
  const auditState = { schema: 1, domain: 'policy', capturedAt: now, banks: [{ code: 'FED', current: { value: current.value, upper: current.value, lower: current.lower, effectiveAt: current.effectiveDate ? policyEffectiveAt('FED', current.effectiveDate) : undefined, sourceAsOf: current.sourceAsOf, sourceUrl: current.sourceUrl ?? health?.source, lastSuccessfulAt: health?.checkedAt, lastAttemptAt: health?.attemptedAt, freshnessState: health?.state, stale: health?.state === 'cached' || health?.state === 'error', error: health?.error }, latestDecision: latest ? { ...latest, outcome: latest.action } : undefined, nextDecision: calendar.next, awaitingDecision: calendar.awaiting, calendarThrough: calendar.horizon }] };
  const funding = (type: string) => rates.funding?.find((f) => f.type === type);
  const effr = funding('EFFR');
  const sofr = funding('SOFR');
  const board = stories.filter((s) => s.source.startsWith('Federal Reserve')).slice(0, 8);
  const nums = useNumberedRows('fed-functions', FED_FUNCTIONS, 1, (f) => execute(panel, f.command), (f) => f.label);
  return (
    <div data-audit-state={JSON.stringify(auditState)}>
      <FnHeader code="FEDPORTAL" title="Federal Reserve" sub={real ? <><RealBadge /> New York Fed rates · Federal Reserve Board calendar and announcements</> : <><SimBadge /> the browser demo has a reference rate, not the Fed&apos;s</>} />
      <div className="cols">
        <Section title="Policy">
          <KV
            items={[
              ['Target range for fed funds', <span key="r" className="white b">{range}</span>],
              ['In force since', real && current.effectiveDate ? fmtDay(Date.parse(`${current.effectiveDate}T00:00:00Z`)) : '--'],
              ['Latest confirmed decision', latest ? <a key="d" href={latest.sourceUrl} target="_blank" rel="noreferrer noopener">{fmtDay(Date.parse(`${latest.date}T00:00:00Z`))}, {policyDecisionLabel(latest)}</a> : 'Statement not archived'],
              ['Last nonzero change', real && lastMove ? <span key="l">{fmtDay(Date.parse(`${lastMove.date}T00:00:00Z`))}, <Chg v={lastMove.change * 100} dec={0} /> bp</span> : '--'],
              ['Next decision', calendar.next ? `${fmtDay(Date.parse(`${calendar.next.date}T00:00:00Z`))}, 14:00 New York (scheduled)` : 'Calendar exhausted'],
              ['Effective fed funds rate', effr ? `${fmtNum(effr.rate, 2)}% on ${fmtDay(Date.parse(`${effr.date}T00:00:00Z`))}` : '--'],
              ['SOFR', sofr ? `${fmtNum(sofr.rate, 2)}% on ${fmtDay(Date.parse(`${sofr.date}T00:00:00Z`))}` : '--'],
            ]}
          />
          {calendar.awaiting && <div className="note amber">Awaiting the official statement for {calendar.awaiting.date}. The scheduled time has passed; no outcome is inferred.</div>}
          {latest?.effectiveDate && policyEffectiveAt('FED', latest.effectiveDate) > now && <div className="note">The announced target takes effect {latest.effectiveDate}; the current range retains its earlier effective level.</div>}
          {real && <div className="note">{health?.checkedAt ? `Latest successful target check: ${fmtDateTime(health.checkedAt)}.` : 'No successful target check recorded.'}{health?.error && ` Latest check failed: ${health.error} Retained figures keep their original dates.`}{current.conflict && ` ${current.conflict}`}</div>}
          {real && health?.state === 'cached' && <div className="note">The current target uses cached evidence; its successful-check time has not advanced.</div>}
          {real && <div className="note">{rates.health?.nyfed?.checkedAt ? `Latest successful funding-rate check: ${fmtDateTime(rates.health.nyfed.checkedAt)}.` : 'No successful funding-rate check recorded.'}{rates.health?.nyfed?.error && ` Latest funding-rate check failed: ${rates.health.nyfed.error}`}</div>}
          <div className="note">Calendar coverage through {calendar.horizon ?? 'unknown'}.{calendar.horizonExpired && ' No later official meeting dates are loaded.'}</div>
        </Section>
        <Section title="Federal Reserve Board announcements">
          {board.length ? (
            <table className="tbl">
              <tbody>
                {board.map((s) => (
                  <tr key={s.id}>
                    <td className="muted nowrap">{fmtDay(s.time)} {fmtTime(s.time, false)}</td>
                    <td>{s.url ? <a className="blue" href={s.url} target="_blank" rel="noreferrer noopener">{s.headline}</a> : s.headline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">{engine.realOnly ? 'Loading the Board’s press releases…' : 'The Board’s press releases are read in the desktop app.'}</div>
          )}
          <div className="pad-s">
            <button type="button" className="act" onClick={() => execute(panel, 'NEWS CB')}>Central bank announcements (NEWS CB)</button>
          </div>
        </Section>
      </div>
      <div className="cols">
        <Section title="The Board's pages">
          <ul className="link-list">
            {FED_PAGES.map((p) => (
              <li key={p.url}>
                <a className="blue" href={p.url} target="_blank" rel="noreferrer noopener">{p.label} ↗</a>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Screens on US rates">
          <table className="tbl">
            <tbody>
              {FED_FUNCTIONS.map((f, i) => (
                <tr key={f.command} className="click" onClick={() => execute(panel, f.command)}>
                  <td className="amber"><RowNo n={nums[i]} />{f.label}</td>
                  <td className="yellow">{f.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <div className="note">Confirmed decisions come from the Board&apos;s statements; an explicitly verified implementation date determines when an announced target becomes current. Daily observations and funding rates remain separately dated. Meeting days are the Board&apos;s calendar. Links open the Board&apos;s site in your browser.</div>
    </div>
  );
}
