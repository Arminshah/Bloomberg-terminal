import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { openSecurity } from '../components/cells';
import { HeatTreemap, type HeatGroup } from '../components/HeatTreemap';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { marketCapUsd, periodChange, type Horizon } from '../data/analytics';
import { shortName } from '../data/news';
import { usePanelId } from '../terminal/panel';
import type { SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';
import { BoardMap, hasBoard } from './IndexBoards';
import { membersAvailable } from '../data/live/index-members';
import { wantShares } from '../data/live/shares';

export { squarify } from '../components/HeatTreemap';

const REGIONS = [
  { n: 1, label: 'US', f: (d: SecurityDef) => d.country === 'US' },
  { n: 2, label: 'Europe', f: (d: SecurityDef) => d.region === 'EMEA' },
  { n: 3, label: 'Asia Pacific', f: (d: SecurityDef) => d.region === 'APAC' },
  { n: 4, label: 'World', f: () => true },
];
const MEASURES: { n: number; h: Horizon; scale: number; tag: string }[] = [
  { n: 11, h: '1D', scale: 3, tag: 'd' },
  { n: 12, h: '5D', scale: 6, tag: '5d' },
  { n: 13, h: '1M', scale: 10, tag: '1m' },
  { n: 14, h: 'YTD', scale: 30, tag: 'ytd' },
  { n: 15, h: '1Y', scale: 40, tag: '1y' },
];

/** The heat map tab for a security's region: US, Europe, Asia Pacific, or World for the rest. */
export function regionTab(d: SecurityDef | undefined): number {
  if (!d || d.country === 'US') return 1;
  if (d.region === 'EMEA') return 2;
  if (d.region === 'APAC') return 3;
  return 4;
}

/** A sector or industry as a group name: the lookup's "--" placeholder (no sector known) is not one. */
export function groupName(x: string | undefined, none: string): string {
  return x && x.trim() && x.trim() !== '--' ? x : none;
}

/**
 * INDEXMAP (IMAP): an index's whole membership as a sunburst, a table and a heat map, where the app can load it
 * (desktop app: the S&P 500, Nasdaq-100 and the Dow). For another index, the regional heat map of its region,
 * saying plainly that it is not the index's membership.
 */
export function IMAP(props: FnProps) {
  const { sec, route } = props;
  const ix = sec?.cls === 'index' ? sec : route.args ? engine.get(`${route.args.trim().toUpperCase()} Index`) : engine.get('SPX Index');
  if (engine.realOnly && membersAvailable() && ix && hasBoard(ix.id)) return <BoardMap ix={ix} />;
  return <RegionalHeatmap key={ix?.id ?? 'none'} code="INDEXMAP" index={ix} />;
}

/**
 * HEATMAP: the US, European and Asia-Pacific stocks the app follows (and those looked up), by sector and industry,
 * sized by market value and coloured by their change over a day, five days, a month, the year to date or a year.
 */
export function HEATMAP(_: FnProps) {
  return <RegionalHeatmap code="HEATMAP" />;
}

/** INDEXMAP's statement that the map shown is not the index's membership, and which map it is. */
export function NoMembersNote({ index, region }: { index: SecurityDef; region: number }) {
  const why = engine.realOnly && membersAvailable() ? 'the app loads the members of the S&P 500, the Nasdaq-100 and the Dow only' : 'index memberships load in the desktop app';
  return (
    <div className="note amber" role="status" data-testid="imap-no-members">
      {`${index.ticker}: the index's membership is not available here (${why}). `}
      {`This is not the index: it is the heat map of the ${['US ', 'European ', 'Asia-Pacific ', ''][region - 1] ?? ''}stocks the app follows and those you looked up.`}
    </div>
  );
}

function RegionalHeatmap({ code, index }: { code: string; index?: SecurityDef }) {
  const panel = usePanelId();
  useTick(2);
  const [region, setRegion] = useState(() => regionTab(index));
  const [measure, setMeasure] = useState(11);
  const [focus, setFocus] = useState<string | null>(null);
  const m = MEASURES.find((x) => x.n === measure)!;
  // A company is drawn once the source has given its market value; nothing is sized on a guess.
  const cap = (id: string) => {
    const c = marketCapUsd(id);
    return Number.isFinite(c) && c > 0 ? c : 0;
  };
  const inRegion = engine.securities.filter((d) => d.cls === 'equity' && d.eq && REGIONS[region - 1].f(d));
  // The region's stocks without a share count are read first, so the map fills before the others' counts arrive.
  const unsizedIds = inRegion.filter((d) => !(d.eq!.shares > 0)).map((d) => d.id).join(',');
  useEffect(() => {
    for (const id of unsizedIds.split(',')) if (id) wantShares(id);
  }, [unsizedIds]);
  const sectorOf = (d: SecurityDef) => groupName(d.eq!.sector, 'Unclassified');
  const secs = inRegion.filter((d) => cap(d.id) > 0 && (!focus || sectorOf(d) === focus));
  const bySector = new Map<string, Map<string, SecurityDef[]>>();
  for (const d of secs) {
    const sector = sectorOf(d);
    const named = groupName(d.eq!.industry, 'Other');
    const industry = named !== sector ? named : 'Other';
    if (!bySector.has(sector)) bySector.set(sector, new Map());
    const ind = bySector.get(sector)!;
    ind.set(industry, [...(ind.get(industry) ?? []), d]);
  }
  const groups: HeatGroup[] = [...bySector].map(([name, inds]) => ({
    name,
    subs: [...inds].map(([industry, list]) => ({
      name: industry,
      leaves: list.map((d) => {
        const pct = periodChange(d.id, m.h);
        const q = engine.quote(d.id);
        return {
          key: d.id,
          label: d.ticker.split(' ')[0],
          pct,
          weight: cap(d.id),
          info: [
            shortName(d),
            `${d.ticker} · ${industry}`,
            Number.isFinite(pct) ? `${m.h} ${fmtPct(pct, 2)}` : m.h === '1D' ? 'No confirmed previous close yet' : 'No history for the period',
            q ? `Last ${fmtNum(q.last, d.dec)} ${d.ccy}` : '',
            `Mkt cap ${fmtBig(cap(d.id))} USD`,
          ],
          onClick: () => openSecurity(panel, d.id, undefined, 'CHART'),
        };
      }),
    })),
  }));
  const leaves = groups.flatMap((g) => g.subs.flatMap((s) => s.leaves));
  const waiting = inRegion.length - inRegion.filter((d) => cap(d.id) > 0).length;
  let w = 0;
  let sum = 0;
  for (const l of leaves) {
    if (!Number.isFinite(l.pct)) continue;
    w += l.weight;
    sum += l.pct * l.weight;
  }
  const total = w > 0 ? sum / w : NaN;
  return (
    <div className="fn-fill">
      <FnHeader
        code={code}
        title="Market Heat Map"
        sub={`Sized by market value (USD) · coloured by ${m.h} change`}
        tabs={REGIONS.map((r) => ({ n: r.n, label: r.label }))}
        tab={region}
        onTab={(n) => {
          setRegion(n);
          setFocus(null);
        }}
        actions={MEASURES.map((x) => ({ n: x.n, label: x.h, on: x.n === measure, onClick: () => setMeasure(x.n) }))}
      />
      {index && <NoMembersNote index={index} region={region} />}
      <div className="heatmap-head">
        <span>
          {focus ?? REGIONS[region - 1].label} by sector, {m.h} change: <span className={total > 0 ? 'up' : total < 0 ? 'dn' : ''}>{fmtPct(total, 2)}</span>
        </span>
        <span>
          {focus ? (
            <button type="button" className="link" onClick={() => setFocus(null)}>
              All sectors
            </button>
          ) : null}{' '}
          {leaves.length} securities
        </span>
      </div>
      {leaves.length === 0 ? (
        <div className="empty">{inRegion.length ? 'Waiting for market values from the source…' : 'No stocks in this region.'}</div>
      ) : (
        <HeatTreemap groups={groups} scale={m.scale} period={m.tag} onGroup={focus ? undefined : (name) => setFocus(name)} />
      )}
      <p className="pad-s muted">
        The stocks the app follows and those you looked up, by sector and industry, sized by market value in US dollars and coloured by their {m.h} change
        (full colour at ±{m.scale}%). Click a sector to open it, a tile for the stock&apos;s chart.
        {waiting > 0 ? ` ${waiting} ${waiting === 1 ? 'stock has' : 'stocks have'} no market value yet and ${waiting === 1 ? 'is' : 'are'} not drawn.` : ''}
        {code === 'INDEXMAP' ? '' : ' For an index\'s whole membership (the S&P 500, the Nasdaq-100, the Dow), use INDEXMAP (IMAP).'}
      </p>
    </div>
  );
}
