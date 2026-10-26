// The IMF's DataMapper API (no key): the World Economic Outlook's figures and forecasts by country and region, for
// the economic forecasts screen (ECFC). Each answer holds one indicator for every economy and group; the page names
// the indicator, the URL is built here from a fixed list. The IMF publishes the WEO in April and October and
// updates it in between; answers are kept 12 hours.

const API = 'https://www.imf.org/external/datamapper/api/v1';
const HOUR = 3_600_000;

/** The WEO indicators the app shows. */
const WEO_INDICATORS = ['NGDP_RPCH', 'PCPIPCH', 'LUR', 'BCA_NGDPD', 'GGXCNL_NGDP', 'GGXWDG_NGDP'];

/** The request for one kind of answer: an indicator's values, the economies' names, or the groups' names. */
function imfRequest(kind, arg) {
  if (kind === 'weo') return WEO_INDICATORS.includes(arg) ? { url: `${API}/${arg}`, ttl: 12 * HOUR } : null;
  if (kind === 'countries') return { url: `${API}/countries`, ttl: 24 * HOUR };
  if (kind === 'groups') return { url: `${API}/groups`, ttl: 24 * HOUR };
  if (kind === 'indicators') return { url: `${API}/indicators`, ttl: 12 * HOUR };
  return null;
}

module.exports = { imfRequest, WEO_INDICATORS };
