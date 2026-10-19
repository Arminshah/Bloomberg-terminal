import { describe, expect, it } from 'vitest';
import * as newsMain from '../electron/news.cjs';
import { canonicalUrl, finnhubSymbol, mergeStories, parseEdgar8k, parseFinnhubNews, parseMarketaux, parseMarketWatch, sameTicker, titleKey, watchSymbols } from '../src/data/live/marketnews';
import googleKbcNl from './fixtures/google-news-kbc-nl.xml?raw';

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
    expect(st.issuer).toBe('EXAMPLE SA');
    expect(st.time).toBe(Date.parse('2026-10-15T16:06:02Z'));
    expect(st.summary).toBeUndefined();
    expect(st.feeds).toEqual(['Euronext']);
  });
});

describe("a Euronext-listed company's press releases", () => {
  it('knows the stocks listed on a Euronext market', async () => {
    const { onEuronext } = await import('../src/data/live/marketnews');
    expect(onEuronext({ cls: 'equity', country: 'BE', exch: 'EN Brussels' })).toBe(true);
    expect(onEuronext({ cls: 'equity', country: 'IE' })).toBe(true);
    // Euronext's markets outside the five countries, as the app names them.
    expect(onEuronext({ cls: 'equity', country: 'IT', exch: 'EN Milan' })).toBe(true);
    expect(onEuronext({ cls: 'equity', country: 'US', exch: 'NASDAQ' })).toBe(false);
    expect(onEuronext({ cls: 'equity', country: 'DE', exch: 'Xetra' })).toBe(false);
    expect(onEuronext({ cls: 'index', country: 'FR', exch: 'EN Paris' })).toBe(false);
  });

  it('reads a name without case, accents, punctuation or legal forms', async () => {
    const { companyWords } = await import('../src/data/live/marketnews');
    expect(companyWords('Anheuser-Busch InBev SA/NV')).toEqual(['anheuser', 'busch', 'inbev']);
    expect(companyWords("L'Oreal SA")).toEqual(['loreal']);
    expect(companyWords('L’ORÉAL')).toEqual(['loreal']);
    expect(companyWords('Koninklijke Philips N.V.')).toEqual(['koninklijke', 'philips']);
    expect(companyWords('NV Bekaert SA')).toEqual(['bekaert']);
    expect(companyWords('Jerónimo Martins, SGPS, S.A.')).toEqual(['jeronimo', 'martins']);
    expect(companyWords('Sofina Société Anonyme')).toEqual(['sofina']);
    // A name that is only a legal form keeps it.
    expect(companyWords('SE')).toEqual(['se']);
  });

  it('matches an issuer to the company, not to another company that shares its first word', async () => {
    const { sameCompany } = await import('../src/data/live/marketnews');
    // Yahoo's names for the listings beside the names Euronext's feed gives the issuers.
    expect(sameCompany('AGEAS', 'Ageas SA/NV')).toBe(true);
    expect(sameCompany('ANHEUSER-BUSCH INBEV', 'Anheuser-Busch InBev SA/NV')).toBe(true);
    expect(sameCompany('L’ORÉAL', "L'Oreal SA")).toBe(true);
    expect(sameCompany('UCB', 'UCB SA')).toBe(true);
    expect(sameCompany('ASML HOLDING N.V.', 'ASML Holding NV')).toBe(true);
    expect(sameCompany('LVMH', 'LVMH Moet Hennessy Louis Vuitton SE')).toBe(true);
    expect(sameCompany('COLRUYT', 'Colruyt Group N.V.')).toBe(true);
    expect(sameCompany('KBC GROEP', 'KBC Groep NV')).toBe(true);
    // KBC Ancora holds KBC shares but is another company; "KBC" alone is too short to name either.
    expect(sameCompany('KBC ANCORA', 'KBC Groep NV')).toBe(false);
    expect(sameCompany('KBC', 'KBC Ancora')).toBe(false);
    expect(sameCompany('KBC', 'KBC Groep NV')).toBe(false);
    expect(sameCompany('EDP RENOVAVEIS', 'EDP - Energias de Portugal, S.A.')).toBe(false);
    expect(sameCompany('AIR FRANCE-KLM', 'Air Liquide SA')).toBe(false);
    expect(sameCompany('SPINEWAY', 'ASML Holding NV')).toBe(false);
    expect(sameCompany('', 'ASML Holding NV')).toBe(false);
  });

  it("keeps a company's releases from Euronext's feed, by issuer or by a title that starts with its name", async () => {
    const { parseEuronextPr, releasesOf } = await import('../src/data/live/marketnews');
    // Titles in the shapes the feed carried on 18 October 2026, with made-up links.
    const item = (title: string, n: number) => `<item><title>${title}</title><link>https://live.euronext.com/en/products/equities/company-news/2026-10-1${n}-x</link><pubDate>Thu, 1${n} Oct 2026 16:06:02 +0000</pubDate></item>`;
    const xml = `<rss><channel>${[
      'SPINEWAY : CHIFFRE D’AFFAIRES À 9 MOIS',
      'KBC Groep NV : KBC Group third-quarter 2026 results',
      'KBC ANCORA : Interim financial information',
      'Mercialys Appoints a Lead Independent Director',
      'ROCTOOL: INFORMATION MENSUELLE RELATIVE AU NOMBRE TOTAL DE DROITS DE VOTE',
      'UCB announces a dividend',
    ].map(item).join('')}</channel></rss>`;
    const all = parseEuronextPr(xml);
    // Newest first: the last item is the latest.
    expect(all.map((s) => s.issuer)).toEqual([undefined, undefined, undefined, 'KBC ANCORA', 'KBC Groep NV', 'SPINEWAY']);
    const titles = (company: string) => releasesOf(company, all).map((s) => s.title);
    expect(titles('KBC Groep NV')).toEqual(['KBC Groep NV : KBC Group third-quarter 2026 results']);
    expect(titles('KBC Ancora')).toEqual(['KBC ANCORA : Interim financial information']);
    expect(titles('Spineway SA')).toEqual(['SPINEWAY : CHIFFRE D’AFFAIRES À 9 MOIS']);
    expect(titles('Mercialys SA')).toEqual(['Mercialys Appoints a Lead Independent Director']);
    expect(titles('Roctool SA')).toEqual(['ROCTOOL: INFORMATION MENSUELLE RELATIVE AU NOMBRE TOTAL DE DROITS DE VOTE']);
    // A title is not matched on a short first word alone.
    expect(titles('UCB SA')).toEqual([]);
    expect(titles('ASML Holding NV')).toEqual([]);
  });
});

describe('Alpaca, Massive and Google News requests (main process)', () => {
  const now = Date.parse('2026-10-19T04:00:00Z');

  it('reads mergers from Finnhub besides its general news, and no other category', () => {
    expect(newsMain.newsRequest('finnhub-market', 'merger', 'k')!.url).toBe('https://finnhub.io/api/v1/news?category=merger');
    expect(newsMain.newsRequest('finnhub-market', 'crypto', 'k')).toBeNull();
  });

  it("asks Alpaca with both keys in headers, for the last three days' or a ticker's last month", () => {
    const market = newsMain.newsRequest('alpaca-market', '', 'PKID', 'SECRET', now)!;
    expect(market.url).toBe('https://data.alpaca.markets/v1beta1/news?start=2026-10-16&sort=desc&limit=50');
    expect(market.headers).toEqual({ 'APCA-API-KEY-ID': 'PKID', 'APCA-API-SECRET-KEY': 'SECRET' });
    expect(market.provider).toBe('alpaca');
    expect(newsMain.newsRequest('alpaca-market', 'AAPL', 'PKID', 'SECRET', now)).toBeNull();
    expect(newsMain.newsRequest('alpaca-company', 'BRK.B', 'PKID', 'SECRET', now)!.url).toBe('https://data.alpaca.markets/v1beta1/news?symbols=BRK.B&start=2026-09-19&sort=desc&limit=50');
    expect(newsMain.newsRequest('alpaca-company', 'aapl', 'PKID', 'SECRET', now)).toBeNull();
    expect(newsMain.SOURCES['alpaca-company']).toMatchObject({ credential: 'ALPACA_API_KEY_ID', credential2: 'ALPACA_API_SECRET_KEY', gate: 'ALPACA_ENABLED' });
  });

  it("asks Massive with its key in the Bearer header, never in the URL", () => {
    const market = newsMain.newsRequest('massive-market', '', 'mkey')!;
    expect(market.url).toBe('https://api.massive.com/v2/reference/news?order=desc&sort=published_utc&limit=100');
    expect(market.headers).toEqual({ Authorization: 'Bearer mkey' });
    const company = newsMain.newsRequest('massive-company', 'AAPL', 'mkey')!;
    expect(company.url).toBe('https://api.massive.com/v2/reference/news?ticker=AAPL&order=desc&sort=published_utc&limit=50');
    expect(company.url).not.toContain('mkey');
    expect(newsMain.newsRequest('massive-company', 'AAPL&apiKey=x', 'mkey')).toBeNull();
    // Its own switch, so CROSSCHECK can keep Massive's 5 calls a minute.
    expect(newsMain.SOURCES['massive-company'].gate).toBe('MASSIVE_NEWS_ENABLED');
  });

  it("searches Google News for the day's market news in an English edition", () => {
    const market = newsMain.newsRequest('google-news-market', 'US:en', '')!;
    expect(market.url).toMatch(/^https:\/\/news\.google\.com\/rss\/search\?q=.+&hl=en-US&gl=US&ceid=US:en$/);
    expect(new URL(market.url).searchParams.get('q')).toBe('(stocks OR "stock market" OR "Wall Street" OR earnings OR bonds OR "central bank") when:1d');
    expect(newsMain.newsRequest('google-news-market', 'GB:en', '')!.url).toContain('&hl=en-GB&gl=GB&ceid=GB:en');
    // Its words are English.
    expect(newsMain.newsRequest('google-news-market', 'BE:nl', '')).toBeNull();
    expect(newsMain.newsRequest('google-news-market', 'XX:en', '')).toBeNull();
    expect(newsMain.SOURCES['google-news-market'].gate).toBe('GOOGLE_NEWS_RSS_ENABLED');
  });

  it('searches a company by name with words about its shares, in the edition asked', () => {
    const query = (arg: string) => {
      const r = newsMain.newsRequest('google-news-company', arg, '');
      return r ? decodeURIComponent(new URL(r.url).searchParams.get('q')!) : null;
    };
    expect(query('US:en|Apple|AAPL')).toBe('"Apple" (stock OR shares OR earnings OR AAPL) when:7d');
    expect(newsMain.newsRequest('google-news-company', 'BE:nl|KBC|KBC', '')!.url).toContain('&hl=nl&gl=BE&ceid=BE:nl');
    // A ticker that is the name adds nothing; one that is Google's operator would break the search.
    expect(query('BE:nl|KBC|KBC')).toBe('"KBC" (aandeel OR aandelen OR beurs OR winst OR omzet OR resultaten) when:7d');
    expect(query('FR:fr|L’Oréal|OR')).toBe('"L’Oréal" (action OR actions OR bourse OR bénéfice OR résultats) when:7d');
    expect(query('BE:fr|AB InBev|ABI')).toBe('"AB InBev" (action OR actions OR bourse OR bénéfice OR résultats OR ABI) when:7d');
    expect(query('PT:pt-150|Jeronimo Martins|')).toBe('"Jeronimo Martins" (ações OR bolsa OR lucro OR receitas) when:7d');
    // Abroad, the country it is listed in: "KBC" alone in English finds an Indian quiz show.
    expect(query('GB:en|KBC|KBC|BE')).toBe('"KBC" (stock OR shares OR earnings) (Belgium OR Belgian OR Brussels) when:7d');
    expect(query('GB:en|KBC|KBC|XX')).toBeNull();
    expect(query('GB:en|KBC|KBC|BE|x')).toBeNull();
    // Only a name, never search syntax, from the page.
    expect(query('US:en|Apple" OR "x|AAPL')).toBeNull();
    expect(query('US:en|Apple) site:x.com (|AAPL')).toBeNull();
    expect(query('US:en|Apple|aapl')).toBeNull();
    expect(query('BE:de|KBC|KBC')).toBeNull();
    expect(query('US:en||AAPL')).toBeNull();
  });

  it('has words for every edition language', () => {
    for (const e of Object.values(newsMain.EDITIONS)) expect(newsMain.FINANCE_WORDS[e.lang]?.length).toBeGreaterThan(2);
    // And for every country whose stocks are also searched in the UK edition.
    for (const ceid of Object.keys(newsMain.EDITIONS)) {
      const country = ceid.split(':')[0];
      if (!['US', 'GB', 'IE', 'CA'].includes(country)) expect(newsMain.COUNTRY_WORDS[country], country).toHaveLength(3);
    }
  });
});

describe("a stock's Google News searches", () => {
  it('asks the editions of its market in the name the press uses', async () => {
    const { googleSearches } = await import('../src/data/live/marketnews');
    const stock = (id: string, name: string, country: string) => ({ id, name, cls: 'equity' as const, ticker: id.replace(/ Equity$/, ''), country });
    expect(googleSearches(stock('KBC BB Equity', 'KBC Groep NV', 'BE'))).toEqual(['BE:nl|KBC|KBC', 'BE:fr|KBC|KBC', 'GB:en|KBC|KBC|BE']);
    expect(googleSearches(stock('ABI BB Equity', 'Anheuser-Busch InBev SA/NV', 'BE'))).toEqual(['BE:nl|AB InBev|ABI', 'BE:fr|AB InBev|ABI', 'GB:en|AB InBev|ABI|BE']);
    expect(googleSearches(stock('SHEL LN Equity', 'Shell plc', 'GB'))).toEqual(['GB:en|Shell|SHEL']);
    expect(googleSearches(stock('AAPL US Equity', 'Apple Inc.', 'US'))).toEqual(['US:en|Apple|AAPL']);
    expect(googleSearches(stock('SOFI US Equity', 'SoFi Technologies, Inc.', 'US'))).toEqual(['US:en|SoFi Technologies|SOFI']);
    expect(googleSearches(stock('VOLV/B SS Equity', 'AB Volvo (publ)', 'SE'))).toEqual(['SE:sv|AB Volvo|VOLV', 'GB:en|AB Volvo|VOLV|SE']);
    // A ticker that is a number is left out; a market without its own edition reads the US one.
    expect(googleSearches(stock('7203 JT Equity', 'Toyota Motor Corp', 'JP'))).toEqual(['US:en|Toyota|']);
    expect(googleSearches({ id: 'SPX Index', name: 'S&P 500', cls: 'index', ticker: 'SPX', country: 'US' })).toEqual([]);
  });

  it('only asks searches the main process accepts', async () => {
    const { googleSearches } = await import('../src/data/live/marketnews');
    for (const country of ['US', 'CA', 'GB', 'IE', 'BE', 'NL', 'FR', 'DE', 'AT', 'CH', 'IT', 'ES', 'PT', 'SE', 'DK', 'FI', 'NO', 'JP', 'HK']) {
      const searches = googleSearches({ id: 'EXM XX Equity', name: 'Société Exemple & Fils N.V.', cls: 'equity', ticker: 'EXM XX', country });
      expect(searches.length).toBeGreaterThan(0);
      for (const a of searches) expect(newsMain.newsRequest('google-news-company', a, ''), a).not.toBeNull();
    }
  });

  it('shortens names to the words the press uses', async () => {
    const { shortName } = await import('../src/data/news');
    const name = (n: string) => shortName({ id: 'X', name: n, cls: 'equity' } as never);
    expect(name('Anheuser-Busch InBev SA/NV')).toBe('Anheuser-Busch InBev');
    expect(name('KBC Groep NV')).toBe('KBC');
    expect(name('Banco Santander, S.A.')).toBe('Banco Santander');
    expect(name('Novo Nordisk A/S')).toBe('Novo Nordisk');
    expect(name('Eni S.p.A.')).toBe('Eni');
    expect(name('Koninklijke Philips N.V.')).toBe('Koninklijke Philips');
    expect(name('NVIDIA Corporation')).toBe('NVIDIA');
    expect(name('Coca-Cola Co/The')).toBe('Coca-Cola');
    // A name that starts with "Groupe" keeps it.
    expect(name('Groupe Bruxelles Lambert SA')).toBe('Groupe Bruxelles Lambert');
  });
});

describe('Alpaca, Massive and Google News answers', () => {
  it("reads Alpaca's news, with Benzinga as publisher and no story without a link", async () => {
    const { parseAlpacaNews } = await import('../src/data/live/marketnews');
    // The layout of Alpaca's documented example, with made-up stories.
    const text = JSON.stringify({
      news: [
        { id: 24843171, headline: 'Chipmaker &amp; partner sign a supply deal', author: 'A Writer', created_at: '2026-10-19T02:10:00Z', updated_at: '2026-10-19T02:12:00Z', summary: '<p>Shares rose.</p>', content: '<p>Long text</p>', images: [], symbols: ['ABC', 'xyz', 'BTCUSD'], source: 'benzinga', url: 'https://www.benzinga.com/news/26/10/1/chipmaker' },
        { id: 2, headline: 'No link', author: '', created_at: '2026-10-19T02:00:00Z', updated_at: '2026-10-19T02:00:00Z', summary: '', content: '', images: [], symbols: [], source: 'benzinga', url: null },
      ],
      next_page_token: null,
    });
    expect(parseAlpacaNews(text)).toEqual([
      { id: 'benzinga.com/news/26/10/1/chipmaker', title: 'Chipmaker & partner sign a supply deal', url: 'https://www.benzinga.com/news/26/10/1/chipmaker', publisher: 'Benzinga', feeds: ['Alpaca'], time: Date.parse('2026-10-19T02:10:00Z'), summary: 'Shares rose.', tickers: ['ABC', 'XYZ', 'BTCUSD'] },
    ]);
    expect(parseAlpacaNews('{"message":"forbidden."}')).toEqual({ error: 'forbidden.' });
  });

  it("reads Massive's ticker news, and its refusal", async () => {
    const { parseMassiveNews } = await import('../src/data/live/marketnews');
    const text = JSON.stringify({
      results: [
        { id: 'x1', publisher: { name: 'Investing.com', homepage_url: 'https://www.investing.com/' }, title: 'Brewer beats estimates', author: 'A Writer', published_utc: '2026-10-18T13:00:00Z', article_url: 'https://www.investing.com/news/brewer-beats', tickers: ['BUD', 'TAP'], description: 'Volumes held up.', keywords: ['beer'], insights: [{ ticker: 'BUD', sentiment: 'positive', sentiment_reasoning: 'Beat.' }] },
        { id: 'x2', publisher: {}, title: 'No date', article_url: 'https://example.com/a', tickers: [] },
      ],
      status: 'OK',
      request_id: 'r',
      count: 2,
    });
    expect(parseMassiveNews(text)).toEqual([
      { id: 'investing.com/news/brewer-beats', title: 'Brewer beats estimates', url: 'https://www.investing.com/news/brewer-beats', publisher: 'Investing.com', feeds: ['Massive'], time: Date.parse('2026-10-18T13:00:00Z'), summary: 'Volumes held up.', tickers: ['BUD', 'TAP'] },
    ]);
    expect(parseMassiveNews('{"status":"OK","request_id":"r","count":0}')).toEqual([]);
    // As Massive answered without a key on 19 October 2026 (HTTP 401).
    expect(parseMassiveNews('{"status":"ERROR","request_id":"5907aef7","error":"API Key was not provided"}')).toEqual({ error: 'API Key was not provided' });
  });

  it("reads Google News's feed with the publisher out of the title, tagged with the ticker searched", async () => {
    const { parseGoogleNews } = await import('../src/data/live/marketnews');
    // A real answer to the Dutch search for KBC on 19 October 2026, cut to three items.
    const r = parseGoogleNews(googleKbcNl, 'KBC');
    expect(Array.isArray(r)).toBe(true);
    const stories = r as Exclude<typeof r, { error: string }>;
    expect(stories.map((s) => [s.title, s.publisher])).toEqual([
      ['KBC ziet recordinteresse om start-up op te richten, maar velen springen niet voluit', 'De Standaard'],
      ['De 5 favoriete aandelen: ‘Orderboek van dit Belgisch medtechbedrijf staat op record’', 'De Tijd'],
      ['Grootbanken boeken tot 53% meer winst, maar aandelen stijgen niet: hoe komt dat en wat verwacht onze geldexpert voor KBC en co?', 'HLN'],
    ]);
    expect(stories[0]).toMatchObject({ feeds: ['Google News'], tickers: ['KBC'], time: Date.parse('2026-10-16T19:30:00Z') });
    expect(stories[0].url).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
    // The description only repeats the title and the publisher.
    expect(stories[0].summary).toBeUndefined();
    expect(parseGoogleNews('<!doctype html><html><body>Before you continue to Google</body></html>')).toEqual({ error: 'Google answered with a web page, not the feed' });
    // Quote pages Google lists among stories, as the English search for KBC returned them on 19 October 2026.
    const page = (title: string) => `<rss><channel><item><title>${title}</title><link>https://news.google.com/rss/articles/x</link><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate><source url="https://uk.finance.yahoo.com">Yahoo Finance UK</source></item></channel></rss>`;
    expect(parseGoogleNews(page('KBC Groupe NV (KDB.HM) Stock Price, News, Quote &amp; History - Yahoo Finance UK'))).toEqual([]);
    expect(parseGoogleNews(page('KBC Eq Fd North America Classic USD Dis (0P00000GSL) latest stock news and headlines - Yahoo Finance UK'))).toEqual([]);
    expect(parseGoogleNews(page('KBC Groupe NV: Graphique de cours statique | KBC | BE0003565737 - Yahoo Finance UK'))).toEqual([]);
    expect(parseGoogleNews(page('KBC GROU0.75MTN23: Bond Price | BE0002266352 - Yahoo Finance UK'))).toEqual([]);
    expect(parseGoogleNews(page('KBC Group raises guidance and plans EUR 1 dividend - Yahoo Finance UK'))).toHaveLength(1);
  });
});

describe('the news lists together', () => {
  it("keeps a direct link over Google's redirect for a story both carry", async () => {
    const { marketNews, storiesFor, MARKET_SOURCES } = await import('../src/data/live/marketnews');
    const story = (feed: 'Alpaca' | 'Google News', url: string) => ({ id: url, title: 'Chipmaker beats third-quarter estimates', url, publisher: feed === 'Alpaca' ? 'Benzinga' : 'Reuters', feeds: [feed], time: 1760450000000, tickers: [] });
    // Google's list arrived first; the order of MARKET_SOURCES decides, not the order of arrival.
    marketNews.set({ v: 1, feeds: {}, lists: { 'google-news-market:US:en': [story('Google News', 'https://news.google.com/rss/articles/abc')], 'alpaca-market': [story('Alpaca', 'https://www.benzinga.com/x')] } });
    const [s] = storiesFor(MARKET_SOURCES);
    expect(s.url).toBe('https://www.benzinga.com/x');
    expect(s.feeds).toEqual(['Alpaca', 'Google News']);
    marketNews.set({ v: 2, feeds: {}, lists: {} });
  });

  it("puts a company's own news and the market stories tagged with it together", async () => {
    const { marketNews, companyStories } = await import('../src/data/live/marketnews');
    const story = (id: string, tickers: string[]) => ({ id, title: `Story ${id} about a chipmaker`, url: `https://news.example/${id}`, publisher: 'Wire', feeds: ['Alpaca' as const], time: 1760450000000 + id.length, tickers });
    marketNews.set({ v: 1, feeds: {}, lists: { 'alpaca-company:BRK.B': [story('own', ['BRK.B'])], 'massive-market': [story('tagged', ['BRK.B']), story('other', ['ABC'])] } });
    expect(companyStories('BRK-B').map((s) => s.id).sort()).toEqual(['own', 'tagged']);
    marketNews.set({ v: 2, feeds: {}, lists: {} });
  });

  it('counts several requests to one source as one state', async () => {
    const { combinedFeed } = await import('../src/data/live/marketnews');
    expect(combinedFeed([{ state: 'ok', count: 70, at: 1000 }, { state: 'ok', count: 30, at: 2000, stale: true }])).toEqual({ state: 'ok', count: 100, at: 2000, stale: true });
    expect(combinedFeed([{ state: 'loading' }, { state: 'ok', count: 5, at: 1000 }])).toMatchObject({ state: 'ok', count: 5 });
    expect(combinedFeed([{ state: 'loading' }, { state: 'error', message: 'HTTP 503' }])).toEqual({ state: 'error', message: 'HTTP 503' });
    expect(combinedFeed([undefined, undefined])).toBeUndefined();
  });
});
