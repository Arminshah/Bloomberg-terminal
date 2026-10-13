import type { CommodityInfo, Region, SecurityDef } from '../types';

function idx(
  t: string, name: string, country: string, region: Region, ccy: string, px: number, vol: number, yahoo: string, about: string,
): SecurityDef {
  return {
    id: `${t} Index`, ticker: t, yk: 'Index', name, cls: 'index', ccy, country, region, px, vol, dec: 2, yahoo, about,
    quote: 'price',
  };
}

export const INDICES: SecurityDef[] = [
  idx('SPX', 'S&P 500 INDEX', 'US', 'Americas', 'USD', 6700, 0.16, '^GSPC', 'Market-capitalisation-weighted index of 500 leading US companies covering roughly 80% of US equity market value.'),
  idx('INDU', 'DOW JONES INDUS. AVG', 'US', 'Americas', 'USD', 46000, 0.15, '^DJI', 'Price-weighted average of 30 blue-chip US stocks.'),
  idx('CCMP', 'NASDAQ COMPOSITE', 'US', 'Americas', 'USD', 22500, 0.21, '^IXIC', 'Market-cap-weighted index of all common stocks listed on the Nasdaq Stock Market.'),
  idx('NDX', 'NASDAQ 100 STOCK INDX', 'US', 'Americas', 'USD', 24500, 0.22, '^NDX', 'The 100 largest non-financial companies listed on Nasdaq, modified market-cap weighted.'),
  idx('RTY', 'RUSSELL 2000 INDEX', 'US', 'Americas', 'USD', 2400, 0.22, '^RUT', 'Small-cap segment of the US equity universe: the smallest 2,000 stocks in the Russell 3000.'),
  idx('VIX', 'CBOE SPX VOLATILITY INDX', 'US', 'Americas', 'USD', 16, 0.95, '^VIX', '30-day implied volatility of the S&P 500 derived from SPX option prices.'),
  idx('SPTSX', 'S&P/TSX COMPOSITE INDEX', 'CA', 'Americas', 'CAD', 29000, 0.13, '^GSPTSE', 'Benchmark index of the largest companies on the Toronto Stock Exchange.'),
  idx('MEXBOL', 'S&P/BMV IPC', 'MX', 'Americas', 'MXN', 59000, 0.16, '^MXX', 'Main benchmark index of the Mexican Stock Exchange.'),
  idx('IBOV', 'IBOVESPA BRASIL SAO PAULO', 'BR', 'Americas', 'BRL', 140000, 0.20, '^BVSP', 'Benchmark index of the most traded stocks on B3 in Sao Paulo.'),
  idx('SX5E', 'Euro Stoxx 50 Pr', 'EU', 'EMEA', 'EUR', 5500, 0.17, '^STOXX50E', 'Blue-chip index of 50 Eurozone sector leaders.'),
  idx('SXXP', 'STOXX Europe 600 Pr', 'EU', 'EMEA', 'EUR', 560, 0.15, '^STOXX', 'Broad index of 600 large, mid and small-cap companies across 17 European countries.'),
  idx('UKX', 'FTSE 100 INDEX', 'GB', 'EMEA', 'GBP', 9300, 0.13, '^FTSE', 'Index of the 100 largest companies listed on the London Stock Exchange.'),
  idx('DAX', 'DAX INDEX', 'DE', 'EMEA', 'EUR', 24000, 0.18, '^GDAXI', 'Total-return index of 40 major German companies traded on the Frankfurt Exchange.'),
  idx('CAC', 'CAC 40 INDEX', 'FR', 'EMEA', 'EUR', 7900, 0.17, '^FCHI', 'Benchmark of the 40 most significant stocks on Euronext Paris.'),
  idx('SMI', 'SWISS MARKET INDEX', 'CH', 'EMEA', 'CHF', 12300, 0.13, '^SSMI', 'Capitalisation-weighted index of the 20 largest Swiss stocks.'),
  idx('IBEX', 'IBEX 35 INDEX', 'ES', 'EMEA', 'EUR', 15000, 0.17, '^IBEX', 'Benchmark index of the 35 most liquid Spanish stocks.'),
  idx('FTSEMIB', 'FTSE MIB INDEX', 'IT', 'EMEA', 'EUR', 42000, 0.19, 'FTSEMIB.MI', 'Benchmark index of the 40 most traded stocks on Borsa Italiana.'),
  idx('AEX', 'AEX-Index', 'NL', 'EMEA', 'EUR', 920, 0.16, '^AEX', 'Index of the 25 most actively traded companies on Euronext Amsterdam.'),
  idx('NKY', 'NIKKEI 225', 'JP', 'APAC', 'JPY', 45000, 0.22, '^N225', 'Price-weighted index of 225 large companies on the Tokyo Stock Exchange Prime market.'),
  idx('HSI', 'HANG SENG INDEX', 'HK', 'APAC', 'HKD', 26000, 0.24, '^HSI', 'Free-float capitalisation-weighted index of the largest companies listed in Hong Kong.'),
  idx('SHCOMP', 'SHANGHAI SE COMPOSITE', 'CN', 'APAC', 'CNY', 3900, 0.18, '000001.SS', 'All A-shares and B-shares listed on the Shanghai Stock Exchange.'),
  idx('SHSZ300', 'CSI 300 INDEX', 'CN', 'APAC', 'CNY', 4600, 0.19, '000300.SS', '300 largest and most liquid A-share stocks listed in Shanghai and Shenzhen.'),
  idx('KOSPI', 'KOSPI INDEX', 'KR', 'APAC', 'KRW', 3500, 0.22, '^KS11', 'Index of all common stocks traded on the Korea Exchange stock market division.'),
  idx('TWSE', 'TAIWAN TAIEX INDEX', 'TW', 'APAC', 'TWD', 26000, 0.20, '^TWII', 'Capitalisation-weighted index of all listed common shares on the Taiwan Stock Exchange.'),
  idx('AS51', 'S&P/ASX 200 INDEX', 'AU', 'APAC', 'AUD', 8900, 0.13, '^AXJO', 'Benchmark index of the 200 largest ASX-listed companies.'),
  idx('SENSEX', 'BSE SENSEX 30 INDEX', 'IN', 'APAC', 'INR', 82000, 0.14, '^BSESN', '30 well-established, financially sound companies listed on BSE Ltd.'),
  idx('NIFTY', 'Nifty 50', 'IN', 'APAC', 'INR', 25000, 0.14, '^NSEI', 'Diversified 50-stock index of the National Stock Exchange of India.'),
  idx('STI', 'Straits Times Index STI', 'SG', 'APAC', 'SGD', 4300, 0.12, '^STI', 'Capitalisation-weighted index of the top 30 companies on the Singapore Exchange.'),
];

/**
 * Currencies are simulated as USD values (USD per one unit); pairs are derived.
 * `px` is units of currency per USD (market convention vs USD) for reference.
 */
export interface CurrencyDef {
  code: string;
  name: string;
  country: string;
  region: Region;
  perUsd: number;
  vol: number;
  /** Loading on the dollar factor (negative = moves with risk appetite). */
  risk: number;
  bank: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'EUR', name: 'Euro', country: 'EU', region: 'EMEA', perUsd: 0.89, vol: 0.07, risk: 0.1, bank: 'European Central Bank' },
  { code: 'JPY', name: 'Japanese Yen', country: 'JP', region: 'APAC', perUsd: 158, vol: 0.10, risk: -0.35, bank: 'Bank of Japan' },
  { code: 'GBP', name: 'British Pound', country: 'GB', region: 'EMEA', perUsd: 0.756, vol: 0.075, risk: 0.2, bank: 'Bank of England' },
  { code: 'CHF', name: 'Swiss Franc', country: 'CH', region: 'EMEA', perUsd: 0.83, vol: 0.075, risk: -0.25, bank: 'Swiss National Bank' },
  { code: 'AUD', name: 'Australian Dollar', country: 'AU', region: 'APAC', perUsd: 1.43, vol: 0.10, risk: 0.5, bank: 'Reserve Bank of Australia' },
  { code: 'CAD', name: 'Canadian Dollar', country: 'CA', region: 'Americas', perUsd: 1.42, vol: 0.06, risk: 0.35, bank: 'Bank of Canada' },
  { code: 'NZD', name: 'New Zealand Dollar', country: 'NZ', region: 'APAC', perUsd: 1.78, vol: 0.105, risk: 0.5, bank: 'Reserve Bank of New Zealand' },
  { code: 'SEK', name: 'Swedish Krona', country: 'SE', region: 'EMEA', perUsd: 9.97, vol: 0.10, risk: 0.35, bank: 'Sveriges Riksbank' },
  { code: 'NOK', name: 'Norwegian Krone', country: 'NO', region: 'EMEA', perUsd: 9.56, vol: 0.11, risk: 0.4, bank: 'Norges Bank' },
  { code: 'CNH', name: 'Chinese Renminbi (Offshore)', country: 'CN', region: 'APAC', perUsd: 6.69, vol: 0.04, risk: 0.15, bank: "People's Bank of China" },
  { code: 'CNY', name: 'Chinese Renminbi', country: 'CN', region: 'APAC', perUsd: 6.69, vol: 0.035, risk: 0.1, bank: "People's Bank of China" },
  { code: 'HKD', name: 'Hong Kong Dollar', country: 'HK', region: 'APAC', perUsd: 7.85, vol: 0.004, risk: 0.0, bank: 'Hong Kong Monetary Authority' },
  { code: 'SGD', name: 'Singapore Dollar', country: 'SG', region: 'APAC', perUsd: 1.28, vol: 0.045, risk: 0.2, bank: 'Monetary Authority of Singapore' },
  { code: 'INR', name: 'Indian Rupee', country: 'IN', region: 'APAC', perUsd: 96.7, vol: 0.045, risk: 0.2, bank: 'Reserve Bank of India' },
  { code: 'KRW', name: 'South Korean Won', country: 'KR', region: 'APAC', perUsd: 1341, vol: 0.09, risk: 0.4, bank: 'Bank of Korea' },
  { code: 'MXN', name: 'Mexican Peso', country: 'MX', region: 'Americas', perUsd: 18.2, vol: 0.12, risk: 0.55, bank: 'Banco de Mexico' },
  { code: 'BRL', name: 'Brazilian Real', country: 'BR', region: 'Americas', perUsd: 5.0, vol: 0.14, risk: 0.55, bank: 'Banco Central do Brasil' },
  { code: 'ZAR', name: 'South African Rand', country: 'ZA', region: 'EMEA', perUsd: 17.5, vol: 0.14, risk: 0.55, bank: 'South African Reserve Bank' },
  { code: 'TRY', name: 'Turkish Lira', country: 'TR', region: 'EMEA', perUsd: 44, vol: 0.10, risk: 0.2, bank: 'Central Bank of the Republic of Turkey' },
  { code: 'DKK', name: 'Danish Krone', country: 'DK', region: 'EMEA', perUsd: 6.664, vol: 0.07, risk: 0.1, bank: 'Danmarks Nationalbank' },
  { code: 'TWD', name: 'Taiwan Dollar', country: 'TW', region: 'APAC', perUsd: 30.6, vol: 0.05, risk: 0.25, bank: 'Central Bank of the Republic of China (Taiwan)' },
];

const FX_PAIRS: [string, string][] = [
  ['EUR', 'USD'], ['USD', 'JPY'], ['GBP', 'USD'], ['USD', 'CHF'], ['AUD', 'USD'], ['USD', 'CAD'], ['NZD', 'USD'],
  ['EUR', 'GBP'], ['EUR', 'JPY'], ['EUR', 'CHF'], ['GBP', 'JPY'], ['AUD', 'JPY'], ['USD', 'CNH'], ['USD', 'HKD'],
  ['USD', 'SGD'], ['USD', 'INR'], ['USD', 'KRW'], ['USD', 'MXN'], ['USD', 'BRL'], ['USD', 'ZAR'], ['USD', 'TRY'],
  ['USD', 'SEK'], ['USD', 'NOK'], ['USD', 'CNY'], ['USD', 'TWD'],
];

const CCY = new Map(CURRENCIES.map((c) => [c.code, c]));

function pairRef(base: string, quote: string): number {
  const perUsd = (c: string) => (c === 'USD' ? 1 : CCY.get(c)!.perUsd);
  return perUsd(quote) / perUsd(base);
}

function fxDecimals(ref: number): number {
  if (ref >= 1000) return 2;
  if (ref >= 20) return 3;
  return 4;
}

function yahooFx(base: string, quote: string): string {
  if (base === 'USD') return `${quote}=X`;
  return `${base}${quote}=X`;
}

export const FX: SecurityDef[] = FX_PAIRS.map(([base, quote]) => {
  const ref = pairRef(base, quote);
  const other = base === 'USD' ? quote : base;
  const def = CCY.get(other)!;
  const name = base === 'USD' ? `USD-${quote} X-RATE` : `${base}-${quote} X-RATE`;
  return {
    id: `${base}${quote} Curncy`, ticker: `${base}${quote}`, yk: 'Curncy', name, cls: 'fx', ccy: quote,
    country: def.country, region: def.region, px: ref, vol: def.vol, dec: fxDecimals(ref), yahoo: yahooFx(base, quote),
    fx: { base, quote }, quote: 'price',
    alias: base === 'USD' ? [quote] : base === 'EUR' && quote === 'USD' ? ['EUR', 'EURO'] : quote === 'USD' ? [base] : undefined,
  } satisfies SecurityDef;
});

export const DXY: SecurityDef = {
  id: 'DXY Curncy', ticker: 'DXY', yk: 'Curncy', name: 'DOLLAR INDEX SPOT', cls: 'fx', ccy: 'USD', country: 'US',
  region: 'Americas', px: 98, vol: 0.07, dec: 3, yahoo: 'DX-Y.NYB', quote: 'price', alias: ['DOLLAR', 'USDX'],
  about: 'Geometric average of the US dollar against EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%) and CHF (3.6%).',
};

function cmd(
  t: string, name: string, px: number, vol: number, yahoo: string, dec: number, info: CommodityInfo, minor = false,
): SecurityDef {
  return {
    id: `${t} Comdty`, ticker: t, yk: 'Comdty', name, cls: 'commodity', ccy: minor ? 'USd' : 'USD', country: 'US',
    region: 'Americas', exch: info.exch, px, vol, dec, yahoo, cmd: info, quote: 'price', minor,
  };
}

export const COMMODITIES: SecurityDef[] = [
  cmd('CL1', 'Generic 1st \'CL\' Future', 62, 0.34, 'CL=F', 2, { unit: 'USD/bbl.', exch: 'NYMEX', size: '1,000 bbl', months: 'All months', group: 'Energy' }),
  cmd('CO1', 'Generic 1st \'CO\' Future', 66, 0.32, 'BZ=F', 2, { unit: 'USD/bbl.', exch: 'ICE Futures Europe', size: '1,000 bbl', months: 'All months', group: 'Energy' }),
  cmd('NG1', 'Generic 1st \'NG\' Future', 3.4, 0.6, 'NG=F', 3, { unit: 'USD/MMBtu', exch: 'NYMEX', size: '10,000 MMBtu', months: 'All months', group: 'Energy' }),
  cmd('HO1', 'Generic 1st \'HO\' Future', 2.3, 0.32, 'HO=F', 4, { unit: 'USD/gal.', exch: 'NYMEX', size: '42,000 gal', months: 'All months', group: 'Energy' }),
  cmd('XB1', 'Generic 1st \'XB\' Future', 2.0, 0.34, 'RB=F', 4, { unit: 'USD/gal.', exch: 'NYMEX', size: '42,000 gal', months: 'All months', group: 'Energy' }),
  cmd('GC1', 'Generic 1st \'GC\' Future', 4000, 0.2, 'GC=F', 1, { unit: 'USD/t oz.', exch: 'COMEX', size: '100 troy oz', months: 'G,J,M,Q,V,Z', group: 'Precious Metals' }),
  cmd('SI1', 'Generic 1st \'SI\' Future', 48, 0.32, 'SI=F', 3, { unit: 'USD/t oz.', exch: 'COMEX', size: '5,000 troy oz', months: 'H,K,N,U,Z', group: 'Precious Metals' }),
  cmd('PL1', 'Generic 1st \'PL\' Future', 1600, 0.3, 'PL=F', 1, { unit: 'USD/t oz.', exch: 'NYMEX', size: '50 troy oz', months: 'F,J,N,V', group: 'Precious Metals' }),
  cmd('PA1', 'Generic 1st \'PA\' Future', 1300, 0.38, 'PA=F', 1, { unit: 'USD/t oz.', exch: 'NYMEX', size: '100 troy oz', months: 'H,M,U,Z', group: 'Precious Metals' }),
  cmd('HG1', 'Generic 1st \'HG\' Future', 5.0, 0.24, 'HG=F', 4, { unit: 'USD/lb.', exch: 'COMEX', size: '25,000 lb', months: 'H,K,N,U,Z', group: 'Base Metals' }),
  cmd('W 1', 'Generic 1st \'W\' Future', 520, 0.3, 'ZW=F', 2, { unit: 'USd/bu.', exch: 'CBOT', size: '5,000 bu', months: 'H,K,N,U,Z', group: 'Grains' }, true),
  cmd('C 1', 'Generic 1st \'C\' Future', 420, 0.24, 'ZC=F', 2, { unit: 'USd/bu.', exch: 'CBOT', size: '5,000 bu', months: 'H,K,N,U,Z', group: 'Grains' }, true),
  cmd('S 1', 'Generic 1st \'S\' Future', 1020, 0.2, 'ZS=F', 2, { unit: 'USd/bu.', exch: 'CBOT', size: '5,000 bu', months: 'F,H,K,N,Q,U,X', group: 'Grains' }, true),
  cmd('KC1', 'Generic 1st \'KC\' Future', 380, 0.38, 'KC=F', 2, { unit: 'USd/lb.', exch: 'ICE Futures US', size: '37,500 lb', months: 'H,K,N,U,Z', group: 'Softs' }, true),
  cmd('SB1', 'Generic 1st \'SB\' Future', 16.5, 0.3, 'SB=F', 2, { unit: 'USd/lb.', exch: 'ICE Futures US', size: '112,000 lb', months: 'H,K,N,V', group: 'Softs' }, true),
  cmd('CC1', 'Generic 1st \'CC\' Future', 6500, 0.5, 'CC=F', 0, { unit: 'USD/MT', exch: 'ICE Futures US', size: '10 metric tons', months: 'H,K,N,U,Z', group: 'Softs' }),
  cmd('CT1', 'Generic 1st \'CT\' Future', 66, 0.22, 'CT=F', 2, { unit: 'USd/lb.', exch: 'ICE Futures US', size: '50,000 lb', months: 'H,K,N,V,Z', group: 'Softs' }, true),
  cmd('LC1', 'Generic 1st \'LC\' Future', 235, 0.16, 'LE=F', 3, { unit: 'USd/lb.', exch: 'CME', size: '40,000 lb', months: 'G,J,M,Q,V,Z', group: 'Livestock' }, true),
  cmd('LH1', 'Generic 1st \'LH\' Future', 85, 0.25, 'HE=F', 3, { unit: 'USd/lb.', exch: 'CME', size: '40,000 lb', months: 'G,J,K,M,N,Q,V,Z', group: 'Livestock' }, true),
];

const COMMODITY_ALIASES: Record<string, string[]> = {
  CL1: ['WTI', 'CRUDE', 'OIL'], CO1: ['BRENT'], NG1: ['NATGAS', 'GAS'], GC1: ['GOLD', 'XAU'], SI1: ['SILVER', 'XAG'],
  HG1: ['COPPER'], PL1: ['PLATINUM'], PA1: ['PALLADIUM'], 'W 1': ['WHEAT', 'W1'], 'C 1': ['CORN', 'C1'],
  'S 1': ['SOYBEANS', 'SOY', 'S1'], KC1: ['COFFEE'], SB1: ['SUGAR'], CC1: ['COCOA'], CT1: ['COTTON'],
  LC1: ['CATTLE'], LH1: ['HOGS'], HO1: ['HEATING OIL', 'DIESEL'], XB1: ['GASOLINE', 'RBOB'],
};
for (const c of COMMODITIES) c.alias = COMMODITY_ALIASES[c.ticker];

function rate(
  t: string, name: string, country: string, region: Region, ccy: string, curve: string, tenor: number, px: number,
  vol: number, yahoo?: string,
): SecurityDef {
  return {
    id: `${t} Index`, ticker: t, yk: 'Index', name, cls: 'rate', ccy, country, region, px, vol, dec: 3, yahoo, tenor,
    curve, quote: 'yield',
  };
}

const T = (n: number) => (n < 1 ? `${Math.round(n * 12)}M` : `${n}Y`);

function curveSet(
  prefix: (tenor: number) => string, label: string, country: string, region: Region, ccy: string, curve: string,
  points: [number, number][], vol: number, yahoo: Record<number, string> = {},
): SecurityDef[] {
  return points.map(([tenor, y]) =>
    rate(prefix(tenor), `${label} ${T(tenor)}`, country, region, ccy, curve, tenor, y, vol * (tenor < 1 ? 0.8 : 1), yahoo[tenor]),
  );
}

const usTicker: Record<number, string> = {
  0.25: 'USGG3M', 0.5: 'USGG6M', 1: 'USGG12M', 2: 'USGG2YR', 3: 'USGG3YR', 5: 'USGG5YR', 7: 'USGG7YR', 10: 'USGG10YR',
  20: 'USGG20YR', 30: 'USGG30YR',
};

export const RATES: SecurityDef[] = [
  ...curveSet((t) => usTicker[t], 'US Generic Govt', 'US', 'Americas', 'USD', 'US', [
    [0.25, 3.85], [0.5, 3.78], [1, 3.62], [2, 3.5], [3, 3.52], [5, 3.68], [7, 3.88], [10, 4.08], [20, 4.62], [30, 4.68],
  ], 0.85, { 0.25: '^IRX', 5: '^FVX', 10: '^TNX', 30: '^TYX' }),
  ...curveSet((t) => `GDBR${t}`, 'German Govt Bond', 'DE', 'EMEA', 'EUR', 'DE', [[2, 2.02], [5, 2.3], [10, 2.68], [30, 3.25]], 0.7),
  ...curveSet((t) => `GUKG${t}`, 'UK Gilts', 'GB', 'EMEA', 'GBP', 'GB', [[2, 3.82], [5, 3.98], [10, 4.55], [20, 5.12], [30, 5.3]], 0.85),
  ...curveSet((t) => `GJGB${t}`, 'Japan Govt Bond', 'JP', 'APAC', 'JPY', 'JP', [[2, 1.05], [5, 1.42], [10, 1.95], [30, 3.3]], 0.45),
  rate('GFRN10', 'French Govt OAT 10Y', 'FR', 'EMEA', 'EUR', 'FR', 10, 3.45, 0.72),
  rate('GBTPGR10', 'Italy Govt BTP 10Y', 'IT', 'EMEA', 'EUR', 'IT', 10, 3.5, 0.8),
  rate('GSPG10YR', 'Spain Govt Bond 10Y', 'ES', 'EMEA', 'EUR', 'ES', 10, 3.2, 0.75),
  rate('GSWISS10', 'Swiss Govt Bond 10Y', 'CH', 'EMEA', 'CHF', 'CH', 10, 0.25, 0.45),
  rate('GCAN10YR', 'Canada Govt Bond 10Y', 'CA', 'Americas', 'CAD', 'CA', 10, 3.25, 0.8),
  rate('GACGB10', 'Australia Govt Bond 10Y', 'AU', 'APAC', 'AUD', 'AU', 10, 4.4, 0.85),
  rate('GCNY10YR', 'China Govt Bond 10Y', 'CN', 'APAC', 'CNY', 'CN', 10, 1.8, 0.3),
  rate('GIND10YR', 'India Govt Bond 10Y', 'IN', 'APAC', 'INR', 'IN', 10, 6.45, 0.45),
  rate('GEBR10Y', 'Brazil Govt Bond 10Y', 'BR', 'Americas', 'BRL', 'BR', 10, 13.6, 1.6),
  rate('GMXN10YR', 'Mexico Govt Bond 10Y', 'MX', 'Americas', 'MXN', 'MX', 10, 8.7, 1.1),
];

const RATE_ALIASES: Record<string, string[]> = {
  USGG10YR: ['UST10', 'US10Y', 'TNX', '10Y'], USGG2YR: ['US2Y', 'UST2'], USGG30YR: ['US30Y', 'UST30'],
  USGG5YR: ['US5Y'], USGG3M: ['US3M', 'TBILL'], GDBR10: ['BUND', 'DE10Y'], GUKG10: ['GILT', 'UK10Y'], GJGB10: ['JGB', 'JP10Y'],
};
for (const r of RATES) r.alias = RATE_ALIASES[r.ticker];

export const CRYPTO: SecurityDef[] = [
  ['XBTUSD', 'Bitcoin', 83500, 0.5, 'BTC-USD', 19_930_000, 'BTC-USD', 2009, ['BTC', 'BITCOIN']],
  ['XETUSD', 'Ethereum', 2700, 0.68, 'ETH-USD', 120_700_000, 'ETH-USD', 2015, ['ETH', 'ETHER', 'ETHEREUM']],
  ['SOLUSD', 'Solana', 140, 0.85, 'SOL-USD', 556_000_000, 'SOL-USD', 2020, ['SOL', 'SOLANA']],
  ['XRPUSD', 'XRP', 2.2, 0.85, 'XRP-USD', 60_500_000_000, 'XRP-USD', 2012, ['XRP', 'RIPPLE']],
  ['ADAUSD', 'Cardano', 0.6, 0.9, 'ADA-USD', 36_600_000_000, 'ADA-USD', 2017, ['ADA', 'CARDANO']],
  ['DOGEUSD', 'Dogecoin', 0.18, 1.0, 'DOGE-USD', 151_000_000_000, 'DOGE-USD', 2013, ['DOGE', 'DOGECOIN']],
  ['AVAXUSD', 'Avalanche', 20, 0.95, 'AVAX-USD', 425_000_000, 'AVAX-USD', 2020, ['AVAX', 'AVALANCHE']],
  ['LINKUSD', 'Chainlink', 15, 0.9, 'LINK-USD', 680_000_000, 'LINK-USD', 2017, ['LINK', 'CHAINLINK']],
  ['LTCUSD', 'Litecoin', 90, 0.75, 'LTC-USD', 76_500_000, 'LTC-USD', 2011, ['LTC', 'LITECOIN']],
  ['DOTUSD', 'Polkadot', 3.5, 0.95, 'DOT-USD', 1_620_000_000, 'DOT-USD', 2020, ['DOT', 'POLKADOT']],
].map(([t, name, px, vol, yahoo, supply, coinbase, launched, alias]) => {
  const p = px as number;
  return {
    id: `${t} Curncy`, ticker: t as string, yk: 'Curncy', name: `${name as string} / US Dollar`, cls: 'crypto', ccy: 'USD',
    country: 'XX', region: 'Americas', px: p, vol: vol as number, dec: p >= 1000 ? 2 : p >= 10 ? 3 : 5,
    yahoo: yahoo as string, quote: 'price', alias: alias as string[],
    cry: { supply: supply as number, coinbase: coinbase as string, launched: launched as number },
  } satisfies SecurityDef;
});
