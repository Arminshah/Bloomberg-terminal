import { useCallback, useEffect, useRef, useState } from 'react';
import { KV, Section } from './cells';
import { fmtDateTime, fmtNum, fmtPct } from '../core/format';
import type { KeyedAnswer } from '../data/live/lookup';
import { parseAsset, parseRatings, parseUsage, rawText, tipranksTicker, type TipRanksKind } from '../data/live/tipranks';
import type { SecurityDef } from '../data/types';

const LABEL: Record<TipRanksKind, string> = { consensus: 'Consensus and price target', ratings: 'Analyst rating actions' };

function problem(answer: KeyedAnswer | undefined): string | undefined {
  if (!answer) return undefined;
  if (answer.missing) return 'Add TIPRANKS_API_KEY on PROVIDERS, then ask again.';
  if (answer.gated) return 'TipRanks is switched off. Enable TIPRANKS_ENABLED on PROVIDERS.';
  if (answer.refused) return 'The configured TipRanks key has the wrong format. Check TIPRANKS_API_KEY on PROVIDERS.';
  return answer.error;
}

/**
 * TipRanks analyst data, asked for only when you click: every call costs one of the account's monthly calls
 * (50 on the free plan). The ticker is TipRanks' own; for markets the app cannot map, type it as TipRanks
 * writes it (AB InBev is IT:1ABI there).
 */
export function TipRanksResearch({ def }: { def: SecurityDef }) {
  const guess = tipranksTicker(def);
  const [ticker, setTicker] = useState(guess);
  const [busy, setBusy] = useState<TipRanksKind | 'usage' | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<TipRanksKind | 'usage', KeyedAnswer>>>({});
  const alive = useRef(true);
  const available = typeof window !== 'undefined' && typeof window.arminDesktop?.tipranks === 'function';
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const ask = useCallback(async (kind: TipRanksKind | 'usage', t: string) => {
    if (!available) return;
    setBusy(kind);
    let answer: KeyedAnswer;
    try {
      answer = await window.arminDesktop!.tipranks!(kind, t);
    } catch {
      answer = { status: 0, text: '', error: 'TipRanks could not be asked.' };
    }
    if (!alive.current) return;
    setAnswers((a) => ({ ...a, [kind]: answer }));
    setBusy(null);
  }, [available]);
  // The usage check is free: it shows what is left before a call is spent.
  useEffect(() => {
    if (available) void ask('usage', '');
  }, [available, ask]);
  const t = ticker.trim().toUpperCase();
  const validTicker = /^(?:[A-Z]{2}:)?[A-Z0-9][A-Z0-9.-]{0,11}$/.test(t);
  const usage = answers.usage?.text ? parseUsage(answers.usage.text) : null;
  const asset = answers.consensus?.text ? parseAsset(answers.consensus.text) : null;
  const ratings = answers.ratings?.text ? parseRatings(answers.ratings.text) : null;
  const left = usage?.remaining;
  const spent = left !== undefined && left <= 0;
  const credit = (
    <a href={asset?.url ?? 'https://www.tipranks.com/'} target="_blank" rel="noreferrer noopener" className="blue">
      Data by TipRanks
    </a>
  );
  return (
    <Section title="TipRanks analyst view" right={credit}>
      <div className="pad-s">
        <div className="note" style={{ padding: '0 0 8px' }}>
          Analyst consensus, average 12-month price target and recent rating actions as TipRanks aggregates them. Each request is one of the account&apos;s monthly calls (50 on the free plan,
          counted even when TipRanks has no data for the ticker); answers stay in memory for an hour.
          {usage ? (
            <>
              {' '}
              TipRanks reports {usage.used ?? '--'} of {usage.limit ?? '--'} calls used this month{left !== undefined ? `, ${left} left` : ''}; this app has made {usage.appUsed} of its {usage.appCap}.
            </>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="fld">
            TipRanks ticker
            <input className="inp" style={{ width: 120 }} aria-label="TipRanks ticker" value={ticker} placeholder="e.g. IT:1ABI" onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          {(['consensus', 'ratings'] as TipRanksKind[]).map((kind) => (
            <button key={kind} type="button" className="btn primary" disabled={!available || busy !== null || !validTicker || spent} onClick={() => void ask(kind, t)}>
              {busy === kind ? 'Asking TipRanks…' : `${LABEL[kind]} · 1 call`}
            </button>
          ))}
        </div>
        {!guess ? <p className="muted">TipRanks writes stocks outside the US, London, Xetra and Paris its own way; find the ticker on tipranks.com and type it here (AB InBev is IT:1ABI).</p> : null}
        {!available ? <p className="muted">TipRanks requires the desktop app.</p> : null}
        {spent ? <p className="amber" role="status">TipRanks says this month&apos;s calls are used up; they reset on the 1st (UTC).</p> : null}
        {(['consensus', 'ratings'] as TipRanksKind[]).map((kind) => {
          const why = problem(answers[kind]);
          return why ? (
            <p key={kind} className="amber" role="status">
              {LABEL[kind]}: {why}
            </p>
          ) : null;
        })}
        {asset ? (
          <KV
            items={[
              ['Company', `${asset.companyName ?? '--'} (${asset.ticker})`],
              ['Analyst consensus', asset.analystConsensus ?? '--'],
              ['Top analysts’ consensus', asset.bestAnalystConsensus ?? '--'],
              ['Average price target', `${fmtNum(asset.priceTarget, 2)}${asset.priceTargetUpside !== undefined ? ` (${fmtPct(asset.priceTargetUpside * 100, 1)} vs TipRanks' last close ${fmtNum(asset.price, 2)})` : ''}`],
              ['Smart Score (1-10)', fmtNum(asset.smartScore, 0)],
              ['News / hedge fund / insider signals (0-1)', [asset.newsSentiment, asset.hedgeFundsScore, asset.insiderScore].map((v) => fmtNum(v, 2)).join(' / ')],
              ['Next earnings', asset.nextEarningsDate ? `${asset.nextEarningsDate}${asset.daysUntilEarnings !== undefined ? ` (in ${asset.daysUntilEarnings} days)` : ''}` : '--'],
              ['Received', answers.consensus?.at ? `${fmtDateTime(answers.consensus.at)}${answers.consensus.cached ? ' · kept from an earlier request' : ''}` : '--'],
            ]}
          />
        ) : answers.consensus?.text ? (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{rawText(answers.consensus.text) ?? 'TipRanks returned no entry for this ticker.'}</pre>
        ) : null}
        {ratings ? (
          ratings.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Analyst</th>
                  <th>Firm</th>
                  <th>Rating</th>
                  <th>Action</th>
                  <th className="num">Price target</th>
                  <th className="num">Stars</th>
                </tr>
              </thead>
              <tbody>
                {ratings.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date || '--'}</td>
                    <td>{r.analyst || '--'}</td>
                    <td>{r.firm || '--'}</td>
                    <td>{r.rating || '--'}</td>
                    <td>{r.action || '--'}</td>
                    <td className="num">{fmtNum(r.target, 2)}</td>
                    <td className="num">{fmtNum(r.stars, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">TipRanks lists no rating actions in the last 12 months for {t}.</p>
          )
        ) : answers.ratings?.text ? (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{rawText(answers.ratings.text) ?? 'TipRanks returned rating actions in a layout the app does not read.'}</pre>
        ) : null}
        <div className="note" style={{ paddingLeft: 0 }}>
          Ratings and targets are analysts&apos; opinions as TipRanks collects them, in the currency TipRanks quotes the stock in; they are not a forecast by this app. {credit}.
        </div>
      </div>
    </Section>
  );
}
