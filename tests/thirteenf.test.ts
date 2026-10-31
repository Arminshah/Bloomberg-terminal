import { describe, expect, it } from 'vitest';
import { folderPath, parseCover, parseInfoTable, tableCandidates } from '../electron/thirteenf.cjs';
import { cleanCodes, FigiStore, idType, LIMITS, mappingJobs, parseMapping } from '../electron/openfigi.cjs';
import * as providers from '../electron/providers.cjs';
import { combineQuarter, compareQuarters, impliedPrice, previousQuarterEnd, quartersOf, quarterTotals, valueUnit, type Answer13F } from '../src/data/live/thirteenf';
import type { Filing } from '../src/data/live/sec';
import nvda2026q2Primary from './fixtures/13f/nvda-2026q2-primary.xml?raw';
import nvda2026q2Infotable from './fixtures/13f/nvda-2026q2-infotable.xml?raw';
import nvda2026q1Primary from './fixtures/13f/nvda-2026q1-primary.xml?raw';
import nvda2026q1Infotable from './fixtures/13f/nvda-2026q1-infotable.xml?raw';
import brk2026q2Primary from './fixtures/13f/brk-2026q2-primary.xml?raw';
import brk2026q2Infotable from './fixtures/13f/brk-2026q2-infotable.xml?raw';
import brk2025q1AmendmentPrimary from './fixtures/13f/brk-2025q1-amendment-primary.xml?raw';
import brk2025q1AmendmentInfotable from './fixtures/13f/brk-2025q1-amendment-infotable.xml?raw';
import qcom2022q3Primary from './fixtures/13f/qcom-2022q3-primary.xml?raw';
import qcom2022q3Infotable from './fixtures/13f/qcom-2022q3-infotable.xml?raw';

// Real filings from SEC EDGAR, as filed: NVIDIA's 13F-HR for the first two quarters of 2026, Berkshire Hathaway's
// for the second (89 lines under several other managers), Berkshire's amendment adding holdings it had kept
// confidential for the first quarter of 2025, and Qualcomm's for the third quarter of 2022 (values in thousands,
// tags with a namespace prefix).
const FILES: Record<string, string> = {
  'nvda-2026q2-primary.xml': nvda2026q2Primary,
  'nvda-2026q2-infotable.xml': nvda2026q2Infotable,
  'nvda-2026q1-primary.xml': nvda2026q1Primary,
  'nvda-2026q1-infotable.xml': nvda2026q1Infotable,
  'brk-2026q2-primary.xml': brk2026q2Primary,
  'brk-2026q2-infotable.xml': brk2026q2Infotable,
  'brk-2025q1-amendment-primary.xml': brk2025q1AmendmentPrimary,
  'brk-2025q1-amendment-infotable.xml': brk2025q1AmendmentInfotable,
  'qcom-2022q3-primary.xml': qcom2022q3Primary,
  'qcom-2022q3-infotable.xml': qcom2022q3Infotable,
};
const read = (name: string) => FILES[name];
const filing = (accession: string, form: string, filed: string, report: string): Filing => ({ accession, form, filed, report });
const answer = (primary: string, table?: string): Answer13F => {
  const t = table ? parseInfoTable(read(table))! : null;
  return { status: 200, cover: parseCover(read(primary))!, ...(t ? { holdings: t.holdings, unread: t.unread } : {}) };
};

describe('a 13F as filed', () => {
  it("reads NVIDIA's cover and table, the lines adding up to the filed total", () => {
    const cover = parseCover(read('nvda-2026q2-primary.xml'))!;
    expect(cover).toMatchObject({ manager: 'NVIDIA CORP', period: '2026-06-30', submissionType: '13F-HR', reportType: '13F HOLDINGS REPORT', amendment: false, entries: 8, total: 63439974569, confidentialOmitted: false, signed: '2026-08-14' });
    const t = parseInfoTable(read('nvda-2026q2-infotable.xml'))!;
    expect(t.rows).toBe(8);
    expect(t.unread).toBe(0);
    expect(t.valueSum).toBe(cover.total);
    expect(t.holdings[0]).toMatchObject({ issuer: 'INTEL CORP', cls: 'COM', cusip: '458140100', type: 'SH', putCall: '', value: 29989261126, amount: 214776632, rows: 1 });
    expect(t.holdings.map((h) => h.cusip)).toContain('N97284108');
  });

  it("adds up a security's lines under other managers, as Berkshire files them", () => {
    const cover = parseCover(read('brk-2026q2-primary.xml'))!;
    expect(cover.entries).toBe(89);
    expect(cover.included.length).toBe(14);
    const t = parseInfoTable(read('brk-2026q2-infotable.xml'))!;
    expect(t.rows).toBe(89);
    expect(t.holdings).toHaveLength(29);
    expect(t.valueSum).toBe(299253556246);
    expect(t.holdings.find((h) => h.cusip === '037833100')).toMatchObject({ issuer: 'APPLE INC', amount: 227917808, value: 65950296923, rows: 12 });
  });

  it('reads tags with a namespace prefix, and older values in thousands of dollars', () => {
    const cover = parseCover(read('qcom-2022q3-primary.xml'))!;
    expect(cover).toMatchObject({ manager: 'QUALCOMM INC/DE', period: '2022-09-30', total: 85707, entries: 10 });
    const t = parseInfoTable(read('qcom-2022q3-infotable.xml'))!;
    expect(t.rows).toBe(10);
    expect(t.valueSum).toBe(85707);
    expect(valueUnit('2022-11-10')).toBe(1000);
    expect(valueUnit('2023-01-03')).toBe(1);
    const q = combineQuarter('2022-09-30', [{ filing: filing('0000804328-22-000022', '13F-HR', '2022-11-10', '2022-09-30'), answer: answer('qcom-2022q3-primary.xml', 'qcom-2022q3-infotable.xml') }]);
    expect(q.total).toBe(85707000);
    expect(q.filedTotal).toBe(85707000);
    // Airspan's 2,260,630 shares at $4,566 thousand: $2.02 each.
    expect(impliedPrice(q.positions.find((p) => p.cusip === '00951K104')!)).toBeCloseTo(2.0198, 3);
  });

  it('reads an amendment: its type, and that confidential treatment ended', () => {
    expect(parseCover(read('brk-2025q1-amendment-primary.xml'))).toMatchObject({ amendment: true, amendmentNo: 1, amendmentType: 'NEW HOLDINGS', confidentialEnded: true, period: '2025-03-31', entries: 4, total: 1106550356 });
  });

  it('refuses what is not a 13F, and finds the table among the files', () => {
    expect(parseCover('<ownershipDocument/>')).toBeNull();
    expect(parseInfoTable('<html></html>')).toBeNull();
    expect(tableCandidates(['0001-index.html', 'primary_doc.xml', '56757.xml', 'x.txt', 'form13fInfoTable.xml'])).toEqual(['form13fInfoTable.xml', '56757.xml']);
    expect(folderPath(1045810, '0001045810-26-000065')).toBe('1045810/000104581026000065');
    expect(folderPath('0', '0001045810-26-000065')).toBeNull();
    expect(folderPath(1045810, '../../x')).toBeNull();
  });

  it('decodes entities in names', () => {
    const t = parseInfoTable('<informationTable><infoTable><nameOfIssuer>AT&amp;T INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>00206R102</cusip><value>10</value><shrsOrPrnAmt><sshPrnamt>1</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Put</putCall></infoTable></informationTable>')!;
    expect(t.holdings[0]).toMatchObject({ issuer: 'AT&T INC', putCall: 'Put' });
  });
});

describe("a quarter's holdings and the change since the quarter before", () => {
  const nvda = (q: 1 | 2) =>
    combineQuarter(q === 2 ? '2026-06-30' : '2026-03-31', [
      { filing: filing(q === 2 ? '0001045810-26-000065' : '0001045810-26-000042', '13F-HR', q === 2 ? '2026-08-14' : '2026-05-15', q === 2 ? '2026-06-30' : '2026-03-31'), answer: answer(`nvda-2026q${q}-primary.xml`, `nvda-2026q${q}-infotable.xml`) },
    ]);

  it("compares NVIDIA's two quarters: SpaceX new, the other seven unchanged", () => {
    const q2 = nvda(2);
    const q1 = nvda(1);
    expect(q2.total).toBe(63439974569);
    expect(q1.total).toBe(18374354150);
    const { rows, sold } = compareQuarters(q2.positions, q1.positions);
    expect(rows.filter((r) => r.change === 'new').map((r) => r.issuer)).toEqual(['SPACE EXPLORATION TECHN CORP']);
    expect(rows.filter((r) => r.change === 'same')).toHaveLength(7);
    expect(sold).toHaveLength(0);
    // Without the quarter before, nothing is called new.
    expect(compareQuarters(q2.positions, null).rows.every((r) => r.change === null)).toBe(true);
  });

  it('marks holdings added, reduced and sold out', () => {
    const p = (cusip: string, amount: number) => ({ key: `${cusip}|SH|`, cusip, issuer: cusip, cls: 'COM', type: 'SH' as const, putCall: '' as const, value: amount * 10, amount });
    const { rows, sold } = compareQuarters([p('A00000001', 150), p('B00000001', 50)], [p('A00000001', 100), p('B00000001', 100), p('C00000001', 7)]);
    expect(rows.map((r) => [r.change, r.diff, r.diffPct])).toEqual([['added', 50, 50], ['reduced', -50, -50]]);
    expect(sold.map((r) => [r.cusip, r.change, r.prevAmount])).toEqual([['C00000001', 'sold', 7]]);
  });

  it('adds a new-holdings amendment to the report, and a restatement replaces it', () => {
    // Berkshire's 2026 report stands in for the one the amendment adds to; all four of the amendment's stocks are in it.
    const report = { filing: filing('0000950123-25-000001', '13F-HR', '2025-05-15', '2025-03-31'), answer: answer('brk-2026q2-primary.xml', 'brk-2026q2-infotable.xml') };
    const added = { filing: filing('0000950123-25-008361', '13F-HR/A', '2025-08-14', '2025-03-31'), answer: answer('brk-2025q1-amendment-primary.xml', 'brk-2025q1-amendment-infotable.xml') };
    const q = combineQuarter('2025-03-31', [added, report]);
    expect(q.filings.map((f) => f.use)).toEqual(['report', 'added']);
    expect(q.positions).toHaveLength(29);
    expect(q.positions.find((p) => p.cusip === '670346105')!.amount).toBe(1857752 + 5756510);
    expect(q.total).toBe(299253556246 + 1106550356);
    expect(q.filedTotal).toBe(q.total);
    const restated = { ...added, answer: { ...added.answer, cover: { ...added.answer.cover!, amendmentType: 'RESTATEMENT' } } };
    const r = combineQuarter('2025-03-31', [report, restated]);
    expect(r.filings.map((f) => f.use)).toEqual(['report', 'restatement']);
    expect(r.positions).toHaveLength(4);
    expect(r.total).toBe(1106550356);
  });

  it('reads a new-holdings amendment that repeats the whole report as a restatement, counting nothing twice', () => {
    // JPMorgan's third quarter of 2025, as filed: the report, then a 13F-HR/A marked NEW HOLDINGS with the same 32,847 lines.
    const base = parseCover(read('nvda-2026q2-primary.xml'))!;
    const report = { filing: filing('0000019617-25-001081', '13F-HR', '2025-11-07', '2025-09-30'), cover: { ...base, entries: 32847, total: 1669071139042 } };
    const amendment = { filing: filing('0000019617-25-001093', '13F-HR/A', '2025-11-26', '2025-09-30'), cover: { ...base, amendment: true, amendmentNo: 1, amendmentType: 'NEW HOLDINGS', entries: 32847, total: 1669077787156 } };
    expect(quarterTotals('2025-09-30', [amendment, report])).toEqual({ period: '2025-09-30', total: 1669077787156, entries: 32847, notice: false });
    // Berkshire's real new holdings: 4 lines added to a report of 89.
    const added = { filing: filing('0000950123-25-008361', '13F-HR/A', '2025-08-14', '2025-03-31'), cover: parseCover(read('brk-2025q1-amendment-primary.xml'))! };
    const brk = { filing: filing('0000950123-25-000001', '13F-HR', '2025-05-15', '2025-03-31'), cover: parseCover(read('brk-2026q2-primary.xml'))! };
    expect(quarterTotals('2025-03-31', [brk, added])).toMatchObject({ total: 299253556246 + 1106550356, entries: 93 });
    // The same with the lines: NVIDIA's table filed twice, the second time as "new holdings".
    const lines = parseInfoTable(read('nvda-2026q2-infotable.xml'))!.holdings;
    const q = combineQuarter('2026-06-30', [
      { filing: filing('0001045810-26-000065', '13F-HR', '2026-08-14', '2026-06-30'), answer: { status: 200, cover: base, holdings: lines } },
      { filing: filing('0001045810-26-000099', '13F-HR/A', '2026-08-20', '2026-06-30'), answer: { status: 200, cover: { ...base, amendment: true, amendmentType: 'NEW HOLDINGS' }, holdings: lines } },
    ]);
    expect(q.total).toBe(63439974569);
    expect(q.filedTotal).toBe(63439974569);
    expect(q.filings.map((f) => [f.use, f.repeated ?? false])).toEqual([['report', false], ['restatement', true]]);
  });

  it('a quarter of notices only has no holdings', () => {
    const cover = { ...parseCover(read('nvda-2026q2-primary.xml'))!, reportType: '13F NOTICE', reportedBy: [{ name: 'Example Advisers LLC', fileNumber: '028-00001' }] };
    const q = combineQuarter('2026-06-30', [{ filing: filing('0000000001-26-000001', '13F-NT', '2026-08-14', '2026-06-30'), answer: { status: 200, cover } }]);
    expect(q).toMatchObject({ notice: true, positions: [], reportedBy: ['Example Advisers LLC'], filedTotal: null });
  });

  it('groups the filings by quarter, the latest first, and knows the quarter before', () => {
    const qs = quartersOf([
      filing('a', '13F-HR', '2026-08-14', '2026-06-30'),
      filing('b', '10-Q', '2026-08-01', '2026-06-30'),
      filing('c', '13F-HR/A', '2026-05-20', '2026-03-31'),
      filing('d', '13F-HR', '2026-05-15', '2026-03-31'),
      filing('e', '4', '2026-05-01', '2026-04-29'),
    ]);
    expect(qs.map((q) => [q.period, q.filings.map((f) => f.accession)])).toEqual([['2026-06-30', ['a']], ['2026-03-31', ['d', 'c']]]);
    expect(previousQuarterEnd('2026-06-30')).toBe('2026-03-31');
    expect(previousQuarterEnd('2026-03-31')).toBe('2025-12-31');
    expect(previousQuarterEnd('2025-12-31')).toBe('2025-09-30');
  });
});

describe('tickers for CUSIPs from OpenFIGI', () => {
  it('asks for US listings, CINS codes as such, within the limits', () => {
    expect(cleanCodes(['458140100', 'n97284108', '458140100'])).toEqual(['458140100', 'N97284108']);
    expect(cleanCodes(['45814010'])).toBeNull();
    expect(cleanCodes(['458140100; DROP'])).toBeNull();
    expect(cleanCodes('458140100')).toBeNull();
    expect(idType('458140100')).toBe('ID_CUSIP');
    expect(idType('N97284108')).toBe('ID_CINS');
    expect(mappingJobs(['N97284108'])).toEqual([{ idType: 'ID_CINS', idValue: 'N97284108', exchCode: 'US' }]);
    expect(LIMITS.keyed.jobs).toBe(100);
    expect(LIMITS.open.jobs).toBe(10);
    expect(LIMITS.keyed.perMinute).toBeLessThan(250);
    expect(LIMITS.open.perMinute).toBeLessThan(25);
  });

  it("reads OpenFIGI's answer, one entry per code", () => {
    // As OpenFIGI answered on 25 October 2026 for Coherent, Nebius (asked as a CUSIP) and Nokia's ADR.
    const body = JSON.stringify([
      { data: [{ figi: 'BBG000BLW102', name: 'COHERENT CORP', ticker: 'COHR', exchCode: 'US', compositeFIGI: 'BBG000BLW102', securityType: 'Common Stock', marketSector: 'Equity', shareClassFIGI: 'BBG001S5S6N6', securityType2: 'Common Stock', securityDescription: 'COHR' }] },
      { warning: 'No identifier found.' },
      { data: [{ figi: 'BBG000BNGBW9', name: 'NOKIA CORP-SPON ADR', ticker: 'NOK', exchCode: 'US', compositeFIGI: 'BBG000BNGBW9', securityType: 'ADR', marketSector: 'Equity', shareClassFIGI: 'BBG001SCPCG9', securityType2: 'Depositary Receipt', securityDescription: 'NOK' }] },
    ]);
    const codes = ['19247G107', 'N97284108', '654902204'];
    expect(parseMapping(body, codes)).toEqual({
      '19247G107': { ticker: 'COHR', name: 'COHERENT CORP', securityType: 'Common Stock', figi: 'BBG000BLW102' },
      N97284108: { none: true },
      '654902204': { ticker: 'NOK', name: 'NOKIA CORP-SPON ADR', securityType: 'Depositary Receipt', figi: 'BBG000BNGBW9' },
    });
    expect(parseMapping(body, codes.slice(0, 2))).toBeNull();
    expect(parseMapping('not json', codes)).toBeNull();
    expect(parseMapping(JSON.stringify([{ error: 'Unexpected error' }]), ['19247G107'])).toEqual({ '19247G107': { error: 'Unexpected error' } });
  });

  it('keeps a ticker a week and a code without one a day, never an error', () => {
    const s = new FigiStore();
    s.set('19247G107', { ticker: 'COHR' }, 0);
    s.set('N97284108', { none: true }, 0);
    s.set('654902204', { error: 'x' }, 0);
    expect(s.get('19247G107', 6 * 86_400_000)?.value.ticker).toBe('COHR');
    expect(s.get('19247G107', 8 * 86_400_000)).toBeUndefined();
    expect(s.get('N97284108', 3_600_000)?.value.none).toBe(true);
    expect(s.get('N97284108', 2 * 86_400_000)).toBeUndefined();
    expect(s.get('654902204', 0)).toBeUndefined();
    const t = new FigiStore();
    t.load(JSON.parse(JSON.stringify(s)));
    expect(t.get('19247G107', 1)?.value.ticker).toBe('COHR');
  });

  it('takes the OpenFIGI key in its own form and from a pasted line', () => {
    const uuid = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    expect(providers.CREDENTIALS.OPENFIGI_API_KEY.valid(uuid)).toBe(true);
    expect(providers.CREDENTIALS.OPENFIGI_API_KEY.valid('not-a-key')).toBe(false);
    expect(providers.parseCredentialList(`OpenFIGI: ${uuid}`).found).toEqual([{ name: 'OPENFIGI_API_KEY', value: uuid }]);
  });
});
