import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { fmtNum } from '../core/format';
import { engine } from '../data/market';
import { alignedReturns } from '../data/analytics';
import { correlation } from '../finance/stats';
import { resolveSecurity } from '../data/registry';
import type { FnProps } from '../terminal/types';

const DEFAULT = ['SPX Index', 'NDX Index', 'SX5E Index', 'NKY Index', 'EURUSD Curncy', 'USDJPY Curncy', 'USGG10YR Index', 'CL1 Comdty', 'GC1 Comdty', 'XBTUSD Curncy'];
const PERIODS = [
  { n: 1, label: '3M', bars: 63 },
  { n: 2, label: '6M', bars: 126 },
  { n: 3, label: '1Y', bars: 252 },
  { n: 4, label: '3Y', bars: 756 },
];

function color(c: number): string {
  if (!Number.isFinite(c)) return '#111';
  const a = Math.min(1, Math.abs(c));
  return c >= 0 ? `rgba(47, 211, 107, ${0.12 + a * 0.75})` : `rgba(255, 77, 79, ${0.12 + a * 0.75})`;
}

export function CORR({ sec }: FnProps) {
  const [ids, setIds] = useState<string[]>(() => (sec && !DEFAULT.includes(sec.id) ? [sec.id, ...DEFAULT.slice(0, 9)] : DEFAULT));
  const [tab, setTab] = useState(3);
  const [text, setText] = useState('');
  const matrix = useMemo(() => {
    const { rets } = alignedReturns(ids, PERIODS[tab - 1].bars);
    return ids.map((_, i) => ids.map((__, j) => (i === j ? 1 : correlation(rets[i], rets[j]))));
  }, [ids, tab]);
  return (
    <div>
      <FnHeader code="CORR" title="Correlation Matrix" sub="Daily returns (yield changes for rates)" tabs={PERIODS.map((p) => ({ n: p.n, label: p.label }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <input
          className="inp"
          placeholder="+ Add security (Enter)"
          aria-label="Add security"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const r = resolveSecurity(text);
              if (r && !ids.includes(r.id)) setIds([...ids, r.id].slice(-14));
              setText('');
            }
          }}
        />
        <span className="muted">Click × to drop a row. Green = moves together, red = moves opposite.</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl" style={{ width: 'auto' }}>
          <thead>
            <tr>
              <th />
              {ids.map((id) => (
                <th key={id} className="num" style={{ minWidth: 64 }}>
                  {engine.get(id)!.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => (
              <tr key={id}>
                <td>
                  <button type="button" className="act" aria-label={`Remove ${id}`} onClick={() => setIds(ids.filter((x) => x !== id))}>
                    ×
                  </button>
                  <SecLink id={id}>{engine.get(id)!.ticker}</SecLink>
                </td>
                {matrix[i].map((c, j) => (
                  <td key={j} className="num" style={{ background: i === j ? '#1a1a1a' : color(c), color: '#fff' }}>
                    {fmtNum(c, 2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
