import { useEffect, useState, type MouseEvent } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { openSecurity } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine } from '../data/market';
import { rebuildSupplyChain, sharePeriod, supplyChainAvailable, useSupplyChain, type Chain, type Filer, type Relation, type Role } from '../data/live/supply-chain';
import { secTicker } from '../data/live/sec';
import { earningsCalendar, requestListings } from '../data/live/earnings-calendar';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type SortKey = 'exposure' | 'cap' | 'name' | 'date';
type ColorKey = 'change' | 'share' | 'none';
type SourceKey = 'all' | 'quantified' | 'listed' | 'recent';
type PeerKey = 'own' | 'theirs' | 'all';

const TABS = [
  { n: 1, label: 'Summary' },
  { n: 2, label: 'Suppliers' },
  { n: 3, label: 'Customers' },
  { n: 4, label: 'Competitors' },
  { n: 5, label: 'Partners & Investors' },
  { n: 6, label: 'Filings Read' },
];

/** Opens a related company's PROFILE: its line in the app, its US ticker, or its European listing. */
function openRelated(panel: number, r: Relation, e?: MouseEvent) {
  if (r.id && engine.get(r.id)) openSecurity(panel, r.id, e, 'PROFILE');
  else if (r.ticker) execute(panel, `${r.ticker.replace('-', '/')} US EQUITY PROFILE`);
  else if (r.id) execute(panel, `${r.id.toUpperCase()} PROFILE`);
}

const openable = (r: Relation) => !!(r.ticker || r.id);

const docUrl = (path: string) => `https://www.sec.gov/Archives/edgar/data/${path}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-04-23" as "Apr 2026". */
export function monthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** The newest statement behind a relation. */
export function latestEvidence(r: Relation): Relation['evidence'][number] | undefined {
  return r.evidence.reduce<Relation['evidence'][number] | undefined>((m, e) => (!m || e.date > m.date ? e : m), undefined);
}

/** The figure a box shows: whose share of what; without a share, who said so last and when ("Its press release · Apr 2026"). */
export function shareLabel(r: Relation): string {
  if (r.share == null) {
    const e = latestEvidence(r);
    if (!e) return '';
    const src = sourceLabel(e);
    if (r.side === 'both') return `Both name it · ${monthYear(e.date)}`;
    return `${r.side === 'own' ? 'Its' : 'Their'} ${src === 'Press release' || src === 'Agreement' ? src.toLowerCase() : src} · ${monthYear(e.date)}`;
  }
  const v = `${r.qualifier === '>' ? '≥' : r.qualifier === '<' ? '<' : ''}${fmtNum(r.share, r.share % 1 ? 1 : 0)}%`;
  const period = sharePeriod(r.evidence[0]?.sentence ?? '');
  const tail = period ? ` · ${period}` : '';
  switch (r.basis) {
    case 'their-revenue':
    case 'target-revenue':
      return `Rev: ${v}${tail}`;
    case 'their-product-sales':
      return `Sales: ${v}${tail}`;
    case 'their-purchases':
      return `Purch: ${v}${tail}`;
    default:
      return `${v}${tail}`;
  }
}

/** One line on what the relation is, in the target's terms. */
export function describe(r: Relation, t: string): string {
  const period = r.share != null ? sharePeriod(r.evidence[0]?.sentence ?? '') : '';
  const v = r.share != null ? `${r.qualifier === '>' ? 'at least ' : r.qualifier === '<' ? 'less than ' : ''}${fmtNum(r.share, r.share % 1 ? 1 : 0)}%` : '';
  switch (r.role) {
    case 'supplier':
      if (r.basis === 'their-revenue') return `${t} brought ${v} of its revenue${period ? ` (${period})` : ''}`;
      return r.side === 'theirs' ? `Names ${t} as a customer` : r.side === 'both' ? `Named by ${t}; names it as a customer` : `Named by ${t} as a supplier`;
    case 'customer':
      if (r.basis === 'target-revenue') return `${v} of ${t}'s revenue${period ? ` (${period})` : ''}`;
      if (r.basis === 'their-product-sales') return `${v} of its sales are ${t} products${period ? ` (${period})` : ''}`;
      if (r.basis === 'their-purchases') return `${v} of its purchases are from ${t}${period ? ` (${period})` : ''}`;
      return r.side === 'theirs' ? `Names ${t} as a supplier` : r.side === 'both' ? `Named by ${t}; names it as a supplier` : `Named by ${t} as a customer`;
    case 'competitor':
      return r.side === 'theirs' ? `Names ${t} as a competitor` : r.side === 'both' ? `${t} and it name each other as competitors` : `Named by ${t} as a competitor`;
    case 'partner':
      return `Partnership with ${t}`;
    case 'investment':
      return `${t} took a stake or invested`;
    case 'investor':
      return r.side === 'own' ? `Invested in ${t}` : `Holds an investment in ${t}`;
    case 'lender':
      return r.side === 'own' ? `Lends to ${t} (credit or loan facility)` : `Lends to ${t}`;
  }
}

/** The kind of relation in the Partners & Investors table. */
export function relationLabel(r: Relation): string {
  return r.role === 'partner' ? 'Partner' : r.role === 'investor' ? 'Investor' : r.role === 'lender' ? 'Lender' : 'Investment';
}

/** "8-K EX-99.1" as the reader knows it: a press release; an 8-K is a current report. */
export function sourceLabel(e: { form: string; type?: string }): string {
  if (e.type && /^EX-99/i.test(e.type)) return 'Press release';
  if (/^8-K/i.test(e.form)) return e.type && /^EX-10/i.test(e.type) ? 'Agreement' : '8-K';
  return e.form;
}

function latestDate(r: Relation): string {
  return latestEvidence(r)?.date ?? '';
}

/** Stated in a filing of the last twelve months. */
function recent(r: Relation, now = Date.now()): boolean {
  const d = Date.parse(`${latestDate(r)}T00:00:00Z`);
  return Number.isFinite(d) && now - d < 366 * 86_400_000;
}

/**
 * Sorted for the chosen order. "Company Exposure" puts stated shares first, largest first, then companies both sides
 * name, then those the company names itself, each by market value.
 */
function sorted(list: Relation[], key: SortKey, capOf: (r: Relation) => number): Relation[] {
  const arr = [...list];
  const cap = (r: Relation) => (Number.isFinite(capOf(r)) ? capOf(r) : -1);
  if (key === 'name') return arr.sort((a, b) => a.name.localeCompare(b.name));
  if (key === 'date') return arr.sort((a, b) => latestDate(b).localeCompare(latestDate(a)) || a.name.localeCompare(b.name));
  if (key === 'cap') return arr.sort((a, b) => cap(b) - cap(a) || a.name.localeCompare(b.name));
  const sideRank = (r: Relation) => (r.side === 'both' ? 0 : r.side === 'own' ? 1 : 2);
  return arr.sort(
    (a, b) =>
      (b.share ?? -1) - (a.share ?? -1) ||
      sideRank(a) - sideRank(b) ||
      cap(b) - cap(a) ||
      Number(openable(b)) - Number(openable(a)) ||
      b.evidence.length - a.evidence.length ||
      a.name.localeCompare(b.name),
  );
}

/** Box colours: green for a rise and red for a fall, brighter as the move grows (to ±3%); grey without a price. */
export function changeFill(pct: number | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '#262626';
  const k = Math.min(Math.abs(pct) / 3, 1);
  const mix = (a: number[], b: number[]) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`;
  return pct >= 0 ? mix([22, 58, 26], [38, 140, 48]) : mix([72, 24, 24], [168, 34, 34]);
}

function shareFill(share: number | undefined): string {
  if (share == null) return '#262626';
  const k = Math.min(share / 50, 1);
  return `rgb(${Math.round(20 + 20 * k)},${Math.round(50 + 70 * k)},${Math.round(90 + 110 * k)})`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** "CISCO SYSTEMS, INC." as "Cisco Systems Inc": the SEC's list writes many names in capitals. */
export function displayName(name: string): string {
  const clean = name.replace(/\s*[/\\][A-Za-z]{2,3}[/\\]?\s*$/, '').replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(clean)) return clean;
  return clean
    .split(' ')
    .map((w) => (/^(?:INC|CORP|CO|LTD|PLC|LLC|N\.V\.|S\.A\.|AG|SE)\.?,?$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w.length <= 3 && !/^(AND|THE|OF|FOR)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}

interface BoxProps {
  r: Relation;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  t: string;
  onOpen: (r: Relation, e: MouseEvent) => void;
}

function Box({ r, x, y, w, h, fill, t, onOpen }: BoxProps) {
  const ev = r.evidence[0];
  const tip = `${displayName(r.name)}${r.ticker ? ` (${r.ticker})` : ''}\n${describe(r, t)}\n\n"${trunc(ev?.sentence ?? '', 420)}"\n${ev ? `${ev.filer}, ${ev.form} filed ${ev.date}` : ''}`;
  const chars = Math.floor((w - 10) / 7.4);
  return (
    <g className={`splc-box${openable(r) ? ' link' : ''}`} onClick={(e) => openable(r) && onOpen(r, e)} data-key={r.key}>
      <title>{tip}</title>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} />
      <text x={x + 6} y={y + 18} className="splc-name">
        {trunc(displayName(r.name), chars)}
      </text>
      <text x={x + 6} y={y + 36} className="splc-metric">
        {shareLabel(r)}
      </text>
      <g transform={`translate(${x + w - 14},${y + 31})`}>
        <circle r={6.5} className="splc-info" />
        <text y={3.5} textAnchor="middle" className="splc-i">
          i
        </text>
      </g>
    </g>
  );
}

const W = 1000;
const H = 610;
const BOX_W = 232;
const BOX_H = 44;
const GAP = 7;
const SIDE_ROWS = 8;
const BOTTOM = 4;

function Pager({ x, y, page, pages, onPage, vertical }: { x: number; y: number; page: number; pages: number; onPage: (p: number) => void; vertical?: boolean }) {
  if (pages <= 1) return null;
  const prev = vertical ? '▲' : '◀';
  const next = vertical ? '▼' : '▶';
  return (
    <g className="splc-pager">
      <text x={x} y={y} className={page > 0 ? 'link' : 'off'} onClick={() => page > 0 && onPage(page - 1)}>
        {prev}
      </text>
      <text x={x + 18} y={y} className="splc-pg">
        {page + 1}/{pages}
      </text>
      <text x={x + 52} y={y} className={page < pages - 1 ? 'link' : 'off'} onClick={() => page < pages - 1 && onPage(page + 1)}>
        {next}
      </text>
    </g>
  );
}

function Summary({ chain, t, suppliers, customers, competitors, fillOf, onOpen }: { chain: Chain; t: string; suppliers: Relation[]; customers: Relation[]; competitors: Relation[]; fillOf: (r: Relation) => string; onOpen: (r: Relation, e: MouseEvent) => void }) {
  const [pages, setPages] = useState({ s: 0, c: 0, k: 0 });
  const sp = Math.ceil(suppliers.length / SIDE_ROWS);
  const cp = Math.ceil(customers.length / SIDE_ROWS);
  const kp = Math.ceil(competitors.length / BOTTOM);
  const ps = Math.min(pages.s, Math.max(sp - 1, 0));
  const pc = Math.min(pages.c, Math.max(cp - 1, 0));
  const pk = Math.min(pages.k, Math.max(kp - 1, 0));
  const left = suppliers.slice(ps * SIDE_ROWS, ps * SIDE_ROWS + SIDE_ROWS);
  const right = customers.slice(pc * SIDE_ROWS, pc * SIDE_ROWS + SIDE_ROWS);
  const bottom = competitors.slice(pk * BOTTOM, pk * BOTTOM + BOTTOM);
  const top = 74;
  const rowY = (i: number) => top + i * (BOX_H + GAP);
  const hubY = 250;
  const hubL = { x: 330, y: hubY };
  const hubR = { x: W - 330, y: hubY };
  const hubB = { x: W / 2, y: 418 };
  const cx = W / 2 - 128;
  const cy = 176;
  const quantified = customers.filter((r) => r.basis === 'target-revenue' && r.share != null);
  const revQ = quantified.reduce((a, r) => a + (r.share ?? 0), 0);
  const read = chain.filers.filter((f) => f.state === 'read').length;
  const total = chain.filers.length;
  const newest = chain.relations.reduce((m, r) => (latestDate(r) > m ? latestDate(r) : m), '');
  const count = (role: Role) => chain.relations.filter((r) => r.role === role).length;
  const company = chain.company?.display ?? displayName(chain.company?.name ?? t);
  const bw = 182;
  const bx0 = 96;
  const bgap = (W - 2 * bx0 - BOTTOM * bw) / (BOTTOM - 1);
  const by = 520;
  return (
    <svg className="splc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t} supply chain`}>
      <text x={W / 2} y={20} textAnchor="middle" className="splc-title">
        {t}&apos;s Exposure to Related Companies:
      </text>
      <text x={W / 2} y={38} textAnchor="middle" className="splc-sub">
        Suppliers are sorted by the share of their revenue {t} brings; customers by the share of {t}&apos;s revenue they bring,
      </text>
      <text x={W / 2} y={52} textAnchor="middle" className="splc-sub">
        then by the share of their sales or purchases {t} accounts for. Companies named without a share follow.
      </text>
      {/* Suppliers */}
      <text x={hubL.x} y={hubL.y - 16} textAnchor="middle" className="splc-hub-label">
        {suppliers.length} Supplier{suppliers.length === 1 ? '' : 's'}
      </text>
      {left.map((r, i) => (
        <line key={`ls${r.key}`} x1={10 + BOX_W} y1={rowY(i) + BOX_H / 2} x2={hubL.x - 10} y2={hubL.y} className="splc-edge" />
      ))}
      <rect x={hubL.x - 10} y={hubL.y - 10} width={20} height={20} className="splc-hub" />
      <line x1={hubL.x + 10} y1={hubL.y} x2={cx} y2={hubL.y} className="splc-edge" />
      {left.map((r, i) => (
        <Box key={`s${r.key}`} r={r} x={10} y={rowY(i)} w={BOX_W} h={BOX_H} fill={fillOf(r)} t={t} onOpen={onOpen} />
      ))}
      <Pager x={90} y={rowY(SIDE_ROWS) + 14} page={ps} pages={sp} onPage={(p) => setPages((x) => ({ ...x, s: p }))} vertical />
      {/* Customers */}
      <text x={hubR.x} y={hubR.y - 16} textAnchor="middle" className="splc-hub-label">
        {customers.length} Customer{customers.length === 1 ? '' : 's'}
      </text>
      {right.map((r, i) => (
        <line key={`lc${r.key}`} x1={W - 10 - BOX_W} y1={rowY(i) + BOX_H / 2} x2={hubR.x + 10} y2={hubR.y} className="splc-edge" />
      ))}
      <rect x={hubR.x - 10} y={hubR.y - 10} width={20} height={20} className="splc-hub" />
      <line x1={cx + 256} y1={hubR.y} x2={hubR.x - 10} y2={hubR.y} className="splc-edge" />
      {right.map((r, i) => (
        <Box key={`c${r.key}`} r={r} x={W - 10 - BOX_W} y={rowY(i)} w={BOX_W} h={BOX_H} fill={fillOf(r)} t={t} onOpen={onOpen} />
      ))}
      <Pager x={W - 10 - BOX_W + 80} y={rowY(SIDE_ROWS) + 14} page={pc} pages={cp} onPage={(p) => setPages((x) => ({ ...x, c: p }))} vertical />
      {/* The company */}
      <g className="splc-center">
        <rect x={cx} y={cy} width={256} height={166} rx={4} fill={fillOf({ key: '__self', name: company, role: 'customer', side: 'own', evidence: [] })} />
        <text x={cx + 10} y={cy + 22} className="splc-center-name">
          {trunc(company, 30)}
        </text>
        <text x={cx + 10} y={cy + 38} className="splc-center-tk">
          {t}
        </text>
        <text x={cx + 10} y={cy + 60} className="splc-center-line">
          {quantified.length
            ? `Rev. quantified ${fmtNum(revQ, 1)}% (${quantified.length} customer${quantified.length === 1 ? '' : 's'})`
            : 'No customer above 10% of revenue disclosed'}
        </text>
        <text x={cx + 10} y={cy + 77} className="splc-center-line">
          Suppliers {suppliers.length} · {suppliers.filter((r) => r.share != null).length} with a share
        </text>
        <text x={cx + 10} y={cy + 94} className="splc-center-line">
          Customers {customers.length} · {customers.filter((r) => r.share != null).length} with a share
        </text>
        <text x={cx + 10} y={cy + 111} className="splc-center-line">
          Competitors {competitors.length}
        </text>
        <text x={cx + 10} y={cy + 128} className="splc-center-line">
          Partners {count('partner')} · Investors {count('investor') + count('investment')} · Lenders {count('lender')}
        </text>
        <text x={cx + 10} y={cy + 152} className="splc-center-foot">
          {chain.state === 'loading' ? `Reading filings ${read} of ${total || '…'}` : `${read} filings read${newest ? ` · newest ${monthYear(newest)}` : ''}`}
        </text>
      </g>
      {/* Competitors */}
      <line x1={W / 2} y1={cy + 166} x2={hubB.x} y2={hubB.y - 10} className="splc-edge" />
      <text x={hubB.x} y={cy + 186} textAnchor="middle" className="splc-hub-label">
        {competitors.length} Competitor{competitors.length === 1 ? '' : 's'}
      </text>
      <rect x={hubB.x - 10} y={hubB.y - 10} width={20} height={20} className="splc-hub" />
      {bottom.map((r, i) => (
        <line key={`lk${r.key}`} x1={hubB.x} y1={hubB.y + 10} x2={bx0 + i * (bw + bgap) + bw / 2} y2={by} className="splc-edge" />
      ))}
      {bottom.map((r, i) => (
        <Box key={`k${r.key}`} r={r} x={bx0 + i * (bw + bgap)} y={by} w={bw} h={BOX_H} fill={fillOf(r)} t={t} onOpen={onOpen} />
      ))}
      <Pager x={W / 2 - 30} y={by + BOX_H + 22} page={pk} pages={kp} onPage={(p) => setPages((x) => ({ ...x, k: p }))} />
    </svg>
  );
}

function Legend({ color }: { color: ColorKey }) {
  if (color === 'none') return null;
  return (
    <div className="splc-legend">
      <span className="amber">Analysis: {color === 'change' ? '1 Day Price Change %' : 'Share Stated %'}</span>
      <span className={`splc-grad ${color}`} />
      <span className="splc-ticks">{color === 'change' ? <><span>-3</span><span>0</span><span>+3</span></> : <><span>0</span><span>25</span><span>50+</span></>}</span>
    </div>
  );
}

function RelationTable({ rows, t, changes, onOpen, role, capOf }: { rows: Relation[]; t: string; changes: Record<string, number>; onOpen: (r: Relation, e: MouseEvent) => void; role: Role | 'other'; capOf: (r: Relation) => number }) {
  if (!rows.length) return <div className="empty">No {role === 'other' ? 'partnerships or investments' : `${role}s`} found in the filings read.</div>;
  return (
    <table className="tbl zebra splc-tbl">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Name</th>
          <th>Ticker</th>
          {role === 'other' && <th>Relation</th>}
          <th>Relationship</th>
          <th className="num">Share</th>
          <th className="num hide-m">Mkt Cap</th>
          <th className="num hide-m">1D %</th>
          <th className="hide-m">Source</th>
          <th className="hide-m">Latest</th>
          <th className="num hide-m" title="How many statements in the filings read name the relation">Stmts</th>
          <th className="hide-m">Statement</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const ev = r.evidence[0];
          const chg = changes[r.key];
          return (
            <tr key={`${r.key}|${r.role}`}>
              <td className="num muted">{i + 1}</td>
              <td className={openable(r) ? 'link amber' : 'white'} onClick={(e) => openable(r) && onOpen(r, e)}>
                {displayName(r.name)}
              </td>
              <td>{r.ticker ?? (r.id ? r.id.replace(/ Equity$/, '') : '')}</td>
              {role === 'other' && <td>{relationLabel(r)}</td>}
              <td>{describe(r, t)}</td>
              <td className="num white">
                {r.share != null ? `${r.qualifier === '>' ? '≥' : r.qualifier === '<' ? '<' : ''}${fmtNum(r.share, 1)}%` : ''}
                {r.share != null && sharePeriod(ev?.sentence ?? '') ? <span className="muted"> {sharePeriod(ev?.sentence ?? '')}</span> : null}
              </td>
              <td className="num hide-m">{Number.isFinite(capOf(r)) ? fmtBig(capOf(r), 1) : ''}</td>
              <td className={`num hide-m ${chg > 0 ? 'up' : chg < 0 ? 'dn' : ''}`}>{chg != null && Number.isFinite(chg) ? fmtPct(chg, 2) : ''}</td>
              <td className="hide-m">
                {ev && (
                  <a className="link" href={docUrl(ev.path)} target="_blank" rel="noopener noreferrer" title={`${ev.filer} ${ev.form}${ev.type ? ` ${ev.type}` : ''}`}>
                    {sourceLabel(ev)} {fmtDay(Date.parse(`${ev.date}T00:00:00Z`))}
                  </a>
                )}
              </td>
              <td className="hide-m">{latestDate(r) ? fmtDay(Date.parse(`${latestDate(r)}T00:00:00Z`)) : ''}</td>
              <td className="num hide-m">{r.evidence.length}</td>
              <td className="hide-m splc-quote" title={r.evidence.map((e) => `${e.filer} (${e.form} ${e.date}): ${e.sentence}`).join('\n\n')}>
                {ev ? trunc(ev.sentence, 160) : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * SPLC, supply chain analysis: the company's suppliers, customers and competitors as annual reports filed with the
 * SEC state them, with the share of revenue each relation stands for when the report gives it, and the sentence and
 * filing behind each one.
 */
export function SPLC({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const chain = useSupplyChain(s);
  const [tab, setTab] = useState(1);
  const [sort, setSort] = useState<SortKey>('exposure');
  const [color, setColor] = useState<ColorKey>('change');
  const [source, setSource] = useState<SourceKey>('all');
  const [peers, setPeers] = useState<PeerKey>('all');
  const [filter, setFilter] = useState('');
  const t = chain?.company?.ticker ? `${chain.company.ticker} US` : s.ticker;
  useEffect(() => requestListings(), []);
  const listings = earningsCalendar.use((x) => x.listings?.data);
  const capOf = (r: Relation) => (r.ticker ? listings?.get(r.ticker.replace('-', '.'))?.cap ?? listings?.get(r.ticker)?.cap ?? NaN : NaN);
  const changes = chain?.changes ?? {};
  const keep = (r: Relation) =>
    (source === 'all' || (source === 'quantified' ? r.share != null : source === 'recent' ? recent(r) : openable(r) || !!r.yahoo)) &&
    (!filter.trim() || `${r.name} ${r.ticker ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const all = chain?.relations ?? [];
  const suppliers = sorted(all.filter((r) => r.role === 'supplier' && keep(r)), sort, capOf);
  const customers = sorted(all.filter((r) => r.role === 'customer' && keep(r)), sort, capOf);
  const competitors = sorted(all.filter((r) => r.role === 'competitor' && keep(r) && (peers === 'all' || (peers === 'own' ? r.side !== 'theirs' : r.side !== 'own'))), sort, capOf);
  const others = sorted(all.filter((r) => (r.role === 'partner' || r.role === 'investment' || r.role === 'investor' || r.role === 'lender') && keep(r)), sort, capOf);
  const fillOf = (r: Relation) => (color === 'change' ? changeFill(r.key === '__self' ? selfChange(s.id) : changes[r.key]) : color === 'share' ? shareFill(r.key === '__self' ? undefined : r.share) : '#1d3a22');
  const onOpen = (r: Relation, e: MouseEvent) => openRelated(panel, r, e);
  const csv = () => [
    ['Relation', 'Name', 'Ticker', 'Share %', 'Share of', 'Stated by', 'Filer', 'Form', 'Filed', 'Statement', 'Document'],
    ...all.map((r) => {
      const ev = r.evidence[0];
      return [r.role, displayName(r.name), r.ticker ?? '', r.share ?? '', r.basis ?? '', r.side, ev?.filer ?? '', ev?.form ?? '', ev?.date ?? '', ev?.sentence ?? '', ev ? docUrl(ev.path) : ''];
    }),
  ];
  const usOnly = !secTicker(s);
  const status = !supplyChainAvailable()
    ? 'Supply chains are read from SEC filings by the desktop app.'
    : chain?.state === 'error'
      ? chain.message
      : !chain || (chain.state === 'loading' && !chain.filers.length)
        ? 'Searching the SEC’s full-text index for reports that name the company…'
        : null;
  return (
    <div>
      <FnHeader
        code="SUPPLYCHAIN"
        title="Supply Chain Analysis"
        sec={s}
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        actions={[...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_SPLC.csv`, csv), { n: 97, label: 'Refresh', onClick: () => rebuildSupplyChain(s) }]}
        controls={
          <>
            <div className="chart-tools">
              <span className="amber">{s.name}</span>
              <label className="fld">
                Source
                <select className="sel-inp" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as SourceKey)}>
                  <option value="all">All Companies</option>
                  <option value="quantified">With a Stated Share</option>
                  <option value="listed">Listed Securities</option>
                  <option value="recent">Stated in the Last 12 Months</option>
                </select>
              </label>
              <label className="fld">
                Sort By
                <select className="sel-inp" aria-label="Sort By" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="exposure">Company Exposure</option>
                  <option value="cap">Market Cap</option>
                  <option value="name">Name</option>
                  <option value="date">Latest Filing</option>
                </select>
              </label>
            </div>
            <div className="chart-tools">
              <label className="fld">
                Filter By
                <input className="inp splc-filter" aria-label="Filter By" placeholder="Name or ticker" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
              <label className="fld">
                Color Coding
                <select className="sel-inp" aria-label="Color Coding" value={color} onChange={(e) => setColor(e.target.value as ColorKey)}>
                  <option value="change">1 Day Price Change %</option>
                  <option value="share">Share Stated %</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="fld">
                Peers
                <select className="sel-inp" aria-label="Peers" value={peers} onChange={(e) => setPeers(e.target.value as PeerKey)}>
                  <option value="all">All Competitors</option>
                  <option value="own">Company Reported</option>
                  <option value="theirs">Naming the Company</option>
                </select>
              </label>
            </div>
          </>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        chain && (
          <>
            {tab === 1 && (
              <>
                <Summary chain={chain} t={t} suppliers={suppliers} customers={customers} competitors={competitors} fillOf={fillOf} onOpen={onOpen} />
                <Legend color={color} />
              </>
            )}
            {tab === 2 && <RelationTable rows={suppliers} t={t} changes={changes} onOpen={onOpen} role="supplier" capOf={capOf} />}
            {tab === 3 && <RelationTable rows={customers} t={t} changes={changes} onOpen={onOpen} role="customer" capOf={capOf} />}
            {tab === 4 && <RelationTable rows={competitors} t={t} changes={changes} onOpen={onOpen} role="competitor" capOf={capOf} />}
            {tab === 5 && <RelationTable rows={others} t={t} changes={changes} onOpen={onOpen} role="other" capOf={capOf} />}
            {tab === 6 && <FilingsRead chain={chain} />}
            <p className="pad-s muted">
              From SEC filings: the company&apos;s own latest annual and quarterly reports and its press releases and agreements (8-K) of the last year; and, from
              other companies that name it, their annual and quarterly reports (10-K, 20-F, 40-F, 10-Q) of the last 18 months, IPO prospectuses (S-1, F-1, 424B4)
              of the last three years and press releases of the last year
              {chain.names ? ` (${chain.names.legal.concat(chain.names.names).filter((v, i, a) => a.indexOf(v) === i).join(', ')})` : ''}. Shares are as the
              reports state them, for the latest year they give: a supplier&apos;s share is of its own revenue, a customer&apos;s of {t}&apos;s revenue (or of its
              own sales or purchases). Companies a filing names without a share are listed after, with the filing that last named them; unnamed counterparties are
              shown as the filings describe them. Each box links to the statements and filings behind it.
              {usOnly ? ' The company is not in the SEC’s list, so only other companies’ reports are read.' : ''}
            </p>
          </>
        )
      )}
    </div>
  );
}

function selfChange(id: string): number | undefined {
  const q = engine.quote(id);
  return q && Number.isFinite(q.pct) ? q.pct : undefined;
}

const SOURCE: Record<Filer['source'], string> = { own: 'Its own filing', report: 'Report naming it', current: 'Current report naming it' };

function FilingsRead({ chain }: { chain: Chain }) {
  return (
    <table className="tbl zebra">
      <thead>
        <tr>
          <th>Filer</th>
          <th>Document</th>
          <th className="hide-m">Read as</th>
          <th>Filed</th>
          <th>State</th>
          <th className="num">Statements</th>
        </tr>
      </thead>
      <tbody>
        {chain.filers.map((r) => (
          <tr key={r.path}>
            <td className="white">{displayName(r.name)}</td>
            <td>
              <a className="link" href={docUrl(r.path)} target="_blank" rel="noopener noreferrer" title={`${r.form}${r.type && r.type !== r.form ? ` ${r.type}` : ''}`}>
                {r.form}
                {r.type && r.type !== r.form ? ` ${r.type}` : ''}
              </a>
            </td>
            <td className="hide-m muted">{SOURCE[r.source]}</td>
            <td>{fmtDay(Date.parse(`${r.date}T00:00:00Z`))}</td>
            <td className={r.state === 'failed' ? 'dn' : r.state === 'read' ? '' : 'amber'}>{r.state === 'read' ? 'Read' : r.state === 'failed' ? 'Failed' : r.state === 'reading' ? 'Reading…' : 'Waiting'}</td>
            <td className="num">{r.found ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
