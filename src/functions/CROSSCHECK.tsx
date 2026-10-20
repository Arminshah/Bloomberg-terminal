import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { fmtDateTime, fmtNum } from '../core/format';
import { engine, useInterval, useQuote } from '../data/market';
import { secTicker } from '../data/live/sec';
import { compareCloses, diffBp, EOD_PROVIDERS, eodAvailable, eodRange, loadEod, type EodBar, type EodProvider, type EodResult } from '../data/live/eod';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * CROSSCHECK: the daily closes the app shows for a US stock, beside the same
 * sessions' closes from the end-of-day providers whose keys are set (Massive,
 * Alpha Vantage, Twelve Data), with the gap in basis points. A gap is a
 * question to look into, not an answer: providers differ on split
 * adjustment, late corrections and the official closing print.
 */

/** Gaps above this many basis points are marked. */
const FLAG_BP = 5;

/** A gap to one decimal of a basis point, signed only when it rounds to something. */
function fmtBp(bp: number): string {
  if (!Number.isFinite(bp)) return '';
  const r = Math.round(bp * 10) / 10 || 0;
  return `${r > 0 ? '+' : ''}${fmtNum(r, 1)}bp`;
}

export function CROSSCHECK({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const ticker = secTicker(s);
  const quote = useQuote(s.id);
  const provider = quote?.provider ?? 'the active price source';
  useInterval(60_000);
  const latest = eodRange().to;
  const [results, setResults] = useState<Partial<Record<EodProvider, EodResult>>>({});
  useEffect(() => {
    if (!ticker || !eodAvailable()) return;
    let live = true;
    for (const p of EOD_PROVIDERS) {
      void loadEod(p.id, ticker.replace('-', '.')).then((r) => {
        if (live) setResults((x) => ({ ...x, [p.id]: r }));
      });
    }
    return () => {
      live = false;
    };
  }, [ticker, latest]);

  const daily = engine.daily(s.id);
  const app: { date: string; c: number }[] = [];
  for (let i = Math.max(0, daily.length - 30); i < daily.length; i++) app.push({ date: new Date(daily.t[i]).toISOString().slice(0, 10), c: daily.c[i] });
  // Use the same New York session cutoff as the provider requests, including early closes.
  const finished = app.filter((r) => r.date <= latest);
  const others: Partial<Record<EodProvider, EodBar[]>> = {};
  for (const p of EOD_PROVIDERS) {
    const r = results[p.id];
    if (r?.ok) others[p.id] = r.bars;
  }
  const rows = compareCloses(finished, others);
  const active = EOD_PROVIDERS.filter((p) => results[p.id]?.ok);

  const header = <FnHeader code="CROSSCHECK" title="Close Cross-Check" sec={s} sub="The app's daily closes against other end-of-day sources" />;
  if (!ticker) {
    return (
      <div>
        {header}
        <div className="pad muted">The end-of-day sources cover US-listed stocks; {s.id} is not one.</div>
      </div>
    );
  }
  if (!eodAvailable()) {
    return (
      <div>
        {header}
        <div className="pad muted">Other sources are asked by the desktop app, with your own keys.</div>
      </div>
    );
  }
  return (
    <div>
      {header}
      <QuoteStrip sec={s} />
      <div className="chart-tools">
        {EOD_PROVIDERS.map((p) => {
          const r = results[p.id];
          return (
            <span key={p.id} title={r?.ok ? `Answer received ${fmtDateTime(r.at)}${r.stale ? '; the latest request failed' : ''}` : r?.message}>
              <span className="lbl">{p.name}</span>{' '}
              {!r ? <span className="muted">asking…</span> : r.ok ? <span className={r.stale ? 'amber' : 'up'}>{r.stale ? 'STALE · ' : ''}{r.bars.length} sessions ({p.basis})</span> : <span className="amber">{r.reason === 'needs-key' ? 'no key' : r.reason === 'gated' ? 'display rights not confirmed' : r.reason === 'budget' ? 'budget spent' : 'error'}</span>}
            </span>
          );
        })}
        <button type="button" className="btn" onClick={() => execute(panel, 'PROVIDERS')}>
          Keys
        </button>
      </div>
      {!active.length ? (
        <div className="empty">No other end-of-day source has answered. Set a Massive, Alpha Vantage, Tiingo or Twelve Data key on the provider screen to compare closes.</div>
      ) : (
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Session</th>
              <th className="num" title={provider}>App close</th>
              {active.map((p) => (
                <th key={p.id} className="num" colSpan={2}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td className="num white">{fmtNum(r.app, s.dec)}</td>
                {active.map((p) => {
                  const v = r.others[p.id];
                  const bp = diffBp(r.app, v);
                  return [
                    <td key={`${p.id}c`} className="num">
                      {v != null ? fmtNum(v, s.dec) : '--'}
                    </td>,
                    <td key={`${p.id}d`} className={`num ${Math.abs(bp) > FLAG_BP ? 'amber b' : 'muted'}`} title="Gap from the app's close, basis points">
                      {fmtBp(bp)}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="note">
        Finished sessions only. Gaps over {FLAG_BP} bp are marked. Massive&apos;s closes are split-adjusted, Alpha Vantage&apos;s and Tiingo&apos;s are as traded (a split in the window shows as a large gap), and Twelve Data is asked only once you confirm your plan
        allows displaying its data. The app&apos;s own closes come from {provider}. {/IEX/i.test(provider) ? 'IEX covers one exchange; its closes can differ from market-wide closing prices. ' : ''}No source here is adjusted for dividends.
      </div>
    </div>
  );
}
