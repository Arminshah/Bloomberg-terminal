import { marketCapUsd } from './analytics';
import { engine } from './market';
import { keyStats } from './fundamentals';
import { realFund } from './live/yfund';
import type { FieldValue } from './fields';
import type { SecurityDef } from './types';

/**
 * The fundamental columns a worksheet (W) adds to the watchlist's market fields: market value, enterprise value and
 * the valuation and quality ratios PEERS shows, worked out the same way, each with its source and status.
 */

export interface WorksheetColumn {
  id: string;
  label: string;
  /** How the value is shown: USD amounts compact, ratios with decimals, percentages with a sign. */
  format: 'usd' | 'ratio' | 'pct' | 'text';
  definition: string;
}

export const FUNDAMENTAL_COLUMNS: readonly WorksheetColumn[] = [
  { id: 'ARMIN_SECTOR', label: 'Sector', format: 'text', definition: "The company's sector in the app's security definition (GICS sector names)." },
  { id: 'ARMIN_INDUSTRY', label: 'Industry', format: 'text', definition: "The company's industry in the app's security definition." },
  { id: 'ARMIN_MKT_CAP_USD', label: 'Mkt Cap USD', format: 'usd', definition: 'Market value: the share count times the last price, in US dollars.' },
  { id: 'ARMIN_EV_USD', label: 'EV USD', format: 'usd', definition: 'Enterprise value: market value, net debt, preferred stock and minority interest from the latest balance sheet, in US dollars.' },
  { id: 'ARMIN_PE', label: 'P/E', format: 'ratio', definition: 'Price over the last 12 months of diluted EPS; none on a loss.' },
  { id: 'ARMIN_PB', label: 'P/B', format: 'ratio', definition: "Market value over shareholders' equity; none on negative equity." },
  { id: 'ARMIN_EV_EBITDA', label: 'EV/EBITDA', format: 'ratio', definition: "Enterprise value over the last 12 months' EBITDA; none on negative EBITDA, or for a bank." },
  { id: 'ARMIN_DIV_YLD', label: 'Div Yld', format: 'pct', definition: 'Dividends paid in the last 12 months over the price, %.' },
  { id: 'ARMIN_ROE', label: 'ROE', format: 'pct', definition: "The last 12 months' net income over shareholders' equity, %." },
  { id: 'ARMIN_NET_MARGIN', label: 'Net Mgn', format: 'pct', definition: "The last 12 months' net income over revenue, %." },
  { id: 'ARMIN_REV_GROWTH', label: 'Rev Growth', format: 'pct', definition: "The latest fiscal year's revenue over the year before's, %." },
  { id: 'ARMIN_EPS_LTM', label: 'EPS LTM', format: 'ratio', definition: 'Diluted EPS over the last 12 months, in the statements\' currency.' },
  { id: 'ARMIN_BETA', label: 'Beta', format: 'ratio', definition: "The provider's beta from the company summary (BETA works out its own from price history)." },
];

const COLUMN_BY_ID = new Map(FUNDAMENTAL_COLUMNS.map((c) => [c.id, c]));
export const isFundamental = (id: string) => COLUMN_BY_ID.has(id);
export const fundamentalColumn = (id: string) => COLUMN_BY_ID.get(id);

/** The fundamental fields of one security, keyed by column ID; a stock's only (others have none). */
export function fundamentalFields(sec: SecurityDef | undefined): Map<string, FieldValue> {
  const out = new Map<string, FieldValue>();
  if (!sec || sec.cls !== 'equity' || !sec.eq) return out;
  const k = keyStats(sec);
  const real = engine.realOnly;
  const rf = realFund.get(sec.id);
  const loaded = !real || !!rf;
  const toUsd = engine.usdValue(k.ccy) * 1e6;
  const values: Record<string, string | number> = {
    ARMIN_SECTOR: sec.eq.sector,
    ARMIN_INDUSTRY: sec.eq.industry,
    ARMIN_MKT_CAP_USD: marketCapUsd(sec.id),
    ARMIN_EV_USD: k.ev * toUsd,
    ARMIN_PE: k.pe,
    ARMIN_PB: k.pb,
    ARMIN_EV_EBITDA: k.evEbitda,
    ARMIN_DIV_YLD: k.divYld,
    ARMIN_ROE: k.roe,
    ARMIN_NET_MARGIN: k.netMargin,
    ARMIN_REV_GROWTH: k.revGrowth,
    ARMIN_EPS_LTM: k.epsLtm,
    // In the desktop app only the provider's own beta, never the security list's starting value.
    ARMIN_BETA: real ? (rf?.stats.beta ?? NaN) : k.beta,
  };
  const statements = `${rf?.statementsFrom ?? 'Yahoo Finance'} statements and the app's last price`;
  const summary = `${rf?.statsFrom ?? 'Yahoo Finance'} company summary`;
  for (const c of FUNDAMENTAL_COLUMNS) {
    const v = values[c.id];
    const text = c.format === 'text';
    const valid = text ? typeof v === 'string' && v.trim() !== '' && v !== '--' : typeof v === 'number' && Number.isFinite(v) && loaded;
    out.set(c.id, {
      id: c.id,
      name: c.label,
      category: text ? 'Identity' : 'Calculated',
      definition: c.definition,
      value: valid ? v : null,
      unit: c.format === 'usd' ? 'USD' : c.format === 'pct' ? '%' : c.format === 'text' ? 'text' : 'ratio',
      source: !real ? 'Demo engine' : text ? "The app's security definition" : c.id === 'ARMIN_BETA' ? summary : statements,
      status: !valid ? 'UNAVAILABLE' : !real ? 'DEMO DATA' : text ? 'REFERENCE' : 'CALCULATED',
      asOf: null,
      dateOnly: true,
      timeBasis: 'Statements as of their latest period; the price is the current one.',
      note: valid ? 'Worked out as PEERS works it out.' : real && !loaded ? "The company's statements have not loaded." : 'Not meaningful or not available for this company.',
    });
  }
  return out;
}
