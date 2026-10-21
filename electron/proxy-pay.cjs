// The Summary Compensation Table of a company's proxy statement (DEF 14A), read from the filing's HTML: each named
// executive officer with their title and, by fiscal year, salary and total compensation (salary, bonus, stock and
// option awards at grant-date value, incentive pay, pension changes and other compensation). Item 402(c) of
// Regulation S-K fixes the table's columns, with Total last; companies lay it out differently (name and title in
// one cell or on the following rows, dollar signs and footnote marks in cells of their own, dashes for zero).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ndash: '-', mdash: '-' };

/** A cell's text: tags out, entities decoded, zero-width and repeated spaces gone. */
function cellText(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, b) => {
      if (b[0] === '#') {
        const code = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
        if (code === 160 || code === 8203) return ' ';
        if (code === 8211 || code === 8212) return '-';
        if (code === 8217 || code === 8216) return "'";
        return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
      }
      return ENT[b.toLowerCase()] ?? ' ';
    })
    .replace(/[​ ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1,234,567" → 1234567; "(1,234)" → -1234; a dash → 0; anything else → NaN. */
function amount(s) {
  const t = s.replace(/[$\s]/g, '');
  if (/^[-–—]+$/.test(t)) return 0;
  const m = /^(\()?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\)?$/.exec(t);
  if (!m) return NaN;
  const v = Number(m[2].replace(/,/g, ''));
  return m[1] ? -v : v;
}

const NOISE = /^(\$|\(\w{1,3}\)(\s*\(\w{1,3}\))*|\*+|%|\))$/;
const TITLE = /^(former\s+|interim\s+|co-)?(chief|senior|executive|president|vice|evp|svp|ceo|cfo|coo|cto|cio|clo|chair(man|woman|person)?|director|general counsel|secretary|treasurer|founder|head|group|managing|principal|controller|chief|corporate|global|regional|division)\b/i;

/** Splits "Tim Cook Chief Executive Officer" into the name and the title (the title starts at its first title word). */
function splitNameTitle(s) {
  const words = s.split(' ');
  for (let i = 1; i < words.length; i++) {
    if (TITLE.test(words.slice(i).join(' '))) return { name: words.slice(0, i).join(' '), title: words.slice(i).join(' ') };
  }
  return { name: s, title: '' };
}

const clean = (s) => s.replace(/\s*\(\w{1,3}\)/g, '').replace(/[*†‡]+/g, '').replace(/\s+/g, ' ').trim();

/** The rows of a table as lists of cell texts, without empty, dollar-sign and footnote-mark cells. */
function tableRows(table) {
  return (table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((r) => [...r.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => cellText(m[1])).filter((c) => c && !NOISE.test(c)));
}

/**
 * The executives of the first Summary Compensation Table in a proxy statement: [{ name, title, years: [{ year,
 * salary, total }] }], newest year first; null when there is none. Total is the row's last amount.
 */
function parseSummaryCompensation(html) {
  if (typeof html !== 'string') return null;
  const heads = [...html.matchAll(/Summary\s+Compensation\s+Table/gi)].map((m) => m.index);
  for (const at of heads) {
    let from = at;
    // The table follows its heading (the first one with the columns, within a few pages of text).
    for (let tries = 0; tries < 3; tries++) {
      const start = html.indexOf('<table', from);
      if (start < 0 || start - at > 60_000) break;
      const end = html.indexOf('</table>', start);
      if (end < 0) break;
      from = end;
      const rows = tableRows(html.slice(start, end));
      const head = rows.slice(0, 14).flat().join(' ');
      if (!/salary/i.test(head) || !/total/i.test(head) || !/year/i.test(head)) continue;
      const people = [];
      let person = null;
      for (const cells of rows) {
        const yi = cells.findIndex((c) => /^(19|20)\d{2}$/.test(c));
        const text = clean(cells.slice(0, Math.max(0, yi)).join(' '));
        if (yi < 0) {
          // A row of title words only continues the current person's title.
          if (person && text && !/\d/.test(text) && TITLE.test(text)) person.title = `${person.title} ${text}`.trim();
          continue;
        }
        const amounts = cells.slice(yi + 1).map(amount).filter((v) => Number.isFinite(v));
        if (amounts.length < 2) continue;
        if (text && !TITLE.test(text)) {
          const { name, title } = splitNameTitle(text);
          person = { name, title, years: [] };
          people.push(person);
        } else if (text && person) {
          person.title = `${person.title} ${text}`.trim();
        }
        if (!person) continue;
        const total = amounts[amounts.length - 1];
        // A year of dashes: not a named executive that year.
        if (total > 0) person.years.push({ year: Number(cells[yi]), salary: amounts[0], total });
      }
      const found = people
        .filter((p) => p.name.length >= 4 && /[a-z]/i.test(p.name) && p.years.length)
        .map((p) => ({ ...p, title: p.title.replace(/\s+and$/i, '').trim(), years: p.years.sort((a, b) => b.year - a.year) }));
      if (found.length) return found.slice(0, 15);
    }
  }
  return null;
}

module.exports = { parseSummaryCompensation, cellText, amount, splitNameTitle };
