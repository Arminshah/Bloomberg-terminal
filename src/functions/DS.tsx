import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { docQueryString, docUrl, highlightTerms, parseDocSearch, type DocHit, type DocResults } from '../data/live/docsearch';
import { resolveFiler, secAvailable, secTicker, SEC_DESKTOP_ONLY, SEC_NEEDS_AGENT } from '../data/live/sec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { DocAnswer } from '../data/live/lookup';

const FORM_SETS: { key: string; label: string; forms: string[] }[] = [
  { key: 'all', label: 'All Documents', forms: [] },
  { key: 'periodic', label: 'Annual & Quarterly Reports', forms: ['10-K', '10-Q', '20-F', '40-F', '6-K'] },
  { key: 'current', label: 'Current Reports (8-K)', forms: ['8-K'] },
  { key: 'proxy', label: 'Proxy Statements', forms: ['DEF 14A', 'DEFA14A'] },
  { key: 'offering', label: 'Registrations & Prospectuses', forms: ['S-1', 'F-1', 'S-3', 'F-3', '424B4', '424B5'] },
  { key: 'ownership', label: 'Ownership (13D/13G)', forms: ['SC 13D', 'SC 13G', 'SC 13D/A', 'SC 13G/A'] },
  { key: 'deals', label: 'Mergers & Tender Offers', forms: ['DEFM14A', 'S-4', 'SC TO-T', 'SC 14D9'] },
];

const RANGES = [
  { key: '1y', label: 'Last Year', years: 1 },
  { key: '3y', label: 'Last 3 Years', years: 3 },
  { key: '5y', label: 'Last 5 Years', years: 5 },
  { key: 'all', label: 'Since 2001', years: 0 },
];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The words in a sentence emphasised where they match. */
function marked(sentence: string, terms: string[]): ReactNode {
  if (!terms.length) return sentence;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return sentence.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

/** Questions to start from, in the app's own words. */
const SUGGESTIONS = ['Sum up the main points', 'What risks does it name?', 'What does it say about the outlook?', 'What changed from the year before?', 'Where does it mention competition?'];

/**
 * DS's Ask a Question on one filing (FFM_DS_TA 0:30.7, 0:35.5): an amber field, suggestions, then Gemini's answer from
 * the filing's text with each point over the filing's own words; points whose quote is not in the filing never reach
 * the page (electron/gemini.cjs).
 */
function DocAsk({ path }: { path: string }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ q: string; a?: DocAnswer } | null>(null);
  if (typeof window.arminDesktop?.docAsk !== 'function') return <p className="muted ds-ask-note">Ask a Question runs in the desktop app with a Gemini key on PROVIDERS.</p>;
  const ask = async (question: string) => {
    const t = question.trim();
    if (!t) return;
    setQ(t);
    setState({ q: t });
    const a = await window.arminDesktop!.docAsk!(path, t).catch((e: unknown) => ({ error: String((e as Error)?.message ?? e) }) as DocAnswer);
    setState({ q: t, a });
  };
  const a = state?.a;
  const why = !a ? '' : a.missing === 'GEMINI_API_KEY' ? 'Set GEMINI_API_KEY on PROVIDERS to ask questions.' : a.missing === 'SEC_USER_AGENT' ? 'Set SEC_USER_AGENT on PROVIDERS to read the filing.' : a.gated ? 'Gemini is switched off on PROVIDERS (GEMINI_DOCS_ENABLED).' : a.budget ? "Today's 200 questions to Gemini are used; it answers again tomorrow." : a.refused ? `The Gemini key was not sent: ${a.refused}.` : a.error ?? '';
  return (
    <div className="ds-ask" data-testid="ds-ask">
      <div className="ds-ask-h">Ask a Question</div>
      <input
        className="inp ds-ask-inp"
        aria-label="Ask a question about this document"
        placeholder="Ask about this document"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void ask(q)}
      />
      <p className="muted">Ask a question about this filing, or ask for a summary of what it says on a subject. The answer comes from the filing&apos;s text only.</p>
      {!state ? (
        <>
          <div className="amber">Suggestions</div>
          <div className="ds-ask-sugg">
            {SUGGESTIONS.map((x) => (
              <button key={x} type="button" className="ds-ask-chip" onClick={() => void ask(x)}>
                {x}
              </button>
            ))}
          </div>
        </>
      ) : !a ? (
        <p className="muted">Reading the filing and asking Gemini…</p>
      ) : why ? (
        <p className="amber" role="status">{why}</p>
      ) : (
        <div className="ds-ask-answer" data-testid="ds-answer">
          {a.answer ? <p className="white">{a.answer}</p> : null}
          {(a.points ?? []).map((p, i) => (
            <div key={i} className="ds-ask-point">
              <div className="white">• {p.point}</div>
              <div className="ds-ask-quote">&ldquo;{p.quote}&rdquo;</div>
            </div>
          ))}
          {!a.points?.length && !a.answer ? <p className="muted">Gemini gave no point it could quote from the filing.</p> : null}
          <p className="muted ds-ask-note">
            Answer by Google Gemini ({a.model}) from this filing&apos;s text; each point is shown over the words it quotes.
            {a.dropped ? ` ${a.dropped} point${a.dropped === 1 ? ' was' : 's were'} left out: the quote was not in the filing, or a figure was not in its quote.` : ''}
            {a.truncated ? ' The filing is long: only its first part was read.' : ''}
          </p>
          <button type="button" className="link-btn" onClick={() => { setState(null); setQ(''); }}>Ask another question</button>
        </div>
      )}
    </div>
  );
}

/**
 * DS, document search: words searched in the text of every SEC filing since 2001, for the loaded company or all
 * companies, by kind of document and date, with where each document matches.
 */
export function DS({ sec }: FnProps) {
  const panel = usePanelId();
  const ticker = secTicker(sec);
  const [words, setWords] = useState('');
  const [typed, setTyped] = useState('');
  const [scope, setScope] = useState<'company' | 'all'>(ticker ? 'company' : 'all');
  const [formSet, setFormSet] = useState('all');
  const [form, setForm] = useState<string | null>(null);
  const [range, setRange] = useState('3y');
  const [page, setPage] = useState(0);
  const [newest, setNewest] = useState(false);
  const [cik, setCik] = useState<number | null>(null);
  const [state, setState] = useState<{ key: string; results?: DocResults; message?: string } | null>(null);
  const [open, setOpen] = useState<Record<string, string[] | 'loading' | 'none'>>({});
  // The loaded company's CIK, for "this company".
  useEffect(() => {
    if (!ticker || !secAvailable()) return;
    let stopped = false;
    void resolveFiler(ticker).then((r) => !stopped && setCik(r.ok ? r.data.cik : null));
    return () => {
      stopped = true;
    };
  }, [ticker]);
  const years = RANGES.find((r) => r.key === range)!.years;
  const now = Date.now();
  const query = {
    words,
    forms: form ? [form] : FORM_SETS.find((f) => f.key === formSet)!.forms,
    ciks: scope === 'company' && cik ? [cik] : [],
    ...(years ? { from: iso(now - years * 365.25 * 86_400_000), to: iso(now) } : { from: '2001-01-01', to: iso(now) }),
    page,
  };
  const key = docQueryString(query);
  const waitingForCompany = scope === 'company' && !!ticker && cik == null;
  useEffect(() => {
    if (!words.trim() || waitingForCompany || typeof window.arminDesktop?.sec !== 'function') return;
    let stopped = false;
    setState({ key });
    void window.arminDesktop
      .sec('search', key)
      .then((res) => {
        if (stopped) return;
        if (res.missing) return setState({ key, message: SEC_NEEDS_AGENT });
        const parsed = res.text ? parseDocSearch(res.text) : null;
        setState(parsed ? { key, results: parsed } : { key, message: res.error ? `The SEC did not answer: ${res.error}` : `The SEC answered HTTP ${res.status}.` });
      })
      .catch(() => !stopped && setState({ key, message: 'The search could not be made.' }));
    return () => {
      stopped = true;
    };
  }, [key, words, waitingForCompany]);
  const found = state?.key === key ? state.results : undefined;
  const results = found && newest ? { ...found, hits: [...found.hits].sort((a, b) => b.filed.localeCompare(a.filed)) } : found;
  const terms = highlightTerms(words);
  const show = async (h: DocHit) => {
    if (open[h.id]) return setOpen((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== h.id)));
    setOpen((o) => ({ ...o, [h.id]: 'loading' }));
    const res = terms.length && window.arminDesktop?.secText ? await window.arminDesktop.secText('mentions', h.path, terms).catch(() => null) : null;
    setOpen((o) => ({ ...o, [h.id]: res && res.sentences.length ? res.sentences.slice(0, 6) : 'none' }));
  };
  const submit = () => {
    setWords(typed.trim());
    setPage(0);
    setForm(null);
    setOpen({});
  };
  const csv = () => [['Filed', 'Company', 'Tickers', 'Form', 'Description', 'Period', 'Document'], ...(results?.hits ?? []).map((h) => [h.filed, h.company, h.tickers.join(' '), h.form, h.description, h.period ?? '', docUrl(h.path)])];
  return (
    <div>
      <FnHeader
        code="DOCSEARCH"
        title="Document Search"
        sec={sec}
        actions={exportActions(panel, `DS_${words.replace(/\W+/g, '_').slice(0, 40) || 'search'}.csv`, csv)}
        controls={
          <>
            <div className="chart-tools">
              <label className="fld ds-words">
                Search
                <input
                  className="inp"
                  aria-label="Search words"
                  placeholder='Words or "a phrase"; OR between alternatives'
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      submit();
                    }
                  }}
                />
              </label>
              <button type="button" className="btn" onClick={submit}>
                Search
              </button>
            </div>
            <div className="chart-tools">
              <label className="fld">
                Companies
                <select className="sel-inp" aria-label="Companies" value={scope} onChange={(e) => (setScope(e.target.value as 'company' | 'all'), setPage(0))}>
                  {ticker && <option value="company">{sec?.name ?? ticker}</option>}
                  <option value="all">All Companies</option>
                </select>
              </label>
              <label className="fld">
                Documents
                <select className="sel-inp" aria-label="Documents" value={formSet} onChange={(e) => (setFormSet(e.target.value), setForm(null), setPage(0))}>
                  {FORM_SETS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fld">
                Dates
                <select className="sel-inp" aria-label="Dates" value={range} onChange={(e) => (setRange(e.target.value), setPage(0))}>
                  {RANGES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fld">
                Order
                <select className="sel-inp" aria-label="Order" value={newest ? 'date' : 'relevance'} onChange={(e) => setNewest(e.target.value === 'date')}>
                  <option value="relevance">Relevance</option>
                  <option value="date">Newest First</option>
                </select>
              </label>
              {form && (
                <button type="button" className="chip on" onClick={() => setForm(null)} title="Remove the form filter">
                  {form} ×
                </button>
              )}
            </div>
          </>
        }
      />
      {!secAvailable() ? (
        <div className="empty">{SEC_DESKTOP_ONLY}</div>
      ) : !words ? (
        <div className="empty">Type words to search the text of every SEC filing since 2001{ticker ? `, for ${sec?.name} or all companies` : ''}: a phrase in quotes, alternatives with OR.</div>
      ) : state?.key === key && state.message ? (
        <div className="empty">{state.message}</div>
      ) : !results ? (
        <div className="empty">Searching the SEC’s filings…</div>
      ) : (
        <>
          <div className="ds-facets">
            <span className="white">
              {fmtNum(results.total, 0)}
              {results.more ? '+' : ''} documents
            </span>
            {results.forms.slice(0, 10).map((f) => (
              <button key={f.key} type="button" className={`chip${form === f.key ? ' on' : ''}`} onClick={() => (setForm(form === f.key ? null : f.key), setPage(0))}>
                {f.key} {fmtNum(f.count, 0)}
              </button>
            ))}
            {scope === 'all' && results.companies.length > 0 && <span className="muted">Most: {results.companies.slice(0, 4).map((c) => `${c.key.replace(/\s+\(CIK.*$/, '')} (${c.count})`).join(', ')}</span>}
          </div>
          {results.hits.length === 0 ? (
            <div className="empty">No documents match.</div>
          ) : (
            <table className="tbl zebra ds-tbl">
              <thead>
                <tr>
                  <th>Filed</th>
                  <th>Company</th>
                  <th>Form</th>
                  <th className="hide-m">Description</th>
                  <th className="hide-m">Period</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {results.hits.map((h) => {
                  const o = open[h.id];
                  return (
                    <Fragment key={h.id}>
                      <tr className="click" onClick={() => void show(h)} title="Show where the document matches">
                        <td>{fmtDay(Date.parse(`${h.filed}T00:00:00Z`))}</td>
                        <td className="amber">
                          {h.company}
                          {h.tickers.length ? <span className="muted"> {h.tickers[0]}</span> : null}
                        </td>
                        <td className="white">{h.form}</td>
                        <td className="hide-m">{h.description}</td>
                        <td className="hide-m">{h.period ? fmtDay(Date.parse(`${h.period}T00:00:00Z`)) : ''}</td>
                        <td>
                          <a className="link" href={docUrl(h.path)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            {h.file.length > 28 ? `${h.file.slice(0, 26)}…` : h.file}
                          </a>
                        </td>
                      </tr>
                      {o && (
                        <tr className="ds-match">
                          <td colSpan={6}>
                            {o === 'loading' ? (
                              <span className="muted">Reading the document…</span>
                            ) : o === 'none' ? (
                              <span className="muted">The words are in the document but not in a sentence of its text (a table, a heading or an exhibit).</span>
                            ) : (
                              o.map((sentence, i) => (
                                <p key={i} className="ds-sentence">
                                  {marked(sentence, terms)}
                                </p>
                              ))
                            )}
                            {o !== 'loading' && <DocAsk key={h.path} path={h.path} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="ds-pager">
            <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ‹ Previous 100
            </button>
            <span className="muted">
              {page * 100 + 1}–{page * 100 + results.hits.length}
            </span>
            <button type="button" className="btn" disabled={(page + 1) * 100 >= Math.min(results.total, 10_000)} onClick={() => setPage((p) => p + 1)}>
              Next 100 ›
            </button>
          </div>
          <p className="pad-s muted">EDGAR full-text search: the text of filings and their exhibits since 2001, newest relevance first. Click a document to see the sentences that match.</p>
        </>
      )}
    </div>
  );
}
