// FRED requests for the economic data chart (ECOW): the API's series search, any series' description, and any
// series' observations with one of FRED's own transformations. The page names the words, the series and the
// transformation; the URL is built here from fixed patterns, and main.cjs adds the owner's key.

const FRED_API = 'https://api.stlouisfed.org/fred';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// FRED's series ids are capital letters, digits and underscores.
const FRED_ANY_SERIES = /^[A-Z0-9_]{1,30}$/;
// lin level, chg change, ch1 change from a year ago, pch % change, pc1 % change from a year ago, pca compounded
// annual rate.
const FRED_UNITS = new Set(['lin', 'chg', 'ch1', 'pch', 'pc1', 'pca']);

/** The FRED URL of a request for the economic data chart, or null when it is not one. */
function fredChartUrl(kind, arg, from) {
  if (kind === 'search') {
    const words = String(arg ?? '').trim();
    if (words.length < 2 || words.length > 80 || /[^A-Za-z0-9 .,&'()%/-]/.test(words)) return null;
    return `${FRED_API}/series/search?search_text=${encodeURIComponent(words)}&limit=30&order_by=popularity&sort_order=desc&file_type=json`;
  }
  if (kind === 'series') {
    const id = String(arg ?? '').toUpperCase();
    return FRED_ANY_SERIES.test(id) ? `${FRED_API}/series?series_id=${id}&file_type=json` : null;
  }
  if (kind === 'chart') {
    const [id, units] = String(arg ?? '').toUpperCase().split('|');
    if (!FRED_ANY_SERIES.test(id ?? '') || !FRED_UNITS.has(String(units ?? '').toLowerCase()) || typeof from !== 'string' || !ISO_DATE.test(from)) return null;
    return `${FRED_API}/series/observations?series_id=${id}&units=${units.toLowerCase()}&observation_start=${from}&file_type=json`;
  }
  return null;
}

module.exports = { fredChartUrl, FRED_UNITS };
