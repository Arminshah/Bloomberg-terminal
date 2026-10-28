// The U.S. Treasury's Fiscal Data API (no key) for DEBTPROFILE T: the Monthly Statement of the Public Debt's
// marketable securities outstanding (table 3), and the Treasury's average interest rates. Two fixed requests; nothing
// else can be asked for. Not prices or yields: bond prices and dealer quotes have no free public source.

const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const HOUR = 3_600_000;

/** The columns of table 3 the screen reads. */
const MSPD_FIELDS = ['record_date', 'security_class1_desc', 'security_class2_desc', 'interest_rate_pct', 'yield_pct', 'issue_date', 'maturity_date', 'outstanding_amt'];

/**
 * 'mspd': the latest statement's table 3, newest first (one month is about 900 rows; 3,000 hold it whole, and the
 * parser checks that the month's total row came with it). 'avg-rates': the latest months' average interest rates.
 */
function fiscalRequest(kind) {
  if (kind === 'mspd') {
    const q = new URLSearchParams({ fields: MSPD_FIELDS.join(','), sort: '-record_date', 'page[size]': '3000' });
    return { url: `${BASE}/v1/debt/mspd/mspd_table_3_market?${q.toString()}`, ttl: 6 * HOUR };
  }
  if (kind === 'avg-rates') {
    const q = new URLSearchParams({ sort: '-record_date', 'page[size]': '60' });
    return { url: `${BASE}/v2/accounting/od/avg_interest_rates?${q.toString()}`, ttl: 6 * HOUR };
  }
  return null;
}

module.exports = { fiscalRequest, MSPD_FIELDS };
