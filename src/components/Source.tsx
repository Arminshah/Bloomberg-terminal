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
  if (!desktopData()) {
    return (
      <>
        <SimBadge /> yields from the simulator; the US curve is real in the desktop app
      </>
    );
  }
  if (curve && curve !== 'US') {
    return (
      <>
        <SimBadge /> no free source for this curve, so its levels are simulated
      </>
    );
  }
  if (rates === 'off' || rates === 'connecting') return <>Loading the US Treasury curve…</>;
  if (rates === 'error') {
    return (
      <>
        <RealBadge /> 5Y, 10Y and 30Y from Yahoo · <SimBadge /> other tenors (Treasury data unavailable)
      </>
    );
  }
  return (
    <>
      <RealBadge /> US Treasury: 5Y, 10Y and 30Y live from Yahoo, other tenors official end of day
      {curve ? null : (
        <>
          {' '}
          · <SimBadge /> other countries
        </>
      )}
    </>
  );
}
