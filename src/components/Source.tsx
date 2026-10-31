// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { ReactNode } from 'react';
import { FnHeader } from './FnHeader';
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
          <span className="badge sim">DEMO DATA</span> real data unavailable for this security
        </>
      );
    default:
      return (
        <>
          <span className="badge sim">DEMO DATA</span> {simText}
        </>
      );
  }
}

/**
 * Where a line's prices come from: 'real' for exchange history and quotes
 * (Yahoo Finance in the desktop app), 'live' for a streaming feed on top of
 * simulated history, 'sim' for the simulator alone.
 */
export function priceSource(id: string): 'real' | 'live' | 'sim' | 'none' {
  if (engine.isExternal(id)) return 'real';
  const q = engine.quote(id);
  if (!q || q.src === 'NONE') return 'none';
  return q.src !== 'SIM' ? 'live' : 'sim';
}

export function SimBadge() {
  return <span className="badge sim">DEMO DATA</span>;
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
  if (rates === 'error') return <>US Treasury yields unavailable right now (the Treasury's data is not answering)</>;
  return (
    <>
      <RealBadge /> US Treasury par yields, official end of day, every tenor
      {curve ? null : <> · other countries {yields === 'live' ? 'official end of day' : yields === 'error' || yields === 'blocked' ? 'unavailable right now' : 'loading'}</>}
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

/** Why the desktop app shows nothing for an individual bond. */
export function NoBondNotice() {
  return (
    <div className="empty">
      Prices for individual bonds come from dealers and trading venues that have no free public feed, so the desktop app does not show bond prices, yields, spreads or dealer quotes, and the bond list it would draw them from is not from a source either. Government yields are real: see CURVE, BONDS and MONEYMARKET.
    </div>
  );
}

/** What bond screens show on real data: no free source quotes individual bonds. */
export function NoBondData({ code, title }: { code: string; title: string }) {
  return (
    <div>
      <FnHeader code={code} title={title} />
      <NoBondNotice />
    </div>
  );
}
