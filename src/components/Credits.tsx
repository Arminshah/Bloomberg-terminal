import { engine } from '../data/market';

/**
 * The credit each official publisher asks for where its data appears, in its
 * own words where it gives them (docs/data-providers.md has the terms):
 * the Open Government Licence statement for the ONS and the Bank of England,
 * Statistics Canada's Open Licence notices, the ESCB's "Source: ECB
 * statistics.", CC BY 4.0 for the RBA and the ABS, and the source named for
 * the others.
 */
export const CREDITS = {
  treasury: 'Source: U.S. Department of the Treasury, daily par yield curve rates.',
  nyfed: 'Source: Federal Reserve Bank of New York, reference rates.',
  fedboard: 'Source: Board of Governors of the Federal Reserve System.',
  ecb: 'Source: ECB statistics.',
  bundesbank: 'Source: Deutsche Bundesbank (ESCB statistics).',
  boe: 'Bank of England: contains public sector information licensed under the Open Government Licence v3.0.',
  boc: 'Source: Bank of Canada.',
  imf: 'Source: International Monetary Fund, World Economic Outlook database (www.imf.org/external/datamapper).',
  congressgov: 'Source: Congress.gov, Library of Congress.',
  imfTrade: 'Source: International Monetary Fund, International Trade in Goods (by partner country) (data.imf.org).',
  rba: 'Source: Reserve Bank of Australia, licensed under CC BY 4.0.',
  mof: 'Source: Ministry of Finance Japan.',
  snb: 'Source: Swiss National Bank.',
  bcb: 'Source: Banco Central do Brasil.',
  bde: 'Source: Banco de España website (www.bde.es); the 10-year yield as Bolsas y Mercados Españoles compiles it.',
  bis: "Source: BIS central bank policy rates (WS_CBPOL), from the People's Bank of China, the Reserve Bank of India, Banco de México and the Bank of Japan.",
  ons: 'Source: Office for National Statistics licensed under the Open Government Licence v.3.0.',
  eurostat: 'Source: Eurostat.',
  statcan:
    'Source: Statistics Canada, Labour Force Survey (v2062815) and Consumer Price Index (v41690973), reference month as shown. Reproduced and distributed on an "as is" basis with the permission of Statistics Canada. The 12-month inflation rate: adapted from Statistics Canada, Consumer Price Index, reference month as shown; this does not constitute an endorsement by Statistics Canada of this product.',
  abs: 'Source: Australian Bureau of Statistics, licensed under CC BY 4.0.',
} as const;

export type CreditId = keyof typeof CREDITS;

/** The credits for the official data on a screen. Nothing in the demo, which shows none. */
export function Credits({ ids }: { ids: CreditId[] }) {
  if (!engine.realOnly || !ids.length) return null;
  return <div className="note credits">{ids.map((id) => CREDITS[id]).join(' ')}</div>;
}
