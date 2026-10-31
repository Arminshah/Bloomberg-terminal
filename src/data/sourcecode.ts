// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * Short source codes for headline lists, as the terminal's news screens print a code beside each headline's time
 * ("BN 10:15"). These are this app's abbreviations of the publishers' own names, not Bloomberg's wire codes; the
 * full name stays on the line's tooltip and in the story.
 */
const KNOWN: Record<string, string> = {
  reuters: 'RTRS',
  'associated press': 'AP',
  ap: 'AP',
  bloomberg: 'BBG',
  benzinga: 'BZ',
  marketwatch: 'MW',
  'yahoo finance': 'YHOO',
  yahoo: 'YHOO',
  'seeking alpha': 'SA',
  seekingalpha: 'SA',
  cnbc: 'CNBC',
  'financial times': 'FT',
  'the wall street journal': 'WSJ',
  'wall street journal': 'WSJ',
  "barron's": 'BARR',
  barrons: 'BARR',
  'investing.com': 'INV',
  'the motley fool': 'FOOL',
  'motley fool': 'FOOL',
  zacks: 'ZACK',
  'zacks investment research': 'ZACK',
  'business wire': 'BW',
  businesswire: 'BW',
  'pr newswire': 'PRN',
  'globenewswire': 'GNW',
  'globe newswire': 'GNW',
  forbes: 'FORB',
  fortune: 'FORT',
  'the new york times': 'NYT',
  'new york times': 'NYT',
  'the economist': 'ECON',
  'sec edgar': 'SEC',
  sec: 'SEC',
  euronext: 'ENXT',
  'federal reserve': 'FED',
  'european central bank': 'ECB',
  ecb: 'ECB',
  'bank of england': 'BOE',
  'bank of japan': 'BOJ',
  'bank of canada': 'BOC',
  'reserve bank of australia': 'RBA',
  bis: 'BIS',
  bea: 'BEA',
  esma: 'ESMA',
  'tipranks': 'TIPR',
  'insidermonkey': 'INSM',
  'insider monkey': 'INSM',
  'thefly': 'FLY',
  'the fly': 'FLY',
  'investor\'s business daily': 'IBD',
  'investors business daily': 'IBD',
  techcrunch: 'TCR',
  'the verge': 'VRGE',
  'business insider': 'BI',
  'fox business': 'FOXB',
  'ft': 'FT',
};

const SKIP = new Set(['the', 'of', 'and', 'a', 'an', '&']);

/** Up to four capitals for a publisher: a known code, the initials of a longer name, or a one-word name cut short. */
export function sourceCode(publisher: string): string {
  const name = publisher.replace(/\s*\(company filing\)$/i, '').trim();
  const key = name.toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  // "finance.yahoo.com", "www.reuters.com": the site's name.
  const host = /^(?:www\.)?([a-z0-9-]+)\.(?:com|net|org|co\.uk|io|news)$/i.exec(name);
  if (host) return KNOWN[host[1].toLowerCase()] ?? host[1].slice(0, 4).toUpperCase();
  const words = name.split(/[\s\-–—/]+/).filter((w) => w && !SKIP.has(w.toLowerCase()));
  if (words.length === 0) return '--';
  if (words.length === 1) {
    const w = words[0].replace(/[^A-Za-z0-9]/g, '');
    return (w === w.toUpperCase() && w.length <= 5 ? w : w.slice(0, 4)).toUpperCase() || '--';
  }
  return words
    .slice(0, 4)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').charAt(0))
    .join('')
    .toUpperCase();
}
