import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { sourceLabel } from '../components/Source';
import { fmtBig, fmtInt } from '../core/format';
import { reportCcy } from '../data/fundamentals';
import type { SecurityDef } from '../data/types';
import { useFundamentals } from '../data/live/yfund';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { loadProxyPay, type PayYear, type ProxyPay } from '../data/live/proxypay';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * Yahoo gives officers' pay without a currency. For a company that reports and trades in dollars it is
 * plain; otherwise none is named rather than guessed (as for FMP's estimates on ANALYSTS).
 */
export function payCurrency(s: SecurityDef): string | undefined {
  return reportCcy(s) === 'USD' && s.ccy === 'USD' ? 'USD' : undefined;
}

const money = (v: number) => (Number.isFinite(v) ? fmtBig(v) : '--');

/** The pay-versus-performance table of the latest proxy statement: the chief executive's and the others' pay by year. */
function ProxyPayTable({ pay }: { pay: ProxyPay }) {
  const rows: { y: PayYear; name: string; total: number; paid: number; first: boolean }[] = [];
  for (const y of pay.years) {
    if (y.peos.length > 1) y.peos.forEach((p, i) => rows.push({ y, name: p.name, total: p.total, paid: p.paid, first: i === 0 }));
    else rows.push({ y, name: y.peos[0]?.name ?? '', total: y.peoTotal, paid: y.peoPaid, first: true });
  }
  return (
    <table className="tbl zebra">
      <thead>
        <tr>
          <th>Fiscal year to</th>
          <th>Chief executive</th>
          <th className="num" title="Summary Compensation Table total: salary, bonus, stock and option awards at grant-date value, incentive pay, pension changes and other compensation">Total compensation</th>
          <th className="num" title="Compensation actually paid (SEC definition): the total with equity awards valued at year end instead of at grant">Actually paid</th>
          <th className="num hide-m" title="The other named executive officers, on average">Other executives, avg total</th>
          <th className="num hide-m">Other executives, avg paid</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.y.end}:${i}`}>
            <td className="amber">{r.first ? r.y.end : ''}</td>
            <td>{r.name || '--'}</td>
            <td className="num white">{money(r.total)}</td>
            <td className="num">{money(r.paid)}</td>
            <td className="num hide-m">{r.first ? money(r.y.neoAvgTotal) : ''}</td>
            <td className="num hide-m">{r.first ? money(r.y.neoAvgPaid) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Management: the company's officers as Yahoo Finance's company profile lists them (desktop app), with title, age,
 * year of birth and Yahoo's "Pay" (salary and bonus; no stock awards), and, for a US-listed company, the executives'
 * total compensation from its latest proxy statement. Nothing is generated in the browser.
 */
export function MGMT({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { real, status } = useFundamentals(s);
  const officers = real?.officers ?? [];
  const cur = payCurrency(s);
  const payLabel = `Salary & bonus${cur ? ` (${cur})` : ''}`;
  const proxy = useSecLoad(secAvailable() && secTicker(s) ? `proxypay:${s.id}` : null, () => loadProxyPay(s));
  const csv = () => [['Name', 'Title', 'Age', 'Year born', 'Salary and bonus (Yahoo "Pay", no stock awards)', 'Options exercised', 'Pay currency', 'Fiscal year'], ...officers.map((o) => [o.name, o.title, num(o.age), num(o.yearBorn), num(o.totalPay), num(o.exercised), cur ?? 'not stated by the source', num(o.fiscalYear)])];
  let body;
  if (status === 'sim') {
    body = (
      <div className="empty">
        Company officers are not part of the demo data: the desktop app lists them from Yahoo Finance&apos;s company profile.{s.eq?.ceo ? ` Chief executive in the built-in profile: ${s.eq.ceo}.` : ''}
      </div>
    );
  } else if (!real) {
    body = <div className="empty">{status === 'error' ? 'No company profile from Yahoo Finance for this company.' : 'Loading the company profile from Yahoo Finance…'}</div>;
  } else if (!officers.length) {
    body = <div className="empty">{real.statsFrom === 'Finnhub' ? "Yahoo refused its company summary this time, and Finnhub's profile lists no officers." : `Yahoo Finance lists no officers for ${s.name}.`}</div>;
  } else {
    body = (
      <>
        <Section title="Company officers" right={`${officers.length} listed by the source, in its order`}>
          <DataTable
            rows={officers}
            rowKey={(o, i) => `${o.name}:${i}`}
            numbered
            columns={[
              { key: 'n', label: 'Name', render: (o) => <span className="white">{o.name}</span>, sort: (o) => o.name },
              { key: 't', label: 'Title', render: (o) => o.title || '--', sort: (o) => o.title },
              { key: 'a', label: 'Age', num: true, render: (o) => fmtInt(o.age), sort: (o) => o.age },
              { key: 'b', label: 'Born', num: true, render: (o) => (Number.isFinite(o.yearBorn) ? String(o.yearBorn) : '--'), sort: (o) => o.yearBorn, hideM: true },
              { key: 'p', label: payLabel, num: true, render: (o) => fmtInt(o.totalPay), sort: (o) => o.totalPay },
              { key: 'x', label: 'Options exercised', num: true, render: (o) => fmtInt(o.exercised), sort: (o) => o.exercised, hideM: true },
              { key: 'y', label: 'Fiscal year', num: true, render: (o) => (Number.isFinite(o.fiscalYear) ? String(o.fiscalYear) : '--'), sort: (o) => o.fiscalYear, hideM: true },
            ]}
          />
        </Section>
        <div className="note">
          Names, titles, ages and pay as Yahoo Finance&apos;s company profile gives them; -- where it gives none. Salary &amp; bonus is Yahoo&apos;s &quot;Pay&quot;: salary, bonus, cash incentives and other cash for the fiscal year shown,
          without stock and option awards, which are usually most of an executive&apos;s pay; the total from the proxy statement is below. Options exercised: the value of options exercised in the year
          {cur ? '. In US dollars: Yahoo does not name the currency, and the company reports and trades in dollars.' : '. Yahoo does not name the currency.'}
        </div>
      </>
    );
  }
  return (
    <div>
      <FnHeader
        code="MANAGEMENT"
        title="Management"
        sec={s}
        sub={<>Company officers · {sourceLabel(status, 'officers come from Yahoo Finance in the desktop app; none are generated')}</>}
        actions={officers.length ? exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_MGMT.csv`, csv) : undefined}
      />
      <QuoteStrip sec={s} />
      {body}
      {secAvailable() && secTicker(s) ? (
        <Section
          title="Total compensation, from the proxy statement"
          right={proxy.result?.ok && proxy.result.data ? <a href={proxy.result.data.link} target="_blank" rel="noreferrer noopener" className="blue">{proxy.result.data.filing.form} filed {proxy.result.data.filing.filed} ›</a> : 'SEC EDGAR'}
        >
          {proxy.loading || !proxy.result ? (
            <div className="empty">Loading the latest proxy statement from SEC EDGAR…</div>
          ) : !proxy.result.ok ? (
            <div className="empty">{proxy.result.message}</div>
          ) : !proxy.result.data ? (
            <div className="empty">
              No pay-versus-performance table in {s.name}&apos;s latest proxy statements on EDGAR. A company files one (DEF 14A) before its annual meeting; a newly listed company may not have filed one yet.
            </div>
          ) : (
            <>
              <ProxyPayTable pay={proxy.result.data} />
              <div className="note">
                As the company tagged its pay-versus-performance table, in US dollars. Total compensation is the Summary Compensation Table&apos;s total: salary, bonus, stock and option awards at their
                grant-date value, incentive pay, pension changes and other compensation. Actually paid is the SEC&apos;s measure that values equity awards at year end, so it moves with the share price.
              </div>
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
}

const num = (v: number) => (Number.isFinite(v) ? v : '');
