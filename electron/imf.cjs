// The IMF's data, no key. The World Economic Outlook's figures and forecasts by country and region come from the
// DataMapper API (ECFC): each answer holds one indicator for every economy and group. Goods trade by partner country
// (IMTS, formerly the Direction of Trade Statistics) comes from the IMF's SDMX API (ECTR). The page names what it
// wants; the URLs are built here from fixed lists and checked codes. The IMF publishes the WEO in April and October
// and updates it in between; WEO answers are kept 12 hours, trade answers a day (monthly ones 12 hours).

const API = 'https://www.imf.org/external/datamapper/api/v1';
const SDMX = 'https://api.imf.org/external/sdmx/3.0';
const HOUR = 3_600_000;

/** The WEO indicators the app shows. */
const WEO_INDICATORS = ['NGDP_RPCH', 'PCPIPCH', 'LUR', 'BCA_NGDPD', 'GGXCNL_NGDP', 'GGXWDG_NGDP'];

/** An IMTS country or group code: USA, G001, GX170, TX799. */
const AREA = /^[A-Z][A-Z0-9]{2,5}$/;

/** The years of annual trade asked for: the last ten. */
const TRADE_YEARS = 10;
/** The months of monthly trade asked for: the last 40, so the 24 shown each have the month a year before, the IMF's
 *  latest month being a few months back. */
const TRADE_MONTHS = 40;

/**
 * The request for one kind of answer: an indicator's values, the economies' names, or the groups' names (WEO); an
 * economy's annual exports and imports with every partner, its monthly ones with one partner ("USA:CHN"), or the
 * names of the economies and groups (IMTS).
 */
function imfRequest(kind, arg, now = Date.now()) {
  if (kind === 'weo') return WEO_INDICATORS.includes(arg) ? { url: `${API}/${arg}`, ttl: 12 * HOUR } : null;
  if (kind === 'countries') return { url: `${API}/countries`, ttl: 24 * HOUR };
  if (kind === 'groups') return { url: `${API}/groups`, ttl: 24 * HOUR };
  if (kind === 'indicators') return { url: `${API}/indicators`, ttl: 12 * HOUR };
  const flows = 'XG_FOB_USD%2BMG_CIF_USD';
  if (kind === 'trade') {
    if (!AREA.test(String(arg))) return null;
    const from = new Date(now).getUTCFullYear() - TRADE_YEARS;
    return { url: `${SDMX}/data/dataflow/IMF.STA/IMTS/+/${arg}.${flows}.*.A?c%5BTIME_PERIOD%5D=ge:${from}-01`, ttl: 24 * HOUR };
  }
  if (kind === 'trade-monthly') {
    const [reporter, partner] = String(arg).split(':');
    if (!AREA.test(reporter ?? '') || !AREA.test(partner ?? '')) return null;
    const d = new Date(now);
    const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - TRADE_MONTHS, 1));
    const month = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    return { url: `${SDMX}/data/dataflow/IMF.STA/IMTS/+/${reporter}.${flows}.${partner}.M?c%5BTIME_PERIOD%5D=ge:${month}`, ttl: 12 * HOUR };
  }
  if (kind === 'trade-areas') return { url: `${SDMX}/structure/codelist/IMF.STA/CL_IMTS_COUNTRY/+`, ttl: 7 * 24 * HOUR };
  return null;
}

module.exports = { imfRequest, WEO_INDICATORS };
