// Alpaca market data with the owner's key ID and secret (docs.alpaca.markets, Market Data API v2). On the
// free plan the real-time feed is IEX: one exchange's trades and quotes, not the whole US market, so every
// figure from here is labelled "IEX only". Only the market data host is ever called: the trading hosts
// (api.alpaca.markets, paper-api.alpaca.markets) and every order or account endpoint are out of reach.

const DATA = 'https://data.alpaca.markets';
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;
const TRADING_HOSTS = ['api.alpaca.markets', 'paper-api.alpaca.markets'];

/** Latest IEX trade, quote and bars for up to 20 US stocks, or null for anything else. */
function alpacaRequest(kind, symbols) {
  if (kind !== 'snapshots' || typeof symbols !== 'string') return null;
  const list = symbols.split(',').filter(Boolean);
  if (!list.length || list.length > 20 || !list.every((s) => SYMBOL.test(s))) return null;
  const url = `${DATA}/v2/stocks/snapshots?symbols=${list.map(encodeURIComponent).join(',')}&feed=iex`;
  // Belt and braces: whatever is built here must be the data host.
  if (new URL(url).host !== 'data.alpaca.markets' || TRADING_HOSTS.includes(new URL(url).host)) return null;
  return url;
}

const alpacaHeaders = (id, secret) => ({ 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret });

module.exports = { alpacaRequest, alpacaHeaders, TRADING_HOSTS };
