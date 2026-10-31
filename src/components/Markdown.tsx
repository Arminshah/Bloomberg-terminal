// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { ReactNode } from 'react';

/**
 * Renders Markdown (the release notes on WHATSNEW): headings, pipe tables, lists, links, bold, italic
 * notes and rules, as the app's own headings and tables. Only the elements below are produced, from text: nothing in
 * the source runs or becomes HTML, and links open only http(s) addresses.
 */

export type MdBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'table'; head: string[]; rows: string[][]; numeric: boolean[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'para'; text: string }
  | { type: 'rule' }
  | { type: 'code'; text: string };

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line) || (line.includes('|') && line.split('|').length >= 3);
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
/** A figure: number, percent, money, multiple or a dash for none. */
const NUMERIC = /^[(+\-−]?[$€£¥]?\s?[\d.,]+\s?(%|[KMBTkmbt]|bn|x|pp|bp)?\)?$|^(--|—|–|n\/a|N\/A)$/;

export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      out.push({ type: 'heading', level: h[1].length, text: h[2] });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push({ type: 'rule' });
      continue;
    }
    if (isRow(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && isRow(lines[i]) && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      const numeric = head.map((_, c) => rows.length > 0 && rows.every((r) => !r[c] || NUMERIC.test(stripInline(r[c]))));
      out.push({ type: 'table', head, rows, numeric });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const ordered = /\d/.test(li[1]);
      const items = [li[2]];
      for (i++; i < lines.length; i++) {
        const next = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (next && /\d/.test(next[1]) === ordered) items.push(next[2]);
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      i--;
      out.push({ type: 'list', ordered, items });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** The text of a cell without its Markdown marks, for deciding whether it holds a figure. */
function stripInline(s: string): string {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
}

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

/** Links, bold, italic and code within a line, as elements; everything else stays text. */
export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*?)_(?![\w_])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) {
      out.push(SAFE_URL.test(m[2]) ? <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener" className="blue">{inline(m[1], k)}</a> : m[1]);
    } else if (m[3] !== undefined || m[4] !== undefined) out.push(<strong key={k}>{inline(m[3] ?? m[4], k)}</strong>);
    else if (m[5] !== undefined) out.push(<code key={k}>{m[5]}</code>);
    else if (m[6] !== undefined || m[7] !== undefined) out.push(<em key={k} className="muted">{inline(m[6] ?? m[7], k)}</em>);
    else if (m[8] !== undefined) out.push(<a key={k} href={m[8]} target="_blank" rel="noreferrer noopener" className="blue">{m[8].replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, testId }: { text: string; testId?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="md" data-testid={testId}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case 'heading':
            return b.level <= 2 ? <div key={k} className="md-h1">{inline(b.text, k)}</div> : <div key={k} className="md-h2">{inline(b.text, k)}</div>;
          case 'table':
            return (
              <div key={k} className="tbl-wrap md-table">
                <table className="tbl zebra">
                  <thead>
                    <tr>{b.head.map((h, c) => <th key={c} className={b.numeric[c] ? 'num' : undefined}>{inline(h, `${k}h${c}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>{b.head.map((_, c) => <td key={c} className={b.numeric[c] ? 'num' : undefined}>{inline(r[c] ?? '', `${k}r${ri}c${c}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'list': {
            const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}l${j}`)}</li>);
            return b.ordered ? <ol key={k} className="md-list">{items}</ol> : <ul key={k} className="md-list">{items}</ul>;
          }
          case 'rule':
            return <hr key={k} className="md-rule" />;
          case 'code':
            return <pre key={k} className="md-code">{b.text}</pre>;
          default:
            return <p key={k} className="md-p">{inline(b.text, k)}</p>;
        }
      })}
    </div>
  );
}
