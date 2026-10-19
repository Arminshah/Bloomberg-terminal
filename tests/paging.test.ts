import { describe, expect, it } from 'vitest';
import { pageAfter, pageState, pageTop, typedPageCount } from '../src/terminal/paging';
import { firstRowNumber, rowNumbers } from '../src/terminal/numbering';

describe('screen pages', () => {
  it('counts one page when everything is in view', () => {
    expect(pageState({ top: 0, height: 800, client: 800 })).toMatchObject({ page: 1, pages: 1 });
    // A pixel or two of rounding does not make a second page.
    expect(pageState({ top: 0, height: 802, client: 800 })).toMatchObject({ page: 1, pages: 1 });
  });

  it('pages by the visible height less one line of overlap and the pinned header', () => {
    // 2,000 px of content in a 500 px panel with a 60 px pinned header: pages of 420 px, scrolling stops at 1,500.
    const g = { top: 0, height: 2000, client: 500, pinned: 60 };
    const s = pageState(g);
    expect(s).toEqual({ page: 1, pages: 5, step: 420, max: 1500 });
    expect([1, 2, 3, 4, 5].map((p) => pageTop(s, p))).toEqual([0, 420, 840, 1260, 1500]);
    // Each page's own offset reads back as that page.
    for (const p of [1, 2, 3, 4, 5]) expect(pageState({ ...g, top: pageTop(s, p) }).page, `page ${p}`).toBe(p);
  });

  it('calls the end of the content the last page even between page boundaries', () => {
    const g = { height: 2000, client: 500, pinned: 60 };
    expect(pageState({ ...g, top: 1499 }).page).toBe(5);
    expect(pageState({ ...g, top: 1300 }).page).toBe(4);
    expect(pageState({ ...g, top: 410 }).page).toBe(1);
    // Within two pixels of a boundary counts as the next page (sub-pixel scrolling).
    expect(pageState({ ...g, top: 419 }).page).toBe(2);
  });

  it('moves a number of pages and stops at either end', () => {
    const s = { ...pageState({ top: 0, height: 2000, client: 500, pinned: 60 }), page: 2 };
    expect(pageAfter(s, 1)).toBe(3);
    expect(pageAfter(s, -1)).toBe(1);
    // "13 PAGE FWD" from page 2 would be page 15; this screen has 5.
    expect(pageAfter(s, 1, 13)).toBe(5);
    expect(pageAfter(s, -1, 3)).toBe(1);
    expect(pageTop(s, 99)).toBe(1500);
    expect(pageTop(s, -4)).toBe(0);
  });

  it('keeps a usable step in a very short panel', () => {
    expect(pageState({ top: 0, height: 400, client: 30, pinned: 40 }).step).toBe(40);
  });

  it('reads a page count typed before PAGE FWD and nothing else', () => {
    expect(typedPageCount('13')).toBe(13);
    expect(typedPageCount(' 2 ')).toBe(2);
    expect(typedPageCount('0')).toBeUndefined();
    expect(typedPageCount('1234')).toBeUndefined();
    expect(typedPageCount('AAPL')).toBeUndefined();
    expect(typedPageCount('3 GO')).toBeUndefined();
    expect(typedPageCount('')).toBeUndefined();
  });
});

describe('numbered rows', () => {
  it('numbers rows around the function bar actions 96 to 99', () => {
    expect(rowNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(rowNumbers(94, 4)).toEqual([94, 95, 100, 101]);
    expect(rowNumbers(11, 0)).toEqual([]);
  });

  it('stops at three digits', () => {
    expect(rowNumbers(998, 5)).toEqual([998, 999]);
  });

  it('starts rows clear of the screen own tabs and actions', () => {
    expect(firstRowNumber([])).toBe(1);
    expect(firstRowNumber([98, 99])).toBe(1);
    expect(firstRowNumber([1, 2, 3, 4])).toBe(11);
    expect(firstRowNumber([1, 2, 3, 4, 5, 11, 12, 13, 14])).toBe(21);
    expect(firstRowNumber([1, 2, 3, 4, 5, 6, 7, 96, 97])).toBe(11);
  });
});
