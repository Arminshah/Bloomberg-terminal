import { FnHeader } from '../components/FnHeader';
import { Chg, KV, Section } from '../components/cells';
import { RowNo } from '../components/Numbered';
import { RealBadge, SimBadge } from '../components/Source';
import { fmtDateTime, fmtDay, fmtNum, fmtTime } from '../core/format';
import { centralBanks, meetingsOf } from '../data/eco';
import { policyRates, POLICY_SOURCE, type PolicyRates, type PolicySeries } from '../data/live/policy';
import type { PolicyDecision } from '../data/live/policy-decisions';
import { bankDate, currentPolicyTarget, effectivePolicyHistory, effectivePolicySeries, latestPolicyDecision, policyDecisionLabel, policyMeetingState, visibleDecisions } from '../data/policy-state';
import { rateMoves } from '../data/rate-analysis';
import { engine, useTick } from '../data/market';
import { news } from '../data/news';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * ECB, BOE and BOJ: portals on the European Central Bank, the Bank of England and the Bank of Japan, as FED is on the
 * Federal Reserve (the provider's 2020 Quick Start lists them with FED). Each gathers the policy rate from the bank's
 * own data with its last move, the next decision from the bank's published calendar, the overnight benchmark it
 * publishes, its latest announcements, its own pages and the app's screens on its market.
 */

type SeriesKey = keyof Pick<PolicyRates, 'ecb' | 'boe' | 'bojLoan' | 'estr' | 'sonia' | 'bojCall'>;

interface Portal {
  fn: string;
  code: 'ECB' | 'BOE' | 'BOJ';
  title: string;
  /** The news source names its announcements carry. */
  publisher: string;
  policy: { label: string; key: SeriesKey; about: string };
  overnight: { label: string; key: SeriesKey; about: string };
  /** When decisions are announced, in the bank's own time. */
  when: string;
  pages: { label: string; url: string }[];
  functions: { label: string; command: string }[];
  source: string;
  credit?: string;
}

export const PORTALS: Record<string, Portal> = {
  ECBPORTAL: {
    fn: 'ECBPORTAL',
    code: 'ECB',
    title: 'European Central Bank',
    publisher: 'European Central Bank',
    policy: { label: 'Deposit facility rate', key: 'ecb', about: 'The rate the ECB steers policy with (ECB Data Portal, FM dataset).' },
    overnight: { label: 'Euro short-term rate (€STR)', key: 'estr', about: 'The overnight unsecured rate euro area banks borrow at, published by the ECB each TARGET day (EST dataset).' },
    when: '14:15 Frankfurt',
    pages: [
      { label: 'Monetary policy decisions', url: 'https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html' },
      { label: 'Monetary policy statements (press conferences)', url: 'https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/html/index.en.html' },
      { label: 'Accounts of the monetary policy meetings', url: 'https://www.ecb.europa.eu/press/accounts/html/index.en.html' },
      { label: 'Key ECB interest rates', url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html' },
      { label: 'Staff macroeconomic projections', url: 'https://www.ecb.europa.eu/press/projections/html/index.en.html' },
      { label: 'Economic Bulletin', url: 'https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html' },
      { label: 'Speeches', url: 'https://www.ecb.europa.eu/press/key/html/index.en.html' },
      { label: 'Meeting calendar', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html' },
    ],
    functions: [
      { label: 'Central bank monitor', command: 'CENTRALBANKS' },
      { label: 'German Bund curve', command: 'CURVE DE' },
      { label: 'World bond markets', command: 'BONDS' },
      { label: 'Economic calendar', command: 'RELEASES' },
      { label: 'World economic statistics', command: 'ECONSTATS' },
      { label: 'World currency rates', command: 'WCR' },
      { label: 'Central bank announcements', command: 'NEWS CB' },
    ],
    source: "The deposit facility rate and €STR are the ECB's (ECB Data Portal); the meeting days are its published calendar; announcements are its press and blog feeds.",
  },
  BOEPORTAL: {
    fn: 'BOEPORTAL',
    code: 'BOE',
    title: 'Bank of England',
    publisher: 'Bank of England',
    policy: { label: 'Bank Rate', key: 'boe', about: "The Bank's policy rate (Bank of England database, IUDBEDR)." },
    overnight: { label: 'SONIA', key: 'sonia', about: 'The sterling overnight index average, which the Bank administers (Bank of England database, IUDSOIA).' },
    when: '12:00 London',
    pages: [
      { label: 'Monetary Policy Summary and minutes', url: 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/monetary-policy-summary-and-minutes' },
      { label: 'Monetary Policy Report', url: 'https://www.bankofengland.co.uk/monetary-policy-report/monetary-policy-report' },
      { label: 'Bank Rate history', url: 'https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp' },
      { label: 'Upcoming MPC dates', url: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates' },
      { label: 'Financial stability', url: 'https://www.bankofengland.co.uk/financial-stability' },
      { label: 'Speeches', url: 'https://www.bankofengland.co.uk/news/speeches' },
    ],
    functions: [
      { label: 'Central bank monitor', command: 'CENTRALBANKS' },
      { label: 'UK gilt curve', command: 'CURVE GB' },
      { label: 'World bond markets', command: 'BONDS' },
      { label: 'Economic calendar', command: 'RELEASES' },
      { label: 'World economic statistics', command: 'ECONSTATS' },
      { label: 'World currency rates', command: 'WCR' },
      { label: 'Central bank announcements', command: 'NEWS CB' },
    ],
    source: "Bank Rate and SONIA are from the Bank of England database; the decision days are the Bank's published MPC dates; announcements are its news feed.",
  },
  BOJPORTAL: {
    fn: 'BOJPORTAL',
    code: 'BOJ',
    title: 'Bank of Japan',
    publisher: 'Bank of Japan',
    policy: {
      label: 'Basic loan rate',
      key: 'bojLoan',
      about: "The rate of the Bank's complementary lending facility, changed with each change in its guideline (Time-Series Data Search, IR01). The guideline itself, for the overnight call rate, is in each policy statement.",
    },
    overnight: { label: 'Uncollateralized overnight call rate, average', key: 'bojCall', about: "The market rate the Bank's guideline for money market operations targets (Time-Series Data Search, FM01)." },
    when: 'when the meeting ends, usually around midday Tokyo',
    pages: [
      { label: 'Statements on monetary policy', url: 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm' },
      { label: 'Meeting schedule, summaries of opinions and minutes', url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm' },
      { label: 'Outlook for Economic Activity and Prices', url: 'https://www.boj.or.jp/en/mopo/outlook/index.htm' },
      { label: 'Tankan survey', url: 'https://www.boj.or.jp/en/statistics/tk/index.htm' },
      { label: 'Speeches and press conferences', url: 'https://www.boj.or.jp/en/about/press/index.htm' },
      { label: 'Time-Series Data Search', url: 'https://www.stat-search.boj.or.jp/index_en.html' },
    ],
    functions: [
      { label: 'Central bank monitor', command: 'CENTRALBANKS' },
      { label: 'Japan JGB curve', command: 'CURVE JP' },
      { label: 'World bond markets', command: 'BONDS' },
      { label: 'Economic calendar', command: 'RELEASES' },
      { label: 'World economic statistics', command: 'ECONSTATS' },
      { label: 'World currency rates', command: 'WCR' },
      { label: 'Central bank announcements', command: 'NEWS CB' },
    ],
    source: "The basic loan rate and the call rate are from the Bank of Japan's Time-Series Data Search; the meeting days are its published schedule; announcements are its what's-new feed.",
    credit: 'This service uses the API provided by the "Bank of Japan Time-Series Data Search." The Bank of Japan does not guarantee the content of the service.',
  },
};

const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));

/**
 * The last nonzero effective change. A nearby calendar date is only a candidate; statement evidence is required
 * to link an announcement to the change or call it unscheduled.
 */
export function lastMove(s: PolicySeries | undefined, meetings: readonly string[], decisions: readonly PolicyDecision[] = []): { since: string; level: number; move: number; meeting?: string; scheduledCandidate?: string; unscheduled?: boolean } | undefined {
  if (!s || s.changes.length < 2) return s?.changes.length ? { since: s.changes[0][0], level: s.changes[0][1], move: NaN } : undefined;
  const move = rateMoves(s, meetings, decisions).at(-1);
  return move ? { since: move.date, level: move.level, move: move.change, ...(move.meeting ? { meeting: move.meeting, ...(!meetings.includes(move.meeting) ? { unscheduled: true } : {}) } : {}), ...(move.scheduledCandidate ? { scheduledCandidate: move.scheduledCandidate } : {}) } : undefined;
}

function CentralBankPortal({ fn }: { fn: string }) {
  useTick(30);
  const panel = usePanelId();
  const p = PORTALS[fn];
  const rates = policyRates.use((r) => r);
  const stories = news.use((n) => n.stories);
  const ref = centralBanks().find((b) => b.code === p.code);
  const now = engine.now();
  const meetings = meetingsOf(p.code);
  const observed = effectivePolicySeries(rates[p.policy.key] as PolicySeries | undefined, bankDate(p.code, now));
  const policy = effectivePolicyHistory(rates, p.code, observed, now);
  const current = currentPolicyTarget(rates, p.code, observed, now);
  const overnight = effectivePolicySeries(rates[p.overnight.key] as PolicySeries | undefined, bankDate(p.code, now));
  const real = engine.realOnly;
  const move = lastMove(policy, meetings, visibleDecisions(rates.decisions ?? [], p.code, now));
  const calendar = policyMeetingState(p.code, meetings, rates.decisions ?? [], now);
  const decision = latestPolicyDecision(rates, p.code, now);
  const source = POLICY_SOURCE[p.policy.key];
  const health = source ? rates.health?.[source] : undefined;
  const overnightSource = POLICY_SOURCE[p.overnight.key];
  const overnightHealth = overnightSource ? rates.health?.[overnightSource] : undefined;
  const latest = overnight ? { level: overnight.last, on: overnight.asOf } : undefined;
  const board = stories.filter((s) => s.source.startsWith(p.publisher)).slice(0, 8);
  const nums = useNumberedRows(`${fn}-functions`, p.functions, 1, (f) => execute(panel, f.command), (f) => f.label);
  // In the browser demo the rate is a reference setting, not the bank's: said so in the header.
  const policyValue = real ? (Number.isFinite(current.value) ? `${fmtNum(current.value, 2)}%` : '--') : ref ? `${fmtNum(ref.rate, 2)}% (reference)` : '--';
  const sinceValue = real ? (move ? day(move.since) : '--') : ref ? `${day(ref.last)} (reference)` : '--';
  const lastValue = real
    ? move && Number.isFinite(move.move)
      ? <span key="l"><Chg v={move.move * 100} dec={0} /> bp{move.meeting ? `, confirmed ${day(move.meeting)}${move.unscheduled ? ' (unscheduled)' : ''}` : move.scheduledCandidate ? `, calendar match ${day(move.scheduledCandidate)} (unverified)` : ''}</span>
      : '--'
    : ref ? <span key="l"><Chg v={ref.lastMove * 100} dec={0} /> bp (reference)</span> : '--';
  return (
    <div>
      <FnHeader
        code={fn}
        title={p.title}
        sub={real ? <><RealBadge /> {p.title}&apos;s own data, calendar and announcements</> : <><SimBadge /> the browser demo has a reference rate, not the bank&apos;s</>}
      />
      <div className="cols">
        <Section title="Policy">
          <KV
            items={[
              [p.policy.label, <span key="r" className="white b" title={p.policy.about}>{policyValue}</span>],
              ['In force since', sinceValue],
              ['Last move', lastValue],
              ['Latest confirmed decision', decision ? <a key="d" href={decision.sourceUrl} target="_blank" rel="noreferrer noopener">{day(decision.date)}, {policyDecisionLabel(decision)}</a> : 'Statement not archived'],
              ['Next decision', calendar.next ? `${day(calendar.next.date)}, ${p.when} (scheduled)` : 'Calendar exhausted'],
              [p.overnight.label, <span key="o" title={p.overnight.about}>{real && latest ? `${fmtNum(latest.level, 3)}% on ${day(latest.on)}` : '--'}</span>],
            ]}
          />
          <div className="note">{health?.checkedAt ? `Latest successful policy-rate check: ${fmtDateTime(health.checkedAt)}.` : 'No successful policy-rate check recorded.'}{health?.error && ` Latest policy-rate check failed: ${health.error} Retained values keep their dates.`}{overnightHealth?.error && ` Latest overnight-rate check failed: ${overnightHealth.error}`}</div>
          {real && health?.state === 'cached' && <div className="note">The policy rate uses cached evidence; its successful-check time has not advanced.</div>}
          <div className="note">Calendar coverage through {calendar.horizon ? day(calendar.horizon) : 'unknown'}.{calendar.horizonExpired && ' No later official dates are loaded.'} Published statements for this bank are not automatically archived here; rate observations do not confirm a HOLD.</div>
          {real && !policy && <div className="note">The {p.title}&apos;s rate has not loaded yet, or its service did not answer; nothing is shown in its place.</div>}
        </Section>
        <Section title={`${p.title} announcements`}>
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
            <div className="empty">{real ? `Loading the ${p.title}'s announcements…` : `The ${p.title}'s announcements are read in the desktop app.`}</div>
          )}
        </Section>
      </div>
      <div className="cols">
        <Section title={`The ${p.title}'s pages`}>
          <ul className="link-list">
            {p.pages.map((pg) => (
              <li key={pg.url}>
                <a className="blue" href={pg.url} target="_blank" rel="noreferrer noopener">{pg.label} ↗</a>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Screens on its market">
          <table className="tbl">
            <tbody>
              {p.functions.map((f, i) => (
                <tr key={f.command} className="click" onClick={() => execute(panel, f.command)}>
                  <td className="amber"><RowNo n={nums[i]} />{f.label}</td>
                  <td className="yellow">{f.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <div className="note">
        {p.source} The last move is the latest nonzero effective change. A nearby scheduled meeting is labelled an unverified calendar match. Links open the bank&apos;s site in your browser.
        {p.credit && <> {p.credit}</>}
      </div>
    </div>
  );
}

export const ECB = (_: FnProps) => <CentralBankPortal fn="ECBPORTAL" />;
export const BOE = (_: FnProps) => <CentralBankPortal fn="BOEPORTAL" />;
export const BOJ = (_: FnProps) => <CentralBankPortal fn="BOJPORTAL" />;
