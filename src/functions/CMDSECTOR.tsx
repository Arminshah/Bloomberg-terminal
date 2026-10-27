import { FnHeader } from '../components/FnHeader';
import { Chg, DayChg, LivePx, SecLink, Section, openSecurity } from '../components/cells';
import { RowNo } from '../components/Numbered';
import { Sparkline } from '../components/Sparkline';
import { fmtNum, fmtStamp } from '../core/format';
import { periodChange } from '../data/analytics';
import { engine, useHistoryVersion, useTick } from '../data/market';
import { measureStats, SECTOR_MEASURES } from '../data/sector-measures';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { glcoName } from './FXMON';

/**
 * The commodity sector pages: AGS (agriculture), MINE (metals and mining), GAS (natural gas) and OIL. Each gathers
 * its sector's front-month futures from COMMODITIES, the sector's standard relative measures worked out from those
 * prices, and the screens and news that go further. The names come from the provider's 2020 Quick Start and the
 * University of Michigan's commodities guide; their layout is not documented, so this one is the app's own.
 */

interface Sector {
  code: string;
  title: string;
  /** Which front-month contracts the page shows. */
  includes: (d: SecurityDef) => boolean;
  news: string;
  note?: string;
}

const EIA = "US inventories, production and storage are the EIA's: the app needs its free key for them (NGAS), which is not set up yet.";

export const SECTORS: Record<string, Sector> = {
  AGRICULTURE: { code: 'AGRICULTURE', title: 'Agriculture', includes: (d) => ['Grains', 'Softs', 'Livestock'].includes(d.cmd!.group), news: 'NEWS AGRICULTURE' },
  METALS: { code: 'METALS', title: 'Metals & Mining', includes: (d) => ['Precious Metals', 'Base Metals'].includes(d.cmd!.group), news: 'NEWS METALS' },
  NATURALGAS: { code: 'NATURALGAS', title: 'Natural Gas', includes: (d) => d.cmd!.group === 'Energy' && d.ticker === 'NG1', news: 'NEWS NATURAL GAS', note: EIA },
  OILMARKET: { code: 'OILMARKET', title: 'Oil', includes: (d) => d.cmd!.group === 'Energy' && d.ticker !== 'NG1', news: 'NEWS OIL', note: EIA },
};

/** The sector's contracts, in the order COMMODITIES lists them. */
export const sectorContracts = (code: string): SecurityDef[] => engine.securities.filter((d) => d.cls === 'commodity' && d.cmd && SECTORS[code].includes(d));

function SectorPage({ code }: { code: string }) {
  const panel = usePanelId();
  useTick(1);
  const version = useHistoryVersion();
  const sector = SECTORS[code];
  const now = engine.now();
  const contracts = sectorContracts(code);
  const nums = useNumberedRows(`sector-${code}`, contracts, 1, (d) => openSecurity(panel, d.id, undefined, 'CHART'), (d) => glcoName(d));
  const history = (id: string) => {
    const s = engine.daily(id);
    const out: { t: number; c: number }[] = [];
    for (let i = 0; i < s.length; i++) out.push({ t: s.t[i], c: s.c[i] });
    return out;
  };
  const measures = SECTOR_MEASURES[code].map((m) => {
    const qa = engine.quote(m.a);
    const qb = engine.quote(m.b);
    return { m, s: measureStats(m, { a: qa?.last ?? NaN, b: qb?.last ?? NaN, prevA: qa?.prevClose ?? NaN, prevB: qb?.prevClose ?? NaN }, history(m.a), history(m.b)) };
  });
  void version;
  const more = [
    ...contracts.slice(0, 3).map((d) => ({ label: `${glcoName(d)} futures curve`, command: `${d.id} FUTURESCURVE` })),
    { label: 'Exchange contracts and their terms', command: 'CONTRACTS' },
    { label: `${sector.title} news`, command: sector.news },
    { label: 'Every commodity sector', command: 'COMMODITIES' },
  ];
  const moreNums = useNumberedRows(`sector-${code}-more`, more, contracts.length + 1, (r) => execute(panel, r.command), (r) => r.label);
  return (
    <div>
      <FnHeader code={code} title={sector.title} sub="Generic front-month futures, the sector's measures and the screens that go further" />
      <table className="tbl" data-testid="sector-contracts">
        <thead>
          <tr>
            <th>Contract</th>
            <th className="hide-m">Name</th>
            <th className="num">Last</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">Time</th>
            <th className="num">YTD %</th>
            <th className="num hide-m">1Y %</th>
            <th className="hide-m">Unit</th>
            <th className="hide-m">Intraday</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {contracts.map((d, i) => {
            const q = engine.quote(d.id)!;
            const intra = engine.intraday(d.id);
            return (
              <tr key={d.id} className="click" onClick={(e) => openSecurity(panel, d.id, e, 'CHART')}>
                <td>
                  <RowNo n={nums[i]} />
                  <SecLink id={d.id} fn="CHART">
                    {d.ticker}
                  </SecLink>
                </td>
                <td className="hide-m">{glcoName(d)}</td>
                <td className="num white">
                  <LivePx id={d.id} />
                </td>
                <td className="num">
                  <DayChg q={q} dec={d.dec} />
                </td>
                <td className="num">
                  <DayChg q={q} pct />
                </td>
                <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                <td className="num">
                  <Chg v={periodChange(d.id, 'YTD')} pct dec={1} />
                </td>
                <td className="num hide-m">
                  <Chg v={periodChange(d.id, '1Y')} pct dec={1} />
                </td>
                <td className="muted hide-m">{d.cmd!.unit}</td>
                <td className="hide-m">
                  <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                </td>
                <td>
                  <button
                    type="button"
                    className="act"
                    aria-label={`${glcoName(d)} futures curve`}
                    onClick={(e) => {
                      e.stopPropagation();
                      execute(panel, `${d.id} FUTURESCURVE`);
                    }}
                  >
                    Curve
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="cols">
        <Section title="Sector measures">
          <table className="tbl" data-testid="sector-measures">
            <thead>
              <tr>
                <th>Measure</th>
                <th className="num">Last</th>
                <th className="num">Day chg</th>
                <th className="num hide-m">1Y low</th>
                <th className="num hide-m">1Y high</th>
                <th className="num hide-m">1Y mean</th>
                <th className="num hide-m" title="Where the latest value stands in the year's range: 0% at the low, 100% at the high">In range</th>
              </tr>
            </thead>
            <tbody>
              {measures.map(({ m, s }) => (
                <tr key={m.id} title={`${m.formula}${m.unit ? ` (${m.unit})` : ''}. ${m.about} From the two front-month contracts' prices; the year's figures from the ${s.days} days both closed.`}>
                  <td>
                    {m.name} <span className="muted">{m.formula}</span>
                  </td>
                  <td className="num white">{fmtNum(s.last, m.dec)}</td>
                  <td className="num">
                    <Chg v={s.last - s.previous} dec={m.dec} />
                  </td>
                  <td className="num hide-m">{fmtNum(s.low, m.dec)}</td>
                  <td className="num hide-m">{fmtNum(s.high, m.dec)}</td>
                  <td className="num hide-m">{fmtNum(s.mean, m.dec)}</td>
                  <td className="num hide-m">{Number.isFinite(s.position) ? `${fmtNum(s.position * 100, 0)}%` : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">Worked out from the front-month contracts above: the last prices, the previous closes for the day&apos;s change, and the daily closes both contracts share over the last year. A blank means one of the two has no price or history yet.</div>
        </Section>
        <Section title="More">
          <table className="tbl">
            <tbody>
              {more.map((r, i) => (
                <tr key={r.command} className="click" onClick={() => execute(panel, r.command)}>
                  <td className="amber">
                    <RowNo n={moreNums[i]} />
                    {r.label}
                  </td>
                  <td className="yellow">{r.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sector.note && <div className="note">{sector.note}</div>}
        </Section>
      </div>
    </div>
  );
}

export const AGS = (_: FnProps) => <SectorPage code="AGRICULTURE" />;
export const MINE = (_: FnProps) => <SectorPage code="METALS" />;
export const GAS = (_: FnProps) => <SectorPage code="NATURALGAS" />;
export const OIL = (_: FnProps) => <SectorPage code="OILMARKET" />;
