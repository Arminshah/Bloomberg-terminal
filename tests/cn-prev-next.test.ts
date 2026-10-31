import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import type { MarketStory } from '../src/data/live/marketnews';
import { panelMessages } from '../src/terminal/panel';
import { CompanyNews, StoryList, storyOrder, storySteps } from '../src/functions/MNEWS';

const NOW = Date.parse('2026-10-30T15:00:00Z');
// Synthetic stories: the tests exercise the list's order and actions, not any real headline.
const story = (id: string, hoursOld: number, feeds: MarketStory['feeds'] = ['Alpaca']): MarketStory => ({
  id: `https://example.com/${id}`,
  title: `Synthetic story ${id}`,
  url: `https://example.com/${id}`,
  publisher: 'Benzinga',
  feeds,
  time: NOW - hoursOld * 3_600_000,
  tickers: ['AAPL'],
});
// Newest first, as the sources merge them; C is carried by two sources, so CN ranks it first under Top Ranked News.
const A = story('a', 1);
const B = story('b', 2);
const C = story('c', 3, ['Alpaca', 'Google News']);

const shown = vi.hoisted(() => ({ stories: [] as MarketStory[] }));
vi.mock('../src/data/live/secnews', async (original) => ({
  ...(await original<typeof import('../src/data/live/secnews')>()),
  useSecuritiesNews: () => 0,
  securityNews: () => ({ stories: shown.stories, states: [['Alpaca', { state: 'ok', count: shown.stories.length }]] }),
}));
// The news is read by the desktop app; the server render stands in for it.
vi.mock('../src/data/live/marketnews', async (original) => ({ ...(await original<typeof import('../src/data/live/marketnews')>()), newsAvailable: () => true }));

beforeEach(() => {
  vi.spyOn(engine, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  panelMessages.set({});
  shown.stories = [];
});

describe("COMPANYNEWS story steps, as CN's 4) Previous and 3) Next", () => {
  it('finds the open story and its neighbours in the order the list shows', () => {
    expect(storyOrder([A, B, C], NOW, null)).toMatchObject({ current: A, prev: undefined, next: B });
    expect(storyOrder([A, B, C], NOW, B.id)).toMatchObject({ current: B, prev: A, next: C });
    expect(storyOrder([A, B, C], NOW, C.id)).toMatchObject({ current: C, prev: B, next: undefined });
    // A story the sources no longer return leaves the first headline open, as a fresh list does.
    expect(storyOrder([A, B, C], NOW, 'https://example.com/gone')).toMatchObject({ current: A, prev: undefined, next: B });
    // Ranked, the top story heads the list, so the steps follow that order rather than the time order.
    const ranked = storyOrder([A, B, C], NOW, A.id, 'AAPL', 3);
    expect(ranked.stories).toEqual([C, A, B]);
    expect(ranked).toMatchObject({ current: A, prev: C, next: B });
    expect(storyOrder([], NOW, null)).toMatchObject({ current: undefined, prev: undefined, next: undefined });
  });

  it('gives 4) Previous then 3) Next, each opening its neighbour, and says why one has nowhere to go', () => {
    const step = vi.fn();
    const first = storySteps({ ...storyOrder([A, B, C], NOW, null), step }, 7);
    expect(first.map((x) => [x.n, x.label, x.to])).toEqual([[4, 'Previous', undefined], [3, 'Next', B]]);
    first[1].run();
    expect(step).toHaveBeenCalledWith(B);
    // At the top of the list, 4 <GO> opens nothing and says so on the panel's message line.
    first[0].run();
    expect(step).toHaveBeenCalledTimes(1);
    expect(panelMessages.get()[7]).toMatchObject({ text: 'No previous story: the first headline is open', kind: 'error' });

    const middle = storySteps({ ...storyOrder([A, B, C], NOW, B.id), step }, 7);
    middle[0].run();
    expect(step).toHaveBeenLastCalledWith(A);
    middle[1].run();
    expect(step).toHaveBeenLastCalledWith(C);

    const last = storySteps({ ...storyOrder([A, B, C], NOW, C.id), step }, 7);
    expect(last.map((x) => x.to)).toEqual([B, undefined]);
    last[1].run();
    expect(step).toHaveBeenCalledTimes(3);
    expect(panelMessages.get()[7]?.text).toBe('No next story: the last headline is open');

    const none = storySteps({ ...storyOrder([], NOW, null), step }, 7);
    expect(none.map((x) => [x.to, x.why])).toEqual([[undefined, 'No story is open'], [undefined, 'No story is open']]);
  });

  it('puts them on the function bar, Previous disabled on the first headline and Next opening the second in the ranked order', () => {
    shown.stories = [A, B, C];
    const html = renderToStaticMarkup(createElement(CompanyNews, { route: { fn: 'COMPANYNEWS' }, sec: engine.get('AAPL US Equity')! }));
    const bar = /<span class="fnh-actions">(.*?)<\/span><span class="fnh-caption">/.exec(html)?.[1] ?? '';
    expect(bar).toBe(
      '<button type="button" class="act story-step" disabled="" title="No previous story: the first headline is open"><b>4)</b> Previous</button>' +
        '<button type="button" class="act story-step" title="Synthetic story a (type 3 and press Enter)"><b>3)</b> Next</button>',
    );
    // The headlines stay numbered from 101), the ranked story first and open.
    expect([...html.matchAll(/<span class="news-n">(\d+\))<\/span>/g)].map((m) => m[1])).toEqual(['101)', '102)', '103)']);
    expect(html).toMatch(/class="news-item numbered real sel"[^>]*><span class="news-n">101\)<\/span>[\s\S]*?Synthetic story c/);
  });

  it('leaves both disabled when no story is open', () => {
    const html = renderToStaticMarkup(createElement(CompanyNews, { route: { fn: 'COMPANYNEWS' }, sec: engine.get('AAPL US Equity')! }));
    expect(html.match(/<button type="button" class="act story-step" disabled="" title="No story is open">/g)).toHaveLength(2);
  });

  it("leaves the other news screens' lists without them", () => {
    const html = renderToStaticMarkup(createElement(StoryList, { stories: [A, B, C], empty: 'None', first: 11 }));
    expect(html).not.toContain('story-step');
    expect(html).not.toContain('Previous');
    expect([...html.matchAll(/<span class="news-n">(\d+\))<\/span>/g)].map((m) => m[1])).toEqual(['11)', '12)', '13)']);
    expect(html).toMatch(/class="news-item numbered real sel"[^>]*><span class="news-n">11\)<\/span>[\s\S]*?Synthetic story a/);
  });
});
