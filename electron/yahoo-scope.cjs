// Unofficial, personal-use Yahoo data. Options and news remain outside this adapter.
// The independent research switch controls analyst modules and fields. Kept free
// of Electron so both settings can be verified without a running desktop.

const ALLOWED = /^\/(v1\/finance\/screener\/predefined\/saved\?scrIds=[a-z0-9_]+&count=\d{1,3}(&start=\d{1,4})?$|v1\/finance\/trending\/US\?count=\d{1,2}$|v6\/finance\/recommendationsbysymbol\/[A-Za-z0-9.^=%-]+$|v8\/finance\/chart\/[A-Za-z0-9.^=%-]+\?|v8\/finance\/spark\?|v1\/finance\/search\?|v10\/finance\/quoteSummary\/[A-Za-z0-9.^=%-]+\?|v7\/finance\/quote\?|ws\/fundamentals-timeseries\/v1\/finance\/timeseries\/[A-Za-z0-9.^=%-]+\?)/;
const ANALYST_MODULES = ['earningsTrend', 'recommendationTrend', 'upgradeDowngradeHistory', 'earningsHistory', 'indexTrend', 'industryTrend', 'sectorTrend'];
const ANALYST_FIELDS = {
  financialData: ['targetHighPrice', 'targetLowPrice', 'targetMeanPrice', 'targetMedianPrice', 'recommendationMean', 'recommendationKey', 'numberOfAnalystOpinions'],
  defaultKeyStatistics: ['forwardPE', 'forwardEps', 'pegRatio'],
  summaryDetail: ['forwardPE'],
};
const QUOTE_ANALYST_FIELDS = ['averageAnalystRating', 'forwardPE', 'epsForward', 'epsCurrentYear', 'priceEpsCurrentYear', 'epsNextQuarter'];

/** The page's request with news switched off and analyst modules dropped. */
function yahooRequest(path, research = false) {
  if (path.startsWith('/v1/finance/search?')) {
    return /[?&]newsCount=/.test(path) ? path.replace(/([?&])newsCount=\d*/, '$1newsCount=0') : `${path}&newsCount=0`;
  }
  if (path.startsWith('/v10/finance/quoteSummary/') && !research) {
    return path.replace(/([?&]modules=)([^&]*)/, (_m, key, list) => key + decodeURIComponent(list).split(',').filter((m) => !ANALYST_MODULES.includes(m)).join(','));
  }
  return path;
}

/** Removes news and analyst data from a Yahoo answer. */
function withoutRestricted(path, data, research = false) {
  if (!data || typeof data !== 'object') return data;
  if (path.startsWith('/v10/finance/quoteSummary/') && !research) {
    for (const r of data.quoteSummary?.result ?? []) {
      if (!r || typeof r !== 'object') continue;
      for (const m of ANALYST_MODULES) delete r[m];
      for (const [m, fields] of Object.entries(ANALYST_FIELDS)) for (const f of fields) if (r[m]) delete r[m][f];
      const e = r.calendarEvents?.earnings;
      if (e) for (const f of ['earningsAverage', 'earningsLow', 'earningsHigh', 'revenueAverage', 'revenueLow', 'revenueHigh']) delete e[f];
      const chart = r.earnings?.earningsChart;
      if (chart) {
        for (const f of Object.keys(chart)) if (f.startsWith('currentQuarterEstimate')) delete chart[f];
        for (const q of chart.quarterly ?? []) if (q) for (const f of ['actual', 'estimate', 'difference', 'surprisePct']) delete q[f];
      }
    }
  } else if (path.startsWith('/v7/finance/quote?') && !research) {
    for (const q of data.quoteResponse?.result ?? []) if (q) for (const f of QUOTE_ANALYST_FIELDS) delete q[f];
  } else if (path.startsWith('/v1/finance/search?')) {
    delete data.news;
    delete data.researchReports;
  }
  return data;
}

module.exports = { ALLOWED, ANALYST_MODULES, ANALYST_FIELDS, QUOTE_ANALYST_FIELDS, yahooRequest, withoutRestricted };
