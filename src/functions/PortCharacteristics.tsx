// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtInt, fmtNum, fmtSigned } from '../core/format';
import { engine, useTick } from '../data/market';
import { defaultBeta, marketCapUsd } from '../data/analytics';
import { usePortVsBench } from './PortIntraday';

interface Line {
  label: string;
  title?: string;
  port: number;
  bench: number;
  dec?: number;
  /** Shown instead of the portfolio's figure (coverage, units). */
  portNote?: string;
  signed?: boolean;
}

/**
 * PORT's Characteristics tab (the 2021 guide lists it after Holdings): the portfolio beside its benchmark on the
 * figures the app has for both. Weighted averages use each line's share of market value; a figure a holding lacks
 * leaves it out of that average, and the row says how many it covers.
 */
export function PortCharacteristics() {
  useTick(2);
  const { st, benchReady, members, port, benchName, total, nav, secValue, futNotional, base } = usePortVsBench('GICS Sector');
  // Holdings only (not the cash line); averages over long positions, so a short cannot push one past every holding.
  const holdings = port.filter((l) => l.id);
  const weights = holdings.filter((l) => Number.isFinite(l.weight) && l.weight > 0);
  const wavg = (value: (id: string) => number) => {
    let w = 0;
    let s = 0;
    let n = 0;
    for (const l of weights) {
      const v = l.id ? value(l.id) : NaN;
      if (!Number.isFinite(v)) continue;
      w += l.weight;
      s += l.weight * v;
      n++;
    }
    return { v: w > 0 ? s / w : NaN, n };
  };
  const cap = wavg((id) => marketCapUsd(id) / 1e9);
  const betas = holdings.map((l) => defaultBeta(l.id!));
  const beta = wavg((id) => defaultBeta(id).raw);
  // The benchmark's own beta is 1 when the holdings' betas are measured against it.
  const sameBench = betas.length > 0 && betas.every((b) => b?.bench === st.benchmark);
  const benchCapW = members.reduce((a, m) => a + (Number.isFinite(m.weight) && Number.isFinite(m.cap) ? m.weight : 0), 0);
  const benchCap = benchCapW > 0 ? members.reduce((a, m) => a + (Number.isFinite(m.weight) && Number.isFinite(m.cap) ? m.weight * (m.cap / 1e9) : 0), 0) / benchCapW : NaN;
  const sortedPort = holdings.filter((l) => Number.isFinite(l.weight)).map((l) => Math.abs(l.weight)).sort((a, b) => b - a);
  const sortedBench = members.map((m) => m.weight * 100).filter(Number.isFinite).sort((a, b) => b - a);
  const top10 = (xs: number[]) => (xs.length ? xs.slice(0, 10).reduce((a, x) => a + x, 0) : NaN);
  const b = (v: number) => (benchReady ? v : NaN);
  const lines: Line[] = [
    { label: 'Number of Securities', port: holdings.length, bench: b(members.length), dec: 0 },
    { label: `Market Value (${base})`, title: 'Securities at their last price; futures are on their own line', port: secValue, bench: NaN, dec: 0 },
    ...(futNotional ? [{ label: `Futures Notional (${base})`, port: futNotional, bench: NaN, dec: 0 }] : []),
    { label: `Net Asset Value (${base})`, title: 'Cash, securities at market and futures at their unrealised P&L, as Holdings counts it', port: nav, bench: NaN, dec: 0 },
    { label: 'Wgt Avg Market Cap (USD bn)', title: 'Long positions, weighted by their value', port: cap.v, bench: b(benchCap), dec: 1, portNote: cap.n < holdings.filter((l) => l.weight > 0).length ? `${cap.n} of ${holdings.filter((l) => l.weight > 0).length} long holdings` : undefined },
    { label: 'Largest Holding (%)', port: sortedPort[0] ?? NaN, bench: b(sortedBench[0] ?? NaN) },
    { label: 'Top 10 Holdings (%)', port: top10(sortedPort), bench: b(top10(sortedBench)) },
    {
      label: 'Historical Beta',
      title: "Each long holding's regression slope of weekly returns on its market's index over two years, weighted by value",
      port: beta.v,
      bench: benchReady && sameBench ? 1 : NaN,
      dec: 2,
      portNote: beta.n < weights.length ? `${beta.n} of ${weights.length} long holdings` : undefined,
    },
    { label: 'Return Today (%)', port: total.retPort, bench: b(total.retBench), signed: true },
  ];
  const fmt = (v: number, l: Line) => (!Number.isFinite(v) ? '--' : l.signed ? fmtSigned(v, l.dec ?? 2) : l.dec === 0 ? fmtInt(v) : fmtNum(v, l.dec ?? 2));
  return (
    <div data-testid="port-characteristics">
      {st.positions.length === 0 ? <div className="empty">No holdings in {st.name} yet: add them on 2) Holdings.</div> : null}
      <table className="tbl port-grid port-char">
        <thead>
          <tr>
            <th>Characteristic</th>
            <th className="num">Port</th>
            <th className="num">Bmrk ({benchName})</th>
            <th className="num">Diff</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} title={l.title}>
              <td>{l.label}</td>
              <td className="num">
                {fmt(l.port, l)}
                {l.portNote ? <span className="muted"> ({l.portNote})</span> : null}
              </td>
              <td className="num">{fmt(l.bench, l)}</td>
              <td className="num">{Number.isFinite(l.port) && Number.isFinite(l.bench) ? fmtSigned(l.port - l.bench, l.dec ?? 2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Market caps: each holding&apos;s shares outstanding at its last price, in USD; the benchmark&apos;s are its members&apos; as IMAP has them. Beta: {engine.realOnly ? 'two years of weekly returns from the daily history the app holds for each holding' : 'from the demo\'s simulated history'}; a holding without that history is left out of the average.
      </div>
    </div>
  );
}
