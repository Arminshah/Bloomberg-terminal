// The U.S. Treasury's Fiscal Data API (no key) for DEBTPROFILE T: the Monthly Statement of the Public Debt's
// marketable securities outstanding (table 3), and the Treasury's average interest rates; and for AUCTIONS, Fiscal
// Data's auction records with TreasuryDirect's securities service for the latest results and the announced auctions
// (the same Fiscal Service, under its terms for web APIs, which allow an app to display the data). Fixed requests;
// nothing else can be asked for. Not prices or yields: bond prices and dealer quotes have no free public source.

const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const TREASURY_DIRECT = 'https://www.treasurydirect.gov/TA_WS/securities';
const HOUR = 3_600_000;

/** The columns of the auction records the auctions screen reads (results are null until an auction is held). */
const AUCTION_FIELDS = ['cusip', 'security_type', 'security_term', 'auction_date', 'issue_date', 'maturity_date', 'announcemt_date', 'offering_amt', 'int_rate',
  'spread', 'high_yield', 'high_discnt_rate', 'high_investment_rate', 'high_discnt_margin', 'high_price', 'allocation_pctage', 'bid_to_cover_ratio', 'comp_accepted',
  'primary_dealer_accepted', 'direct_bidder_accepted', 'indirect_bidder_accepted', 'total_accepted', 'inflation_index_security', 'floating_rate', 'reopening',
  'cash_management_bill_cmb', 'pdf_filenm_comp_results'];

/** The columns of table 3 the screen reads. */
const MSPD_FIELDS = ['record_date', 'security_class1_desc', 'security_class2_desc', 'interest_rate_pct', 'yield_pct', 'issue_date', 'maturity_date', 'outstanding_amt'];

/**
 * 'auctions': Fiscal Data's latest 600 auctions (about 16 months), newest first. Its results arrive a week or two
 * after the auction, so 'auctions-recent' asks TreasuryDirect for the last 30 days' results (posted minutes after each
 * auction closes) and 'auctions-upcoming' for the auctions announced and not yet held.
 * 'mspd': the latest statement's table 3, newest first (one month is about 900 rows; 3,000 hold it whole, and the
 * parser checks that the month's total row came with it). 'avg-rates': the latest months' average interest rates.
 */
function fiscalRequest(kind) {
  if (kind === 'mspd') {
    const q = new URLSearchParams({ fields: MSPD_FIELDS.join(','), sort: '-record_date', 'page[size]': '3000' });
    return { url: `${BASE}/v1/debt/mspd/mspd_table_3_market?${q.toString()}`, ttl: 6 * HOUR };
  }
  if (kind === 'auctions') {
    // The latest 600, newest first, those announced but not yet held included.
    const q = new URLSearchParams({ fields: AUCTION_FIELDS.join(','), sort: '-auction_date', 'page[size]': '600' });
    return { url: `${BASE}/v1/accounting/od/auctions_query?${q.toString()}`, ttl: HOUR };
  }
  if (kind === 'auctions-recent') return { url: `${TREASURY_DIRECT}/auctioned?format=json&days=30`, ttl: 15 * 60_000, provider: 'treasurydirect' };
  if (kind === 'auctions-upcoming') return { url: `${TREASURY_DIRECT}/upcoming?format=json`, ttl: HOUR, provider: 'treasurydirect' };
  if (kind === 'avg-rates') {
    const q = new URLSearchParams({ sort: '-record_date', 'page[size]': '60' });
    return { url: `${BASE}/v2/accounting/od/avg_interest_rates?${q.toString()}`, ttl: 6 * HOUR };
  }
  return null;
}

module.exports = { fiscalRequest, MSPD_FIELDS, AUCTION_FIELDS };
