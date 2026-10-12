import type { ReactNode } from 'react';
import { engine } from '../data/market';
import { desktopData } from '../data/live/yahoo';
import { feedStatus } from '../data/live/status';

export type SourceStatus = 'ok' | 'loading' | 'error' | 'sim';

/** Says where a screen's figures come from: the company's real data, or the simulator. */
export function sourceLabel(status: SourceStatus, simText: string): ReactNode {
  switch (status) {
    case 'ok':
      return (
        <>
          <span className="badge live">REAL</span> Yahoo Finance
        </>
      );
    case 'loading':
      return 'Loading real data…';
    case 'error':
      // The desktop app never fills in for a source with simulated figures.
      if (engine.realOnly) return 'No data from the source for this security';
      return (
        <>
          <span className="badge sim">SIMULATED</span> real data unavailable for this security
        </>
      );
    default:
      return (
        <>
          <span className="badge sim">SIMULATED</span> {simText}
        </>
      );
  }
}

/**
 * Where a line's prices come from: 'real' for exchange history and quotes
 * (Yahoo Finance in the desktop app), 'live' for a streaming feed on top of
 * simulated history, 'sim' for the simulator alone.
 */
export function priceSource(id: string): 'real' | 'live' | 'sim' {
  if (engine.isExternal(id)) return 'real';
  const q = engine.quote(id);
  return q && q.src !== 'SIM' ? 'live' : 'sim';
}

export function SimBadge() {
  return <span className="badge sim">SIMULATED</span>;
}

export function RealBadge() {
  return <span className="badge live">REAL</span>;
}

/** Where a yield curve's levels come from. `curve` is a country code; omit it for a table of countries. */
export function RatesSource({ curve }: { curve?: string }) {
  const rates = feedStatus.use((s) => s.rates);
  const yields = feedStatus.use((s) => s.yields);
  if (!desktopData()) {
    return (
      <>
        <SimBadge /> yields from the simulator; the desktop app shows official yields
      </>
    );
  }
  if (curve && curve !== 'US') {
    if (yields === 'off' || yields === 'connecting') return <>Loading official yields…</>;
    if (yields === 'error') return <>Official yields unavailable right now</>;
    return (
      <>
        <RealBadge /> {CURVE_SOURCE[curve] ?? 'official source'}, end of day
      </>
    );
  }
  if (rates === 'off' || rates === 'connecting') return <>Loading the US Treasury curve…</>;
  if (rates === 'error') {
    return (
      <>
        <RealBadge /> 5Y, 10Y and 30Y from Yahoo · other US tenors unavailable (Treasury data not answering)
      </>
    );
  }
  return (
    <>
      <RealBadge /> US Treasury par yields: 5Y, 10Y and 30Y live from Yahoo, other tenors official end of day
      {curve ? null : <> · other countries official end of day</>}
    </>
  );
}

const CURVE_SOURCE: Record<string, string> = {
  DE: 'Deutsche Bundesbank zero-coupon yields (Svensson curve)',
  GB: 'Bank of England nominal par yields (5Y, 10Y and 20Y)',
  JP: 'Ministry of Finance Japan constant-maturity JGB yields',
  CA: 'Bank of Canada benchmark bond yields',
  AU: 'Reserve Bank of Australia interpolated yields',
};
