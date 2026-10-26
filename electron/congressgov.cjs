// Congress.gov's API (the Library of Congress), with the owner's key: bills and their latest actions, enacted laws,
// and one bill's sponsor, actions, summaries, subjects, committees, cosponsors and text (BILL). The page names what it
// wants; the URL is built here from checked parts, and the key goes in a header, never in the URL. The API allows
// 5,000 requests an hour; the app keeps to far fewer and keeps each answer a while.

const API = 'https://api.congress.gov/v3';
const MINUTE = 60_000;

/** The bill types the API knows: bills and resolutions of each chamber. */
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
/** A bill's parts the screen shows. */
const PARTS = ['actions', 'summaries', 'subjects', 'committees', 'cosponsors', 'text'];

const congressOk = (c) => /^\d{2,3}$/.test(c) && Number(c) >= 93 && Number(c) <= 200;
const offsetOk = (o) => /^\d{1,4}$/.test(o) && Number(o) % 250 === 0;

/**
 * The request for one kind of answer: the latest bills by update, 250 from an offset ("bills", "250"); a Congress's
 * laws ("laws", "119" or "119:250"); a bill ("bill", "119/hr/7831"); a bill's part ("part", "119/hr/7831/actions").
 */
function congressGovRequest(kind, arg) {
  const a = String(arg ?? '');
  if (kind === 'bills') return offsetOk(a) ? { url: `${API}/bill?format=json&limit=250&offset=${Number(a)}&sort=updateDate+desc`, ttl: 30 * MINUTE } : null;
  if (kind === 'laws') {
    const [c, o = '0'] = a.split(':');
    return congressOk(c) && offsetOk(o) ? { url: `${API}/law/${c}?format=json&limit=250&offset=${Number(o)}`, ttl: 6 * 60 * MINUTE } : null;
  }
  const [c, type, number, part] = a.split('/');
  if (!congressOk(c ?? '') || !BILL_TYPES.includes(type) || !/^\d{1,5}$/.test(number ?? '')) return null;
  const bill = `${API}/bill/${c}/${type}/${number}`;
  if (kind === 'bill' && part === undefined) return { url: `${bill}?format=json`, ttl: 60 * MINUTE };
  if (kind === 'part' && PARTS.includes(part)) return { url: `${bill}/${part}?format=json&limit=250`, ttl: 60 * MINUTE };
  return null;
}

module.exports = { congressGovRequest, BILL_TYPES, PARTS };
