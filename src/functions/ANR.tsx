import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { DataTable } from '../components/DataTable';
import { Section, Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { XYChart } from '../components/chart/XYChart';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { analystViews, consensus } from '../data/fundamentals';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const scoreClass = (score: number) => (score >= 4 ? 'up' : score >= 3 ? 'yellow' : 'dn');
const fmtTarget = (v: number, dec: number) => (Number.isFinite(v) ? fmtNum(v, dec) : '--');

export function ANR({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  useTick(5);
  const { status } = useFundamentals(s);
  const views = analystViews(s);
  const c = consensus(s);
  const px = engine.quote(s.id)!.last;
  const daily = engine.daily(s.id);
  const pts = [];
  for (let i = Math.max(0, daily.length - 252); i < daily.length; i += 2) pts.push({ x: daily.t[i], y: daily.c[i] });
  const csv = () => [['Firm', 'Rating', 'Target', 'Prior target', 'Action', 'Date'], ...views.map((v) => [v.firm, v.rating, v.target, v.prevTarget, v.action, fmtDay(v.date, true)])];
  return (
    <div>
      <FnHeader code="ANR" title="Analyst Recommendations" sec={s} sub={<>{c.n} analysts · {sourceLabel(status, 'fictional research firms; real ratings need the desktop app')}</>} actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_ANR.csv`, csv)} />
      <QuoteStrip sec={s} />
      <div className="cols">
        <Section title="Consensus">
          <div className="pad row" style={{ gap: 18 }}>
            <div>
              <div className="muted">Consensus rating</div>
              <div style={{ fontSize: 28, fontWeight: 600 }} className={c.score >= 4 ? 'up' : c.score >= 3 ? 'yellow' : 'dn'}>
                {fmtNum(c.score, 2)}
              </div>
              <div className="muted" title="Average of the ratings: strong buy 5, buy 4, hold 3, sell 2, strong sell 1">
                5 strong buy · 3 hold · 1 strong sell · {c.n} ratings
              </div>
            </div>
            <div>
              <div className="muted">12M target</div>
              <div style={{ fontSize: 28, fontWeight: 600 }} className="white">
                {fmtTarget(c.avg, s.dec)}
              </div>
              <div>
                Return potential {Number.isFinite(c.avg) ? <Chg v={(c.avg / px - 1) * 100} pct dec={1} /> : '--'}
              </div>
              {c.nTargets != null && Number.isFinite(c.nTargets) && <div className="muted">{c.nTargets} price targets</div>}
            </div>
            <div className="grow" style={{ minWidth: 180 }}>
              {[
                ['Buy', c.buy, 'var(--up)'],
                ['Hold', c.hold, '#c9a227'],
                ['Sell', c.sell, 'var(--dn)'],
              ].map(([k, n, col]) => (
                <div key={k as string} className="row" style={{ gap: 6, margin: '3px 0' }}>
                  <span style={{ width: 36 }} className="amber">
                    {k}
                  </span>
                  <div className="bar-track grow">
                    <div className="bar-fill" style={{ left: 0, width: `${((n as number) / c.n) * 100}%`, background: col as string }} />
                  </div>
                  <span style={{ width: 70 }} className="num">
                    {n} ({fmtNum(((n as number) / c.n) * 100, 0)}%)
                  </span>
                </div>
              ))}
              <div className="muted" style={{ marginTop: 4 }}>
                Target range {fmtTarget(c.lo, s.dec)} - {fmtTarget(c.hi, s.dec)}
              </div>
            </div>
          </div>
        </Section>
        <Section title="1Y price against current targets">
          <XYChart
            height={200}
            series={[{ label: 'Price', color: '#ffb547', points: pts }]}
            refLines={[
              { y: c.hi, color: '#2fd36b', label: `High ${fmtTarget(c.hi, s.dec)}` },
              { y: c.avg, color: '#45d3e6', label: `Consensus ${fmtTarget(c.avg, s.dec)}` },
              { y: c.lo, color: '#ff4d4f', label: `Low ${fmtTarget(c.lo, s.dec)}` },
            ].filter((l) => Number.isFinite(l.y))}
            xFormat={(v) => fmtDay(v)}
            yFormat={(v) => fmtNum(v, s.dec > 1 ? 0 : s.dec)}
            xTicks={pts.filter((_, i) => i % 21 === 0).map((p) => ({ v: p.x, label: fmtDay(p.x).slice(0, 5) }))}
          />
        </Section>
      </div>
      <Section title="Broker recommendations" right={status === 'ok' ? 'Latest action per firm, last 18 months' : undefined}>
        <DataTable
          rows={views}
          rowKey={(v) => v.firm}
          numbered
          defaultSort={{ key: 'd', dir: -1 }}
          columns={[
            { key: 'f', label: 'Firm', render: (v) => v.firm, sort: (v) => v.firm },
            { key: 'r', label: 'Rating', render: (v) => <span className={scoreClass(v.score)}>{v.rating}</span>, sort: (v) => v.score },
            { key: 'a', label: 'Action', render: (v) => v.action, sort: (v) => v.action, hideM: true },
            { key: 't', label: 'Target', num: true, render: (v) => fmtTarget(v.target, s.dec), sort: (v) => (Number.isFinite(v.target) ? v.target : -1) },
            { key: 'p', label: 'Prior', num: true, render: (v) => (v.prevTarget !== v.target ? fmtTarget(v.prevTarget, s.dec) : '--'), hideM: true },
            { key: 'u', label: 'Upside', num: true, render: (v) => (Number.isFinite(v.target) ? <Chg v={(v.target / px - 1) * 100} pct dec={1} /> : '--'), sort: (v) => (Number.isFinite(v.target) ? v.target / px : -9) },
            { key: 'd', label: 'Date', render: (v) => fmtDay(v.date), sort: (v) => v.date },
          ]}
        />
      </Section>
    </div>
  );
}
