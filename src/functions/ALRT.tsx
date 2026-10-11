import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { LivePx, SecLink, Section } from '../components/cells';
import { fmtDate, fmtNum, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { resolveSecurity, searchSecurities } from '../data/registry';
import { execute } from '../terminal/exec';
import { flash, usePanelId } from '../terminal/panel';
import { alerts, newsAlerts, type AlertCond } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

const CONDS: { id: AlertCond; label: string }[] = [
  { id: 'above', label: 'Price at or above' },
  { id: 'below', label: 'Price at or below' },
  { id: 'pctUp', label: 'Day % change ≥ +' },
  { id: 'pctDn', label: 'Day % change ≤ −' },
];

export function describe(cond: AlertCond, value: number, dec: number): string {
  switch (cond) {
    case 'above':
      return `≥ ${fmtNum(value, dec)}`;
    case 'below':
      return `≤ ${fmtNum(value, dec)}`;
    case 'pctUp':
      return `day chg ≥ +${fmtNum(value, 2)}%`;
    case 'pctDn':
      return `day chg ≤ −${fmtNum(value, 2)}%`;
  }
}

export function ALRT({ sec }: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const st = alerts.use((s) => s);
  const [text, setText] = useState(sec?.id ?? '');
  const [cond, setCond] = useState<AlertCond>('above');
  const [value, setValue] = useState('');
  const hits = text.trim() && !resolveSecurity(text) ? searchSecurities(text, 5) : [];
  useEffect(() => {
    if (st.unseen) alerts.set((s) => ({ ...s, unseen: 0 }));
  }, [st.unseen]);
  const create = () => {
    const d = resolveSecurity(text) ?? hits[0]?.def;
    if (!d) return flash(panel, `Unknown security: ${text}`, 'error');
    const v = Number(value);
    if (!Number.isFinite(v) || value.trim() === '') return flash(panel, 'Enter a trigger value', 'error');
    alerts.set((s) => ({ ...s, seq: s.seq + 1, list: [{ id: s.seq, sec: d.id, cond, value: v, active: true, created: engine.now() }, ...s.list] }));
    setValue('');
    flash(panel, `Alert set on ${d.ticker} ${describe(cond, v, d.dec)}`, 'info');
  };
  const preset = () => {
    const d = resolveSecurity(text);
    if (!d) return;
    const q = engine.quote(d.id)!;
    setValue(cond === 'above' ? (q.last * 1.005).toFixed(d.dec) : cond === 'below' ? (q.last * 0.995).toFixed(d.dec) : '2');
  };
  const active = st.list.filter((a) => a.active);
  const fired = st.list.filter((a) => !a.active);
  return (
    <div>
      <FnHeader code="ALRT" title="Alert Manager" sub={`${active.length} active · ${fired.length} triggered`} />
      <Section title="New price alert">
        <div className="pad row" style={{ gap: 8 }}>
          <span style={{ position: 'relative' }}>
            <input className="inp" placeholder="Security" aria-label="Security" value={text} onChange={(e) => setText(e.target.value)} />
            {hits.length > 0 && (
              <div className="ac" style={{ left: 0, right: 'auto', minWidth: 300 }}>
                {hits.map(({ def }) => (
                  <div key={def.id} className="ac-item" onMouseDown={(e) => { e.preventDefault(); setText(def.id); }}>
                    <span className="k">{def.id}</span>
                    <span>{def.name}</span>
                    <span />
                  </div>
                ))}
              </div>
            )}
          </span>
          <select className="sel-inp" aria-label="Condition" value={cond} onChange={(e) => setCond(e.target.value as AlertCond)}>
            {CONDS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input className="inp" style={{ width: 110 }} placeholder="Value" aria-label="Trigger value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button type="button" className="btn" onClick={preset} title="Fill a value near the market">
            Near market
          </button>
          <button type="button" className="btn primary" onClick={create}>
            Create alert
          </button>
        </div>
        <div className="note">Alerts are checked every tick in every panel and pop a notification when they fire.</div>
      </Section>
      <Section title="Active alerts">
        <table className="tbl">
          <thead>
            <tr>
              <th>Security</th>
              <th>Condition</th>
              <th className="num">Last</th>
              <th className="num">Distance</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No active alerts.
                </td>
              </tr>
            )}
            {active.map((a) => {
              const d = engine.get(a.sec)!;
              const q = engine.quote(a.sec)!;
              const dist = a.cond === 'above' || a.cond === 'below' ? ((a.value / q.last - 1) * 100) : a.cond === 'pctUp' ? a.value - q.pct : -a.value - q.pct;
              return (
                <tr key={a.id}>
                  <td>
                    <SecLink id={a.sec}>{d.ticker}</SecLink>
                  </td>
                  <td>{describe(a.cond, a.value, d.dec)}</td>
                  <td className="num white">
                    <LivePx id={a.sec} />
                  </td>
                  <td className="num">{fmtNum(dist, 2)}%</td>
                  <td className="muted">{fmtDate(a.created)} {fmtTime(a.created, false)}</td>
                  <td>
                    <button type="button" className="act" aria-label="Delete alert" onClick={() => alerts.set((s) => ({ ...s, list: s.list.filter((x) => x.id !== a.id) }))}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <NewsAlerts />
      <Section title="Triggered" right={fired.length ? <button type="button" className="act" onClick={() => alerts.set((s) => ({ ...s, list: s.list.filter((x) => x.active) }))}>Clear</button> : undefined}>
        <table className="tbl">
          <tbody>
            {fired.length === 0 && (
              <tr>
                <td className="empty">Nothing has triggered yet.</td>
              </tr>
            )}
            {fired.map((a) => {
              const d = engine.get(a.sec)!;
              return (
                <tr key={a.id}>
                  <td>
                    <SecLink id={a.sec}>{d.ticker}</SecLink>
                  </td>
                  <td>{describe(a.cond, a.value, d.dec)}</td>
                  <td className="num yellow">{a.triggeredPx != null ? fmtNum(a.triggeredPx, d.dec) : ''}</td>
                  <td className="muted">{a.triggered ? `${fmtDate(a.triggered)} ${fmtTime(a.triggered)}` : ''}</td>
                  <td>
                    <button type="button" className="act" onClick={() => alerts.set((s) => ({ ...s, list: s.list.map((x) => (x.id === a.id ? { ...x, active: true, triggered: undefined } : x)) }))}>
                      Re-arm
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function NewsAlerts() {
  const panel = usePanelId();
  const st = newsAlerts.use((s) => s);
  const [kw, setKw] = useState('');
  const add = () => {
    const k = kw.trim();
    if (k.length < 2) return flash(panel, 'Enter a keyword or ticker (two characters or more)', 'error');
    newsAlerts.set((s) => ({ seq: s.seq + 1, list: [{ id: s.seq, keyword: k.toUpperCase(), active: true, hits: 0, created: engine.now() }, ...s.list] }));
    setKw('');
    flash(panel, `News alert set for "${k.toUpperCase()}"`, 'info');
  };
  return (
    <Section title="News keyword alerts" right={`${st.list.filter((a) => a.active).length} active`}>
      <div className="pad row" style={{ gap: 8 }}>
        <input className="inp" placeholder="Keyword or ticker, e.g. FED or NVDA" aria-label="News keyword" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="btn primary" onClick={add}>
          Add news alert
        </button>
      </div>
      <table className="tbl">
        <tbody>
          {st.list.length === 0 && (
            <tr>
              <td className="empty">No news alerts. New headlines that contain the word or name the ticker pop up as alerts.</td>
            </tr>
          )}
          {st.list.map((a) => (
            <tr key={a.id}>
              <td className="amber b">{a.keyword}</td>
              <td className="num">{a.hits} hits</td>
              <td className="ellipsis hide-m" style={{ maxWidth: 320 }}>
                {a.lastHeadline ? (
                  <span className="click" onClick={() => execute(panel, `N ${a.keyword}`)}>
                    {a.lastHit ? `${fmtTime(a.lastHit, false)} ` : ''}
                    {a.lastHeadline}
                  </span>
                ) : (
                  <span className="muted">Waiting for a matching headline</span>
                )}
              </td>
              <td>
                <button type="button" className="act" onClick={() => newsAlerts.set((s) => ({ ...s, list: s.list.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)) }))}>
                  {a.active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="act" aria-label="Delete news alert" onClick={() => newsAlerts.set((s) => ({ ...s, list: s.list.filter((x) => x.id !== a.id) }))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
