import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { execute } from '../terminal/exec';
import { panelMessages, clearFlash, flash } from '../terminal/panel';
import { turnPage, typedPageCount } from '../terminal/paging';
import { back, forward, LINK_GROUPS, linkGroupOf, navigate, setLinkGroup, terminal, type LinkGroup } from '../terminal/state';
import { CHART_STYLES, primaryMnemonic, styledMnemonic } from '../terminal/legacy';
import { settings } from '../terminal/settings';
import { startSuggestions, suggest, type Suggestion } from '../terminal/suggest';
import { nameSuggestions } from '../terminal/name-search';
import { favourites } from '../terminal/userdata';
import type { Route } from '../terminal/types';
import { lookupFn } from '../terminal/registry';
import { engine, useQuote } from '../data/market';
import { QuoteLine1, QuoteLine2 } from './QuoteStrip';

/** Imperative handles per panel for global keys and the key bar. */
interface CommandApi {
  input: HTMLInputElement;
  append: (token: string) => void;
  submit: () => void;
  clear: () => void;
  recall: (direction: -1 | 1) => void;
}
export const commandApis = new Map<number, CommandApi>();

/** Market sector keys on F2-F12: each types its sector word (GOVT, CORP, EQUITY...). */
export const FKEY_TEXT: Record<string, string> = {
  F2: 'GOVT',
  F3: 'CORP',
  F4: 'MTGE',
  F5: 'M-MKT',
  F6: 'MUNI',
  F7: 'PFD',
  F8: 'EQUITY',
  F9: 'CMDTY',
  F10: 'INDEX',
  F11: 'CRNCY',
  F12: 'CLIENT',
};

/**
 * PAGE BACK / PAGE FWD: show the previous or next page of the panel's largest scrolling region (a table, a news
 * list or the screen). A number typed first moves that many pages, as on the terminal keyboard: 13 PAGE FWD goes
 * from page 2 to page 15. The number is used up; anything else on the command line stays.
 */
export function pagePanel(panel: number, dir: 1 | -1) {
  const api = commandApis.get(panel);
  const count = api ? typedPageCount(api.input.value) : undefined;
  const turned = turnPage(panel, dir, count ?? 1);
  if (count !== undefined) {
    api?.clear();
    if (turned && turned.pages > 1) flash(panel, `Page ${turned.page} of ${turned.pages}`, 'info');
  }
}

/** Appends a market sector word (or any token) to a panel's command line. */
export function typeInto(panel: number, token: string) {
  commandApis.get(panel)?.append(token);
}

export function submitPanel(panel: number) {
  commandApis.get(panel)?.submit();
}

export function focusPanelInput(panel: number) {
  commandApis.get(panel)?.input.focus();
}

export function clearPanelInput(panel: number) {
  commandApis.get(panel)?.clear();
}

/** Cycle past entries without executing them, like the terminal's Cmd History key. */
export function recallPanelCommand(panel: number, direction: -1 | 1 = -1) {
  commandApis.get(panel)?.recall(direction);
}

/** The mnemonic a function suggestion is listed under, as the terminal lists DES rather than PROFILE; GPC stays GPC. */
function suggestedMnemonic(s: Suggestion): string {
  const typed = s.execute?.split(' ').at(-1) ?? '';
  return CHART_STYLES[typed] ? typed : primaryMnemonic(s.primary);
}

function routeText(r: Route, mnemonics: boolean): string {
  // A candlestick chart reads GPC rather than GP CANDLE.
  const shown = mnemonics ? styledMnemonic(r.fn, r.args) : { mnemonic: r.fn, args: r.args };
  const parts = [r.sec, shown.mnemonic, shown.args].filter(Boolean);
  return parts.join(' ');
}

export function CommandLine({ panel, route }: { panel: number; route: Route }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  // Typing turns the row into the command field; until then, on a security's screen, it shows the quote's first line.
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const entries = useRef<string[]>([]);
  const recallIndex = useRef(-1);
  const draft = useRef('');
  const msg = panelMessages.use((m) => m[panel]);
  const canBack = terminal.use((s) => s.panels[panel].idx > 0);
  const canFwd = terminal.use((s) => s.panels[panel].idx < s.panels[panel].history.length - 1);
  const group = terminal.use((s) => linkGroupOf(s.panels[panel]));
  const mnemonics = settings.use((s) => s.mnemonics);
  const favIds = favourites.use((s) => s.ids);
  const recentSecs = terminal.use((s) => s.recentSecs);

  const valueRef = useRef(value);
  valueRef.current = value;
  const submitRef = useRef<() => void>(() => undefined);

  const recall = (direction: -1 | 1) => {
    if (!entries.current.length || (direction === 1 && recallIndex.current < 0)) return;
    if (recallIndex.current < 0) {
      draft.current = valueRef.current;
      recallIndex.current = entries.current.length;
    }
    const next = Math.max(0, recallIndex.current + direction);
    recallIndex.current = next >= entries.current.length ? -1 : next;
    setValue(recallIndex.current < 0 ? draft.current : entries.current[recallIndex.current]);
    setEditing(true);
    setOpen(false);
    setSel(-1);
    inputRef.current?.focus();
  };
  const recallRef = useRef(recall);
  recallRef.current = recall;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const api: CommandApi = {
      input: el,
      append: (token) => {
        const cur = valueRef.current.trimEnd();
        setValue(`${cur}${cur ? ' ' : ''}${token} `);
        recallIndex.current = -1;
        setEditing(true);
        setOpen(true);
        setSel(-1);
        el.focus();
      },
      submit: () => submitRef.current(),
      clear: () => {
        setValue('');
        setEditing(false);
        setOpen(false);
        setSel(-1);
        recallIndex.current = -1;
        clearFlash(panel);
      },
      recall: (direction) => recallRef.current(direction),
    };
    commandApis.set(panel, api);
    return () => {
      if (commandApis.get(panel) === api) commandApis.delete(panel);
    };
  }, [panel]);

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => clearFlash(panel), msg.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(id);
  }, [msg, panel]);

  // Before anything is typed: favourites and recent securities, as soon as the line is clicked.
  const local = useMemo(() => (!open ? [] : value.trim() ? suggest(value) : startSuggestions(favIds, recentSecs)), [value, open, favIds, recentSecs]);
  // A company's name typed: the stocks the online search finds for it, after the app's own matches.
  const [named, setNamed] = useState<{ text: string; items: Suggestion[] }>({ text: '', items: [] });
  useEffect(() => {
    const text = value.trim();
    if (!open || text.length < 3) return;
    let live = true;
    const id = setTimeout(() => {
      void nameSuggestions(text).then((found) => {
        if (live) setNamed({ text, items: found });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [value, open]);
  const items = useMemo(() => {
    if (!open || named.text !== value.trim() || !named.items.length) return local;
    const have = new Set(local.map((s) => s.primary));
    return [...local, ...named.items.filter((s) => !have.has(s.primary))];
  }, [local, named, value, open]);

  useEffect(() => {
    if (sel < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (text: string) => {
    if (!text.trim()) return;
    const entry = text.trim();
    if (entries.current.at(-1) !== entry) entries.current = [...entries.current, entry].slice(-50);
    recallIndex.current = -1;
    const ok = execute(panel, text);
    if (ok) {
      setValue('');
      setEditing(false);
      setOpen(false);
      setSel(-1);
    }
  };

  const choose = (s: Suggestion) => {
    if (s.execute) run(s.execute);
    else if (s.fill) {
      setValue(s.fill);
      recallIndex.current = -1;
      setSel(-1);
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const submit = () => sel >= 0 && items[sel] ? choose(items[sel]) : run(valueRef.current);
  // The word being typed: bold in the functions' titles, and the search behind "More Functions…".
  const typed = value.trim().split(/\s+/).at(-1) ?? '';
  // The directory searched for it, opened as a route: typed as a command, "HELP CORP" would open the CORP market.
  const moreFunctions = (text: string) => {
    navigate(panel, { fn: 'HELP', args: text });
    setValue('');
    setOpen(false);
    setSel(-1);
  };
  submitRef.current = submit;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      recall(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.key in FKEY_TEXT) {
      e.preventDefault();
      typeInto(panel, FKEY_TEXT[e.key]);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        if (items.length) {
          e.preventDefault();
          setSel((i) => (i + 1) % items.length);
        } else { e.preventDefault(); recall(1); }
        break;
      case 'ArrowUp':
        // On an empty line Up still recalls the last command; Down goes into the favourites listed below.
        if (!value.trim() && sel < 0) {
          e.preventDefault();
          recall(-1);
        } else if (items.length) {
          e.preventDefault();
          setSel((i) => (i <= 0 ? items.length - 1 : i - 1));
        } else { e.preventDefault(); recall(-1); }
        break;
      case 'Tab':
        // Ctrl+Tab and Ctrl+Shift+Tab move between panels; only a plain Tab completes.
        if (items.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const s = items[Math.max(0, sel)];
          if (s.fill) choose(s);
          else setValue(`${s.execute} `);
        }
        break;
      case 'Enter':
        e.preventDefault();
        submit();
        break;
      case 'Escape':
        e.preventDefault();
        if (open && items.length) setOpen(false);
        else {
          setValue('');
          setEditing(false);
          recallIndex.current = -1;
          clearFlash(panel);
        }
        setSel(-1);
        break;
      case 'Backspace':
        if (!value && !e.repeat) {
          e.preventDefault();
          back(panel);
        }
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        pagePanel(panel, e.key === 'PageDown' ? 1 : -1);
        break;
      default:
    }
  };

  const fnDef = lookupFn(route.fn);
  const sec = route.sec ? engine.get(route.sec) : undefined;
  const quote = useQuote(sec?.id);
  // The quote strip's two lines (TE01 03:11, TE04 04:55): the first shares the command line's row until typing starts,
  // the second takes the hint row. Screens without a security always show the command field.
  const quoteShown = !!sec && !!quote && !editing && !value;
  return (
    <>
    <div className="cmd" role="search">
      <span className="cmd-num" title={`Panel ${panel + 1}`}>
        {panel + 1}
      </span>
      <select
        className="cmd-link"
        aria-label={`Panel ${panel + 1} security link group`}
        title="Security link group: matching colors share selections across visible compatible panels. A linked monitor keeps its list open."
        value={group}
        style={{ color: LINK_GROUPS[group].color }}
        onChange={(e) => setLinkGroup(panel, Number(e.target.value) as LinkGroup)}
      >
        {LINK_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.id ? `${g.id} ${g.name}` : 'Unlinked'}</option>)}
      </select>
      <span className="cmd-nav">
        <button type="button" aria-label="Back" title="Back (Backspace on empty line)" disabled={!canBack} onClick={() => back(panel)}>
          ‹
        </button>
        <button type="button" aria-label="Forward" title="Forward" disabled={!canFwd} onClick={() => forward(panel)}>
          ›
        </button>
      </span>
      <span className={`cmd-field${quoteShown ? ' as-quote' : ''}`} onMouseDown={() => setEditing(true)}>
      <input
        ref={inputRef}
        id={`cmd-${panel}`}
        className="cmd-input"
        value={value}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={open && items.length > 0 ? `cmd-suggestions-${panel}` : undefined}
        aria-activedescendant={open && sel >= 0 && items[sel] ? `cmd-option-${panel}-${sel}` : undefined}
        aria-label={`Panel ${panel + 1} command line`}
        title="Enter / GO runs a command. Clicking an empty line lists your favourites: Down goes into the list, Up recalls the last command. Up / Down recall commands when suggestions are closed; Ctrl+Up / Down always recall."
        aria-describedby={`cmd-route-${panel}`}
        onChange={(e) => {
          setValue(e.target.value);
          setEditing(true);
          recallIndex.current = -1;
          setOpen(true);
          setSel(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setEditing(false);
          setTimeout(() => setOpen(false), 120);
        }}
      />
      {/* An empty line shows only the triangle and the cursor; what the panel runs is named for screen readers. */}
      {quoteShown && sec ? <span className="cmd-quote"><QuoteLine1 sec={sec} /></span> : null}
      <span id={`cmd-route-${panel}`} className="sr-only">{`${routeText(route, mnemonics)}${fnDef ? ` · ${fnDef.name}` : ''}`}</span>
      </span>
      <span className="cmd-spacer" />
      <button type="button" className="cmd-help" title="Help for this function" onClick={() => run(`HELP ${route.fn}`)}>
        ?
      </button>
      <button type="button" className="cmd-go" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
        GO
      </button>
      {open && items.length > 0 && (
        <div className="ac" id={`cmd-suggestions-${panel}`} ref={listRef} role="listbox" aria-label="Suggested functions and securities">
          {items.map((s, i) => {
            const head = i === 0 || items[i - 1].kind !== s.kind;
            const lastFn = s.kind === 'fn' && (i + 1 === items.length || items[i + 1].kind !== 'fn');
            return [
              head ? (
                <div key={`h${i}`} className="ac-head">
                  {s.kind === 'fn' ? 'FUNCTIONS' : s.kind === 'fav' ? '★ FAVOURITES' : s.kind === 'recent' ? 'RECENT SECURITIES' : 'SECURITIES'}
                </div>
              ) : null,
              <div
                key={s.key}
                id={`cmd-option-${panel}-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={`ac-item${i === sel ? ' sel' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
              >
                <span className={s.kind === 'fn' ? 'fn' : s.kind === 'fav' ? 'k fav' : 'k'} title={s.kind === 'fn' ? `${s.primary}: ${s.secondary}` : undefined}>
                  {s.kind === 'fn' && s.scope ? `${s.scope} ` : ''}
                  {s.kind === 'fn' && mnemonics ? suggestedMnemonic(s) : s.primary}
                </span>
                <span>{s.kind === 'fn' ? boldTyped(s.secondary, typed) : s.secondary}</span>
                <span className="tag">{s.tag}</span>
              </div>,
              lastFn && typed ? (
                <button key="more" type="button" className="ac-more" onMouseDown={(e) => e.preventDefault()} onClick={() => moreFunctions(typed)} title={`Every function matching ${typed}, in HELP`}>
                  More Functions…
                </button>
              ) : null,
            ];
          })}
          <div className="ac-foot">
            {value.trim() || favIds.length ? '↑↓ select · Enter run · Tab complete · Esc close' : '☆ next to a security\'s name makes it a favourite: it shows here first'}
          </div>
        </div>
      )}
    </div>
    {/* The row under the command line carries its hints and messages, in white. */}
    <div className="cmd-hints" aria-live="polite">{msg ? <span className={`cmd-msg ${msg.kind}`}>{msg.text}</span> : quoteShown && sec ? <QuoteLine2 sec={sec} /> : null}</div>
    </>
  );
}

/** A title with the letters typed in bold where a word starts with them ("**Merg**ers & Acquisitions"). */
export function boldTyped(title: string, typed: string): ReactNode {
  const t = typed.replace(/[^A-Za-z0-9&]/g, '');
  if (!t) return title;
  const re = new RegExp(`(^|[^A-Za-z0-9])(${t})`, 'gi');
  const out: ReactNode[] = [];
  let at = 0;
  for (let m = re.exec(title); m; m = re.exec(title)) {
    const start = m.index + m[1].length;
    out.push(title.slice(at, start), <b key={start}>{m[2]}</b>);
    at = start + m[2].length;
  }
  if (!out.length) return title;
  out.push(title.slice(at));
  return out;
}
