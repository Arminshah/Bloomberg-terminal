import { describe, expect, it } from 'vitest';
import * as secMain from '../electron/sec.cjs';
import { displayName, ownershipFile, parseOwnership, summarize, type Trade } from '../src/data/live/insiders';
import { matchOfficer } from '../src/functions/MGMT';
import type { Officer } from '../src/data/live/yfund';

// The shape of an EDGAR Form 4 (schema X0508): an officer's 10b5-1 sale, the shares from an option exercise, the
// shares withheld for tax, and the exercised option in the derivative table.
const form4 = `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0508</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2026-09-30</periodOfReport>
  <aff10b5One>1</aff10b5One>
  <issuer><issuerCik>0001144879</issuerCik><issuerName>Applied Digital Corp.</issuerName><issuerTradingSymbol>APLD</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0001825331</rptOwnerCik><rptOwnerName>CUMMINS WES</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><isTenPercentOwner>0</isTenPercentOwner><officerTitle>Chairman &amp; CEO</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-09-29</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>M</transactionCode><equitySwapInvolved>0</equitySwapInvolved></transactionCoding>
      <transactionAmounts><transactionShares><value>10,000</value></transactionShares><transactionPricePerShare><value>5.00</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>1010000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-09-30</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>S</transactionCode><equitySwapInvolved>0</equitySwapInvolved><footnoteId id="F1"/></transactionCoding>
      <transactionAmounts><transactionShares><value>50000</value></transactionShares><transactionPricePerShare><value>18.52</value><footnoteId id="F2"/></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>960000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-09-30</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>F</transactionCode><equitySwapInvolved>0</equitySwapInvolved></transactionCoding>
      <transactionAmounts><transactionShares><value>3000</value></transactionShares><transactionPricePerShare><value>18.40</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>957000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeHolding>
      <securityTitle><value>Common Stock</value></securityTitle>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>250000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>I</value></directOrIndirectOwnership><natureOfOwnership><value>By trust</value></natureOfOwnership></ownershipNature>
    </nonDerivativeHolding>
  </nonDerivativeTable>
  <derivativeTable>
    <derivativeTransaction>
      <securityTitle><value>Stock Option (right to buy)</value></securityTitle>
      <conversionOrExercisePrice><value>5.00</value></conversionOrExercisePrice>
      <transactionDate><value>2026-09-29</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>M</transactionCode><equitySwapInvolved>0</equitySwapInvolved></transactionCoding>
      <transactionAmounts><transactionShares><value>10000</value></transactionShares><transactionPricePerShare><value>0</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <underlyingSecurity><underlyingSecurityTitle><value>Common Stock</value></underlyingSecurityTitle><underlyingSecurityShares><value>10000</value></underlyingSecurityShares></underlyingSecurity>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>90000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </derivativeTransaction>
  </derivativeTable>
  <footnotes><footnote id="F1">The sales were effected under a Rule 10b5-1 trading plan adopted on March 3, 2026.</footnote><footnote id="F2">Weighted average price.</footnote></footnotes>
</ownershipDocument>`;

const award = `<ownershipDocument><documentType>4</documentType>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0001900001</rptOwnerCik><rptOwnerName>Zhang Jason</rptOwnerName></reportingOwnerId>
  <reportingOwnerRelationship><isOfficer>true</isOfficer><officerTitle>President</officerTitle></reportingOwnerRelationship></reportingOwner>
  <nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-07-15</value></transactionDate>
  <transactionCoding><transactionCode>A</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>40000</value></transactionShares><transactionPricePerShare><footnoteId id="F1"/></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
  <postTransactionAmounts><sharesOwnedFollowingTransaction><value>540000</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>
  <nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-08-01</value></transactionDate>
  <transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>2000</value></transactionShares><transactionPricePerShare><value>12.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
  <postTransactionAmounts><sharesOwnedFollowingTransaction><value>542000</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction></nonDerivativeTable>
</ownershipDocument>`;

const trades = (xml: string, filed: string): Trade[] => {
  const f = parseOwnership(xml)!;
  return f.trades.map((t) => ({ ...t, owner: f.owner, plan: f.plan, filed, link: `https://www.sec.gov/${filed}` }));
};

describe("insiders' Form 4 filings", () => {
  it('reads the owner, every transaction with its code, shares, price and holding after, and the 10b5-1 plan', () => {
    const f = parseOwnership(form4)!;
    expect(f.owner).toMatchObject({ cik: '1825331', secName: 'CUMMINS WES', name: 'Wes Cummins', title: 'Chairman & CEO', director: true, officer: true, tenPercent: false });
    expect(f.plan).toBe(true);
    expect(f.trades).toHaveLength(4);
    expect(f.trades[0]).toMatchObject({ date: '2026-09-29', code: 'M', kind: 'other', shares: 10_000, price: 5, acquired: true, after: 1_010_000, direct: true, derivative: false });
    expect(f.trades[1]).toMatchObject({ code: 'S', kind: 'sell', shares: 50_000, price: 18.52, acquired: false, after: 960_000 });
    expect(f.trades[2]).toMatchObject({ code: 'F', kind: 'tax', shares: 3000 });
    expect(f.trades[3]).toMatchObject({ code: 'M', kind: 'exercise', shares: 10_000, derivative: true, exercisePrice: 5, security: 'Stock Option (right to buy)' });
    // An indirect holding is not the insider's own direct holding.
    expect(f.heldDirect).toBeNaN();
    expect(parseOwnership('<html></html>')).toBeNull();
  });

  it('reads an award without a price as a grant of shares', () => {
    const f = parseOwnership(award)!;
    expect(f.owner).toMatchObject({ name: 'Jason Zhang', title: 'President', officer: true, director: false });
    expect(f.trades[0]).toMatchObject({ code: 'A', kind: 'award', shares: 40_000, acquired: true });
    expect(f.trades[0].price).toBeNaN();
    expect(f.plan).toBe(false);
  });

  it('totals each insider and all of them: bought, sold, received, exercised, withheld, net and held after', () => {
    const { people, all } = summarize([...trades(form4, '2026-10-01'), ...trades(award, '2026-08-03')]);
    const wes = people.find((p) => p.owner.name === 'Wes Cummins')!;
    expect(wes.sold).toEqual({ shares: 50_000, value: 926_000, count: 1 });
    expect(wes.exercised.shares).toBe(10_000);
    expect(wes.taxWithheld.shares).toBe(3000);
    // +10,000 from the exercise, -50,000 sold, -3,000 withheld; the option itself is not a share.
    expect(wes.netShares).toBe(-43_000);
    // The holding after the day's last transaction (the shares withheld for tax).
    expect(wes).toMatchObject({ heldAfter: 957_000, heldAsOf: '2026-09-30', last: '2026-09-30', trades: 4 });
    const jason = people.find((p) => p.owner.name === 'Jason Zhang')!;
    expect(jason.bought).toEqual({ shares: 2000, value: 25_000, count: 1 });
    expect(jason.awarded.shares).toBe(40_000);
    expect(jason).toMatchObject({ netShares: 42_000, heldAfter: 542_000 });
    // The biggest trader by value first.
    expect(people[0].owner.name).toBe('Wes Cummins');
    expect(all).toMatchObject({ buyers: 1, sellers: 1, netShares: -1000, trades: 6 });
    expect(all.sold.value).toBe(926_000);
  });

  it("names insiders first name first, keeps a company's name, and matches Yahoo's officers to them", () => {
    expect(displayName('MOHMAND MOHAMMAD SAIDAL L.')).toBe('Mohammad Saidal L. Mohmand');
    expect(displayName('Vanguard Group Inc')).toBe('Vanguard Group Inc');
    expect(displayName('BLACKROCK INC.')).toBe('Blackrock Inc.');
    const { people } = summarize([...trades(form4, '2026-10-01'), ...trades(award, '2026-08-03')]);
    const officer = (name: string): Officer => ({ name, title: '', age: NaN, yearBorn: NaN, totalPay: NaN, exercised: NaN, unexercised: NaN, fiscalYear: NaN });
    expect(matchOfficer(officer('Wesley Cummins'), people)?.owner.secName).toBe('CUMMINS WES');
    expect(matchOfficer(officer('Jason Zhang'), people)?.owner.secName).toBe('Zhang Jason');
    expect(matchOfficer(officer('Laura Laltrello'), people)).toBeUndefined();
    expect(matchOfficer(officer('Mark Cummins'), people)).toBeUndefined();
  });

  it("reads a filing's own XML, not EDGAR's style-sheet view, through an allowed request", () => {
    expect(ownershipFile({ accession: '0001825331-26-000004', form: '4', filed: '2026-10-01', doc: 'xslF345X05/wk-form4_1759.xml' })).toBe('wk-form4_1759.xml');
    expect(ownershipFile({ accession: '0001825331-26-000004', form: '4', filed: '2026-10-01', doc: 'form4.htm' })).toBeNull();
    expect(secMain.secRequest('ownership-xml', '1144879/000182533126000004/wk-form4_1759.xml')).toEqual({ url: 'https://www.sec.gov/Archives/edgar/data/1144879/000182533126000004/wk-form4_1759.xml', ttl: 7 * 24 * 3_600_000 });
    for (const bad of ['1144879/000182533126000004/../x.xml', '1144879/0001/x.xml', '1144879/000182533126000004/x.htm']) expect(secMain.secRequest('ownership-xml', bad), bad).toBeNull();
  });
});
