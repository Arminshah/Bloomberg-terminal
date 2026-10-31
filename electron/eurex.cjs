// Eurex's market statistics for two index futures (no key): per contract month the day's open, high, low, last,
// daily settlement, volume and open interest, with the index close, from the JSON behind eurex.com's product pages.
// Eurex's terms allow "a single copy in a single personal computer's memory for personal, non-commercial use", and
// its robots.txt asks every agent to wait 30 seconds between requests; the app keeps to one request every 30 seconds.

const PRODUCTS = { FESX: 34652, FDAX: 34642 };

/** The request for a product's statistics on a business day (YYYYMMDD) or its latest day, or null. */
function eurexRequest(product, busdate) {
  if (typeof product !== 'string' || !Object.prototype.hasOwnProperty.call(PRODUCTS, product)) return null;
  if (busdate !== undefined && busdate !== '' && (typeof busdate !== 'string' || !/^\d{8}$/.test(busdate))) return null;
  const url = `https://www.eurex.com/api/v1/overallstatistics/${PRODUCTS[product]}?${busdate ? `busdate=${busdate}&` : ''}filtertype=overview`;
  // A past day's statistics are settled; the latest change once a day, in the evening.
  return { url, ttl: busdate ? 7 * 86_400_000 : 3_600_000 };
}

/** Eurex's answer is usable when it is JSON with its rows of contract months. */
function eurexProblem(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j?.dataRows) && j?.header ? null : 'Eurex changed its statistics format.';
  } catch {
    return 'Eurex returned a page that is not JSON.';
  }
}

module.exports = { eurexRequest, eurexProblem, EUREX_PRODUCTS: Object.keys(PRODUCTS) };
