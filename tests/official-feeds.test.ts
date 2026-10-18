import { describe, expect, it, vi } from 'vitest';
import { FED_PRESS_URLS, fetchFedPress } from '../electron/official-feeds.cjs';

const rss = '<rss><channel><item><title>Synthetic Fed headline</title></item></channel></rss>';
describe('Federal Reserve RSS recovery', () => {
  it('uses the all-releases feed when it answers', async () => {
    const get = vi.fn(async () => new Response(rss));
    expect(await fetchFedPress(get, {})).toMatchObject({ status: 200, text: rss, sourceLabel: 'Federal Reserve Board', fallback: false });
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('recovers from the reported 404 with the explicitly labelled monetary-policy feed', async () => {
    const get = vi.fn().mockResolvedValueOnce(new Response('Not found', { status: 404 })).mockResolvedValueOnce(new Response(rss));
    expect(await fetchFedPress(get, {})).toMatchObject({ status: 200, text: rss, sourceLabel: 'Federal Reserve Board (monetary policy feed)', fallback: true });
    expect(get.mock.calls.map(([url]) => url)).toEqual(FED_PRESS_URLS);
  });
  it('rejects HTTP-200 HTML and stops after its two official candidates', async () => {
    const get = vi.fn(async () => new Response('<html>Not a feed</html>'));
    expect(await fetchFedPress(get, {})).toMatchObject({ text: '', error: expect.stringContaining('usable RSS') });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
