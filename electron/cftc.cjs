// The CFTC's Commitments of Traders for COT, from its public reporting platform (Socrata, no key): the Legacy,
// Disaggregated and Traders in Financial Futures reports, each futures only or futures and options combined. The URLs
// are built here from the six dataset IDs and a fixed list of contract codes; nothing else can be asked for.

const BASE = 'https://publicreporting.cftc.gov/resource';
const DAY_MS = 86_400_000;

/** Dataset IDs, checked against each dataset's own name on 28 October 2026. */
const DATASETS = {
  legacy: { futures: '6dca-aqww', combined: 'jun7-fc8e' },
  disaggregated: { futures: '72hh-3qpy', combined: 'kh3c-gbw2' },
  tff: { futures: 'gpe5-46if', combined: 'yw9f-hn96' },
};

/** The trader groups' position columns, as each report names them (long, short). */
const GROUPS = {
  legacy: [
    ['noncomm', 'noncomm_positions_long_all', 'noncomm_positions_short_all'],
    ['comm', 'comm_positions_long_all', 'comm_positions_short_all'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
  disaggregated: [
    ['prod', 'prod_merc_positions_long', 'prod_merc_positions_short'],
    ['swap', 'swap_positions_long_all', 'swap__positions_short_all'],
    ['mmoney', 'm_money_positions_long_all', 'm_money_positions_short_all'],
    ['other', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
  tff: [
    ['dealer', 'dealer_positions_long_all', 'dealer_positions_short_all'],
    ['assetmgr', 'asset_mgr_positions_long', 'asset_mgr_positions_short'],
    ['levmoney', 'lev_money_positions_long', 'lev_money_positions_short'],
    ['other', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
};

/** CFTC contract codes of the markets COT shows: commodities (Disaggregated) and financial futures (TFF). */
const COMMODITY_CODES = ['067651', '023651', '022651', '111659', '088691', '084691', '076651', '075651', '085692', '001602', '002602', '005602', '083731', '080732', '073732', '033661', '057642', '054642'];
const FINANCIAL_CODES = ['13874A', '209742', '239742', '042601', '044601', '043602', '043607', '020601', '020604', '134741', '045601', '099741', '097741', '096742', '232741', '090741', '092741', '095741', '112741', '102741', '1170E1', '133741'];

const codesOf = (report) => (report === 'disaggregated' ? COMMODITY_CODES : report === 'tff' ? FINANCIAL_CODES : [...COMMODITY_CODES, ...FINANCIAL_CODES]);

function isoDay(t) {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The request for one report: 'latest' gives every market's reports of the last 120 days (the newest and the one before
 * it are shown; the CFTC published up to 50 days late after the federal shutdown of October 2025), 'history' one
 * market's two years. Null for anything else.
 */
function cftcRequest(kind, report, mode, code, now = Date.now()) {
  const ds = DATASETS[report]?.[mode];
  if (!ds || (kind !== 'latest' && kind !== 'history')) return null;
  const codes = kind === 'latest' ? codesOf(report) : codesOf(report).includes(code) ? [code] : null;
  if (!codes) return null;
  const since = isoDay(now - (kind === 'latest' ? 120 : 2 * 366) * DAY_MS);
  const fields = ['report_date_as_yyyy_mm_dd', 'cftc_contract_market_code', 'market_and_exchange_names', 'open_interest_all', ...GROUPS[report].flatMap((g) => [g[1], g[2]]), ':created_at', ':updated_at'];
  const where = `cftc_contract_market_code in(${codes.map((c) => `'${c}'`).join(',')}) AND report_date_as_yyyy_mm_dd >= '${since}T00:00:00.000'`;
  const params = new URLSearchParams({ $select: fields.join(','), $where: where, $order: 'report_date_as_yyyy_mm_dd DESC', $limit: '2000' });
  return { url: `${BASE}/${ds}.json?${params.toString()}`, ttl: 60 * 60_000 };
}

module.exports = { cftcRequest, DATASETS, GROUPS, COMMODITY_CODES, FINANCIAL_CODES };
