import { useEffect, useRef } from 'react';
import { engine } from '../../data/market';
import type { Series } from '../../data/series';
import { PriceChart, type ChartOptions } from './PriceChart';

interface Props {
  series: Series;
  options: ChartOptions;
  /** Changing this resets zoom/pan to the initial window. */
  resetKey: string;
  className?: string;
  onReady?: (chart: PriceChart) => void;
}

/** React host for the canvas price chart; redraws on every market tick. */
export function ChartView({ series, options, resetKey, className, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<PriceChart | null>(null);
  const lastReset = useRef<string | null>(null);

  useEffect(() => {
    const c = new PriceChart(host.current!);
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

  return <div ref={host} className={`chart-host ${className ?? ''}`} />;
}
