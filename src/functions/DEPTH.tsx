import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { useTick } from '../data/market';
import { orderBook, type Level } from '../data/book';
import type { SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';

export function BookTable({ sec, levels = 10, compact }: { sec: SecurityDef; levels?: number; compact?: boolean }) {
  useTick(1);
  const b = orderBook(sec.id, levels);
  const max = Math.max(...b.bids.map((x) => x.size), ...b.asks.map((x) => x.size));
  const cum = (xs: Level[]) => {
    let c = 0;
    return xs.map((x) => (c += x.size));
  };
  const cb = cum(b.bids);
  const ca = cum(b.asks);
  const sizeDec = sec.cls === 'crypto' ? 3 : 0;
  return (
    <table className="tbl">
      <thead>
        <tr>
          {!compact && <th className="num hide-m">#Ord</th>}
          {!compact && <th className="num hide-m">Cum</th>}
          <th className="num">Bid size</th>
          <th className="num">Bid</th>
          <th className="num">Ask</th>
          <th className="num">Ask size</th>
          {!compact && <th className="num hide-m">Cum</th>}
          {!compact && <th className="num hide-m">#Ord</th>}
        </tr>
      </thead>
      <tbody>
        {b.bids.map((bid, i) => {
          const ask = b.asks[i];
          return (
            <tr key={i}>
              {!compact && <td className="num muted hide-m">{bid.orders}</td>}
              {!compact && <td className="num muted hide-m">{fmtBig(cb[i])}</td>}
              <td className="num" style={{ background: `linear-gradient(to left, rgba(47,211,107,0.28) ${(bid.size / max) * 100}%, transparent 0)` }}>
                {sizeDec ? fmtNum(bid.size, sizeDec) : fmtBig(bid.size)}
              </td>
              <td className={`num ${i === 0 ? 'up b' : 'up'}`}>{fmtNum(bid.px, sec.dec)}</td>
              <td className={`num ${i === 0 ? 'dn b' : 'dn'}`}>{fmtNum(ask.px, sec.dec)}</td>
              <td className="num" style={{ background: `linear-gradient(to right, rgba(255,77,79,0.28) ${(ask.size / max) * 100}%, transparent 0)` }}>
                {sizeDec ? fmtNum(ask.size, sizeDec) : fmtBig(ask.size)}
              </td>
              {!compact && <td className="num muted hide-m">{fmtBig(ca[i])}</td>}
              {!compact && <td className="num muted hide-m">{ask.orders}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DEPTH({ sec }: FnProps) {
  const s = sec!;
  useTick(1);
  const b = orderBook(s.id, 15);
  const bidTot = b.bids.reduce((a, x) => a + x.size, 0);
  const askTot = b.asks.reduce((a, x) => a + x.size, 0);
  let c = 0;
  const bidPts = b.bids.map((x) => ({ x: x.px, y: (c += x.size) })).reverse();
  c = 0;
  const askPts = b.asks.map((x) => ({ x: x.px, y: (c += x.size) }));
  const spread = b.asks[0].px - b.bids[0].px;
  return (
    <div>
      <FnHeader code="DEPTH" title="Market Depth" sec={s} sub="Simulated limit order book · 15 levels" />
      <QuoteStrip sec={s} />
      <div className="chart-tools">
        <span>
          <span className="amber">Spread</span> {fmtNum(spread, s.dec)} ({fmtNum((spread / b.bids[0].px) * 10000, 1)} bp)
        </span>
        <span>
          <span className="amber">Bid depth</span> {fmtBig(bidTot)} <span className="amber">Ask depth</span> {fmtBig(askTot)}
        </span>
        <span>
          <span className="amber">Imbalance</span> <span className={bidTot > askTot ? 'up' : 'dn'}>{fmtPct(((bidTot - askTot) / (bidTot + askTot)) * 100, 1)}</span>
        </span>
      </div>
      <div className="cols">
        <Section title="Order book">
          <BookTable sec={s} levels={15} />
        </Section>
        <Section title="Cumulative depth">
          <XYChart
            height={330}
            series={[
              { label: 'Bids', color: '#2fd36b', points: bidPts, width: 2 },
              { label: 'Asks', color: '#ff4d4f', points: askPts, width: 2 },
            ]}
            xFormat={(v) => fmtNum(v, s.dec)}
            yFormat={(v) => fmtBig(v)}
            yZero
          />
        </Section>
      </div>
    </div>
  );
}
