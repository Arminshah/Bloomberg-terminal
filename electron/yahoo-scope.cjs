// Yahoo Finance serves this app only as an unofficial, personal-use price source. Its option chains, its
// news and its analyst data (ratings, recommendations, price targets and estimates) stay off whatever the
// page asks for: the options path is not on the allowlist, search asks for no news, and analyst modules and
// fields are removed from every answer before the page sees it. Kept free of Electron so tests can load it.

const ALLOWED = /^\/(v8\/finance\/chart\/[A-Za-z0-9.^=%-]+\?|v8\/finance\/spark\?|v1\/finance\/search\?|v10\/finance\/quoteSummary\/[A-Za-z0-9.^=%-]+\?|v7\/finance\/quote\?|ws\/fundamentals-timeseries\/v1\/finance\/timeseries\/[A-Za-z0-9.^=%-]+\?)/;
const ANALYST_MODULES = ['earningsTrend', 'recommendationTrend', 'upgradeDowngradeHistory', 'earningsHistory', 'indexTrend', 'industryTrend', 'sectorTrend'];
const ANALYST_FIELDS = {
  financialData: ['targetHighPrice', 'targetLowPrice', 'targetMeanPrice', 'targetMedianPrice', 'recommendationMean', 'recommendationKey', 'numberOfAnalystOpinions'],
  defaultKeyStatistics: ['forwardPE', 'forwardEps', 'pegRatio'],
  summaryDetail: ['forwardPE'],
};
const QUOTE_ANALYST_FIELDS = ['averageAnalystRating', 'forwardPE', 'epsForward', 'epsCurrentYear', 'priceEpsCurrentYear', 'epsNextQuarter'];

/** The page's request with news switched off and analyst modules dropped. */
function yahooRequest(path) {
  if (path.startsWith('/v1/finance/search?')) {
    return /[?&]newsCount=/.test(path) ? path.replace(/([?&])newsCount=\d*/, '$1newsCount=0') : `${path}&newsCount=0`;
  }
  if (path.startsWith('/v10/finance/quoteSummary/')) {
    return path.replace(/([?&]modules=)([^&]*)/, (_m, key, list) => key + decodeURIComponent(list).split(',').filter((m) => !ANALYST_MODULES.includes(m)).join(','));
  }
  return path;
}

/** Removes news and analyst data from a Yahoo answer. */
function withoutRestricted(path, data) {
  if (!data || typeof data !== 'object') return data;
  if (path.startsWith('/v10/finance/quoteSummary/')) {
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
  } else if (path.startsWith('/v7/finance/quote?')) {
    for (const q of data.quoteResponse?.result ?? []) if (q) for (const f of QUOTE_ANALYST_FIELDS) delete q[f];
  } else if (path.startsWith('/v1/finance/search?')) {
    delete data.news;
    delete data.researchReports;
  }
  return data;
}

module.exports = { ALLOWED, ANALYST_MODULES, ANALYST_FIELDS, QUOTE_ANALYST_FIELDS, yahooRequest, withoutRestricted };
