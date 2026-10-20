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

/** Every US-listed stock with its market value, sector and country: the stock screener's full list, kept a day. */
function nasdaqScreenerRequest() {
  return { url: 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true', ttl: 24 * HOUR, headers: { Accept: 'application/json, text/plain, */*' } };
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

module.exports = { nasdaqCalendarRequest, nasdaqScreenerRequest, nasdaqProblem };
