// Nasdaq's public earnings calendar (no key), one day at a time: every US-listed company reporting that day with
// its market value, the fiscal quarter, the time of the report, the analysts' EPS forecast and their number, and,
// once reported, the EPS and the surprise; for coming reports, the year-earlier EPS and its date. Nasdaq gives no
// revenue. The same endpoint serves nasdaq.com's earnings page.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The request for one day's calendar, or null when the date is not a real calendar date within reach. */
function nasdaqCalendarRequest(date, now = Date.now()) {
  if (typeof date !== 'string' || !ISO.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) return null;
  // Two years back (a year-earlier quarter) to four months ahead.
  if (t < now - 800 * DAY || t > now + 130 * DAY) return null;
  // A day's reports and actuals fill in around it; long-past days are settled.
  const ttl = t < now - 4 * DAY ? 7 * DAY : t > now + 3 * DAY ? 6 * HOUR : HOUR;
  return { url: `https://api.nasdaq.com/api/calendar/earnings?date=${date}`, ttl, headers: { Accept: 'application/json, text/plain, */*' } };
}

/**
 * One day's economic calendar from Nasdaq's site (no key): every country's releases with the time (GMT), the actual
 * value, the consensus and the previous value, as Nasdaq's partner publishes them.
 */
function nasdaqEconomicRequest(date, now = Date.now()) {
  if (typeof date !== 'string' || !ISO.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) return null;
  if (t < now - 120 * DAY || t > now + 60 * DAY) return null;
  // Settled days are kept a week; today and the days around it a quarter of an hour, as values arrive.
  const ttl = t < now - 3 * DAY ? 7 * DAY : t > now + 2 * DAY ? 6 * HOUR : 15 * 60_000;
  return { url: `https://api.nasdaq.com/api/calendar/economicevents?date=${date}`, ttl, headers: { Accept: 'application/json, text/plain, */*' } };
}

/**
 * One month of Nasdaq's IPO calendar (no key): offerings priced (with price, shares and amount), expected, filed and
 * withdrawn. `month` is YYYY-MM, from five years back to three months ahead; past months are kept a day.
 */
function nasdaqIpoRequest(month, now = Date.now()) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const t = Date.parse(`${month}-01T00:00:00Z`);
  if (t < now - 5 * 366 * DAY || t > now + 92 * DAY) return null;
  const current = new Date(now).toISOString().slice(0, 7);
  const ttl = month < current ? 24 * HOUR : 30 * 60_000;
  return { url: `https://api.nasdaq.com/api/ipo/calendar?date=${month}`, ttl, headers: { Accept: 'application/json, text/plain, */*' } };
}

/** Every US-listed stock with its market value, sector and country: the stock screener's full list, kept a day. */
function nasdaqScreenerRequest() {
  return { url: 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true', ttl: 24 * HOUR, headers: { Accept: 'application/json, text/plain, */*' } };
}

// One company's figures from nasdaq.com's quote and company pages (no key), for US-listed stocks: they fill what
// Yahoo leaves empty, above all when Yahoo refuses the session (EU cookies, or its rate limit). Each kind is one
// page's data; the answers are kept for hours.
const COMPANY = /^[A-Z][A-Z0-9]{0,6}(?:\.[A-Z]{1,2})?$/;
const COMPANY_KINDS = {
  // Market value, sector and industry, the one-year target, the annual dividend and its dates.
  summary: { path: (s) => `/quote/${s}/summary?assetclass=stocks`, ttl: 2 * HOUR },
  // Every cash dividend with its declaration, record and payment dates.
  dividends: { path: (s) => `/quote/${s}/dividends?assetclass=stocks`, ttl: 12 * HOUR },
  // Short interest twice a month, with the average daily volume and the days to cover.
  'short-interest': { path: (s) => `/quote/${s}/short-interest?assetClass=stocks`, ttl: 12 * HOUR },
  // Institutional ownership: the share of the company held, shares outstanding and the largest holders.
  holdings: { path: (s) => `/company/${s}/institutional-holdings?limit=15&type=TOTAL&sortColumn=marketValue&sortOrder=DESC`, ttl: 24 * HOUR },
  // The analysts' consensus price target with its range, and the count of buy, hold and sell ratings.
  target: { path: (s) => `/analyst/${s}/targetprice`, ttl: 6 * HOUR },
  // The analysts' mean rating word.
  ratings: { path: (s) => `/analyst/${s}/ratings`, ttl: 6 * HOUR },
  // The consensus EPS of the coming quarters and fiscal years, with the range and the number of estimates.
  forecast: { path: (s) => `/analyst/${s}/earnings-forecast`, ttl: 6 * HOUR },
  // The next report's date and session, as Nasdaq's page words it.
  'earnings-date': { path: (s) => `/analyst/${s}/earnings-date`, ttl: 6 * HOUR },
  // The company description, sector and industry.
  profile: { path: (s) => `/company/${s}/company-profile`, ttl: 24 * HOUR },
  // The real-time quote (Nasdaq Basic): last sale, bid and ask with their sizes, the day's volume.
  info: { path: (s) => `/quote/${s}/info?assetclass=stocks`, ttl: 20_000 },
};

/** The request for one kind of company data, or null when the kind or the ticker (Nasdaq's style: BRK.B) is not one the app asks for. */
function nasdaqCompanyRequest(kind, symbol) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(COMPANY_KINDS, kind)) return null;
  if (typeof symbol !== 'string' || !COMPANY.test(symbol)) return null;
  const k = COMPANY_KINDS[kind];
  return { url: `https://api.nasdaq.com/api${k.path(symbol)}`, ttl: k.ttl, headers: { Accept: 'application/json, text/plain, */*' } };
}

/** Nasdaq answers HTTP 200 with {status: {rCode, bCodeMessage}} when it refuses; a day without reports has no rows. */
function nasdaqProblem(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return 'Nasdaq returned a page that is not JSON.';
  }
  const code = j?.status?.rCode;
  if (code !== undefined && code !== 200) return `Nasdaq refused the request (${String(j?.status?.bCodeMessage?.[0]?.errorMessage ?? code).slice(0, 120)}).`;
  if (j?.data !== null && (typeof j?.data !== 'object' || (j.data.rows !== null && j.data.rows !== undefined && !Array.isArray(j.data.rows)))) return 'Nasdaq changed the calendar format.';
  return null;
}

// FINRA's consolidated short interest (no key), for every US-listed stock: Nasdaq's page has it for Nasdaq listings
// only. A POST to FINRA's Query API for one symbol's settlements of the last 75 days; FINRA publishes twice a month.
function finraShortRequest(symbol, now = Date.now(), days = 75, limit = 12) {
  if (typeof symbol !== 'string' || !COMPANY.test(symbol)) return null;
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const body = JSON.stringify({
    limit,
    compareFilters: [{ compareType: 'EQUAL', fieldName: 'symbolCode', fieldValue: symbol }],
    dateRangeFilters: [{ fieldName: 'settlementDate', startDate: day(now - days * DAY), endDate: day(now) }],
  });
  return { url: 'https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest', ttl: 12 * HOUR, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body };
}

module.exports = { finraShortRequest, nasdaqCalendarRequest, nasdaqEconomicRequest, nasdaqIpoRequest, nasdaqScreenerRequest, nasdaqCompanyRequest, COMPANY_KINDS, nasdaqProblem };
