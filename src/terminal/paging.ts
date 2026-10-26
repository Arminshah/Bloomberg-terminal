/**
 * Screen paging, as PAGE FWD / PAGE BACK work on a terminal: a long screen is a
 * series of pages, the function bar shows "Page 2/5", and a number typed before
 * PAGE FWD moves that many pages ("13 PAGE FWD" goes from page 2 to page 15).
 *
 * The page arithmetic is pure so it can be tested; the DOM helpers find the
 * region of a panel that actually scrolls (a news list, a table, or the panel).
 */

/** Scroll position and sizes of the region being paged, in pixels. */
export interface PageGeometry {
  /** Current scroll offset. */
  top: number;
  /** Full content height. */
  height: number;
  /** Visible height of the region. */
  client: number;
  /** Height of a header pinned over the top of the region, which hides content as it scrolls under it. */
  pinned?: number;
}

export interface PageState {
  /** 1-based current page. */
  page: number;
  pages: number;
  /** Pixels from one page's top to the next. */
  step: number;
  /** Largest scroll offset. */
  max: number;
}

/** One line of overlap, so the last line of a page is the first line of the next. */
export const PAGE_OVERLAP = 20;
/** Offsets within this many pixels count as the same position (sub-pixel scrolling). */
const SLACK = 2;

export function pageState(g: PageGeometry, overlap = PAGE_OVERLAP): PageState {
  // A page moves by what shows below the pinned header; scrolling stops when the content's end is in view.
  const step = Math.max(40, Math.floor(g.client - (g.pinned ?? 0) - overlap));
  const max = Math.max(0, Math.floor(g.height - g.client));
  if (max <= SLACK) return { page: 1, pages: 1, step, max };
  // A last page starting within SLACK of the page before would read back as that page: it is not counted.
  const pages = 1 + Math.ceil((max - SLACK) / step);
  const page = g.top >= max - SLACK ? pages : Math.min(pages, 1 + Math.floor((g.top + SLACK) / step));
  return { page, pages, step, max };
}

/** The scroll offset that shows a page; past either end it stops at the first or last page. */
export function pageTop(state: PageState, page: number): number {
  const p = Math.min(state.pages, Math.max(1, Math.round(page)));
  return Math.min(state.max, (p - 1) * state.step);
}

/** Where `count` pages forward (dir 1) or back (dir -1) lands from the current page. */
export function pageAfter(state: PageState, dir: 1 | -1, count = 1): number {
  const n = Math.max(1, Math.floor(count));
  return Math.min(state.pages, Math.max(1, state.page + dir * n));
}

/**
 * A count typed on the command line before PAGE FWD / PAGE BACK: one to three
 * digits and nothing else. Anything else is not a page count.
 */
export function typedPageCount(text: string): number | undefined {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return n > 0 ? n : undefined;
}

// ------------------------------------------------------------- DOM helpers

/** The panel's largest vertically scrollable region: the panel body itself, or a list or table inside it. */
export function pageTarget(panel: number): HTMLElement | undefined {
  const body = typeof document === 'undefined' ? null : document.getElementById(`panel-body-${panel}`);
  if (!body) return undefined;
  let target: HTMLElement = body;
  let best = body.scrollHeight - body.clientHeight;
  // Scrolling regions are block containers outside tables (lists, table wrappers, story panes). Looking only at those
  // keeps this cheap on a thousand-line table, whose cells would otherwise each be measured every time.
  for (const el of body.querySelectorAll<HTMLElement>('div:not(table div), section:not(table section), ul:not(table ul), ol:not(table ol), pre:not(table pre)')) {
    const room = el.scrollHeight - el.clientHeight;
    if (room > best + 8 && el.clientHeight > 80) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        target = el;
        best = room;
      }
    }
  }
  return target;
}

/** Height of the function header pinned over the top of the scrolling region, if it sits inside it. */
function pinnedHeight(el: HTMLElement): number {
  const header = el.querySelector<HTMLElement>('.fnh');
  if (!header || getComputedStyle(header).position !== 'sticky') return 0;
  // Only a header that scrolls with this region (and is pinned to it) covers its content.
  let p: HTMLElement | null = header.parentElement;
  while (p && p !== el) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') return 0;
    p = p.parentElement;
  }
  return header.offsetHeight;
}

export function geometryOf(el: HTMLElement): PageGeometry {
  return { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight, pinned: pinnedHeight(el) };
}

/** Moves a panel `count` pages; returns the page now shown, or undefined when the panel has nothing to page. */
export function turnPage(panel: number, dir: 1 | -1, count = 1): PageState | undefined {
  const el = pageTarget(panel);
  if (!el) return undefined;
  const state = pageState(geometryOf(el));
  const page = pageAfter(state, dir, count);
  el.scrollTo({ top: pageTop(state, page) });
  return { ...state, page };
}
