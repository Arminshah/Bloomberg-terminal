// ASIC's daily aggregated short positions (no key, CC BY 4.0): an index of every published day, and one CSV a day
// with each ASX product's reported short position, the product in issue and the share short. Positions are those
// of four trading days earlier. The page asks for the index, then for days from it; nothing else is built here.

const BASE = 'https://download.asic.gov.au/short-selling';

/** The request for the index or one day's file ("20261026", version "001"), or null. */
function asicRequest(kind, date, version) {
  if (kind === 'index') return { url: `${BASE}/short-selling-data.json`, ttl: 3 * 3_600_000 };
  if (kind !== 'day' || typeof date !== 'string' || typeof version !== 'string' || !/^\d{8}$/.test(date) || !/^\d{3}$/.test(version)) return null;
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))));
  if (d.toISOString().slice(0, 10).replace(/-/g, '') !== date || d.getUTCFullYear() < 2010) return null;
  // A day's file does not change once published, save a later version, which has its own name.
  return { url: `${BASE}/RR${date}-${version}-SSDailyAggShortPos.csv`, ttl: 7 * 86_400_000 };
}

module.exports = { asicRequest };
