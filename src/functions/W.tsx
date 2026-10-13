import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtBp, fmtNum, fmtPct, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { resolveSecurity, searchSecurities } from '../data/registry';
import { flash, usePanelId } from '../terminal/panel';
import { watchlists } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

export function W({ route }: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const st = watchlists.use((s) => s);
  // WATCHLIST TECH opens the list whose name starts with TECH.
  const wanted = route.args?.trim().toUpperCase();
  useEffect(() => {
    if (!wanted) return;
    const i = watchlists.get().lists.findIndex((l) => l.name.toUpperCase().startsWith(wanted));
    if (i >= 0) watchlists.set((s) => ({ ...s, active: i }));
    else flash(panel, `No watchlist named ${wanted}: 91) New list makes one`, 'error');
  }, [wanted, panel]);
  const active = Math.min(st.active, st.lists.length - 1);
  const list = st.lists[active];
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const hits = text.trim() ? searchSecurities(text, 6) : [];
  const now = engine.now();

  const update = (ids: string[]) => watchlists.set((s) => ({ ...s, lists: s.lists.map((l, i) => (i === active ? { ...l, ids } : l)) }));
  const add = (id: string) => {
    if (list.ids.includes(id)) flash(panel, `${id} is already on ${list.name}`, 'error');
    else update([...list.ids, id]);
    setText('');
  };
  const move = (i: number, d: -1 | 1) => {
    const ids = [...list.ids];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    update(ids);
  };
  const csv = () => [
    ['Ticker', 'Name', 'Last', 'Net chg', '% chg', 'Bid', 'Ask', 'High', 'Low', 'Volume'],
    ...list.ids.map((id) => {
      const q = engine.quote(id)!;
      return [id, engine.get(id)!.name, q.last, q.chg, q.pct.toFixed(3), q.bid, q.ask, q.high, q.low, q.volume];
    }),
  ];
  return (
    <div>
      <FnHeader
        code="WATCHLIST"
        title="Watchlists"
        sub={`${list.ids.length} securities`}
        tabs={st.lists.map((l, i) => ({ n: i + 1, label: l.name }))}
        tab={active + 1}
        onTab={(n) => watchlists.set((s) => ({ ...s, active: n - 1 }))}
        actions={[
          {
            n: 91,
            label: 'New list',
            onClick: () => watchlists.set((s) => ({ ...s, lists: [...s.lists, { name: `List ${s.lists.length + 1}`, ids: [] }], active: s.lists.length })),
          },
          { n: 92, label: 'Rename', onClick: () => setRenaming(true) },
          {
            n: 93,
            label: 'Delete list',
            onClick: () => {
              if (st.lists.length <= 1) return flash(panel, 'Keep at least one list', 'error');
              watchlists.set((s) => ({ ...s, lists: s.lists.filter((_, i) => i !== active), active: 0 }));
            },
          },
          ...exportActions(panel, `${list.name.replace(/\W+/g, '_')}.csv`, csv),
        ]}
      />
      <div className="chart-tools">
        {renaming ? (
          <input
            className="inp"
            autoFocus
            aria-label="List name"
            defaultValue={list.name}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim() || list.name;
                watchlists.set((s) => ({ ...s, lists: s.lists.map((l, i) => (i === active ? { ...l, name } : l)) }));
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={() => setRenaming(false)}
          />
        ) : (
          <span style={{ position: 'relative' }}>
            <input
              className="inp"
              style={{ width: 220 }}
              placeholder="+ Add security (ticker or name)"
              aria-label="Add security to monitor"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const r = resolveSecurity(text) ?? hits[0]?.def;
                  if (r) add(r.id);
                }
              }}
            />
            {hits.length > 0 && (
              <div className="ac" style={{ left: 0, right: 'auto', minWidth: 320 }}>
                {hits.map(({ def }) => (
                  <div key={def.id} className="ac-item" onMouseDown={(e) => { e.preventDefault(); add(def.id); }}>
                    <span className="k">{def.id}</span>
                    <span>{def.name}</span>
                    <span />
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
        <span className="muted hide-m">Click to open · shift-click opens in the next panel · ▲▼ reorder</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Security</th>
            <th className="hide-m">Name</th>
            <th className="num">Last</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">Bid</th>
            <th className="num hide-m">Ask</th>
            <th className="num hide-m">Volume</th>
            <th className="num hide-m">YTD</th>
            <th className="num hide-m">Time</th>
            <th className="hide-m">Today</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.ids.length === 0 && (
            <tr>
              <td colSpan={12} className="empty">
                This list is empty. Add a security above.
              </td>
            </tr>
          )}
          {list.ids.map((id, i) => {
            const d = engine.get(id);
            const q = engine.quote(id);
            if (!d || !q) return null;
            const y = d.quote === 'yield';
            const intra = engine.intraday(id);
            return (
              <tr key={id} className="click" onClick={(e) => openSecurity(panel, id, e)}>
                <td>
                  <SecLink id={id}>{d.ticker}</SecLink>
                </td>
                <td className="hide-m ellipsis" style={{ maxWidth: 200 }}>
                  {d.name}
                </td>
                <td className="num white">
                  <LivePx id={id} />
                </td>
                <td className="num">{y ? <DayChg q={q} bp unit="bp" /> : <DayChg q={q} dec={d.dec} />}</td>
                <td className="num">{y ? '' : <DayChg q={q} pct />}</td>
                <td className="num hide-m">{fmtNum(q.bid, d.dec)}</td>
                <td className="num hide-m">{fmtNum(q.ask, d.dec)}</td>
                <td className="num hide-m">{q.volume ? fmtBig(q.volume) : ''}</td>
                <td className="num hide-m">{y ? `${fmtBp(periodChange(id, 'YTD'), 0)}` : <span className={periodChange(id, 'YTD') >= 0 ? 'up' : 'dn'}>{fmtPct(periodChange(id, 'YTD'), 1)}</span>}</td>
                <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                <td className="hide-m">
                  <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                </td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="act" aria-label="Move up" onClick={() => move(i, -1)}>
                    ▲
                  </button>
                  <button type="button" className="act" aria-label="Move down" onClick={() => move(i, 1)}>
                    ▼
                  </button>
                  <button type="button" className="act" aria-label={`Remove ${id}`} onClick={() => update(list.ids.filter((x) => x !== id))}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <FreshnessLegend />
    </div>
  );
}
