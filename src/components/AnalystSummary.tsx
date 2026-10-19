import type { ReactNode } from 'react';
import { KV } from './cells';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { analystsAvailable, analystSymbol, useAnalysts, type AnalystPart, type RatingTally, type TargetConsensus } from '../data/live/analysts';
import { finnhubAvailable, finnhubSymbol, useFinnhub, type FinnhubPart, type NextReport } from '../data/live/finnhub';
import { yahooResearchAvailable } from '../data/live/yahoo-research';
import { analystSnapshot, nextQuarterLine, type AnalystSnapshot, type SnapshotLine } from '../data/live/analyst-snapshot';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';

/**
 * The analyst consensus for a US stock from what ANALYSTS and EARNINGS load: the same parts in the same
 * stores, so opening PROFILE or QUOTE asks nothing new once those have answered (see analyst-snapshot.ts).
 */
export function useAnalystSnapshot(sec: SecurityDef): AnalystSnapshot {
  const desktop = analystsAvailable();
  const symbol = desktop ? analystSymbol(sec) : null;
  const parts = useAnalysts(symbol ? sec : undefined, ['consensus', 'ratings']);
  const calendar = useFinnhub(symbol && finnhubAvailable() && finnhubSymbol(sec) ? sec : undefined, ['calendar']).calendar as FinnhubPart<NextReport | null> | undefined;
  return analystSnapshot({
    desktop,
    symbol,
    ticker: sec.ticker,
    consensus: parts.consensus as AnalystPart<TargetConsensus | null> | undefined,
    ratings: parts.ratings as AnalystPart<RatingTally | null> | undefined,
    calendar,
    yahooResearch: yahooResearchAvailable(),
    last: engine.quote(sec.id)?.last ?? NaN,
    ccy: sec.ccy,
  });
}

/** Finnhub's next-quarter estimate alone (PROFILE's earnings tab), from the calendar EARNINGS loads. */
export function useNextQuarterEstimate(sec: SecurityDef): SnapshotLine {
  const desktop = finnhubAvailable();
  const symbol = desktop ? finnhubSymbol(sec) : null;
  const calendar = useFinnhub(symbol ? sec : undefined, ['calendar']).calendar as FinnhubPart<NextReport | null> | undefined;
  const label = 'EPS estimate, next quarter';
  if (!desktop) return { label, value: 'Not connected in the browser: the desktop app reads it from Finnhub with FINNHUB_API_KEY' };
  if (!symbol) return { label, value: '--', missing: `Finnhub's estimates cover US-listed stocks; ${sec.ticker} is not one.` };
  return nextQuarterLine(calendar);
}

/** A line's figure with its source beside it. */
export function lineValue(l: SnapshotLine): ReactNode {
  return (
    <span>
      <span className={l.value === '--' || l.value === 'Loading…' ? 'muted' : 'white'}>{l.value}</span>
      {l.source ? <span className="muted"> · {l.source}</span> : null}
    </span>
  );
}

/** Why a line has no figure, in the sources' own words. */
export function MissingNotes({ lines }: { lines: SnapshotLine[] }) {
  const missing = lines.filter((l) => l.missing);
  if (!missing.length) return null;
  return (
    <div className="note">
      {missing.map((l) => (
        <div key={l.label}>
          {l.label}: {l.missing}
        </div>
      ))}
    </div>
  );
}

/** The consensus lines as a key-value list, or the reason there are none, with the way to ANALYSTS. */
export function AnalystSummary({ sec, snap }: { sec: SecurityDef; snap: AnalystSnapshot }) {
  const panel = usePanelId();
  if (snap.notConnected) return <p className="pad-s muted">{snap.notConnected}</p>;
  if (snap.note) return <p className="pad-s muted">{snap.note}</p>;
  return (
    <>
      <KV items={snap.lines.map((l) => [l.label, lineValue(l)] as [ReactNode, ReactNode])} />
      <MissingNotes lines={snap.lines} />
      <div className="pad-s">
        <button type="button" className="act" onClick={() => execute(panel, `${sec.id} ANALYSTS`)}>
          ANALYSTS ›
        </button>{' '}
        <span className="muted">analysts&apos; opinions as each source collects them, not a forecast by this app</span>
      </div>
    </>
  );
}
