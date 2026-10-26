import { describe, expect, it } from 'vitest';
import { billKey, billName, billRef, congressOn, paragraphs, parseBill, parseBillList, parseParts, stageOf } from '../src/data/live/legislation';
import { findBills } from '../src/functions/BILL';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as gov from '../electron/congressgov.cjs';
import * as providers from '../electron/providers.cjs';
import cg from './fixtures/congressgov-2026-10.json';

// Congress.gov's answers as given on 26 October 2026: the 25 latest bills by update, the first 20 laws of the 119th
// Congress, and H.R. 7831 (the License to Drill Act) with its parts.
describe('U.S. legislation (BILL)', () => {
  const latest = parseBillList(JSON.stringify(cg.bills))!;
  const laws = parseBillList(JSON.stringify(cg.laws))!;

  it("reads the latest bills and the Congress's laws, with the totals", () => {
    expect(latest.bills).toHaveLength(25);
    expect(latest.count).toBe(431049);
    expect(laws.count).toBe(136);
    const law = laws.bills.find((b) => b.number === '7831')!;
    expect(law).toMatchObject({ congress: 119, type: 'HR', title: 'License to Drill Act', laws: ['119-134'] });
    expect(billName(law)).toBe('H.R. 7831');
    expect(billKey(law)).toBe('119/hr/7831');
    expect(parseBillList('<html>')).toBeNull();
  });

  it("reads where a bill stands from its latest action's wording", () => {
    expect(stageOf('Became Public Law No: 119-134.')).toBe('Became law');
    expect(stageOf('Signed by President.')).toBe('Became law');
    expect(stageOf('Presented to President.')).toBe('To the President');
    expect(stageOf('Vetoed by President.')).toBe('Vetoed');
    expect(stageOf('Received in the Senate and Read twice and referred to the Committee on Finance.')).toBe('Passed a chamber');
    expect(stageOf('Held at the desk.')).toBe('Passed a chamber');
    expect(stageOf('Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote.')).toBe('Passed a chamber');
    expect(stageOf('Placed on the Union Calendar, Calendar No. 512.')).toBe('Reported');
    expect(stageOf('Ordered to be Reported (Amended) by the Yeas and Nays: 27 - 22.')).toBe('Reported');
    expect(stageOf('Referred to the House Committee on the Judiciary.')).toBe('In committee');
    expect(stageOf('Committee on Health, Education, Labor, and Pensions. Hearings held.')).toBe('In committee');
    expect(stageOf('See also H.R. 1234.')).toBe('Other');
  });

  it("reads a bill's sponsor, cosponsors, policy area and law, and its parts", () => {
    const d = parseBill(JSON.stringify(cg.bill.detail))!;
    expect(d.sponsors[0]).toMatchObject({ name: 'Rep. Kennedy, Mike [R-UT-3]', party: 'R', state: 'UT', bioguide: 'K000403' });
    expect(d.cosponsors).toBe(3);
    expect(d.policyArea).toBe('Energy');
    expect(d.line.laws).toEqual(['119-134']);
    const p = parseParts({ actions: JSON.stringify(cg.bill.actions), summaries: JSON.stringify(cg.bill.summaries), subjects: JSON.stringify(cg.bill.subjects), committees: JSON.stringify(cg.bill.committees), cosponsors: JSON.stringify(cg.bill.cosponsors), texts: JSON.stringify(cg.bill.text) });
    expect(p.actions).toHaveLength(32);
    expect(p.actions[0]).toMatchObject({ date: '2026-10-20', text: 'Became Public Law No: 119-134.' });
    // The latest summary, as text: the law's.
    expect(p.summary?.label).toBe('Public Law');
    expect(p.summary?.paragraphs[0]).toBe('License to Drill Act');
    expect(p.summary?.paragraphs[1]).toMatch(/^This act extends through FY2037 the Bureau of Land Management’s \(BLM’s\) authority/);
    expect(p.subjects).toEqual(['Licensing and registrations', 'Mining', 'Oil and gas']);
    expect(p.cosponsors).toHaveLength(3);
    expect(p.texts[0].type).toBe('Enrolled Bill');
    expect(p.texts[0].formats.map((f) => f.type)).toContain('PDF');
    expect(parseParts({}).summary).toBeNull();
  });

  it('turns summary HTML into paragraphs of text', () => {
    expect(paragraphs('<p><strong>Act</strong></p><p>It does&nbsp;this &amp; that.</p><ul><li>One</li></ul>')).toEqual(['Act', 'It does this & that.', '• One']);
  });

  it('finds bills by words in the title or by number, by stage and chamber', () => {
    expect(findBills(laws.bills, 'license to drill', '', '').map(billName)).toEqual(['H.R. 7831']);
    expect(findBills(laws.bills, 'H.R. 7831', '', '').map(billName)).toEqual(['H.R. 7831']);
    expect(findBills(laws.bills, '', 'Became law', 'Senate').every((b) => b.chamber === 'Senate')).toBe(true);
  });

  it('names the Congress in session and the bill a command names', () => {
    expect(congressOn(Date.UTC(2026, 9, 26))).toBe(119);
    expect(congressOn(Date.UTC(2025, 0, 2))).toBe(118);
    expect(congressOn(Date.UTC(2025, 0, 3))).toBe(119);
    expect(congressOn(Date.UTC(2027, 0, 5))).toBe(120);
    expect(billRef('hr 7831')).toEqual({ type: 'HR', number: '7831' });
    expect(billRef('H.R.7831')).toEqual({ type: 'HR', number: '7831' });
    expect(billRef('S. 12')).toEqual({ type: 'S', number: '12' });
    expect(billRef('crypto')).toBeNull();
  });

  it('asks Congress.gov for checked bills and lists only, with the key in a header', () => {
    expect(gov.congressGovRequest('bills', '250')?.url).toBe('https://api.congress.gov/v3/bill?format=json&limit=250&offset=250&sort=updateDate+desc');
    expect(gov.congressGovRequest('laws', '119')?.url).toBe('https://api.congress.gov/v3/law/119?format=json&limit=250&offset=0');
    expect(gov.congressGovRequest('bill', '119/hr/7831')?.url).toBe('https://api.congress.gov/v3/bill/119/hr/7831?format=json');
    expect(gov.congressGovRequest('part', '119/hr/7831/actions')?.url).toBe('https://api.congress.gov/v3/bill/119/hr/7831/actions?format=json&limit=250');
    for (const [kind, arg] of [['bills', '100'], ['laws', '9'], ['bill', '119/xx/1'], ['bill', '119/hr/7831/actions'], ['part', '119/hr/7831/amendments'], ['part', '119/hr/../x'], ['other', '']]) expect(gov.congressGovRequest(kind, arg)).toBeNull();
    for (const k of ['bills', 'laws', 'bill', 'part']) expect(JSON.stringify(gov.congressGovRequest(k, k === 'laws' ? '119' : k === 'bills' ? '0' : k === 'part' ? '119/hr/1/text' : '119/hr/1'))).not.toMatch(/api_key/);
  });

  it("takes the key as Congress.gov issues it, also from a pasted list", () => {
    const key = 'A'.repeat(20) + '1'.repeat(20);
    expect(providers.CREDENTIALS.CONGRESS_GOV_API_KEY.valid(key)).toBe(true);
    expect(providers.CREDENTIALS.CONGRESS_GOV_API_KEY.valid('short')).toBe(false);
    expect(providers.parseCredentialList(`16: api.congress.gov : ${key}`).found).toEqual([{ name: 'CONGRESS_GOV_API_KEY', value: key }]);
  });

  it('opens under BILL; BILL US still names the stock', () => {
    expect(parseCommand('BILL', lookupFn)).toEqual({ kind: 'route', fn: 'LEGISLATION' });
    expect(parseCommand('BILL US', lookupFn)).not.toEqual({ kind: 'route', fn: 'LEGISLATION' });
  });
});
