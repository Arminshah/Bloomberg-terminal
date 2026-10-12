import { srcLabelLong } from '../components/QuoteStrip';
import { useEffect, useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Flash } from '../components/Flash';
import { ChartView } from '../components/chart/ChartView';
import type { ChartOptions } from '../components/chart/PriceChart';
import { KV, Section } from '../components/cells';
import { TopOfBook, BookTable } from './DEPTH';
import { TapeSource, TradeTape } from './TAS';
import { SimBadge } from '../components/Source';
import { useFundamentals } from '../data/live/yfund';
import { fmtBig, fmtBp, fmtDay, fmtEarnDate, fmtMln, fmtNum, fmtPct, fmtSigned, fmtStamp, fmtTime, signClass } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { rangeStats } from '../data/analytics';
import { keyStats, nextEarnings } from '../data/fundamentals';
import { news } from '../data/news';
import { execute } from '../terminal/exec';
import { requestCompanyNews } from '../data/live/feeds';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

export function BQ({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const q = useQuote(s.id)!;
  useTick(1);
  useEffect(() => requestCompanyNews(s.id), [s.id]);
  useFundamentals(s.eq ? s : undefined);
  const rs = rangeStats(s.id);
  const intra = engine.intraday(s.id);
  const stories = news.use((n) => n.stories);
  const related = stories.filter((x) => x.tickers.includes(s.id)).slice(0, 8);
  let vwap = NaN;
  {
    let pv = 0;
    let v = 0;
    for (let i = 0; i < intra.length; i++) {
      pv += ((intra.h[i] + intra.l[i] + intra.c[i]) / 3) * intra.v[i];
      v += intra.v[i];
    }
    if (v > 0) vwap = pv / v;
  }
  const options: ChartOptions = useMemo(
    () => ({ type: 'mountain', dec: s.dec, label: s.ticker, intraday: true, overlays: [], lower: [], compare: [], percent: false, annotate: false, refLine: { value: engine.prevClose(s.id), label: 'Prev' }, initialBars: 100000, timeLabel: (t) => fmtTime(t, false) }),
    [s],
  );
  const y = s.quote === 'yield';
  const ks = s.eq ? keyStats(s) : undefined;
  const ne = s.eq ? nextEarnings(s) : undefined;
  const tradable = s.cls === 'equity' || s.cls === 'crypto' || s.cls === 'commodity' || s.cls === 'future';
  return (
    <div>
      <FnHeader
        code="BQ"
        title="Composite Quote"
        sec={s}
        sub={s.name}
        actions={[
          { n: 1, label: 'Chart', onClick: () => execute(panel, `${s.id} GP`) },
          { n: 2, label: 'Desc', onClick: () => execute(panel, `${s.id} DES`) },
          { n: 3, label: 'News', onClick: () => execute(panel, `${s.id} CN`) },
          ...(tradable
            ? [
                { n: 4, label: 'Buy', onClick: () => execute(panel, `${s.id} EMSX BUY`), title: 'Open a buy ticket in EMSX' },
                { n: 5, label: 'Sell', onClick: () => execute(panel, `${s.id} EMSX SELL`), title: 'Open a sell ticket in EMSX' },
              ]
            : []),
        ]}
      />
      <div className="cols">
        <Section title="Quote" right={srcLabelLong(q)}>
          <div className="pad row" style={{ alignItems: 'baseline', gap: 14 }}>
            <Flash value={q.last} className={`white ${q.tick > 0 ? 'arrow-up' : q.tick < 0 ? 'arrow-dn' : ''}`}>
              <span style={{ fontSize: 30, fontWeight: 600 }}>{fmtNum(q.last, s.dec)}</span>
            </Flash>
            <span className={signClass(q.chg)} style={{ fontSize: 'var(--fs-xl)' }}>
              {y ? `${fmtBp(q.chg)} bp` : `${fmtSigned(q.chg, s.dec)}  ${fmtPct(q.pct)}`}
            </span>
          </div>
          <KV
            items={[
              ['Bid / Ask', Number.isFinite(q.bid) ? `${fmtNum(q.bid, s.dec)} / ${fmtNum(q.ask, s.dec)}` : '--'],
              ['Open', fmtNum(q.open, s.dec)],
              ['Day high / low', `${fmtNum(q.high, s.dec)} / ${fmtNum(q.low, s.dec)}`],
              ['Previous close', fmtNum(q.prevClose, s.dec)],
              ...(q.volume > 0 ? ([['Volume', fmtBig(q.volume)], ['VWAP', fmtNum(vwap, s.dec)], ['Avg vol 30D', fmtBig(rs.avgVol30)]] as [string, string][]) : []),
              ['52-week range', `${fmtNum(rs.lo52, s.dec)} - ${fmtNum(rs.hi52, s.dec)}`],
              ['Last update', q.src === 'EOD' || q.dayOnly ? `as of ${fmtDay(q.time)}` : fmtStamp(q.time)],
            ]}
          />
        </Section>
        <Section title="Intraday" right={`prev ${fmtNum(q.prevClose, s.dec)}`}>
          <div style={{ height: 250, display: 'flex' }}>
            <ChartView series={intra} options={options} resetKey={s.id} />
          </div>
        </Section>
      </div>
      <div className="cols">
        {tradable ? (
          engine.realOnly ? (
            <Section title="Best bid and offer" right="level 1 from the source">
              <TopOfBook sec={s} />
            </Section>
          ) : (
            <Section title="Depth (top 5)" right={<SimBadge />}>
              <BookTable sec={s} levels={5} compact />
            </Section>
          )
        ) : null}
        {tradable ? (
          <Section title="Trades" right={<TapeSource id={s.id} short />}>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <TradeTape sec={s} rows={15} />
            </div>
          </Section>
        ) : null}
        <Section title={ks ? 'Key statistics' : 'Statistics'}>
          {ks ? (
            <KV
              items={[
                ['Market cap', `${fmtMln(ks.mcap)} ${ks.tradeCcy}`],
                ['P/E LTM / FY1', `${fmtNum(ks.pe, 1)} / ${fmtNum(ks.fpe, 1)}`],
                ['Dividend yield 12M', fmtPct(ks.divYld, 2, false)],
                ['Beta', fmtNum(ks.beta, 2)],
                ['Next earnings', ne ? fmtEarnDate(ne) : '--'],
                ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
              ]}
            />
          ) : (
            <KV
              items={[
                ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}${y ? ' bp' : '%'}`],
                ['Realised vol 90D', `${fmtNum(rs.vol90, 1)}${y ? ' bp' : '%'}`],
                ['52W high date', fmtDay(rs.hi52t)],
                ['52W low date', fmtDay(rs.lo52t)],
              ]}
            />
          )}
        </Section>
      </div>
      <Section title="Latest news" right={<button type="button" className="act" onClick={() => execute(panel, `${s.id} CN`)}>All news ›</button>}>
        {related.length === 0 ? (
          <div className="note">No recent stories.</div>
        ) : (
          related.map((st) => (
            <div key={st.id} className={`news-item${st.hot ? ' hot' : ''}`} onClick={() => execute(panel, `${s.id} CN`)}>
              <span className="time">{fmtStamp(st.time, engine.now())}</span>
              <span className="hl">{st.headline}</span>
              <span className="src">{st.source}</span>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
