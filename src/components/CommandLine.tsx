import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { execute } from '../terminal/exec';
import { panelMessages, clearFlash } from '../terminal/panel';
import { back, forward, terminal } from '../terminal/state';
import { suggest, type Suggestion } from '../terminal/suggest';
import type { Route } from '../terminal/types';
import { lookupFn } from '../terminal/registry';

/** Imperative handles per panel for global keys and the key bar. */
interface CommandApi {
  input: HTMLInputElement;
  append: (token: string) => void;
  submit: () => void;
  clear: () => void;
}
export const commandApis = new Map<number, CommandApi>();

export const FKEY_TEXT: Record<string, string> = {
  F2: 'GOVT',
  F8: 'EQUITY',
  F9: 'CMDTY',
  F10: 'INDEX',
  F11: 'CRNCY',
};

/** Appends a yellow key (or any token) to a panel's command line. */
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

function routeText(r: Route): string {
  const parts = [r.sec, r.fn, r.args].filter(Boolean);
  return parts.join(' ');
}

export function CommandLine({ panel, route }: { panel: number; route: Route }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const msg = panelMessages.use((m) => m[panel]);
  const canBack = terminal.use((s) => s.panels[panel].idx > 0);
  const canFwd = terminal.use((s) => s.panels[panel].idx < s.panels[panel].history.length - 1);

  const valueRef = useRef(value);
  valueRef.current = value;
  const runRef = useRef<(text: string) => void>(() => undefined);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const api: CommandApi = {
      input: el,
      append: (token) => {
        const cur = valueRef.current.trimEnd();
        setValue(`${cur}${cur ? ' ' : ''}${token} `);
        setOpen(true);
        setSel(-1);
        el.focus();
      },
      submit: () => runRef.current(valueRef.current),
      clear: () => {
        setValue('');
        setOpen(false);
        setSel(-1);
        clearFlash(panel);
      },
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

  const items = useMemo(() => (open && value.trim() ? suggest(value) : []), [value, open]);

  useEffect(() => {
    if (sel < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (text: string) => {
    if (!text.trim()) return;
    const ok = execute(panel, text);
    if (ok) {
      setValue('');
      setOpen(false);
      setSel(-1);
    }
  };

  runRef.current = run;

  const choose = (s: Suggestion) => {
    if (s.execute) run(s.execute);
    else if (s.fill) {
      setValue(s.fill);
      setSel(-1);
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
        }
        break;
      case 'ArrowUp':
        if (items.length) {
          e.preventDefault();
          setSel((i) => (i <= 0 ? items.length - 1 : i - 1));
        }
        break;
      case 'Tab':
        if (items.length) {
          e.preventDefault();
          const s = items[Math.max(0, sel)];
          if (s.fill) choose(s);
          else setValue(`${s.execute} `);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (sel >= 0 && items[sel]) choose(items[sel]);
        else run(value);
        break;
      case 'Escape':
        e.preventDefault();
        if (open && items.length) setOpen(false);
        else {
          setValue('');
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
      default:
    }
  };

  const fnDef = lookupFn(route.fn);
  return (
    <div className="cmd" role="search">
      <span className="cmd-num" title={`Panel ${panel + 1}`}>
        {panel + 1}
      </span>
      <span className="cmd-nav">
        <button type="button" aria-label="Back" title="Back (Backspace on empty line)" disabled={!canBack} onClick={() => back(panel)}>
          ‹
        </button>
        <button type="button" aria-label="Forward" title="Forward" disabled={!canFwd} onClick={() => forward(panel)}>
          ›
        </button>
      </span>
      <input
        ref={inputRef}
        id={`cmd-${panel}`}
        className="cmd-input"
        value={value}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        aria-label={`Panel ${panel + 1} command line`}
        placeholder={`${routeText(route)}${fnDef ? `  ·  ${fnDef.name}` : ''}`}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setSel(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {msg && <span className={`cmd-msg ${msg.kind}`}>{msg.text}</span>}
      <button type="button" className="cmd-help" title="Help for this function" onClick={() => run(`HELP ${route.fn}`)}>
        ?
      </button>
      <button type="button" className="cmd-go" onMouseDown={(e) => e.preventDefault()} onClick={() => (sel >= 0 && items[sel] ? choose(items[sel]) : run(value))}>
        GO
      </button>
      {open && items.length > 0 && (
        <div className="ac" ref={listRef} role="listbox">
          {items.map((s, i) => {
            const head = i === 0 || items[i - 1].kind !== s.kind;
            return [
              head ? (
                <div key={`h${i}`} className="ac-head">
                  {s.kind === 'fn' ? 'Functions' : 'Securities'}
                </div>
              ) : null,
              <div
                key={s.key}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={`ac-item${i === sel ? ' sel' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
              >
                <span className={s.kind === 'fn' ? 'fn' : 'k'}>{s.primary}</span>
                <span>{s.secondary}</span>
                <span className="tag">{s.tag}</span>
              </div>,
            ];
          })}
          <div className="ac-foot">↑↓ select · Enter run · Tab complete · Esc close</div>
        </div>
      )}
    </div>
  );
}
