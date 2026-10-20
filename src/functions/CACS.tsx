import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { fmtDay } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { ACTION_GROUPS, corporateActions, type ActionGroup } from '../data/corpactions';
import { dividends, splits } from '../data/fundamentals';
import { engine } from '../data/market';
import { loadFiler, resolveFiler, secAvailable, secTicker, useSecLoad, type SecFiler } from '../data/live/sec';
import { useFundamentals } from '../data/live/yfund';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** CACS: a company's corporate actions, by announcement or effective date. */
export function CACS({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  useFundamentals(s);
  const today = engine.today * DAY_MS;
  const [basis, setBasis] = useState<'announced' | 'effective'>('effective');
  const [from, setFrom] = useState(isoOf(today - 2 * 365 * DAY_MS));
  const [to, setTo] = useState(isoOf(today + 365 * DAY_MS));
  const [groups, setGroups] = useState<ActionGroup[]>(ACTION_GROUPS);
  const ticker = secTicker(s);
  const filer = useSecLoad<SecFiler>(secAvailable() && ticker ? `filer:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadFiler(c.data.cik, force);
  });
  const filings = filer.result?.ok ? filer.result.data.filings : [];
  const cik = filer.result?.ok ? filer.result.data.cik : undefined;
  const ccy = s.ccy === 'GBp' ? 'GBp' : s.ccy;
  const all = corporateActions({ ccy, dividends: dividends(s), splits: splits(s), filings, cik });
  const lo = Date.parse(`${from}T00:00:00Z`);
  const hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS - 1;
  const dateOf = (a: (typeof all)[number]) => (basis === 'announced' ? a.announced : a.effective);
  const rows = all
    .filter((a) => groups.includes(a.group) && Number.isFinite(dateOf(a)) && dateOf(a) >= lo && dateOf(a) <= hi)
    .sort((a, b) => dateOf(b) - dateOf(a));
  const numbered = useNumberedRows('cacs-rows', rows, 1, (a) => (a.link ? window.open(a.link, '_blank', 'noopener') : undefined), (a) => `${a.type} ${fmtDay(dateOf(a))}`);
  const toggle = (g: ActionGroup) => setGroups((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]));
  const csv = () => [[basis === 'announced' ? 'Announced Date' : 'Effective Date', 'Action Type', 'Ticker', 'Summary', 'Filing'], ...rows.map((a) => [isoOf(dateOf(a)), a.type, s.ticker, a.summary, a.link ?? ''])];
  return (
    <div>
      <FnHeader
        code="CORPACTIONS"
        title="Corporate Actions"
        sec={s}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_CACS.csv`, csv)}
        controls={
          <>
            <div className="chart-tools">
              <label className="fld">
                Actions for
                <select className="sel-inp" aria-label="Actions for" value="company" disabled>
                  <option value="company">Company</option>
                </select>
              </label>
              <label className="chk">
                <input type="radio" name={`cacs-basis-${panel}`} checked={basis === 'announced'} onChange={() => setBasis('announced')} /> Announced
              </label>
              <label className="chk">
                <input type="radio" name={`cacs-basis-${panel}`} checked={basis === 'effective'} onChange={() => setBasis('effective')} /> Effective
              </label>
              <input className="inp" type="date" aria-label="From" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              <span>-</span>
              <input className="inp" type="date" aria-label="To" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </div>
            <div className="chart-tools">
              <span className="amber">Filter Actions</span>
              {ACTION_GROUPS.map((g) => (
                <label key={g} className="chk">
                  <input type="checkbox" checked={groups.includes(g)} onChange={() => toggle(g)} /> {g}
                </label>
              ))}
              <span className="muted cacs-count">{rows.length} Results</span>
            </div>
          </>
        }
      />
      {rows.length === 0 ? (
        <div className="empty">{filer.loading ? 'Reading the company’s SEC filings…' : 'No corporate actions in this range.'}</div>
      ) : (
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>{basis === 'announced' ? 'Announced' : 'Effective'} Date</th>
              <th>Action Type</th>
              <th className="hide-m">Ticker / ID</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={`${a.type}:${a.effective}:${a.summary}`} className={a.link ? 'click' : undefined} onClick={() => (a.link ? window.open(a.link, '_blank', 'noopener') : undefined)} title={a.link ? 'Open the filing on SEC EDGAR' : undefined}>
                <td>
                  <span className="row-no">{numbered[i]})</span> {fmtDay(dateOf(a))}
                </td>
                <td className="amber">{a.type}</td>
                <td className="hide-m">{s.ticker}</td>
                <td className={a.estimate ? 'yellow' : 'white'}>{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pad-s muted">
        Dividends and splits from the dividend record; mergers, tender offers, offerings, listing changes and shareholder meetings from the company&apos;s SEC filings
        {secAvailable() && ticker ? (filer.result && !filer.result.ok ? ` (${filer.result.message})` : '') : ' (US-listed companies, desktop app with SEC_USER_AGENT)'}. Filed events are dated by their filing.
      </p>
    </div>
  );
}
