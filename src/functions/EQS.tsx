import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { CapLink } from '../components/CapLink';
import { FnHeader } from '../components/FnHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Chg, LivePx, SecLink, openSecurity } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { SimBadge } from '../components/Source';
import { fmtBig, fmtInt, fmtIso, fmtNum, fmtTime } from '../core/format';
import { useTick } from '../data/market';
import { calendarAvailable, earningsCalendar, requestListings } from '../data/live/earnings-calendar';
import { FTSE_SOURCE, useFtse100, type FtseList, type MemberFigures } from '../data/live/ftse100';
import { membersAvailable } from '../data/live/index-members';
import { lookupSecurity } from '../data/live/lookup';
import { desktopData } from '../data/live/yahoo';
import {
  appCandidates,
  BLANK_SCREEN,
  complete,
  describeScreen,
  excludedWord,
  FIELD,
  fieldText,
  ftseCandidates,
  isRank,
  matchesAfterEach,
  NM,
  OPS,
  PERIOD_LABEL,
  PERIOD_SHORT,
  periodOf,
  PRESETS,
  runScreen,
  SCREEN_FIELDS,
  unitOf,
  usCandidates,
  valueKey,
  type Candidate,
  type Criterion,
  type FieldId,
  type PeriodId,
  type ScreenDef,
  type ScreenField,
  type ScreenRow,
  type Universe,
} from '../data/screen';
import { resultsCsv, ScreenResults } from './ScreenResults';
import { flash, usePanelId } from '../terminal/panel';
import { savedScreens } from '../terminal/userdata';
import type { SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';

/** The exclusion word a stock's sector or industry contains, if any (case does not matter). */
export function excludedBy(d: Pick<SecurityDef, 'eq'>, exclude: string): string | undefined {
  return excludedWord(d.eq?.sector, d.eq?.industry, exclude);
}

/** The columns each universe shows, before any field a criterion adds. */
const SHOWN: Record<Universe, FieldId[]> = {
  app: ['price', 'cap', 'pe', 'divYld', 'roe', 'beta', 'ytd', 'y1'],
  us: ['price', 'chg', 'cap', 'volume', 'industry', 'country', 'ipoYear'],
  ftse: ['price', 'chg', 'cap', 'gm', 'roce', 'ytd', 'tr'],
};
const CATEGORIES: ScreenField['category'][] = ['Market', 'Valuation', 'Size and growth', 'Profitability', 'Risk and return', 'Classification'];

/** A column of the results: a field for one period. */
interface Col {
  field: FieldId;
  key: string;
  period?: PeriodId;
}
const colOf = (field: FieldId, period?: PeriodId): Col => ({ field, key: valueKey({ field, period }), period: periodOf({ field, period }) });
function colLabel(c: Col, u: Universe): string {
  const f = FIELD[c.field];
  const p = c.period ? ` ${PERIOD_SHORT[c.period]}` : '';
  const unit = unitOf(f, u);
  // Market values read "1.23B": the column says the currency only where it is not the dollar.
  return `${f.label}${p}${unit === '£bn' ? ' £' : unit && unit !== 'shares' && unit !== '$bn' ? ` ${unit}` : ''}`;
}

/** The FTSE 100 universe in words: Wikipedia's list, its review date and load time, and how many members have figures. */
function ftseText(list: FtseList | undefined, by: Readonly<Record<string, MemberFigures>>, problem: string | undefined): string {
  if (!list || (list.state === 'loading' && !list.members)) return "The FTSE 100's members from Wikipedia, loading";
  if (!list.members?.length) return `Wikipedia's FTSE 100 list did not load: ${list.message ?? 'no answer'}`;
  const n = list.members.length;
  const done = list.members.filter((m) => by[m.yahoo]?.annual !== undefined && by[m.yahoo]?.daily !== undefined).length;
  const failed = list.members.filter((m) => by[m.yahoo]?.error).length;
  const source = `${FTSE_SOURCE}${list.asOf ? `, after the changes on ${list.asOf}` : ''}${list.at ? `, loaded ${fmtTime(list.at, false)}` : ''}`;
  const figures = problem ?? `figures for ${done} of ${n} from Yahoo Finance${done + failed < n ? ', loading' : ''}${failed ? `; Yahoo did not answer for ${failed}, asked again shortly` : ''}`;
  return `the FTSE 100's ${n} members (${source}${list.state === 'error' ? `; the latest request failed: ${list.message}` : ''}); ${figures}`;
}
const PAGE = 250;

const offered = (u: Universe) => SCREEN_FIELDS.filter((f) => f.from[u]);
const numberOf = (v: number | string | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

function valueText(id: FieldId, v: number | string | undefined): string {
  if (v === NM) return NM;
  if (FIELD[id].kind === 'text') return typeof v === 'string' ? v : '';
  const x = numberOf(v);
  if (!Number.isFinite(x)) return '';
  if (id === 'cap') return fmtBig(x * 1e9);
  if (FIELD[id].unit === '$M') return fmtBig(x * 1e6);
  if (id === 'volume') return fmtBig(x);
  if (id === 'ipoYear') return String(x);
  return fmtNum(x, id === 'price' || id === 'beta' || id === 'divYld' ? 2 : 1);
}

function Cell({ id, v }: { id: FieldId; v: number | string | undefined }) {
  if (v === NM) return <span className="muted" title="Not meaningful: a loss, or growth from a loss">{NM}</span>;
  if ((id === 'chg' || id === 'ytd' || id === 'y1') && Number.isFinite(numberOf(v))) return <Chg v={numberOf(v)} pct dec={1} />;
  const text = valueText(id, v);
  return text ? <>{text}</> : <span className="muted" title="The source gives no value" />;
}

/** A stock the app may not hold yet (a US ticker, or a London one as "BATS LN"): looked up first, then opened. */
function openTicker(panel: number, c: Candidate, e?: MouseEvent) {
  if (c.id) return openSecurity(panel, c.id, e);
  const shift = !!e?.shiftKey;
  const asked = c.lookup ?? c.ticker;
  void lookupSecurity(asked, false).then((r) => {
    if (r.ok) openSecurity(panel, r.def.id, { shiftKey: shift } as unknown as MouseEvent);
    else flash(panel, `${asked} could not be looked up`, 'error');
  });
}

function TickerCell({ c }: { c: Candidate }) {
  const panel = usePanelId();
  if (c.id) return <SecLink id={c.id}>{c.ticker}</SecLink>;
  return (
    <button type="button" className="sec-link" title={`${c.lookup ?? `${c.ticker} US`}: click to look it up and open it`} onClick={(e) => { e.stopPropagation(); openTicker(panel, c, e); }}>
      {c.ticker}
    </button>
  );
}

export function EQS({ route }: FnProps) {
  const panel = usePanelId();
  const tick = useTick(10);
  const saved = savedScreens.use((x) => x.screens);
  const wanted = route.args?.trim().toUpperCase();
  // SCREEN VALUE opens the saved screen whose name starts with VALUE.
  const named = wanted ? savedScreens.get().screens.find((x) => x.name?.toUpperCase().startsWith(wanted)) : undefined;
  const [s, setS] = useState<ScreenDef>(() => named ?? BLANK_SCREEN);
  const [name, setName] = useState(() => named?.name ?? '');
  // The FTSE 100's results open on the paper's Results tab; Overview is the table every universe has.
  const [view, setView] = useState<'overview' | 'results'>('results');
  const paperView = s.universe === 'ftse' && view === 'results';
  useEffect(() => {
    if (wanted && !named) flash(panel, `No saved screen named ${wanted}`, 'error');
  }, [wanted, named, panel]);
  const usAvailable = calendarAvailable();
  const ftseAvailable = membersAvailable();
  useEffect(() => {
    if (s.universe === 'us') requestListings();
  }, [s.universe]);
  const list = earningsCalendar.use((x) => x.listings);
  const ftse = useFtse100(s.universe === 'ftse');
  // The US list is rebuilt when it loads again, not on every tick: six thousand stocks take a moment. The FTSE 100's
  // members as their figures arrive, and on the tick for the exchange rates of its dollar and euro lines.
  const cands = useMemo(
    () => (s.universe === 'us' ? (list?.data ? usCandidates(list.data) : []) : s.universe === 'ftse' ? ftseCandidates(ftse.list?.members ?? [], ftse.by) : appCandidates()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.universe, list, ftse.list, ftse.by, s.universe !== 'us' ? tick : 0],
  );
  const out = useMemo(() => runScreen(cands, s), [cands, s]);
  // The latest day the FTSE 100's prices reach.
  const latestDay = s.universe === 'ftse' ? cands.map((c) => String(c.values.day ?? '')).filter(Boolean).sort().at(-1) : undefined;
  // The stocks left after each criterion in its group, as the fixed income search shows them beside its criteria.
  const left = useMemo(() => matchesAfterEach(cands, s), [cands, s]);
  const fields = offered(s.universe);
  const used = s.groups.flat().map((c) => c.field);
  // The universe's columns, then each field and period a criterion uses.
  const shown: Col[] = [...SHOWN[s.universe].map((f) => colOf(f)), ...s.groups.flat().filter((c) => c.field !== 'name' && c.field !== 'sector').map((c) => colOf(c.field, c.period))].filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i);

  const setGroups = (groups: Criterion[][]) => setS({ ...s, groups });
  const setCriterion = (gi: number, ci: number, patch: Partial<Criterion>) =>
    setGroups(s.groups.map((g, i) => (i !== gi ? g : g.map((c, j) => (j !== ci ? c : { ...c, ...patch })))));
  const pickField = (gi: number, ci: number, field: FieldId) => {
    const kind = FIELD[field].kind;
    const c = s.groups[gi][ci];
    setCriterion(gi, ci, FIELD[c.field].kind === kind ? { field, period: undefined } : { field, op: OPS[kind][0].id, value: '', to: undefined, period: undefined });
  };
  // Order matters once a rank is in the group: it ranks what the criteria above it left.
  const moveCriterion = (gi: number, ci: number, by: -1 | 1) =>
    setGroups(s.groups.map((g, i) => {
      if (i !== gi || ci + by < 0 || ci + by >= g.length) return g;
      const next = [...g];
      [next[ci], next[ci + by]] = [next[ci + by], next[ci]];
      return next;
    }));
  const addCriterion = (gi: number) => setGroups(s.groups.map((g, i) => (i === gi ? [...g, { field: 'cap', op: 'gte', value: '' }] : g)));
  const removeCriterion = (gi: number, ci: number) => {
    const groups = s.groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== ci) : g)).filter((g) => g.length > 0);
    setGroups(groups.length ? groups : BLANK_SCREEN.groups);
  };
  const switchUniverse = (u: Universe) => {
    const dropped = [...new Set(s.groups.flat().filter((c) => !FIELD[c.field].from[u]).map((c) => FIELD[c.field].label))];
    const groups = s.groups.map((g) => g.filter((c) => FIELD[c.field].from[u])).filter((g) => g.length > 0);
    setS({ ...s, universe: u, groups: groups.length ? groups : BLANK_SCREEN.groups });
    if (dropped.length) flash(panel, `${dropped.join(', ')}: not in this universe, criteria removed`, 'error');
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const def: ScreenDef = { ...s, name: n };
    savedScreens.set((x) => ({ screens: [...x.screens.filter((y) => y.name?.toUpperCase() !== n.toUpperCase()), def].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')) }));
    flash(panel, `Saved ${n}: SCREEN ${n.toUpperCase()} opens it`);
  };
  const load = (n: string) => {
    const def = saved.find((x) => x.name === n);
    if (!def) return;
    setS(def);
    setName(n);
  };
  const remove = () => {
    const n = name.trim();
    savedScreens.set((x) => ({ screens: x.screens.filter((y) => y.name !== n) }));
    flash(panel, `Deleted ${n}`);
  };
  const isSaved = saved.some((x) => x.name === name.trim());
  // A preset with its own universe (the FTSE 100 paper's screen) switches to it.
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const u = p.universe ?? s.universe;
    if (u === 'ftse' && !ftseAvailable) flash(panel, 'The FTSE 100 universe needs the desktop app', 'error');
    else if (p.groups.every((g) => g.every((c) => FIELD[c.field].from[u]))) setS({ ...s, universe: u, groups: p.groups });
    else flash(panel, 'This preset needs figures this universe does not have', 'error');
  };

  // Suggestions for the text fields, from the stocks in the universe.
  const suggestions = useMemo(() => {
    const m = new Map<FieldId, string[]>();
    for (const f of ['sector', 'industry', 'region', 'country'] as FieldId[]) {
      m.set(f, [...new Set(cands.map((c) => c.values[f]).filter((v): v is string => typeof v === 'string' && v.trim() !== ''))].sort().slice(0, 400));
    }
    return m;
  }, [cands]);

  const universeText =
    s.universe === 'app'
      ? `the app's ${cands.length} stocks`
      : s.universe === 'ftse'
        ? ftseText(ftse.list, ftse.by, ftse.problem)
      : list?.state === 'ok' && list.data
        ? `Nasdaq's list of ${cands.length.toLocaleString('en-US')} US-listed stocks${list.at ? `, loaded ${fmtTime(list.at, false)}` : ''}${list.stale ? ' (an earlier answer: the latest request failed)' : ''}`
        : list && list.state !== 'loading'
          ? `Nasdaq's list did not load: ${list.message ?? 'no answer'}`
          : "Nasdaq's list of US-listed stocks, loading";
  const missingText = (Object.entries(out.missingBy) as [FieldId, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${FIELD[f].label} ${n.toLocaleString('en-US')}`)
    .join(', ');
  const unrankedText = (Object.entries(out.unranked) as [FieldId, number][]).map(([f, n]) => `${n.toLocaleString('en-US')} without a ${FIELD[f].label.toLowerCase()} could not be ranked`).join('; ');

  const columns: Column<ScreenRow>[] = [
    { key: 't', label: 'Ticker', render: (r) => <TickerCell c={r.c} />, sort: (r) => r.c.ticker },
    { key: 'n', label: 'Name', render: (r) => <span className="ellipsis" style={{ display: 'inline-block', maxWidth: 200 }}>{r.c.name}</span>, sort: (r) => r.c.name, hideM: true },
    { key: 'sector', label: 'Sector', render: (r) => <span className="muted">{String(r.c.values.sector ?? '')}</span>, sort: (r) => String(r.c.values.sector ?? ''), hideM: true },
    ...shown.map(({ field: f, key, period }): Column<ScreenRow> => ({
      key,
      label: colLabel({ field: f, key, period }, s.universe),
      title: period ? `${FIELD[f].label}, ${PERIOD_LABEL[period]}` : unitOf(FIELD[f], s.universe) === '£bn' ? `${FIELD[f].label}, pounds` : undefined,
      num: FIELD[f].kind === 'num',
      hideN: f === 'industry' || f === 'country' || f === 'ipoYear' || f === 'volume',
      render: (r) =>
        f === 'price' && s.universe === 'app' && r.c.id ? <LivePx id={r.c.id} />
          : f === 'cap' && s.universe !== 'ftse' && r.c.id && Number.isFinite(numberOf(r.c.values.cap)) ? <CapLink id={r.c.id}>{fmtBig(numberOf(r.c.values.cap) * 1e9)}</CapLink>
            : <Cell id={f} v={r.c.values[key]} />,
      sort: (r) => (FIELD[f].kind === 'text' ? String(r.c.values[key] ?? '') : numberOf(r.c.values[key])),
    })),
    {
      key: 'missing',
      label: '?',
      title: 'Kept although a value the screen needs is missing',
      render: (r) => (r.unknown.length ? <span className="amber" title={`No value for ${r.unknown.map((f) => FIELD[f].label).join(', ')}: kept because the screen keeps stocks with a missing value`}>?</span> : null),
      sort: (r) => r.unknown.length,
    },
  ];

  const csv = () => {
    if (paperView) return resultsCsv(out.rows);
    // Every field for its default period, then the other periods the criteria use.
    const cols: Col[] = [...fields.filter((f) => f.id !== 'name').map((f) => colOf(f.id)), ...shown].filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i);
    return [
      ['Ticker', 'Name', ...cols.map((c) => { const f = FIELD[c.field]; const p = c.period ? `, ${PERIOD_LABEL[c.period]}` : ''; const u = unitOf(f, s.universe); return u ? `${f.label}${p} (${u})` : `${f.label}${p}`; }), 'Missing values'],
      ...out.rows.map((r) => [r.c.ticker, r.c.name, ...cols.map((c) => (FIELD[c.field].kind === 'text' ? String(r.c.values[c.key] ?? '') : r.c.values[c.key] === NM ? NM : Number.isFinite(numberOf(r.c.values[c.key])) ? String(numberOf(r.c.values[c.key])) : '')), r.unknown.map((f) => FIELD[f].label).join('; ')]),
    ];
  };

  return (
    <div>
      <FnHeader
        code="SCREEN"
        title="Equity Screening"
        sub={
          <>
            {/* No count until the universe has stocks: "0 of" before a list loads would read as a result. */}
            {cands.length ? `${out.rows.length.toLocaleString('en-US')} of ` : ''}
            {universeText} ·{' '}
            {s.universe === 'us' || desktopData() ? <span className="badge live">REAL</span> : <><SimBadge /> ratios; real data needs the desktop app</>}
          </>
        }
        actions={exportActions(panel, `${(name.trim() || 'EQS').replace(/\W+/g, '_')}_results.csv`, csv)}
      />
      <div className="chart-tools" style={{ gap: '6px 14px' }}>
        <label className="fld" htmlFor={`eqs-universe-${panel}`}>
          Universe
          <select id={`eqs-universe-${panel}`} className="sel-inp" value={s.universe} onChange={(e) => switchUniverse(e.target.value as Universe)}>
            <option value="app">The app&apos;s stocks</option>
            <option value="us" disabled={!usAvailable}>
              US-listed stocks (Nasdaq&apos;s list){usAvailable ? '' : ': desktop app'}
            </option>
            <option value="ftse" disabled={!ftseAvailable}>
              FTSE 100 (Wikipedia&apos;s member list){ftseAvailable ? '' : ': desktop app'}
            </option>
          </select>
        </label>
        <label className="fld" htmlFor={`eqs-missing-${panel}`} title="A stock whose result turns on a value the source does not give">
          A stock missing a value
          <select id={`eqs-missing-${panel}`} className="sel-inp" value={s.missing} onChange={(e) => setS({ ...s, missing: e.target.value as ScreenDef['missing'] })}>
            <option value="leave-out">is left out</option>
            <option value="keep">is kept, marked ?</option>
          </select>
        </label>
        <label className="fld" htmlFor={`eqs-exclude-${panel}`} title="Leave out stocks whose sector or industry contains any of these words, separated by commas">
          Exclude industries
          <input id={`eqs-exclude-${panel}`} className="inp" style={{ width: 190 }} placeholder="tobacco, casinos, defense" value={s.exclude} onChange={(e) => setS({ ...s, exclude: e.target.value })} />
        </label>
        <button type="button" className="btn" onClick={() => { setS({ ...BLANK_SCREEN, universe: s.universe }); setName(''); }}>
          Reset
        </button>
      </div>
      <div className="eqs-groups">
        {cands.length > 0 && (
          <div className="eqs-crit" title="The stocks screened, before the criteria below">
            <span className="white">Security universe</span>
            <span className="eqs-left muted" data-testid="eqs-universe-count">
              {fmtInt(cands.length)}
            </span>
          </div>
        )}
        {s.groups.map((g, gi) => (
          <fieldset key={gi} className="eqs-group" aria-label={`Group ${gi + 1}`}>
            <legend>{gi === 0 ? 'All of' : 'Or all of'}</legend>
            {g.map((c, ci) => {
              const f = FIELD[c.field];
              const at = `${gi + 1}.${ci + 1}`;
              const listId = `eqs-dl-${c.field}-${panel}`;
              return (
                <div key={ci} className={`eqs-crit${complete(c) ? '' : ' incomplete'}`} title={complete(c) ? f.from[s.universe] : 'Not applied until it has a value'}>
                  <select className="sel-inp" aria-label={`Field ${at}`} value={c.field} onChange={(e) => pickField(gi, ci, e.target.value as FieldId)}>
                    {CATEGORIES.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {fields.filter((x) => x.category === cat).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                            {unitOf(x, s.universe) && unitOf(x, s.universe) !== 'shares' ? ` (${unitOf(x, s.universe)})` : ''}
                            {s.universe === 'us' && x.from.us?.startsWith("the app's own") ? ": the app's stocks only" : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {f.periods && (
                    <select className="sel-inp" aria-label={`Period ${at}`} title="The period the figure covers" value={periodOf(c)} onChange={(e) => setCriterion(gi, ci, { period: e.target.value as PeriodId })}>
                      {f.periods.map((p) => (
                        <option key={p} value={p}>
                          {PERIOD_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  )}
                  <select className="sel-inp" aria-label={`Comparison ${at}`} value={c.op} onChange={(e) => setCriterion(gi, ci, { op: e.target.value as Criterion['op'] })}>
                    {OPS[f.kind].map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inp"
                    style={{ width: f.kind === 'text' ? 180 : isRank(c) ? 50 : 80 }}
                    aria-label={`Value ${at}`}
                    placeholder={isRank(c) ? 'N' : undefined}
                    title={isRank(c) ? `How many stocks to keep: the ${c.op === 'top' ? 'highest' : 'lowest'} by ${fieldText(c)} of those the criteria above left` : undefined}
                    inputMode={f.kind === 'num' ? (isRank(c) ? 'numeric' : 'decimal') : undefined}
                    list={f.kind === 'text' ? listId : undefined}
                    value={c.value}
                    onChange={(e) => setCriterion(gi, ci, { value: e.target.value })}
                  />
                  {f.kind === 'text' && (
                    <datalist id={listId}>
                      {(suggestions.get(c.field) ?? []).map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  )}
                  {c.op === 'between' && (
                    <>
                      and
                      <input className="inp" style={{ width: 80 }} aria-label={`Upper value ${at}`} inputMode="decimal" value={c.to ?? ''} onChange={(e) => setCriterion(gi, ci, { to: e.target.value })} />
                    </>
                  )}
                  {unitOf(f, s.universe) && unitOf(f, s.universe) !== 'shares' && !isRank(c) && <span className="muted">{unitOf(f, s.universe)}</span>}
                  <button type="button" className="link-btn" aria-label={`Move criterion ${at} up`} title="Move up: criteria apply in order" disabled={ci === 0} onClick={() => moveCriterion(gi, ci, -1)}>
                    ▲
                  </button>
                  <button type="button" className="link-btn" aria-label={`Move criterion ${at} down`} title="Move down: criteria apply in order" disabled={ci === g.length - 1} onClick={() => moveCriterion(gi, ci, 1)}>
                    ▼
                  </button>
                  <button type="button" className="link-btn" aria-label={`Remove criterion ${at}`} onClick={() => removeCriterion(gi, ci)}>
                    ✕
                  </button>
                  {left[gi]?.[ci] != null && cands.length > 0 && (
                    <span className="eqs-left muted" data-testid={`eqs-left-${at}`} title={`Stocks left after this criterion${ci > 0 ? ' and the ones above it' : ''}${s.groups.length > 1 ? ' in this group' : ''}`}>
                      {fmtInt(left[gi][ci]!)} left
                    </span>
                  )}
                </div>
              );
            })}
            <button type="button" className="link-btn" onClick={() => addCriterion(gi)}>
              + And
            </button>
          </fieldset>
        ))}
        <div>
          <button type="button" className="btn" onClick={() => setGroups([...s.groups, [{ field: 'cap', op: 'gte', value: '' }]])}>
            + Or group
          </button>
        </div>
      </div>
      <div className="chart-tools">
        <span className="amber">Preset screens</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="chip-btn" disabled={p.universe === 'ftse' && !ftseAvailable} title={p.universe === 'ftse' ? (ftseAvailable ? 'Switches to the FTSE 100 universe' : 'The FTSE 100 universe needs the desktop app') : undefined} onClick={() => applyPreset(p)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="chart-tools">
        <label className="fld" htmlFor={`eqs-saved-${panel}`}>
          Saved screens
          <select id={`eqs-saved-${panel}`} className="sel-inp" value={isSaved ? name.trim() : ''} onChange={(e) => load(e.target.value)}>
            <option value="">{saved.length ? 'Choose…' : 'None yet'}</option>
            {saved.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <input className="inp" style={{ width: 160 }} aria-label="Screen name" placeholder="Name this screen" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button type="button" className="btn" disabled={!name.trim()} onClick={save}>
          Save
        </button>
        {isSaved && (
          <button type="button" className="btn" onClick={remove}>
            Delete
          </button>
        )}
      </div>
      <div className="note pad-s" data-testid="eqs-logic">
        Screen: {describeScreen(s)}.
        {out.excluded > 0 && ` ${out.excluded.toLocaleString('en-US')} left out for an excluded industry.`}
        {out.undecided > 0 &&
          (s.missing === 'leave-out'
            ? ` ${out.undecided.toLocaleString('en-US')} left out because a value the screen needs is missing (${missingText}).`
            : ` ${out.undecided.toLocaleString('en-US')} kept although a value the screen needs is missing (${missingText}), marked ?.`)}
        {unrankedText && ` ${unrankedText}.`}
      </div>
      {s.universe === 'ftse' && (
        <nav className="tabs" aria-label="Screen results">
          {(['overview', 'results'] as const).map((v) => (
            <button key={v} type="button" className={`tab${view === v ? ' on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'overview' ? 'Overview' : 'Results'}
            </button>
          ))}
        </nav>
      )}
      {paperView ? (
        <ScreenResults rows={out.rows} empty={!ftse.list?.members?.length ? universeText : 'No stock matches. Loosen a criterion.'} onOpen={(c, e) => openTicker(panel, c, e)} />
      ) : (
        <DataTable
          rows={out.rows}
          rowKey={(r) => r.c.ticker}
          numbered
          onRowClick={(r, e) => openTicker(panel, r.c, e)}
          defaultSort={{ key: 'cap', dir: -1 }}
          empty={(s.universe === 'us' && !list?.data) || (s.universe === 'ftse' && !ftse.list?.members?.length) ? universeText : 'No stock matches. Loosen a criterion.'}
          page={{ index: 0, size: PAGE }}
          columns={columns}
        />
      )}
      {!paperView && out.rows.length > PAGE && <div className="note pad-s">The table shows the first {PAGE} in its order; the export has all {out.rows.length.toLocaleString('en-US')}.</div>}
      {paperView && (
        <div className="note pad-s" data-testid="eqs-results-note">
          LF: the latest fiscal year in Yahoo Finance&apos;s annual statements (the app uses the latest annual figures, not interim ones). GM: gross profit over revenue. ROE: net income to common shareholders over the average of the year&apos;s opening and closing common equity. Market Cap: billions of pounds. Price:D-1: the previous session&apos;s close, pence unless marked. P/E: the last price over the year&apos;s diluted EPS. Total Return YTD: % since last year&apos;s final close, dividends reinvested.
          {latestDay ? ` Prices to ${fmtIso(latestDay)}.` : ''} Investable Universe: the plain mean of the rows below.
        </div>
      )}
      <div className="note pad-s">
        Where the figures come from:{' '}
        {fields
          .filter((f) => shown.some((c) => c.field === f.id) || used.includes(f.id) || f.id === 'sector')
          .map((f) => `${f.label}: ${f.from[s.universe]}`)
          .join('. ')}
        .{s.universe === 'us' ? " Nasdaq's list has no P/E, yield, ROE, beta or returns; for those the screen has values only for the stocks the app holds." : ''}
        {s.universe === 'ftse' ? ` Members: ${FTSE_SOURCE} (CC BY-SA). The statement figures are the latest fiscal year's in Yahoo Finance's annual statements, not interim ones.` : ''}
      </div>
    </div>
  );
}
