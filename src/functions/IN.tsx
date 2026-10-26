import { FnHeader } from '../components/FnHeader';
import { DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { INDICES } from '../data/universe/markets';
import { engine, useTick } from '../data/market';
import { COUNTRY_NAMES } from '../data/eco';
import { BOARD_CHOICES } from './IndexBoards';
import { execute } from '../terminal/exec';
import { useGroupedRows, useMenu, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const REGIONS: { name: string; region: string }[] = [
  { name: 'Americas', region: 'Americas' },
  { name: 'EMEA', region: 'EMEA' },
  { name: 'Asia/Pacific', region: 'APAC' },
];

/**
 * IN: the indices the app follows, as the terminal lists indices on its IN page (P02): each with what it is, its
 * country and currency, today's move, and its members where the app lists them (MEMBERS, desktop app).
 */
export function IN(_: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const [collapsed, toggle] = useCollapsed();
  const lists = REGIONS.map((g) => INDICES.filter((d) => d.region === g.region && engine.get(d.id)));
  const nums = useGroupedRows('in-rows', lists, REGIONS.map((g) => !collapsed.includes(g.name)), (d) => openSecurity(panel, d.id, undefined, 'CHART'), (d) => d.name);
  useMenu('in-regions', REGIONS.map((g, gi) => ({ n: gi + 1, label: g.name, run: () => toggle(g.name) })));
  return (
    <div>
      <FnHeader code="INDEXLIST" title="Index Directory" sub={`${lists.flat().length} indices the app follows`} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Index</th>
            <th className="hide-m">Country</th>
            <th>Ccy</th>
            <th className="num">Last</th>
            <th className="num">%Chg</th>
            <th className="hide-m">What it is</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((g, gi) => [
            <GroupRow key={g.name} n={gi + 1} name={g.name} span={7} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} />,
            ...(collapsed.includes(g.name) ? [] : lists[gi]).map((d, i) => {
              const q = engine.quote(d.id)!;
              const members = BOARD_CHOICES.includes(d.id);
              return (
                <tr key={d.id} className="click" onClick={(e) => openSecurity(panel, d.id, e, 'CHART')}>
                  <td className="amber">
                    <RowNo n={nums[gi][i]} />
                    <SecLink id={d.id} fn="CHART">
                      {d.ticker}
                    </SecLink>{' '}
                    <span className="hide-m white">{d.name}</span>
                  </td>
                  <td className="hide-m">{COUNTRY_NAMES[d.country] ?? d.country}</td>
                  <td className="muted">{d.ccy}</td>
                  <td className="num white">
                    <LivePx id={d.id} />
                  </td>
                  <td className="num">
                    <DayChg q={q} pct />
                  </td>
                  <td className="muted hide-m" style={{ whiteSpace: 'normal' }}>{d.about}</td>
                  <td>
                    {members ? (
                      <button
                        type="button"
                        className="act"
                        title={`${d.ticker}'s members with their weights (desktop app)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          execute(panel, `${d.id} MEMBERS`);
                        }}
                      >
                        Members
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <div className="note">
        An index opens its chart. Members are listed for the S&amp;P 500, the Nasdaq-100 and the Dow (MEMBERS, desktop app). Prices come from each index&apos;s source as on MARKET.
      </div>
    </div>
  );
}
