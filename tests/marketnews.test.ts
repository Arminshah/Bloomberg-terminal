import { describe, expect, it } from 'vitest';
import * as newsMain from '../electron/news.cjs';
import { canonicalUrl, finnhubSymbol, mergeStories, parseEdgar8k, parseFinnhubNews, parseMarketaux, parseMarketWatch, sameTicker, titleKey, watchSymbols } from '../src/data/live/marketnews';

// Made-up answers in the layouts each source documents; no request leaves the test.

describe('news requests (main process)', () => {
  it('builds only the requests the app makes', () => {
    expect(newsMain.newsRequest('finnhub-market', '', 'k')).toEqual({ url: 'https://finnhub.io/api/v1/news?category=general', headers: { 'X-Finnhub-Token': 'k' }, ttl: 5 * 60_000, provider: 'finnhub' });
    // Finnhub's key goes in a header, never in the URL.
    const company = newsMain.newsRequest('finnhub-company', 'AAPL|2026-10-07|2026-10-14', 'k')!;
    expect(company.url).toBe('https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-10-07&to=2026-10-14');
    expect(company.url).not.toContain('k&');
    expect(newsMain.newsRequest('finnhub-company', 'AAPL|2026-10-14|2026-10-07', 'k')).toBeNull();
    expect(newsMain.newsRequest('finnhub-company', 'aapl|2026-10-07|2026-10-14', 'k')).toBeNull();
    // Marketaux: the whole list in one request, three stories (its free plan's most), the token encoded.
    const mk = newsMain.newsRequest('marketaux', 'AAPL,MSFT,BRK.B', 't&x')!;
    expect(mk.url).toBe('https://api.marketaux.com/v1/news/all?symbols=AAPL,MSFT,BRK.B&filter_entities=true&language=en&limit=3&api_token=t%26x');
    expect(mk.ttl).toBe(60 * 60_000);
    expect(newsMain.newsRequest('marketaux', Array.from({ length: 51 }, (_, i) => `T${i}`).join(','), 't')).toBeNull();
    expect(newsMain.newsRequest('marketaux', '', 't')).toBeNull();
    expect(newsMain.newsRequest('edgar-8k', '', 'Ann Example ann@mail.org')!.url).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=40&output=atom');
    expect(newsMain.newsRequest('cnbc', '', '')).toBeNull();
    expect(newsMain.newsRequest('constructor', '', '')).toBeNull();
  });

  it('keeps each source behind its switch', () => {
    expect(newsMain.SOURCES.marketwatch.gate).toBe('MARKETWATCH_RSS_ENABLED');
    expect(newsMain.SOURCES['finnhub-market'].gate).toBe('FINNHUB_ENABLED');
    expect(newsMain.SOURCES['finnhub-company'].gate).toBe('FINNHUB_ENABLED');
    expect(newsMain.SOURCES.marketaux.gate).toBe('MARKETAUX_ENABLED');
    // The SEC is asked with the owner's contact as the User-Agent.
    expect(newsMain.SOURCES['edgar-8k'].agent).toBe(true);
  });
});

describe('links and titles', () => {
  it('reduces a link to the story it points at', () => {
    expect(canonicalUrl('https://www.Example.com/news/story-1/?utm_source=x&utm_medium=y#top')).toBe('example.com/news/story-1');
    expect(canonicalUrl('https://example.com/a?id=5&mod=rss')).toBe('example.com/a?id=5');
    expect(canonicalUrl('http://example.com/a/')).toBe(canonicalUrl('https://www.example.com/a'));
  });

  it('compares titles by their words', () => {
    expect(titleKey('Fed Holds Rates — Steady, as Expected!')).toBe(titleKey('fed holds rates: steady as expected'));
  });
});

describe('news answers', () => {
  it('reads Finnhub news', () => {
    const text = JSON.stringify([
      { category: 'top news', datetime: 1760450000, headline: 'Chipmaker beats estimates', id: 1, image: '', related: 'ABC, xyz,', source: 'Wire One', summary: 'Shares rose.', url: 'https://wire.example/a?utm_source=finnhub' },
      { category: 'top news', datetime: 1760450100, headline: '', related: '', source: 'Wire One', url: 'https://wire.example/b' },
      { category: 'top news', datetime: 1760450200, headline: 'No link', related: '', source: 'Wire One', url: 'javascript:alert(1)' },
    ]);
    const r = parseFinnhubNews(text);
    expect(r).toEqual([{ id: 'wire.example/a', title: 'Chipmaker beats estimates', url: 'https://wire.example/a?utm_source=finnhub', publisher: 'Wire One', feeds: ['Finnhub'], time: 1760450000000, summary: 'Shares rose.', tickers: ['ABC', 'XYZ'] }]);
    expect(parseFinnhubNews('{"error":"Invalid API key"}')).toEqual({ error: 'Invalid API key' });
  });

  it('reads Marketaux news with sentiment per company', () => {
    const text = JSON.stringify({
      meta: { found: 2, returned: 1, limit: 3, page: 1 },
      data: [
        {
          uuid: 'u1',
          title: 'Two companies sign a supply deal',
          description: 'A deal was signed.',
          url: 'https://news.example/deal',
          published_at: '2026-10-14T12:00:00.000000Z',
          source: 'news.example',
          entities: [
            { symbol: 'ABC', name: 'ABC Corp', type: 'equity', sentiment_score: 0.42 },
            { symbol: 'XYZ', name: 'XYZ Inc', type: 'equity', sentiment_score: null },
            { symbol: 'abc.lower', name: 'Not a ticker', type: 'equity', sentiment_score: 0.1 },
          ],
        },
      ],
    });
    const r = parseMarketaux(text);
    expect(r).toEqual([
      {
        id: 'news.example/deal',
        title: 'Two companies sign a supply deal',
        url: 'https://news.example/deal',
        publisher: 'news.example',
        feeds: ['Marketaux'],
        time: Date.parse('2026-10-14T12:00:00Z'),
        summary: 'A deal was signed.',
        tickers: ['ABC', 'XYZ'],
        sentiment: [{ symbol: 'ABC', score: 0.42 }],
      },
    ]);
    expect(parseMarketaux('{"error":{"code":"usage_limit_reached","message":"Daily limit reached."}}')).toEqual({ error: 'Daily limit reached.' });
  });

  it('reads the MarketWatch feed', () => {
    const xml = `<rss><channel><item><title><![CDATA[Stocks close higher]]></title><link>https://www.marketwatch.com/story/x?mod=rss</link><pubDate>Tue, 14 Oct 2026 20:05:00 GMT</pubDate><description>Indexes rose.</description></item></channel></rss>`;
    expect(parseMarketWatch(xml)).toEqual([{ id: 'marketwatch.com/story/x', title: 'Stocks close higher', url: 'https://www.marketwatch.com/story/x?mod=rss', publisher: 'MarketWatch', feeds: ['MarketWatch'], time: Date.parse('2026-10-14T20:05:00Z'), summary: 'Indexes rose.', tickers: [] }]);
  });

  it('reads the latest 8-K filings once each, with their items', () => {
    const entry = (role: string) => `<entry>
<title>8-K - EXAMPLE CORP (0001234567) (${role})</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000123/0001234567-26-000123-index.htm"/>
<summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-14 &lt;b&gt;AccNo:&lt;/b&gt; 0001234567-26-000123 &lt;b&gt;Size:&lt;/b&gt; 245 KB&lt;br&gt;Item 2.02: Results of Operations and Financial Condition&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary>
<updated>2026-10-14T16:05:12-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0001234567-26-000123</id>
</entry>`;
    const other = `<entry><title>4 - SOMEONE (0007654321) (Reporting)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/x-index.htm"/><summary type="html">x</summary><updated>2026-10-14T16:00:00-04:00</updated></entry>`;
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entry('Filer')}${entry('Subject')}${other}</feed>`;
    const r = parseEdgar8k(xml);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      title: 'EXAMPLE CORP filed a 8-K: Results of Operations and Financial Condition; Financial Statements and Exhibits',
      publisher: 'SEC EDGAR (company filing)',
      feeds: ['SEC EDGAR'],
      time: Date.parse('2026-10-14T20:05:12Z'),
      summary: 'Item 2.02 Results of Operations and Financial Condition · Item 9.01 Financial Statements and Exhibits',
      filing: true,
    });
  });

  it('shows a story carried by two sources once, newest first', () => {
    const a = parseFinnhubNews(JSON.stringify([{ datetime: 1760450000, headline: 'Chipmaker beats third-quarter estimates', related: 'ABC', source: 'Wire One', url: 'https://wire.example/a?utm_source=finnhub' }])) as never[];
    const b = parseMarketaux(
      JSON.stringify({ data: [{ title: 'Chipmaker beats third-quarter estimates', url: 'https://other.example/copy', published_at: '2026-10-14T15:00:00Z', source: 'other.example', entities: [{ symbol: 'ABC', sentiment_score: 0.3 }, { symbol: 'DEF', sentiment_score: -0.2 }] }] }),
    ) as never[];
    const c = parseFinnhubNews(JSON.stringify([{ datetime: 1760460000, headline: 'A different story', related: '', source: 'Wire Two', url: 'https://wire.example/a?utm_medium=x' }])) as never[];
    const merged = mergeStories([a, b, c]);
    // Same title under two links, and the same link with different tracking: one story each.
    expect(merged).toHaveLength(1);
    expect(merged[0].feeds).toEqual(['Finnhub', 'Marketaux']);
    expect(merged[0].tickers).toEqual(['ABC', 'DEF']);
    expect(merged[0].sentiment).toEqual([
      { symbol: 'ABC', score: 0.3 },
      { symbol: 'DEF', score: -0.2 },
    ]);
    expect(merged[0].time).toBe(1760450000000);
  });
});

describe('8-K items and class shares', () => {
  it('keeps an item whose name holds a colon', () => {
    const xml = `<feed><entry><title>8-K - EXAMPLE CORP (0001234567) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000124/0001234567-26-000124-index.htm"/><summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-14 &lt;b&gt;AccNo:&lt;/b&gt; 0001234567-26-000124 &lt;b&gt;Size:&lt;/b&gt; 300 KB&lt;br&gt;Item 5.02: Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers: Compensatory Arrangements of Certain Officers&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary><updated>2026-10-14T17:00:00-04:00</updated></entry></feed>`;
    expect(parseEdgar8k(xml)[0].summary).toBe(
      'Item 5.02 Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers: Compensatory Arrangements of Certain Officers · Item 9.01 Financial Statements and Exhibits',
    );
  });

  it('treats BRK-B, BRK.B and BRK/B as one ticker', () => {
    expect(sameTicker('BRK.B', 'BRK-B')).toBe(true);
    expect(sameTicker('BRK/B', 'BRK-B')).toBe(true);
    expect(sameTicker('BRK.A', 'BRK-B')).toBe(false);
    expect(finnhubSymbol('BRK-B')).toBe('BRK.B');
    expect(newsMain.newsRequest('finnhub-company', 'BRK.B|2026-10-07|2026-10-14', 'k')!.url).toContain('symbol=BRK.B&');
    // Marketaux is asked for both spellings of a class share, in one request.
    expect(watchSymbols(['AAPL', 'BRK-B', 'AAPL', 'bad ticker'])).toBe('AAPL,BRK-B,BRK.B');
  });
});

describe('Yahoo headlines and Euronext press releases', () => {
  it('builds the feed requests', async () => {
    const newsMain = await import('../electron/news.cjs');
    expect(newsMain.newsRequest('yahoo-rss', 'ABI.BR', '')!.url).toBe('https://feeds.finance.yahoo.com/rss/2.0/headline?s=ABI.BR&region=US&lang=en-US');
    expect(newsMain.newsRequest('yahoo-rss', '^GSPC', '')!.url).toContain('s=%5EGSPC&');
    expect(newsMain.newsRequest('yahoo-rss', 'abi.br', '')).toBeNull();
    expect(newsMain.newsRequest('yahoo-rss', 'ABI.BR&x=1', '')).toBeNull();
    expect(newsMain.SOURCES['yahoo-rss'].gate).toBe('YAHOO_RSS_ENABLED');
    expect(newsMain.newsRequest('euronext-pr', '', '')!.url).toBe('https://live.euronext.com/en/rss/company-pr-release');
    expect(newsMain.SOURCES['euronext-pr'].gate).toBe('EURONEXT_RSS_ENABLED');
  });

  it("reads Yahoo's feed, tagged with the ticker and the article's site as publisher", async () => {
    const { parseYahooRss } = await import('../src/data/live/marketnews');
    // Item layout as the feed answered on 18 October 2026, with a made-up story.
    const xml = '<rss><channel><item><description>Shares rose after results.</description><guid isPermaLink="false">4ad7c862</guid><link>https://www.fool.com/investing/2026/10/17/story/?.tsrc=rss</link><pubDate>Sat, 17 Oct 2026 20:07:00 +0000</pubDate><title>A brewer beats estimates</title></item></channel></rss>';
    expect(parseYahooRss(xml, 'ABI.BR')).toEqual([
      { id: 'fool.com/investing/2026/10/17/story?.tsrc=rss', title: 'A brewer beats estimates', url: 'https://www.fool.com/investing/2026/10/17/story/?.tsrc=rss', publisher: 'fool.com', feeds: ['Yahoo Finance'], time: Date.parse('2026-10-17T20:07:00Z'), summary: 'Shares rose after results.', tickers: ['ABI.BR'] },
    ]);
  });

  it("reads Euronext's feed with the company as publisher and no page markup", async () => {
    const { parseEuronextPr } = await import('../src/data/live/marketnews');
    const xml = '<rss><channel><item><title>EXAMPLE SA : CHIFFRE D’AFFAIRES À 9 MOIS</title><link>https://live.euronext.com/fr/products/equities/company-news/2026-10-15-example</link><description>&lt;span class="field__item"&gt; Stocks &lt;/span&gt; FR0000000000</description><pubDate>Thu, 15 Oct 2026 16:06:02 +0000</pubDate><dc:creator>master_of_puppets</dc:creator><guid>12916650 at https://live.euronext.com</guid></item></channel></rss>';
    const [st] = parseEuronextPr(xml);
    expect(st.publisher).toBe('EXAMPLE SA (press release)');
    expect(st.time).toBe(Date.parse('2026-10-15T16:06:02Z'));
    expect(st.summary).toBeUndefined();
    expect(st.feeds).toEqual(['Euronext']);
  });
});
