import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { fmtStamp } from '../core/format';
import { newsAvailable } from '../data/live/marketnews';
import { engine } from '../data/market';
import { sourceCode } from '../data/sourcecode';
import { execute } from '../terminal/exec';
import { flash, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { myNews, type NewsSection } from '../terminal/userdata';
import { useNewsSearch } from './NEWS';

/**
 * MYN, My News (the provider's 2020 Quick Start: personal news pages, built the way you like). Pages of your own,
 * each a set of sections; a section is a saved search over the news the app reads (the market news sources, the
 * official announcements and Google News's search), showing its latest stories. A section's title opens NEWS on it.
 */

export const MAX_PAGES = 9;
export const MAX_SECTIONS = 12;
const PER_SECTION = 8;

/** Adds a section to a page; refused when the words are missing, the page is full or the same search is there. */
export function addSection(state: { pages: { name: string; sections: NewsSection[] }[] }, page: number, title: string, query: string): { pages: { name: string; sections: NewsSection[] }[] } | string {
  const q = query.trim().replace(/\s+/g, ' ');
  const p = state.pages[page];
  if (!p) return 'That page is no longer there.';
  if (q.length < 2) return 'Type the words to follow: a ticker, a company or a topic.';
  if (p.sections.length >= MAX_SECTIONS) return `A page holds ${MAX_SECTIONS} sections at most.`;
  if (p.sections.some((s) => s.query.toLowerCase() === q.toLowerCase())) return `"${q}" is on this page already.`;
  const section = { title: title.trim().slice(0, 40) || q.slice(0, 40), query: q.slice(0, 120) };
  return { pages: state.pages.map((x, i) => (i === page ? { ...x, sections: [...x.sections, section] } : x)) };
}

function NewsSectionBox({ section, onRemove }: { section: NewsSection; onRemove: () => void }) {
  const panel = usePanelId();
  const { stories } = useNewsSearch(section.query);
  const now = engine.now();
  const top = stories.slice(0, PER_SECTION);
  return (
    <Section
      title={
        <button type="button" className="act" title={`Every story for "${section.query}" (NEWS)`} onClick={() => execute(panel, `NEWS ${section.query}`)}>
          {section.title}
        </button>
      }
      right={
        <button type="button" className="act" aria-label={`Remove the section ${section.title}`} onClick={onRemove}>
          ×
        </button>
      }
    >
      {!newsAvailable() ? (
        <div className="empty">News is read by the desktop app; the browser build has no data source.</div>
      ) : top.length === 0 ? (
        <div className="empty">No story yet for &quot;{section.query}&quot;.</div>
      ) : (
        <table className="tbl" data-testid="myn-stories">
          <tbody>
            {top.map((s) => (
              <tr key={s.id}>
                <td className="muted nowrap">{fmtStamp(s.time, now)}</td>
                <td>{s.url ? <a className="blue" href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title}</td>
                <td className="muted" title={s.publisher}>{sourceCode(s.publisher)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function MYN(_: FnProps) {
  const panel = usePanelId();
  const st = myNews.use((s) => s);
  const active = Math.min(st.active, st.pages.length - 1);
  const page = st.pages[active];
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [pageName, setPageName] = useState('');
  const add = () => {
    const next = addSection(myNews.get(), active, title, query);
    if (typeof next === 'string') return flash(panel, next, 'error');
    myNews.set((s) => ({ ...s, pages: next.pages }));
    setTitle('');
    setQuery('');
  };
  const newPage = () => {
    const name = pageName.trim().slice(0, 30);
    if (!name) return flash(panel, 'Name the new page', 'error');
    if (st.pages.length >= MAX_PAGES) return flash(panel, `At most ${MAX_PAGES} pages`, 'error');
    myNews.set((s) => ({ pages: [...s.pages, { name, sections: [] }], active: s.pages.length }));
    setPageName('');
  };
  const removePage = () => {
    if (st.pages.length <= 1) return flash(panel, 'There is always one page: remove its sections instead', 'error');
    myNews.set((s) => ({ pages: s.pages.filter((_, i) => i !== active), active: Math.max(0, active - 1) }));
  };
  return (
    <div>
      <FnHeader
        code="MYNEWS"
        title="My News"
        sub={`${page.name}: ${page.sections.length} section${page.sections.length === 1 ? '' : 's'}, each a saved search over the news the app reads`}
        tabs={st.pages.map((p, i) => ({ n: i + 1, label: p.name }))}
        tab={active + 1}
        onTab={(n) => myNews.set((s) => ({ ...s, active: n - 1 }))}
        controls={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="inp" style={{ width: 140 }} placeholder="Section title" aria-label="Section title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="inp" style={{ width: 200 }} placeholder="Words: a ticker, a company, a topic" aria-label="Section search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button type="button" className="btn primary" onClick={add}>
              Add section
            </button>
            <input className="inp" style={{ width: 120 }} placeholder="New page name" aria-label="New page name" value={pageName} onChange={(e) => setPageName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newPage()} />
            <button type="button" className="btn" onClick={newPage}>
              New page
            </button>
            <button type="button" className="btn" onClick={removePage} disabled={st.pages.length <= 1}>
              Remove this page
            </button>
          </div>
        }
      />
      {page.sections.length === 0 ? (
        <div className="empty">This page has no sections yet. Add one: a title and the words to follow (a ticker such as NVDA, a company, a topic such as FOMC or tariffs).</div>
      ) : (
        <div className="myn-grid">
          {page.sections.map((s) => (
            <NewsSectionBox
              key={s.query}
              section={s}
              onRemove={() => myNews.set((x) => ({ ...x, pages: x.pages.map((p, i) => (i === active ? { ...p, sections: p.sections.filter((y) => y.query !== s.query) } : p)) }))}
            />
          ))}
        </div>
      )}
      <div className="note">Each section lists the latest stories whose headline, summary or tickers have all its words, from the market news sources and official announcements the app reads and Google News&apos;s search for the last week, as NEWS does. Pages are kept on this computer.</div>
    </div>
  );
}
