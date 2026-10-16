import { describe, expect, it } from 'vitest';
import * as secMain from '../electron/sec.cjs';
import {
  coverShares,
  filingLinks,
  fiscalLabel,
  findByTicker,
  formGroup,
  lineValues,
  FACT_LINES,
  parseCompanyFacts,
  parseFilingPage,
  parseSubmissions,
  parseTickers,
  periodColumns,
  periodKind,
  reportingCurrency,
  searchCompanies,
  secTicker,
  secTickerKey,
} from '../src/data/live/sec';
import type { SecurityDef } from '../src/data/types';

// The SEC files below are synthetic: made-up companies and numbers laid out in
// the structure the SEC documents (field names as in data.sec.gov submissions
// and company facts, and www.sec.gov/files/company_tickers.json). No live SEC
// request was made for these tests.

const line = (key: string) => FACT_LINES.find((l) => l.key === key)!;

describe('SEC requests (main process)', () => {
  it('writes CIKs as ten digits and rejects anything else', () => {
    expect(secMain.cik10('320193')).toBe('0000320193');
    expect(secMain.cik10('CIK0000320193')).toBe('0000320193');
    expect(secMain.cik10(' 789019 ')).toBe('0000789019');
    expect(secMain.cik10('0')).toBeNull();
    expect(secMain.cik10('12345678901')).toBeNull();
    expect(secMain.cik10('abc')).toBeNull();
    expect(secMain.cik10('../1')).toBeNull();
  });

  it('builds only the SEC URLs the app uses', () => {
    expect(secMain.secRequest('tickers')?.url).toBe('https://www.sec.gov/files/company_tickers.json');
    expect(secMain.secRequest('submissions', '320193')?.url).toBe('https://data.sec.gov/submissions/CIK0000320193.json');
    expect(secMain.secRequest('facts', '320193')?.url).toBe('https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
    expect(secMain.secRequest('submissions-page', 'CIK0000320193-submissions-001.json')?.url).toBe('https://data.sec.gov/submissions/CIK0000320193-submissions-001.json');
    expect(secMain.secRequest('submissions-page', '../../etc/passwd')).toBeNull();
    expect(secMain.secRequest('submissions-page', 'CIK0000320193-submissions-001.json?x=1')).toBeNull();
    expect(secMain.secRequest('submissions', 'x'.repeat(65))).toBeNull();
    expect(secMain.secRequest('frames', 'us-gaap')).toBeNull();
    expect(secMain.secRequest('constructor')).toBeNull();
    expect(secMain.secRequest(42)).toBeNull();
  });

  it('keeps filing lists for minutes and the company list for a day', () => {
    expect(secMain.secRequest('submissions', '1')!.ttl).toBe(5 * 60_000);
    expect(secMain.secRequest('facts', '1')!.ttl).toBe(3600_000);
    expect(secMain.secRequest('tickers')!.ttl).toBe(24 * 3600_000);
    expect(secMain.PER_SECOND).toBeLessThan(10);
  });

  it('drops the oldest cached answers past the size limit', () => {
    const c = new secMain.SecCache(10);
    c.set('a', '123456', 1);
    c.set('b', 'abcdef', 2);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toEqual({ text: 'abcdef', at: 2 });
    expect(c.size).toBe(6);
    // One answer larger than the limit is still kept, alone.
    c.set('c', 'x'.repeat(20), 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')?.at).toBe(3);
    // Replacing an entry does not count it twice.
    c.set('c', 'yy', 4);
    expect(c.size).toBe(2);
  });

  it('explains SEC refusals', () => {
    expect(secMain.refusalReason(403)).toMatch(/User-Agent/);
    expect(secMain.refusalReason(429)).toMatch(/slow down/);
  });
});

describe('SEC company list', () => {
  const text = JSON.stringify({
    0: { cik_str: 1111111, ticker: 'EXMP', title: 'Example Industries Inc.' },
    1: { cik_str: 2222222, ticker: 'BRK-B', title: 'Sample Holdings Corp' },
    2: { cik_str: 2222222, ticker: 'BRK-A', title: 'Sample Holdings Corp' },
    3: { cik_str: 3333333, ticker: 'EXM', title: 'Examplar Mining Ltd' },
    4: { cik_str: 'bad', ticker: 'BAD', title: 'Bad row' },
    5: { cik_str: 4444444, ticker: '', title: 'No ticker' },
  });

  it('parses tickers, CIKs and names and skips broken rows', () => {
    const list = parseTickers(text)!;
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({ cik: 1111111, ticker: 'EXMP', title: 'Example Industries Inc.' });
    expect(parseTickers('not json')).toBeNull();
    expect(parseTickers('{}')).toBeNull();
  });

  it('matches share classes however they are written', () => {
    const list = parseTickers(text)!;
    expect(secTickerKey('brk.b')).toBe('BRK-B');
    expect(findByTicker(list, 'BRK/B')?.cik).toBe(2222222);
    expect(findByTicker(list, 'BRK.B')?.ticker).toBe('BRK-B');
    expect(findByTicker(list, 'NOPE')).toBeUndefined();
  });

  it('searches by exact ticker, then ticker prefix, then name, or by CIK', () => {
    const list = parseTickers(text)!;
    expect(searchCompanies(list, 'exm').map((c) => c.ticker)).toEqual(['EXM', 'EXMP']);
    expect(searchCompanies(list, 'holdings').map((c) => c.ticker)).toEqual(['BRK-B', 'BRK-A']);
    expect(searchCompanies(list, 'CIK1111111').map((c) => c.ticker)).toEqual(['EXMP']);
    expect(searchCompanies(list, '3333333').map((c) => c.ticker)).toEqual(['EXM']);
    expect(searchCompanies(list, '  ')).toEqual([]);
  });

  it('takes the SEC ticker only from US-listed equities', () => {
    const def = (ticker: string, cls = 'equity') => ({ ticker, cls }) as unknown as SecurityDef;
    expect(secTicker(def('AAPL US'))).toBe('AAPL');
    expect(secTicker(def('BRK/B US'))).toBe('BRK-B');
    expect(secTicker(def('7203 JT'))).toBeNull();
    expect(secTicker(def('SPX', 'index'))).toBeNull();
    expect(secTicker(undefined)).toBeNull();
  });
});

describe('SEC filing history', () => {
  const recent = {
    accessionNumber: ['0001111111-25-000010', '0001111111-25-000012', '0001111111-25-000011', 'bad', '0001111111-24-000090'],
    filingDate: ['2025-10-30', '2025-11-03', '2025-10-30', '2025-01-01', '2024-11-01'],
    reportDate: ['2025-09-27', '', '2025-10-30', '', '2024-09-28'],
    acceptanceDateTime: ['2025-10-30T16:30:12.000Z', '2025-11-03T18:01:00.000Z', '2025-10-30T16:31:40.000Z', '', '2024-11-01T06:01:36.000Z'],
    form: ['10-K', '4', '8-K', '8-K', '10-K'],
    items: ['', '', '2.02,9.01', '', ''],
    size: [9000000, 4000, 300000, 1, 8000000],
    isXBRL: [1, 0, 1, 0, 1],
    primaryDocument: ['exmp-20250927.htm', 'xslF345X05/form4.xml', 'exmp-8k.htm', '', 'exmp-20240928.htm'],
    primaryDocDescription: ['10-K', 'FORM 4', '8-K', '', '10-K'],
  };
  const text = JSON.stringify({
    cik: '1111111',
    entityType: 'operating',
    sic: '3571',
    sicDescription: 'Electronic Computers',
    name: 'Example Industries Inc.',
    tickers: ['EXMP'],
    exchanges: ['Nasdaq'],
    fiscalYearEnd: '0927',
    stateOfIncorporation: 'CA',
    category: 'Large accelerated filer',
    formerNames: [{ name: 'EXAMPLE COMPUTER INC', from: '1994-01-26T00:00:00.000Z', to: '2007-01-04T00:00:00.000Z' }],
    filings: { recent, files: [{ name: 'CIK0001111111-submissions-001.json', filingCount: 1234, filingFrom: '1994-01-26', filingTo: '2015-03-03' }, { name: '../evil.json', filingCount: 1 }] },
  });

  it('reads the filer and its filings, newest first, skipping broken rows', () => {
    const f = parseSubmissions(text)!;
    expect(f.cik).toBe(1111111);
    expect(f.name).toBe('Example Industries Inc.');
    expect(f.fiscalYearEnd).toBe('0927');
    expect(f.formerNames).toEqual([{ name: 'EXAMPLE COMPUTER INC', from: '1994-01-26', to: '2007-01-04' }]);
    expect(f.filings.map((x) => x.accession)).toEqual(['0001111111-25-000012', '0001111111-25-000011', '0001111111-25-000010', '0001111111-24-000090']);
    const eightK = f.filings.find((x) => x.form === '8-K')!;
    expect(eightK.items).toEqual(['2.02', '9.01']);
    expect(eightK.report).toBe('2025-10-30');
    expect(eightK.accepted).toBe('2025-10-30T16:31:40.000Z');
    expect(f.filings.find((x) => x.form === '4')!.report).toBeUndefined();
    expect(f.pages).toEqual([{ name: 'CIK0001111111-submissions-001.json', count: 1234, from: '1994-01-26', to: '2015-03-03' }]);
  });

  it('reads an older filings file, which has the columns at the top level', () => {
    expect(parseFilingPage(JSON.stringify(recent))!.length).toBe(4);
    expect(parseFilingPage('{"cik":"1"}')).toBeNull();
    expect(parseSubmissions('{"cik":"x"}')).toBeNull();
  });

  it('links each filing to its document and its index on sec.gov', () => {
    const f = parseSubmissions(text)!;
    const tenK = f.filings.find((x) => x.accession === '0001111111-25-000010')!;
    expect(filingLinks(f.cik, tenK)).toEqual({
      doc: 'https://www.sec.gov/Archives/edgar/data/1111111/000111111125000010/exmp-20250927.htm',
      index: 'https://www.sec.gov/Archives/edgar/data/1111111/0001111111-25-000010-index.html',
    });
    expect(filingLinks(f.cik, { accession: '0001111111-25-000099', form: 'UPLOAD', filed: '2025-01-01' }).doc).toBeUndefined();
  });

  it('sorts forms into groups', () => {
    expect(['10-K', '10-K/A', '10-Q', '20-F', '40-F', 'NT 10-K', '10-KT'].map(formGroup)).toEqual(Array(7).fill('periodic'));
    expect(['8-K', '8-K/A', '6-K'].map(formGroup)).toEqual(Array(3).fill('current'));
    expect(['3', '4', '4/A', '5', '144', 'SC 13G', 'SC 13D/A', 'SCHEDULE 13G/A'].map(formGroup)).toEqual(Array(8).fill('ownership'));
    expect(['DEF 14A', 'DEFA14A', 'PRE 14A', 'DEFM14A'].map(formGroup)).toEqual(Array(4).fill('proxy'));
    expect(['S-1', 'S-3ASR', 'S-8', '424B2', 'FWP', 'F-1'].map(formGroup)).toEqual(Array(6).fill('offering'));
    expect(['CORRESP', 'UPLOAD', '13F-HR', '11-K', '40'].map(formGroup)).toEqual(Array(5).fill('other'));
  });
});

describe('SEC reported figures', () => {
  // Fiscal years end on the last Saturday of September; Q4 is not filed as its own quarter.
  const usd = (start: string | undefined, end: string, val: number, accn: string, fy: number, fp: string, form: string, filed: string) => ({ ...(start ? { start } : {}), end, val, accn, fy, fp, form, filed });
  const K23 = ['0001111111-23-000100', 2023, 'FY', '10-K', '2023-11-03'] as const;
  const K24 = ['0001111111-24-000090', 2024, 'FY', '10-K', '2024-11-01'] as const;
  const Q1 = ['0001111111-24-000010', 2024, 'Q1', '10-Q', '2024-02-02'] as const;
  const Q2 = ['0001111111-24-000040', 2024, 'Q2', '10-Q', '2024-05-03'] as const;
  const Q3 = ['0001111111-24-000070', 2024, 'Q3', '10-Q', '2024-08-02'] as const;
  const facts = {
    cik: 1111111,
    entityName: 'Example Industries Inc.',
    facts: {
      dei: {
        EntityCommonStockSharesOutstanding: { label: 'Shares', units: { shares: [usd(undefined, '2023-10-20', 15_550_061_000, ...K23), usd(undefined, '2024-10-18', 15_115_823_000, ...K24)] } },
      },
      'us-gaap': {
        // FY2022 is only in an older concept; FY2023 is reported twice and was later revised.
        SalesRevenueNet: { units: { USD: [usd('2021-09-26', '2022-09-24', 394_328_000_000, ...K23)] } },
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              usd('2022-09-25', '2023-09-30', 383_285_000_000, ...K23),
              usd('2022-09-25', '2023-09-30', 383_000_000_000, ...K24),
              usd('2023-10-01', '2024-09-28', 391_035_000_000, ...K24),
              usd('2023-10-01', '2023-12-30', 119_575_000_000, ...Q1),
              usd('2023-12-31', '2024-03-30', 90_753_000_000, ...Q2),
              // Six months to date: neither a quarter nor a year.
              usd('2023-10-01', '2024-03-30', 210_328_000_000, ...Q2),
              usd('2024-03-31', '2024-06-29', 85_777_000_000, ...Q3),
            ],
          },
        },
        EarningsPerShareDiluted: { units: { 'USD/shares': [usd('2023-10-01', '2024-09-28', 6.08, ...K24), usd('2022-09-25', '2023-09-30', 6.13, ...K24)] } },
        Assets: { units: { USD: [usd(undefined, '2023-09-30', 352_583_000_000, ...K23), usd(undefined, '2024-09-28', 364_980_000_000, ...K24), usd(undefined, '2024-06-29', 331_612_000_000, ...Q3)] } },
        // Not one of the concepts the app reads: dropped while parsing.
        AccountsPayableCurrent: { units: { USD: [usd(undefined, '2024-09-28', 68_960_000_000, ...K24)] } },
        Liabilities: { units: { USD: [{ end: 'not a date', val: 1, accn: 'x', form: '10-K', filed: '2024-11-01' }] } },
      },
    },
  };
  const parsed = parseCompanyFacts(JSON.stringify(facts))!;

  it('keeps only the concepts the app reads, and only well-formed facts', () => {
    expect(parsed.name).toBe('Example Industries Inc.');
    expect(Object.keys(parsed.facts).sort()).toEqual(['dei:EntityCommonStockSharesOutstanding', 'us-gaap:Assets', 'us-gaap:EarningsPerShareDiluted', 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap:SalesRevenueNet']);
    expect(parseCompanyFacts('{"cik": 0, "facts": {}}')).toBeNull();
    expect(parseCompanyFacts('nope')).toBeNull();
  });

  it('tells years from quarters by their length', () => {
    expect(periodKind('2023-10-01', '2024-09-28')).toBe('annual'); // 52 weeks
    expect(periodKind('2022-09-25', '2023-09-30')).toBe('annual'); // 53 weeks
    expect(periodKind('2023-10-01', '2023-12-30')).toBe('quarter');
    expect(periodKind('2024-01-01', '2024-04-20')).toBe('quarter'); // 16 weeks
    expect(periodKind('2023-10-01', '2024-03-30')).toBeNull(); // six months
    expect(periodKind(undefined, '2024-03-30')).toBeNull();
  });

  it('shows the latest figure for each year and keeps the first one when it changed', () => {
    const rev = lineValues(parsed.facts, line('revenue'), 'USD', 'annual');
    expect([...rev.keys()].sort()).toEqual(['2022-09-24', '2023-09-30', '2024-09-28']);
    const fy23 = rev.get('2023-09-30')!;
    expect(fy23.val).toBe(383_000_000_000);
    expect(fy23.filed).toBe('2024-11-01');
    expect(fy23.restated).toBe(true);
    expect(fy23.orig).toEqual({ val: 383_285_000_000, form: '10-K', filed: '2023-11-03', accn: '0001111111-23-000100', fy: 2023, fp: 'FY' });
    expect(rev.get('2024-09-28')!.restated).toBe(false);
    // The older concept fills the year the preferred one does not have.
    expect(rev.get('2022-09-24')!.concept).toBe('us-gaap:SalesRevenueNet');
  });

  it('names each year from the filing that first reported it, counting back for comparatives', () => {
    expect(parsed.ownEnd['0001111111-23-000100']).toBe('2023-09-30');
    expect(parsed.ownEnd['0001111111-24-000040']).toBe('2024-03-30');
    const cols = periodColumns(parsed, 'USD', 'annual', 6);
    expect(cols.map((c) => [c.end, c.label])).toEqual([
      // First seen as the prior-year comparative in the FY2023 report, whose fy is 2023.
      ['2022-09-24', 'FY2022'],
      ['2023-09-30', 'FY2023'],
      ['2024-09-28', 'FY2024'],
    ]);
    expect(periodColumns(parsed, 'USD', 'annual', 2).map((c) => c.end)).toEqual(['2023-09-30', '2024-09-28']);
  });

  it('gives no fiscal name when the dates do not line up', () => {
    const rep = lineValues(parsed.facts, line('revenue'), 'USD', 'quarter').get('2023-12-30')!;
    expect(fiscalLabel(rep, 'quarter', parsed.ownEnd)).toBe('Q1 FY2024');
    expect(fiscalLabel(rep, 'quarter', {})).toBeUndefined();
    expect(fiscalLabel({ ...rep, end: '2023-08-15' }, 'quarter', parsed.ownEnd)).toBeUndefined();
    expect(fiscalLabel({ ...rep, orig: { ...rep.orig, fp: 'FY' } }, 'quarter', parsed.ownEnd)).toBe('Q4 FY2024');
  });

  it('builds quarterly columns, with the year end for the balance sheet and no invented fourth quarter', () => {
    const cols = periodColumns(parsed, 'USD', 'quarter', 8);
    expect(cols.map((c) => [c.end, c.kind, c.label ?? ''])).toEqual([
      ['2022-09-24', 'annual', 'FY2022'],
      ['2023-09-30', 'annual', 'FY2023'],
      ['2023-12-30', 'quarter', 'Q1 FY2024'],
      ['2024-03-30', 'quarter', 'Q2 FY2024'],
      ['2024-06-29', 'quarter', 'Q3 FY2024'],
      ['2024-09-28', 'annual', 'FY2024'],
    ]);
    const q = lineValues(parsed.facts, line('revenue'), 'USD', 'quarter');
    expect(q.get('2024-03-30')!.val).toBe(90_753_000_000); // the three months, not the six
    expect(q.has('2024-09-28')).toBe(false);
    const assets = lineValues(parsed.facts, line('assets'), 'USD', 'quarter');
    expect(assets.get('2024-06-29')!.val).toBe(331_612_000_000);
    expect(assets.get('2024-09-28')!.val).toBe(364_980_000_000);
  });

  it('reads per-share figures in currency per share', () => {
    const eps = lineValues(parsed.facts, line('epsDil'), 'USD', 'annual');
    expect(eps.get('2024-09-28')!.val).toBe(6.08);
    expect(eps.get('2024-09-28')!.unit).toBe('USD/shares');
  });

  it('takes the latest cover-page share count', () => {
    const s = coverShares(parsed.facts)!;
    expect(s.val).toBe(15_115_823_000);
    expect(s.end).toBe('2024-10-18');
  });

  it('finds the reporting currency of a foreign filer', () => {
    const ifrs = parseCompanyFacts(
      JSON.stringify({
        cik: 5555555,
        entityName: 'Beispiel AG',
        facts: {
          'ifrs-full': {
            Revenue: { units: { EUR: [usd('2024-01-01', '2024-12-31', 34_176_000_000, '0005555555-25-000001', 2024, 'FY', '20-F', '2025-03-01')] } },
            Assets: { units: { EUR: [usd(undefined, '2024-12-31', 74_000_000_000, '0005555555-25-000001', 2024, 'FY', '20-F', '2025-03-01')] } },
          },
        },
      }),
    )!;
    expect(reportingCurrency(ifrs.facts)).toBe('EUR');
    expect(lineValues(ifrs.facts, line('revenue'), 'EUR', 'annual').get('2024-12-31')!.concept).toBe('ifrs-full:Revenue');
  });
});
