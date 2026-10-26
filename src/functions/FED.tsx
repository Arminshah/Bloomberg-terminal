import { FnHeader } from '../components/FnHeader';
import { Chg, KV, Section } from '../components/cells';
import { RowNo } from '../components/Numbered';
import { RealBadge, SimBadge } from '../components/Source';
import { fmtDay, fmtNum, fmtTime } from '../core/format';
import { centralBanks, newYorkDate } from '../data/eco';
import { fomcRows } from '../data/fomc';
import { policyRates } from '../data/live/policy';
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
  const fed = centralBanks().find((b) => b.code === 'FED')!;
  const today = newYorkDate(engine.now());
  const upper = rates.fedUpper;
  const lower = rates.fedLower;
  const real = !!upper;
  const range = real ? `${fmtNum(lower?.last ?? NaN, 2)} - ${fmtNum(upper.last, 2)}%` : `${fmtNum(fed.rate, 2)}% (upper bound)`;
  const since = upper?.changes.at(-1)?.[0];
  const decided = fomcRows(fed.meetings, lower, upper, today).filter((r) => r.status === 'decided' && Number.isFinite(r.changeBp));
  const last = decided.at(-1);
  const next = fed.meetings.find((m) => m >= today);
  const days = next ? Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : NaN;
  const funding = (type: string) => rates.funding?.find((f) => f.type === type);
  const effr = funding('EFFR');
  const sofr = funding('SOFR');
  const board = stories.filter((s) => s.source.startsWith('Federal Reserve')).slice(0, 8);
  const nums = useNumberedRows('fed-functions', FED_FUNCTIONS, 1, (f) => execute(panel, f.command), (f) => f.label);
  return (
    <div>
      <FnHeader code="FEDPORTAL" title="Federal Reserve" sub={real ? <><RealBadge /> New York Fed rates · Federal Reserve Board calendar and announcements</> : <><SimBadge /> the browser demo has a reference rate, not the Fed&apos;s</>} />
      <div className="cols">
        <Section title="Policy">
          <KV
            items={[
              ['Target range for fed funds', <span key="r" className="white b">{range}</span>],
              ['In force since', since ? fmtDay(Date.parse(`${since}T00:00:00Z`)) : '--'],
              ['Last decision', last ? <span key="l">{fmtDay(Date.parse(`${last.date}T00:00:00Z`))}, <Chg v={last.changeBp} dec={0} /> bp</span> : '--'],
              ['Next decision', next ? `${fmtDay(Date.parse(`${next}T00:00:00Z`))} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}), 14:00 New York` : '--'],
              ['Effective fed funds rate', effr ? `${fmtNum(effr.rate, 2)}% on ${fmtDay(Date.parse(`${effr.date}T00:00:00Z`))}` : '--'],
              ['SOFR', sofr ? `${fmtNum(sofr.rate, 2)}% on ${fmtDay(Date.parse(`${sofr.date}T00:00:00Z`))}` : '--'],
            ]}
          />
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
      <div className="note">The target range and the funding rates are the New York Fed&apos;s; meeting days are the Board&apos;s calendar; announcements are the Board&apos;s press release feed. Links open the Board&apos;s site in your browser.</div>
    </div>
  );
}
