import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { sourceLabel } from '../components/Source';
import { fmtInt } from '../core/format';
import { reportCcy } from '../data/fundamentals';
import type { SecurityDef } from '../data/types';
import { useFundamentals } from '../data/live/yfund';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * Yahoo gives officers' pay without a currency. For a company that reports and trades in dollars it is
 * plain; otherwise none is named rather than guessed (as for FMP's estimates on ANALYSTS).
 */
export function payCurrency(s: SecurityDef): string | undefined {
  return reportCcy(s) === 'USD' && s.ccy === 'USD' ? 'USD' : undefined;
}

/**
 * Management: the company's officers as Yahoo Finance's company profile lists them (desktop app), with title,
 * age, year of birth and total pay for the fiscal year the source gives. Nothing is generated in the browser.
 */
export function MGMT({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { real, status } = useFundamentals(s);
  const officers = real?.officers ?? [];
  const cur = payCurrency(s);
  const payLabel = `Total pay${cur ? ` (${cur})` : ''}`;
  const csv = () => [['Name', 'Title', 'Age', 'Year born', 'Total pay', 'Pay currency', 'Fiscal year'], ...officers.map((o) => [o.name, o.title, num(o.age), num(o.yearBorn), num(o.totalPay), cur ?? 'not stated by the source', num(o.fiscalYear)])];
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
              { key: 'y', label: 'Fiscal year', num: true, render: (o) => (Number.isFinite(o.fiscalYear) ? String(o.fiscalYear) : '--'), sort: (o) => o.fiscalYear, hideM: true },
            ]}
          />
        </Section>
        <div className="note">
          Names, titles, ages and total pay as Yahoo Finance&apos;s company profile gives them; -- where it gives none. Pay is the total for the fiscal year shown
          {cur ? ', in US dollars: Yahoo does not name the currency, and the company reports and trades in dollars.' : '; Yahoo does not name its currency.'}
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
    </div>
  );
}

const num = (v: number) => (Number.isFinite(v) ? v : '');
