import { describe, expect, it } from 'vitest';
import * as secMain from '../electron/sec.cjs';
import { parsePayVsPerformance } from '../src/data/live/proxypay';
import { parseFilingIndex } from '../src/data/live/sec';

// The shape of an XBRL instance EDGAR extracts from a proxy statement's inline XBRL (name_htm.xml): contexts by
// fiscal year, one with two chief executives on ecd:IndividualAxis, and adjustment contexts that are not table figures.
const ctx = (id: string, start: string, end: string, members = '') =>
  `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001234567</xbrli:identifier>${members ? `<xbrli:segment>${members}</xbrli:segment>` : ''}</xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
const member = (axis: string, m: string) => `<xbrldi:explicitMember dimension="${axis}">${m}</xbrldi:explicitMember>`;
const XML = `<?xml version="1.0"?><xbrli:xbrl xmlns:ecd="http://xbrl.sec.gov/ecd/2024">
${ctx('c-1', '2025-01-01', '2025-12-31')}
${ctx('c-2', '2024-01-01', '2024-12-31')}
${ctx('c-3', '2024-01-01', '2024-12-31', member('ecd:IndividualAxis', 'abc:JaneRoeMember'))}
${ctx('c-4', '2024-01-01', '2024-12-31', member('ecd:IndividualAxis', 'abc:JohnDoeMember'))}
${ctx('c-5', '2025-01-01', '2025-12-31', member('ecd:IndividualAxis', 'abc:JaneRoeMember') + member('ecd:AdjustmentToCompensationAxis', 'abc:StockAwardsMember'))}
<ecd:PeoName contextRef="c-1" id="f1">Jane Roe</ecd:PeoName>
<ecd:PeoTotalCompAmt contextRef="c-1" unitRef="usd" decimals="0" id="f2">24813592</ecd:PeoTotalCompAmt>
<ecd:PeoActuallyPaidCompAmt unitRef="usd" decimals="0" contextRef="c-1" id="f3">31004211</ecd:PeoActuallyPaidCompAmt>
<ecd:NonPeoNeoAvgTotalCompAmt contextRef="c-1" unitRef="usd" decimals="0" id="f4">6120400</ecd:NonPeoNeoAvgTotalCompAmt>
<ecd:NonPeoNeoAvgCompActuallyPaidAmt contextRef="c-1" unitRef="usd" decimals="0" id="f5">5200000</ecd:NonPeoNeoAvgCompActuallyPaidAmt>
<ecd:PeoName contextRef="c-3" id="f6">Jane Roe</ecd:PeoName>
<ecd:PeoTotalCompAmt contextRef="c-3" unitRef="usd" decimals="0" id="f7">9000000</ecd:PeoTotalCompAmt>
<ecd:PeoActuallyPaidCompAmt contextRef="c-3" unitRef="usd" decimals="0" sign="-" id="f8">1500000</ecd:PeoActuallyPaidCompAmt>
<ecd:PeoTotalCompAmt contextRef="c-4" unitRef="usd" decimals="0" id="f9">15000000</ecd:PeoTotalCompAmt>
<ecd:NonPeoNeoAvgTotalCompAmt contextRef="c-2" unitRef="usd" decimals="0" id="f10">4000000</ecd:NonPeoNeoAvgTotalCompAmt>
<ecd:PeoTotalCompAmt contextRef="c-5" unitRef="usd" decimals="0" id="f11">-12000000</ecd:PeoTotalCompAmt>
</xbrli:xbrl>`;

describe("executive pay from a proxy statement's pay-versus-performance table", () => {
  it("reads the chief executive's total and actually paid compensation, and the other executives' averages, by year", () => {
    const years = parsePayVsPerformance(XML);
    expect(years.map((y) => y.end)).toEqual(['2025-12-31', '2024-12-31']);
    expect(years[0]).toMatchObject({ peoTotal: 24813592, peoPaid: 31004211, neoAvgTotal: 6120400, neoAvgPaid: 5200000, peos: [{ name: 'Jane Roe', total: 24813592, paid: 31004211 }] });
  });

  it('lists each of several chief executives in a year, by the name tagged or the member, and ignores adjustment rows', () => {
    const y2024 = parsePayVsPerformance(XML)[1];
    expect(y2024.neoAvgTotal).toBe(4000000);
    expect(y2024.peos).toEqual([
      { name: 'Jane Roe', total: 9000000, paid: -1500000 },
      { name: 'John Doe', total: 15000000, paid: NaN },
    ]);
    // The adjustment (stock awards deducted) never replaces the year's total.
    expect(parsePayVsPerformance(XML)[0].peoTotal).toBe(24813592);
  });

  it('reads an instance written without the xbrli prefix, as in Fabrinet\'s 2024 proxy', () => {
    const xml = '<xbrl><context id="c0"><entity><identifier scheme="http://www.sec.gov/CIK">0001408710</identifier></entity><period><startDate>2023-07-01</startDate><endDate>2024-06-28</endDate></period></context>'
      + '<ecd:PeoTotalCompAmt contextRef="c0" decimals="0" id="ixv-24055" unitRef="usd">11082191</ecd:PeoTotalCompAmt>'
      + '<ecd:PeoName contextRef="c0" id="ixv-24087">Seamus Grady</ecd:PeoName>'
      + '<ecd:NonPeoNeoAvgTotalCompAmt contextRef="c0" decimals="0" id="ixv-24057" unitRef="usd">5460058</ecd:NonPeoNeoAvgTotalCompAmt>'
      + '<ecd:PeoTotalCompAmt contextRef="c0" decimals="0" id="ixv-24091" unitRef="usd">11082191</ecd:PeoTotalCompAmt></xbrl>';
    expect(parsePayVsPerformance(xml)).toEqual([{ end: '2024-06-28', peoTotal: 11082191, peoPaid: NaN, neoAvgTotal: 5460058, neoAvgPaid: NaN, peos: [{ name: 'Seamus Grady', total: 11082191, paid: NaN }] }]);
  });

  it('asks the SEC only for a filing folder index or its extracted XBRL instance', () => {
    expect(secMain.secRequest('filing-index', '1234567/000123456726000012')?.url).toBe('https://www.sec.gov/Archives/edgar/data/1234567/000123456726000012/index.json');
    expect(secMain.secRequest('filing-xbrl', '1234567/000123456726000012/abc-20260401_htm.xml')?.url).toBe('https://www.sec.gov/Archives/edgar/data/1234567/000123456726000012/abc-20260401_htm.xml');
    for (const bad of ['1234567/000123456726000012/../../x_htm.xml', '1234567/000123456726000012/abc.htm', '0001234567/000123456726000012', '1234567/12/x_htm.xml']) {
      expect(secMain.secRequest(bad.endsWith('.xml') || bad.endsWith('.htm') ? 'filing-xbrl' : 'filing-index', bad)).toBeNull();
    }
  });

  it("reads the file names of a filing's folder", () => {
    expect(parseFilingIndex(JSON.stringify({ directory: { item: [{ name: 'abc-20260401.htm' }, { name: 'abc-20260401_htm.xml' }] } }))).toEqual(['abc-20260401.htm', 'abc-20260401_htm.xml']);
    expect(parseFilingIndex('not json')).toBeNull();
  });
});
