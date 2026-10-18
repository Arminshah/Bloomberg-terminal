// Both URLs are published by the Federal Reserve's feed directory. The
// narrower fallback is labelled, so it never claims to cover all releases.
const FED_PRESS_URLS = [
  'https://www.federalreserve.gov/feeds/press_all.xml',
  'https://www.federalreserve.gov/feeds/press_monetary.xml',
];
const FEED_ACCEPT = 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1';

async function fetchFedPress(fetch, init) {
  let status = 0;
  for (let i = 0; i < FED_PRESS_URLS.length; i++) {
    try {
      const response = await fetch(FED_PRESS_URLS[i], { ...init, headers: { ...init.headers, Accept: FEED_ACCEPT } });
      status = response.status;
      const text = response.ok ? await response.text() : '';
      if (response.ok && /<(?:item|entry)\b/i.test(text)) return { status, text, sourceLabel: i ? 'Federal Reserve Board (monetary policy feed)' : 'Federal Reserve Board', fallback: i > 0 };
    } catch { status = 0; }
  }
  return { status, text: '', error: 'Federal Reserve feeds did not return usable RSS.' };
}

module.exports = { FED_PRESS_URLS, FEED_ACCEPT, fetchFedPress };
