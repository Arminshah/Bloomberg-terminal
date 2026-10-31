/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as extraction from '../electron/supply-chain.cjs';
import { buildDirectory, ownRelations } from '../src/data/live/supply-chain';

const require = createRequire(import.meta.url);
const { quotedEvidence } = require('../scripts/live/audit/domains.cjs');

describe('exact documentary quotation formatting', () => {
  it('keeps competitor-list classification context separate from the quoted source item', () => {
    const item = 'suppliers of GPUs, such as Advanced Micro Devices, Inc., or AMD, and Intel Corporation;';
    const html = `<h2>Competition</h2><p>Our current competitors include:</p><p>${item}</p><p>We believe we compete well.</p>`;
    const dir = buildDirectory([
      { cik: 1, ticker: 'TEST', title: 'Test Corporation' },
      { cik: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' },
      { cik: 50863, ticker: 'INTC', title: 'INTEL CORP' },
    ]);
    const source = { filer: 'Test Corporation', form: '10-K', date: '2026-10-01', path: '1/000000000126000001/report.htm' };
    const relations = ownRelations(extraction.ownSentences(extraction.htmlToText(html)), dir, { cik: 1, names: ['Test'], ticker: 'TEST' }, source);
    expect(relations.map((r) => [r.ticker, r.role]).sort()).toEqual([['AMD', 'competitor'], ['INTC', 'competitor']]);
    for (const relation of relations) {
      expect(relation.evidence[0]).toMatchObject({ sentence: item, context: 'competitor-list', path: source.path });
      expect(quotedEvidence(html, relation.evidence[0])).toBe(true);
      expect(quotedEvidence(html, { sentence: `Competitors: ${item}` })).toBe(false);
    }
  });

  it('corroborates rendered inline XBRL text without inserting spaces inside amounts or company names', () => {
    // Synthetic markup reproduces common SEC inline-XBRL formatting, without
    // claiming these terms or amounts were independently verified for an issuer.
    const html = '<p>Our credit agreement with Sumito<span>mo</span> Mitsui Ban<span>king</span> Corporation provides $<ix:nonFraction name="test:Amount">375</ix:nonFraction> million in delayed draw loans.</p>';
    const sentence = 'Our credit agreement with Sumitomo Mitsui Banking Corporation provides $375 million in delayed draw loans.';
    expect(extraction.mentionSentences(extraction.htmlToText(html), ['Sumitomo Mitsui Banking'])).toEqual([sentence]);
    expect(quotedEvidence(html, { sentence })).toBe(true);
    expect(quotedEvidence(html, { sentence: sentence.replace('$375', '$376') })).toBe(false);
    expect(quotedEvidence(html, { sentence: sentence.replace('Sumitomo Mitsui Banking', 'Another Named Bank') })).toBe(false);
  });

  it('decodes source numeric and named typography once while keeping an exact contiguous quotation', () => {
    const html = '<div>The Company&#8217;s agreement with Sumitomo Mitsui Banking Corporation (&ldquo;SMBC&rdquo;) provides $<b>375</b>&nbsp;million&mdash;subject to conditions.</div>';
    const sentence = 'The Company\'s agreement with Sumitomo Mitsui Banking Corporation ("SMBC") provides $375 million-subject to conditions.';
    expect(extraction.ownSentences(extraction.htmlToText(html))).toContain(sentence);
    expect(quotedEvidence(html, { sentence })).toBe(true);
    expect(quotedEvidence(html, { sentence: 'Sumitomo Mitsui Banking Corporation provides $375 million subject to conditions.' })).toBe(false);
    expect(quotedEvidence(html, { sentence: sentence.replace('provides', 'does not provide') })).toBe(false);
  });

  it('preserves paragraph word boundaries and does not corroborate executable or hidden XBRL prose', () => {
    const sentence = 'Our agreement with Sumitomo Mitsui Banking Corporation provides financing.';
    expect(quotedEvidence(`<p>Our agreement with Sumitomo Mitsui Banking</p><p>Corporation provides financing.</p>`, { sentence })).toBe(true);
    expect(quotedEvidence(`<p>Our agreement with Sumitomo Mitsui Banking</p><p>Corporation provides financing.</p>`, { sentence: sentence.replace('Banking Corporation', 'BankingCorporation') })).toBe(false);
    for (const tag of ['script', 'style', 'ix:header']) expect(quotedEvidence(`<${tag}>${sentence}</${tag}><p>No financing agreement is described here.</p>`, { sentence })).toBe(false);
    expect(quotedEvidence(`<!--${sentence}--><p>No financing agreement is described here.</p>`, { sentence })).toBe(false);
  });

  it('does not parse or decode a stored plain-text quotation a second time', () => {
    const html = '<p>The financing documentation describes the literal markers &amp;quot; and &lt;condition&gt; in its explanatory text.</p>';
    const sentence = 'The financing documentation describes the literal markers &quot; and <condition> in its explanatory text.';
    expect(quotedEvidence(html, { sentence })).toBe(true);
    expect(quotedEvidence(html, { sentence: sentence.replace('&quot;', '"') })).toBe(false);
  });
});
