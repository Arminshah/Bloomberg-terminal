import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { RowNo } from '../components/Numbered';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtNum } from '../core/format';
import { meetingsOf } from '../data/eco';
import { policyRates, type PolicyRates, type PolicySeries } from '../data/live/policy';
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
];

const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));
const yearAgo = (now: number) => new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);

export function CBRT(_: FnProps) {
  useTick(30);
  const panel = usePanelId();
  const rates = policyRates.use((r) => r);
  const [chosen, setChosen] = useState('FED');
  const now = engine.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const meetings = (code: string) => (code === 'FED' && rates.fomc?.length ? rates.fomc : meetingsOf(code));
  const rows = RATE_BANKS.map((b) => {
    const s = rates[b.key] as PolicySeries | undefined;
    const moves = s ? rateMoves(s, meetings(b.code)) : [];
    return { b, s, moves, year: s ? changeSince(s, yearAgo(now)) : NaN, count: movesSince(moves, yearAgo(now)), next: meetings(b.code).find((m) => m >= today) };
  });
  const nums = useNumberedRows('cbrt-banks', rows, 1, (r) => setChosen(r.b.code), (r) => r.b.name);
  const pick = rows.find((r) => r.b.code === chosen) ?? rows[0];
  const loaded = rows.filter((r) => r.s);
  return (
    <div>
      <FnHeader code="RATEANALYSIS" title="Central Bank Rate Analysis" sub={engine.realOnly ? <><RealBadge /> each bank&apos;s own data: its rate and every move over about four years</> : "The banks' rate histories are read by the desktop app"} />
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
                <th className="num">Last move</th>
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
                    <td className="hide-m muted">{r.b.rate}</td>
                    <td className="num white">{r.s ? `${fmtNum(r.s.last, 2)}%` : '--'}</td>
                    <td className="num hide-m">{last ? day(last.date) : '--'}</td>
                    <td className="num">{last ? <><Chg v={last.change * 100} dec={0} /> bp</> : '--'}</td>
                    <td className="num">{Number.isFinite(r.year) ? <><Chg v={r.year * 100} dec={0} /> bp</> : '--'}</td>
                    <td className="num hide-m">{r.s ? `${r.count.up} up, ${r.count.down} down` : '--'}</td>
                    <td className="num hide-m">{r.next ? day(r.next) : '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pick.s ? (
            <div className="cols">
              <Section title={`${pick.b.name}: ${pick.b.rate}`} right={`${pick.moves.length} moves since ${day(pick.s.changes[0][0])}`}>
                <XYChart
                  height={220}
                  series={[{ label: pick.b.rate, color: '#ffb547', points: stepPoints(pick.s, now) }]}
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
                      <th className="num hide-m">Decided</th>
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
                        <td className="num hide-m">{m.meeting ? day(m.meeting) : '--'}</td>
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
            Each rate is from the bank&apos;s own data service (as on CENTRALBANKS and the bank portals FED, ECB, BOE and BOJ), dated when a new level took effect; a move is matched to the meeting that decided it when one came within eight days before, from the bank&apos;s published calendar (the
            app holds calendars from 2026). Paths the markets price are on RATEPROBS for the Fed only: the app has no other banks&apos; rate futures.
            {loaded.length < RATE_BANKS.length && ` Not loaded yet: ${rows.filter((r) => !r.s).map((r) => r.b.name).join(', ')}.`}
          </div>
        </>
      )}
    </div>
  );
}
