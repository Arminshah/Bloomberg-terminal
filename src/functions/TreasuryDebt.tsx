// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { KV, Section } from '../components/cells';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtInt, fmtNum } from '../core/format';
import { CLASSES, debtProfile, parseAvgRates, parseMspd, useFiscal, type DebtClass } from '../data/live/fiscal';

/**
 * DEBTPROFILE T GOVT on real data: the U.S. Treasury's marketable debt by maturity year and class, from the Monthly
 * Statement of the Public Debt (Fiscal Data, no key). Amounts outstanding, not prices: no free public source quotes
 * individual bonds.
 */

const CLASS_NAME: Record<DebtClass, string> = { Bills: 'Bills', Notes: 'Notes', Bonds: 'Bonds', TIPS: 'TIPS (with inflation adjustment)', FRN: 'Floating rate notes' };
/** The Treasury's names for its average interest rates by class. */
const RATE_NAME: Record<DebtClass, string> = {
  Bills: 'Treasury Bills',
  Notes: 'Treasury Notes',
  Bonds: 'Treasury Bonds',
  TIPS: 'Treasury Inflation-Protected Securities (TIPS)',
  FRN: 'Treasury Floating Rate Notes (FRN)',
};
const bn = (millions: number) => fmtNum(millions / 1000, 1);
const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));

export function TreasuryDebt() {
  const { mspd, rates } = useFiscal();
  const header = <FnHeader code="DEBTPROFILE" title="Debt Distribution" sub={<><RealBadge /> U.S. Treasury: marketable debt outstanding, Monthly Statement of the Public Debt</>} />;
  if (!mspd || mspd.state === 'loading') return <div>{header}<div className="empty">Loading the Treasury&apos;s statement of the public debt…</div></div>;
  if (mspd.state !== 'ok' || !mspd.text) return <div>{header}<div className="empty amber">{mspd.message ?? 'No statement from Fiscal Data.'}</div></div>;
  const debt = parseMspd(mspd.text);
  if ('error' in debt) return <div>{header}<div className="empty amber">{debt.error}</div></div>;
  const p = debtProfile(debt);
  const avg = rates?.state === 'ok' && rates.text ? parseAvgRates(rates.text, debt.recordDate) : null;
  const avgRates = avg && !('error' in avg) && avg.recordDate === debt.recordDate ? avg.rates : null;
  const rest = debt.statedTotal - CLASSES.reduce((s, c) => s + (debt.statedByClass[c] ?? 0), 0);
  const maxYear = Math.max(1, ...p.years.map((y) => y.amount));
  return (
    <div>
      {header}
      <KV
        items={[
          ['Statement of', day(debt.recordDate)],
          ['Marketable debt (statement)', `${bn(debt.statedTotal)}bn USD`],
          ['Securities outstanding', fmtInt(debt.securities.length)],
          ['Average years to maturity', Number.isFinite(p.averageYears) ? fmtNum(p.averageYears, 2) : '--'],
          ['Average interest rate (Treasury)', avgRates?.['Total Marketable'] != null ? `${fmtNum(avgRates['Total Marketable'], 3)}%` : rates?.state === 'error' ? 'not available' : '--'],
        ]}
      />
      {p.mismatches.length ? (
        <div className="empty amber" data-testid="debt-mismatch">
          {p.mismatches.map((m) => `The ${m.cls} listed add up to ${bn(m.listed)}bn; the statement's total is ${bn(m.stated)}bn.`).join(' ')} The figures are shown as listed.
        </div>
      ) : null}
      <Section title="By class" right="billions of dollars outstanding">
        <table className="tbl" data-testid="debt-classes">
          <thead>
            <tr>
              <th>Class</th>
              <th className="num">Outstanding</th>
              <th className="num">Share</th>
              <th className="num">Securities</th>
              <th className="num">Average rate</th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((c) => (
              <tr key={c}>
                <td>{CLASS_NAME[c]}</td>
                <td className="num white">{bn(p.byClass[c].amount)}</td>
                <td className="num">{p.total > 0 ? `${fmtNum((p.byClass[c].amount / p.total) * 100, 1)}%` : ''}</td>
                <td className="num">{fmtInt(p.byClass[c].count)}</td>
                <td className="num">{avgRates?.[RATE_NAME[c]] != null ? `${fmtNum(avgRates[RATE_NAME[c]], 3)}%` : '--'}</td>
              </tr>
            ))}
            <tr>
              <td className="b">Unmatured marketable securities</td>
              <td className="num white b">{bn(p.total)}</td>
              <td className="num">100%</td>
              <td className="num">{fmtInt(debt.securities.length)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Section>
      <Section title="By year of maturity" right="billions of dollars">
        <div className="ddis-bars" role="img" aria-label="Amount outstanding by maturity year">
          {p.years.map((y) => (
            <div key={y.year} className="ddis-col" title={`${y.year}: ${bn(y.amount)}bn in ${y.count} securities`}>
              <span className="ddis-amt">{fmtNum(y.amount / 1000, 0)}</span>
              <span className="ddis-bar" style={{ height: `${(y.amount / maxYear) * 100}%` }} />
              <span className="ddis-yr">{String(y.year).slice(2)}</span>
            </div>
          ))}
        </div>
        <table className="tbl" data-testid="debt-years">
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Maturing</th>
              <th className="num">Share</th>
              <th className="num">Securities</th>
              {CLASSES.map((c) => (
                <th key={c} className="num hide-m">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.years.map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td className="num white">{bn(y.amount)}</td>
                <td className="num">{fmtNum((y.amount / p.total) * 100, 1)}%</td>
                <td className="num">{y.count}</td>
                {CLASSES.map((c) => (
                  <td key={c} className="num hide-m">
                    {y.byClass[c] ? bn(y.byClass[c]!) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="note">
        Amounts outstanding at the end of {day(debt.recordDate)} as the Treasury&apos;s Monthly Statement of the Public Debt lists them (table 3, marketable securities), each CUSIP once with all its issues; TIPS include their inflation adjustment.{p.mismatches.length ? '' : " They add up to the statement's own total for each class."} The statement&apos;s marketable total also counts {bn(rest)}bn of matured securities not yet redeemed and Federal Financing Bank securities. Average rates are the Treasury&apos;s own for the same month; the average years to maturity is worked out here, weighted by amount outstanding from the statement&apos;s date. The statement comes out on the fourth business day of the next month. These are amounts, not prices or yields: individual Treasury prices come from dealers with no free public feed (CURVE and BONDS give the yields). Source: U.S. Treasury, Fiscal Data.
      </div>
    </div>
  );
}
