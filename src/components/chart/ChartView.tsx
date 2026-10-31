// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { fmtBig, fmtDay, fmtNum, fmtTime } from '../../core/format';
import { engine } from '../../data/market';
import type { Series } from '../../data/series';
import { PriceChart, type ChartObservation, type ChartOptions } from './PriceChart';
import './chart-terminal.css';

interface Props {
  series: Series;
  options: ChartOptions;
  /** Changing this resets zoom/pan to the initial window. */
  resetKey: string;
  className?: string;
  onReady?: (chart: PriceChart) => void;
  readout?: { unit: string; periodicity: string };
}

/** React host for the canvas price chart; redraws on every market tick. */
export function ChartView({ series, options, resetKey, className, onReady, readout }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<PriceChart | null>(null);
  const lastReset = useRef<string | null>(null);
  const [observation, setObservation] = useState<ChartObservation | null>(null);

  useEffect(() => {
    const c = new PriceChart(host.current!);
    if (readout) c.onObservation = (next) => setObservation((previous) => {
      if (next === previous) return previous;
      if (next && previous && Object.entries(next).every(([key, value]) => previous[key as keyof ChartObservation] === value)) return previous;
      return next;
    });
    chart.current = c;
    onReady?.(c);
    const unsub = engine.subscribe(() => c.refresh());
    return () => {
      unsub();
      c.destroy();
      chart.current = null;
      lastReset.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reset = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    chart.current?.setData(series, options, reset);
  }, [series, options, resetKey]);

  const plot = <div ref={host} className={`chart-host ${className ?? ''}`} />;
  if (!readout) return plot;
  const date = options.dateLabel ?? fmtDay;
  const time = options.timeLabel ?? ((t: number) => fmtTime(t, false));
  const stamp = (t: number) => `${date(t)}${options.intraday ? ` ${time(t)}` : ''}`;
  return (
    <div className="terminal-chart">
      <div className="chart-observation" aria-label="Chart observation">
        <span className="chart-observation-date">
          <span className="chart-observation-kind">{observation?.hovered ? 'CURSOR' : 'LAST VISIBLE'}</span>
          {observation ? stamp(observation.time) : '—'}
        </span>
        {(['open', 'high', 'low', 'close'] as const).map((key, i) => (
          <span key={key} title={['Open', 'High', 'Low', 'Close'][i]}>{['O', 'H', 'L', 'C'][i]} <b>{observation ? fmtNum(observation[key], options.dec) : '—'}</b></span>
        ))}
        {observation && observation.volume > 0 && <span>Vol <b>{fmtBig(observation.volume)}</b></span>}
      </div>
      {plot}
      <div className="chart-scale-info">
        <span>{readout.periodicity} · OHLC {readout.unit}{options.percent || options.compare.length > 0 ? ' · Lines in % from the range start, as Normalized As Of says' : ''}</span>
        <span>{observation ? `${stamp(observation.from)} — ${stamp(observation.to)}` : 'No observations'}</span>
      </div>
    </div>
  );
}
