import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { useBooks, withBook } from '../data/live/nasdaq-book';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { RangeBar } from '../components/RangeBar';
import { DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { FavStar } from '../components/FavStar';
import { liveColumns, SessionNow } from '../components/SessionNow';
import { exchangeOfListing, US_MARKET, usSession } from '../data/exchanges';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtBp, fmtNum, fmtPct, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { averageVolume, marketCap, periodChange, range52w } from '../data/analytics';
import { fieldTime } from '../data/fields';
import { extendedSessions } from '../data/live/yahoo';
import { hasSessionColumns, useExtendedSessionQuotes } from '../data/live/extended-hours';
import { placeInOrder, sortWatchlistRows, UNSORTED_COLUMNS, WATCHLIST_COLUMNS, WATCHLIST_PRESETS, watchlistColumns, watchlistExport, watchlistRow, type WatchlistColumn, type WatchlistRow, type WatchlistSort } from '../data/watchlist-columns';
import { resolveSecurity, searchSecurities } from '../data/registry';
import type { Quote, SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import { watchlists, type Watchlist } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

/** One field of a watchlist row, as WATCHLIST and FAVOURITES show it, with its unit, source and limits on hover. */
export function FieldCell({ column, row, sec, quote, now }: { column: WatchlistColumn; row: WatchlistRow; sec?: SecurityDef; quote?: Quote; now: number }) {
  const f = row.fields.get(column.id);
  if (sec?.quote === 'yield' && column.id === 'CHG_PCT_1D') return <span title={f?.note} />;
  // A session that is over says so (the pre-market after the close); nothing else to show is a blank cell, its reason
  // on hover.
  if (f?.status === 'OUT OF SESSION') return <span className="muted" title={f.note}>N/A</span>;
  if (!f || f.value === null || !sec) return <span className="muted" title={f?.note ?? 'No field value is available.'} />;
  const y = sec.quote === 'yield';
  let value: ReactNode = typeof f.value === 'number' ? fmtNum(f.value, column.id === 'ARMIN_SPREAD_PCT' ? 3 : sec.dec) : f.value;
  switch (column.id) {
    case 'PX_LAST': value = <LivePx id={row.id} />; break;
    case 'CHG_NET_1D': value = quote ? <DayChg q={quote} bp={y} unit={y ? 'bp' : ''} dec={sec.dec} /> : ''; break;
    case 'CHG_PCT_1D': value = y ? '' : quote ? <DayChg q={quote} pct /> : ''; break;
    // Currencies, indices and yields trade no volume of their own: a zero says nothing.
    case 'PX_VOLUME': value = Number(f.value) > 0 ? `${fmtBig(Number(f.value))}${quote?.volumeUnit && quote.volumeUnit !== 'USD' ? ` ${quote.volumeUnit}` : ''}` : ''; break;
    case 'ARMIN_YTD':
    case 'ARMIN_1Y': value = y ? fmtBp(Number(f.value), 0) : <span className={Number(f.value) >= 0 ? 'up' : 'dn'}>{fmtPct(Number(f.value), 1)}</span>; break;
    case 'ARMIN_SOURCE_TIME': value = f.dateOnly ? fieldTime(f) : quote ? fmtStamp(quote.time, now) : '--'; break;
    case 'ARMIN_TODAY': value = <Sparkline values={row.today} width={80} height={16} base={row.base} />; break;
    case 'ARMIN_AVG_VOL_3M': value = fmtBig(Number(f.value)); break;
    case 'CUR_MKT_CAP': value = fmtBig(Number(f.value)); break;
    case 'ARMIN_DAY_RANGE':
    case 'ARMIN_52W_RANGE': {
      const r = column.id === 'ARMIN_DAY_RANGE' ? row.day : row.year;
      if (!r) break;
      return <RangeBar r={r} dec={sec.dec} title={`${f.name} (${f.unit}) · ${f.source}\n${f.definition}\n${f.note}`} />;
    }
    case 'ARMIN_RECEIVED_AT': value = f.asOf === null ? '--' : fieldTime(f); break;
    case 'ARMIN_PRE_MARKET':
    case 'ARMIN_AFTER_HOURS': {
      // The session's price with its change against the regular close.
      const px = row.fields.get(column.id === 'ARMIN_PRE_MARKET' ? 'ARMIN_PRE_PX' : 'ARMIN_POST_PX')?.value;
      const pct = Number(f.value);
      value = (
        <>
          {typeof px === 'number' ? fmtNum(px, sec.dec) : ''} <span className={pct >= 0 ? 'up' : 'dn'}>{fmtPct(pct)}</span>
        </>
      );
      return <span title={`${f.name} at ${f.asOf ? fmtStamp(f.asOf, now) : '--'} · ${f.source}\n${f.definition}\n${f.note}`}>{value}</span>;
    }
  }
  return <span title={`${f.name} (${f.unit}) · ${f.source} · ${f.status}\n${f.timeBasis}\n${f.note}`}>{value}</span>;
}

/** A dragged watchlist line carries its security under its own type, so inputs and other screens ignore it. */
const LINE_TYPE = 'application/x-armin-watchlist-line';

/** A line dropped on the lower half of another lands after it, on the upper half before it. */
const dropsAfter = (e: DragEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY > r.top + r.height / 2;
};

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
  const [editingColumns, setEditingColumns] = useState(false);
  const [filter, setFilter] = useState('');
  const [drag, setDrag] = useState<{ id: string; over?: string; after?: boolean } | null>(null);
  const hits = text.trim() ? searchSecurities(text, 6) : [];
  const now = engine.now();
  const columns = watchlistColumns(list.columns);
  const selected = new Set(columns.map((c) => c.id));
  useExtendedSessionQuotes(hasSessionColumns(columns.map((c) => c.id)) ? list.ids : []);
  // Nasdaq's real-time bid and ask for US stocks whose price source gives none.
  useBooks(selected.has('BID') || selected.has('ASK') || selected.has('PX_VOLUME') ? list.ids : []);
  const updateList = (patch: Partial<Watchlist>) => watchlists.set((s) => ({ ...s, lists: s.lists.map((l, i) => i === active ? { ...l, ...patch } : l) }));
  const setColumns = (ids: string[]) => updateList({ columns: ids, ...(!ids.includes(list.sort?.column ?? '') ? { sort: undefined } : {}) });
  const changeSort = (column: string) => {
    const previous = list.sort;
    const sort: WatchlistSort | undefined = previous?.column !== column ? { column, direction: 'asc' } : previous.direction === 'asc' ? { column, direction: 'desc' } : undefined;
    updateList({ sort });
  };
  const moveColumn = (index: number, offset: number) => {
    const ids = columns.map((c) => c.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setColumns(ids);
  };
  const query = filter.trim().toLowerCase();
  // Every line in the order on screen (the chosen sort, else the manual order); the filter then hides some.
  const ordered = sortWatchlistRows(list.ids.map((id) => {
    const intra = selected.has('ARMIN_TODAY') ? engine.intraday(id) : undefined;
    return watchlistRow(id, engine.get(id), withBook(id, engine.quote(id)), now, {
      ytd: selected.has('ARMIN_YTD') ? periodChange(id, 'YTD') : NaN,
      avgVolume: selected.has('ARMIN_AVG_VOL_3M') ? averageVolume(id) : NaN,
      range52: selected.has('ARMIN_52W_RANGE') ? range52w(id) : null,
      marketCap: selected.has('CUR_MKT_CAP') ? marketCap(id) : NaN,
      y1: selected.has('ARMIN_1Y') ? periodChange(id, '1Y') : NaN,
      today: intra ? Array.from(intra.c.subarray(0, intra.length)) : [], intradayTime: intra?.length ? intra.t[intra.length - 1] : undefined,
      extended: extendedSessions(id, now),
    });
  }), list.sort, columns);
  const rows = query ? ordered.filter((r) => `${r.id} ${engine.get(r.id)?.name ?? ''}`.toLowerCase().includes(query)) : ordered;
  // With real prices, the column US stocks are trading in now is marked LIVE (the simulator trades around the clock).
  const usStocks = list.ids.some((id) => {
    const d = engine.get(id);
    return d?.cls === 'equity' && exchangeOfListing(d.ticker) === US_MARKET;
  });
  const live = new Set(engine.realOnly && usStocks ? liveColumns(usSession(Date.now()).phase) : []);

  const update = (ids: string[]) => watchlists.set((s) => ({ ...s, lists: s.lists.map((l, i) => (i === active ? { ...l, ids } : l)) }));
  const add = (id: string) => {
    if (list.ids.includes(id)) flash(panel, `${id} is already on ${list.name}`, 'error');
    else update([...list.ids, id]);
    setText('');
  };
  // Moving a line keeps the order on screen: a sort becomes the manual order, then the line goes before or after another.
  const place = (id: string, target: string, after: boolean) => updateList({ ids: placeInOrder(ordered.map((r) => r.id), id, target, after), sort: undefined });
  const csv = () => watchlistExport(rows, columns, now);
  return (
    <div>
      <FnHeader
        code="WATCHLIST"
        title="Watchlists"
        sub={`${rows.length}${rows.length !== list.ids.length ? ` of ${list.ids.length}` : ''} securities`}
        tabs={st.lists.map((l, i) => ({ n: i + 1, label: l.name }))}
        tab={active + 1}
        onTab={(n) => { watchlists.set((s) => ({ ...s, active: n - 1 })); setFilter(''); }}
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
          { n: 94, label: 'Columns', on: editingColumns, onClick: () => setEditingColumns((v) => !v) },
          ...(list.sort ? [{ n: 95, label: 'Manual order', onClick: () => updateList({ sort: undefined }) }] : []),
          ...exportActions(panel, `${list.name.replace(/\W+/g, '_')}.csv`, csv),
        ]}
      />
      {editingColumns && <section className="sect" aria-label="Watchlist columns">
        <div className="sect-h">Local field columns <span className="right">Saved with {list.name}</span></div>
        <div className="chart-tools">
          <span className="fld">Presets</span>
          {WATCHLIST_PRESETS.map((preset) => <button key={preset.name} type="button" className="btn" onClick={() => setColumns([...preset.columns])}>{preset.name}</button>)}
          <button type="button" className="btn" onClick={() => setEditingColumns(false)}>Done</button>
        </div>
        <div className="pad-s row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {WATCHLIST_COLUMNS.map((c) => <label key={c.id} className="nowrap" title={c.id}>
            <input type="checkbox" checked={selected.has(c.id)} disabled={selected.has(c.id) && columns.length === 1} onChange={(e) => setColumns(e.target.checked ? [...columns.map((x) => x.id), c.id] : columns.filter((x) => x.id !== c.id).map((x) => x.id))} /> {c.label}
          </label>)}
        </div>
        <div className="chart-tools" style={{ flexWrap: 'wrap' }}>
          <span className="fld">Column order</span>
          {columns.map((c, i) => <span key={c.id} className="nowrap">
            <button type="button" className="act" aria-label={`Move ${c.label} column left`} disabled={i === 0} onClick={() => moveColumn(i, -1)}>◀</button>
            <span>{c.label}</span>
            <button type="button" className="act" aria-label={`Move ${c.label} column right`} disabled={i === columns.length - 1} onClick={() => moveColumn(i, 1)}>▶</button>
          </span>)}
        </div>
        <div className="note">Extended-session columns refresh Yahoo quotes independently of the regular-session price source; other columns use fields already held by this app. Hover a value for units, source and limits. Copy/export follows the selected columns and filtered order, with raw values and per-field provenance below the table. Bid/ask event times remain unavailable.</div>
      </section>}
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
        <input className="inp" aria-label="Filter watchlist" placeholder="Filter this list" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 145 }} />
        <span className="muted hide-m">Click to open · shift-click opens in the next panel · drag a line or ▲▼ to reorder</span>
      </div>
      {engine.realOnly ? <SessionNow ids={list.ids} columns={columns.map((c) => c.id)} now={Date.now()} /> : null}
      <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Security</th>
            {columns.map((c) => <th key={c.id} className={`${c.numeric ? 'num' : ''}${c.compact || list.columns ? '' : ' hide-m'}${live.has(c.id) ? ' live-col' : ''}`} aria-sort={list.sort?.column === c.id ? list.sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>
              {UNSORTED_COLUMNS.has(c.id) ? c.label : <button type="button" className="act" title={`${c.id} · sort ascending, descending, then manual order`} onClick={() => changeSort(c.id)}>{c.label}{list.sort?.column === c.id ? list.sort.direction === 'asc' ? ' ▲' : ' ▼' : ''}</button>}
              {live.has(c.id) ? <span className="live-tag" title="US stocks are trading in this session now">LIVE</span> : null}
            </th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="empty">
                {list.ids.length ? 'No securities match this filter.' : 'This list is empty. Add a security above.'}
              </td>
            </tr>
          )}
          {rows.map((row, k) => {
            const id = row.id;
            const d = engine.get(id);
            const q = engine.quote(id);
            const landing = drag?.over === id && drag.id !== id ? drag.after ? ' drop-after' : ' drop-before' : '';
            return (
              <tr
                key={id}
                className={`click${drag?.id === id ? ' dragging' : ''}${landing}`}
                draggable
                onClick={(e) => openSecurity(panel, id, e)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(LINE_TYPE, id);
                  // A sorted list keeps its current order while the line moves, as the manual order.
                  if (list.sort) updateList({ ids: ordered.map((r) => r.id), sort: undefined });
                  setDrag({ id });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const after = dropsAfter(e);
                  if (drag.over !== id || drag.after !== after) setDrag({ ...drag, over: id, after });
                }}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  place(drag.id, id, dropsAfter(e));
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <td className="nowrap">
                  <FavStar id={id} />
                  {d ? <SecLink id={id}>{d.ticker}</SecLink> : <span title="Security definition is unavailable; remove or reload this line.">{id}</span>}
                </td>
                {columns.map((c) => <td key={c.id} className={`${c.numeric ? 'num' : 'ellipsis'}${c.compact || list.columns ? '' : ' hide-m'}${c.id === 'PX_LAST' ? ' white' : ''}${live.has(c.id) ? ' live-col' : ''}`} style={c.numeric || UNSORTED_COLUMNS.has(c.id) ? undefined : { maxWidth: 240 }}><FieldCell column={c} row={row} sec={d} quote={q} now={now} /></td>)}
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="act" aria-label="Move up" disabled={k === 0} title={list.sort ? 'Keeps this sorted order as the manual order' : undefined} onClick={() => place(id, rows[k - 1].id, false)}>
                    ▲
                  </button>
                  <button type="button" className="act" aria-label="Move down" disabled={k === rows.length - 1} title={list.sort ? 'Keeps this sorted order as the manual order' : undefined} onClick={() => place(id, rows[k + 1].id, true)}>
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
      </div>
      <FreshnessLegend />
    </div>
  );
}
