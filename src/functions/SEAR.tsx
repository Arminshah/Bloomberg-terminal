import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, SecLink } from '../components/cells';
import { fmtStamp } from '../core/format';
import { engine } from '../data/market';
import { news, type Story } from '../data/news';
import { searchSecurities } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import { FUNCTIONS } from '../terminal/registry';
import { navigate } from '../terminal/state';
import type { FnDef, FnProps } from '../terminal/types';

/** Words that say nothing about what is searched for. */
const STOP = new Set('A AN AND ARE AS AT BE BY DID DO DOES FOR FROM HAS HAVE HOW I IN IS IT ITS LAST OF ON OR THAT THE THEIR THIS TO WAS WERE WHAT WHEN WHERE WHICH WHO WHY WITH YEAR'.split(' '));

/** The words of a plain-language search that carry its meaning, in capitals. */
export function searchWords(query: string): string[] {
  return [...new Set(query.toUpperCase().replace(/[^A-Z0-9&.$ -]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)))];
}

/** Functions whose code, mnemonic, name or description holds the words, best first. */
export function searchFunctions(words: string[], limit = 50): FnDef[] {
  if (!words.length) return [];
  const scored: [FnDef, number][] = [];
  for (const f of FUNCTIONS) {
    if (f.code === 'SEARCHRESULTS') continue;
    const codes = [f.code, primaryMnemonic(f.code), ...(f.aliases ?? [])];
    const name = f.name.toUpperCase();
    const desc = f.desc.toUpperCase();
    let score = 0;
    for (const w of words) {
      if (codes.includes(w)) score += 10;
      else if (name.split(/\W+/).some((n) => n.startsWith(w))) score += 4;
      else if (desc.includes(w)) score += 1;
    }
    if (score > 0) scored.push([f, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

/** Securities named by any of the words, each once, best first. */
export function searchAllSecurities(query: string, words: string[], limit = 50): SecurityDef[] {
  const seen = new Map<string, SecurityDef>();
  for (const q of [query, ...words]) for (const h of searchSecurities(q, limit)) if (!seen.has(h.def.id)) seen.set(h.def.id, h.def);
  return [...seen.values()].slice(0, limit);
}

/** Headlines holding every word, newest first; failing that, any word. */
export function searchStories(stories: Story[], words: string[], limit = 50): Story[] {
  if (!words.length) return [];
  const hay = (s: Story) => `${s.headline} ${s.body.join(' ')} ${s.tickers.join(' ')}`.toUpperCase();
  const all = stories.filter((s) => words.every((w) => hay(s).includes(w)));
  const some = all.length ? all : stories.filter((s) => words.some((w) => w.length > 3 && hay(s).includes(w)));
  return [...some].sort((a, b) => b.time - a.time).slice(0, limit);
}

const TABS = [
  { n: 1, label: 'Top Results' },
  { n: 2, label: 'Functions' },
  { n: 3, label: 'Securities' },
  { n: 4, label: 'News' },
];
const FIRST_ROW = 11;

/**
 * SEAR, search results for plain words typed on the command line (TE01 02:11): the question in the red bar's amber
 * field, tabs for the top results and each kind, then sections of the app's own functions, securities and headlines
 * that match. "<Pg Dn> for More Results, <Back> to Return" sits on the hint row.
 */
export function SEAR({ route }: FnProps) {
  const panel = usePanelId();
  const query = (route.args ?? '').trim();
  const [tab, setTab] = useState(1);
  const [draft, setDraft] = useState(query);
  const stories = news.use((s) => s.stories);
  const words = useMemo(() => searchWords(query), [query]);
  const fns = useMemo(() => searchFunctions(words), [words]);
  const secs = useMemo(() => searchAllSecurities(query, words), [query, words]);
  const found = useMemo(() => searchStories(stories, words), [stories, words]);
  const top = tab === 1;
  const fnRows = top ? fns.slice(0, 5) : tab === 2 ? fns : [];
  const secRows = top ? secs.slice(0, 6) : tab === 3 ? secs : [];
  const newsRows = top ? found.slice(0, 6) : tab === 4 ? found : [];
  const fnNums = useNumberedRows('sear-fns', fnRows, FIRST_ROW, (f) => runFn(f), (f) => f.name);
  const secNums = useNumberedRows('sear-secs', secRows, FIRST_ROW + fnRows.length, (d) => execute(panel, d.id), (d) => d.ticker);
  const newsNums = useNumberedRows('sear-news', newsRows, FIRST_ROW + fnRows.length + secRows.length, (s) => execute(panel, `N ${s.headline.slice(0, 60)}`), (s) => s.headline);
  const counts: Record<number, number> = { 2: fns.length, 3: secs.length, 4: found.length };
  // A function that needs a security opens for the one the words name, when they name one ("apple dividend growth").
  const runFn = (f: FnDef) => {
    const named = secs.find((d) => !f.classes || f.classes.includes(d.cls));
    execute(panel, f.needsSec && named ? `${named.id} ${f.code}` : f.code);
  };
  const empty = !fnRows.length && !secRows.length && !newsRows.length;
  return (
    <div>
      <FnHeader
        code="SEARCHRESULTS"
        title="Search Results"
        right={
          <input
            className="inp sear-q"
            aria-label="Search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault();
                navigate(panel, { fn: 'SEARCHRESULTS', args: draft.trim() });
              }
            }}
          />
        }
        tabs={TABS.map((t) => ({ n: t.n, label: counts[t.n] !== undefined ? `${t.label} (${counts[t.n]})` : t.label }))}
        tab={tab}
        onTab={setTab}
      />
      {!words.length ? <div className="empty">Type words or a question on the command line and press GO to search the app.</div> : null}
      {words.length > 0 && empty ? <div className="empty">Nothing in the app matches “{query}”.</div> : null}
      {fnRows.length > 0 && (
        <section className="sear-sect">
          <div className="sect-h">Functions <span className="faint">| HELP »</span></div>
          {fnRows.map((f, i) => (
            <button key={f.code} type="button" className="sear-row" onClick={() => runFn(f)} title={`${f.code} <GO>`}>
              <span className="row-no">{fnNums[i]})</span>
              <span className="sear-mn">{primaryMnemonic(f.code)}</span>
              <span className="sear-title">{f.name}</span>
              <span className="sear-type">Function</span>
              <span className="sear-text">{f.desc}</span>
            </button>
          ))}
        </section>
      )}
      {secRows.length > 0 && (
        <section className="sear-sect">
          <div className="sect-h">Securities <span className="faint">| SECF »</span></div>
          <table className="tbl">
            <thead>
              <tr>
                <th />
                <th>Ticker</th>
                <th>Name</th>
                <th className="num">Last</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {secRows.map((d, i) => {
                const q = engine.quote(d.id);
                return (
                  <tr key={d.id} className="click" onClick={() => execute(panel, d.id)}>
                    <td className="num faint" style={{ width: 40 }}>{secNums[i]})</td>
                    <td><SecLink id={d.id}>{d.ticker} {d.yk}</SecLink></td>
                    <td className="amber ellipsis" style={{ maxWidth: 320 }}>{d.name}</td>
                    <td className="num"><LivePx id={d.id} /></td>
                    <td className="num">{q && Number.isFinite(q.pct) ? <Chg v={d.quote === 'yield' ? q.chg : q.pct} pct={d.quote !== 'yield'} bp={d.quote === 'yield'} /> : <span className="muted">--</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {newsRows.length > 0 && (
        <section className="sear-sect">
          <div className="sect-h">News <span className="faint">| N »</span></div>
          {newsRows.map((s, i) => (
            <div key={s.id} className="sear-story">
              <span className="row-no">{newsNums[i]})</span>
              {s.url ? <a className="sear-title" href={s.url} target="_blank" rel="noreferrer">{s.headline}</a> : <span className="sear-title">{s.headline}</span>}
              <span className="sear-type">{s.source} · {fmtStamp(s.time)}</span>
              {s.body[0] ? <span className="sear-text">{s.body[0]}</span> : null}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
