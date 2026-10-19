import { hashString } from '../core/rng';
import type { SecurityDef } from './types';

/**
 * Factor loadings drive the cross-asset correlation structure. Each factor is
 * an independent standard normal shock per period; an instrument's shock is
 * sum(loading * factor) + sqrt(1 - sum(loading^2)) * idiosyncratic.
 */
export type Loadings = [factor: number, loading: number][];

const F = (name: string) => hashString(`factor:${name}`);

const REGION_FACTOR: Record<string, string> = { Americas: 'EQ:US', EMEA: 'EQ:EU', APAC: 'EQ:AS' };

const COMMODITY_FACTORS: Record<string, [string, number][]> = {
  CL1: [['OIL', 0.93], ['G', 0.15]],
  CO1: [['OIL', 0.93], ['G', 0.15]],
  HO1: [['OIL', 0.85], ['G', 0.1]],
  XB1: [['OIL', 0.82], ['G', 0.12]],
  NG1: [['GAS', 0.85]],
  GC1: [['GOLD', 0.85], ['USD', -0.25]],
  SI1: [['GOLD', 0.72], ['METAL', 0.3], ['G', 0.1]],
  PL1: [['GOLD', 0.5], ['METAL', 0.4]],
  PA1: [['METAL', 0.5], ['GOLD', 0.3]],
  HG1: [['METAL', 0.7], ['G', 0.3]],
  'W 1': [['AGS', 0.75]],
  'C 1': [['AGS', 0.75]],
  'S 1': [['AGS', 0.65]],
  KC1: [['SOFT', 0.3]],
  SB1: [['SOFT', 0.3], ['OIL', 0.15]],
  CC1: [['SOFT', 0.25]],
  CT1: [['SOFT', 0.3], ['AGS', 0.2]],
  LC1: [['LIVE', 0.5]],
  LH1: [['LIVE', 0.5]],
};

const US_SLOPE: Record<number, number> = { 0.25: -0.4, 0.5: -0.38, 1: -0.33, 2: -0.25, 3: -0.16, 5: 0, 7: 0.1, 10: 0.2, 20: 0.3, 30: 0.35 };

function equityLoadings(def: SecurityDef): [string, number][] {
  // The simulator's own loading; a beta the source does not give counts as 1 here and is never shown.
  const beta = Math.min(Math.max(Number.isFinite(def.eq!.beta) ? def.eq!.beta : 1, 0.3), 2.2);
  const g = 0.42 * Math.sqrt(beta);
  return [['G', g], [REGION_FACTOR[def.region], 0.42], [`SEC:${def.eq!.sector}`, 0.38]];
}

function indexLoadings(def: SecurityDef): [string, number][] {
  if (def.ticker === 'VIX') return [['G', -0.6], ['EQ:US', -0.5]];
  const out: [string, number][] = [['G', 0.68], [REGION_FACTOR[def.region], 0.6]];
  if (def.ticker === 'CCMP' || def.ticker === 'NDX') out.push(['SEC:Information Technology', 0.3]);
  if (def.ticker === 'RTY') out.push(['SIZE', 0.3]);
  if (def.country === 'CN' || def.country === 'HK') out.push(['CHINA', 0.4]);
  return out;
}

function rateLoadings(def: SecurityDef): [string, number][] {
  const t = def.tenor ?? 10;
  switch (def.curve) {
    case 'US':
      // Level, slope and curvature explain almost all of a curve's daily move.
      return [['R:US', 0.93], ['R:US:SLOPE', US_SLOPE[t] ?? 0.2], ['R:US:CURV', t >= 2 && t <= 7 ? 0.12 : -0.06], ['G', 0.1]];
    case 'DE':
    case 'FR':
    case 'IT':
    case 'ES':
      return [['R:EU', 0.86], ['R:US', 0.4], ['R:EU:SLOPE', t <= 2 ? -0.28 : t >= 30 ? 0.28 : t >= 10 ? 0.08 : -0.05]];
    case 'GB':
      return [['R:GB', 0.82], ['R:US', 0.45], ['R:GB:SLOPE', t <= 2 ? -0.28 : t >= 30 ? 0.28 : t >= 10 ? 0.08 : -0.05]];
    case 'JP':
      return [['R:JP', 0.9], ['R:US', 0.2], ['R:JP:SLOPE', t <= 2 ? -0.3 : t >= 30 ? 0.33 : t >= 10 ? 0.1 : -0.05]];
    default:
      return [[`R:${def.curve}`, 0.82], ['R:US', 0.32]];
  }
}

export function factorLoadings(def: SecurityDef, risk = 0): Loadings {
  let raw: [string, number][] = [];
  switch (def.cls) {
    case 'equity':
      raw = equityLoadings(def);
      break;
    case 'index':
      raw = indexLoadings(def);
      break;
    case 'rate':
      raw = rateLoadings(def);
      break;
    case 'commodity':
      raw = COMMODITY_FACTORS[def.ticker] ?? [['G', 0.2]];
      break;
    case 'crypto':
      raw = [['CRYPTO', def.ticker === 'XBTUSD' ? 0.88 : 0.8], ['G', 0.22]];
      break;
    case 'fx': {
      // Currency USD values: a stronger dollar lowers every other currency.
      const bloc = ['EUR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'GBP'].includes(def.ticker) ? 0.45 : 0;
      const usd = def.ticker === 'HKD' ? -0.05 : -0.62;
      raw = [['USD', usd], ['G', risk * 0.5], ['FX:EUROPE', bloc]];
      break;
    }
    default:
      raw = [];
  }
  const total = raw.reduce((s, [, l]) => s + l * l, 0);
  const cap = def.cls === 'rate' ? 0.985 : 0.96;
  const scale = total > cap ? Math.sqrt(cap / total) : 1;
  return raw.filter(([, l]) => l !== 0).map(([name, l]) => [F(name), l * scale]);
}

export function idioWeight(loadings: Loadings): number {
  const total = loadings.reduce((s, [, l]) => s + l * l, 0);
  return Math.sqrt(Math.max(0.015, 1 - total));
}
