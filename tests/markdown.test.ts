import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from '../src/components/Markdown';

const REPORT = `# Short interest · APLD
Settlement history from FINRA.

| Settlement date | Short interest | Days to cover | Change |
|---|---:|---:|---|
| 2026-09-30 | 61,234,000 | 2.4 | +3.1% |
| 2026-09-15 | 59,400,000 | -- | -1.2% |

_Model estimates are labelled separately._

## Insider trades
- **2026-10-02** CEO sold 50,000 shares ([Form 4](https://www.sec.gov/Archives/edgar/data/1144879/000114487926000101/xslF345X05/form4.xml))
- Director bought 10,000 shares [8-K](javascript:alert(1))
---
See https://www.equibles.com/apld for more.`;

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('provider research written in Markdown', () => {
  it('reads headings, tables, notes, lists and rules as blocks', () => {
    const blocks = parseMarkdown(REPORT);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'para', 'table', 'para', 'heading', 'list', 'rule', 'para']);
    const table = blocks[2];
    expect(table.type === 'table' && table.head).toEqual(['Settlement date', 'Short interest', 'Days to cover', 'Change']);
    expect(table.type === 'table' && table.rows[1]).toEqual(['2026-09-15', '59,400,000', '--', '-1.2%']);
    // Figures align right; dates do not.
    expect(table.type === 'table' && table.numeric).toEqual([false, true, true, true]);
  });

  it('shows tables as tables, notes in italics and links as links', () => {
    const out = html(REPORT);
    expect(out).toContain('<table class="tbl zebra">');
    expect(out).toContain('<th class="num">Short interest</th>');
    expect(out).toContain('<em class="muted">Model estimates are labelled separately.</em>');
    expect(out).toContain('<strong>2026-10-02</strong>');
    expect(out).toContain('href="https://www.sec.gov/Archives/edgar/data/1144879/000114487926000101/xslF345X05/form4.xml"');
    expect(out).not.toContain('|---');
    expect(out).not.toContain('# Short');
  });

  it('never makes a link of anything but http(s), and never renders HTML from the text', () => {
    const out = html(`${REPORT}\n<script>throw new Error('x')</script> <img src=x onerror=alert(1)>`);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('8-K');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<img');
  });

  it('keeps plain text as it is', () => {
    expect(html('AAPL · GetAnalystEstimates\nSYNTHETIC TEST REPORT')).toBe('<div class="md"><p class="md-p">AAPL · GetAnalystEstimates SYNTHETIC TEST REPORT</p></div>');
  });
});
