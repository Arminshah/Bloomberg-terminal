// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
'use strict';

const { fedStatement, compact } = require('./domains.cjs');
const { FED_PRESS_URLS } = require('../../../electron/official-feeds.cjs');
const ORIGIN = 'https://www.federalreserve.gov';
const CALENDAR = `${ORIGIN}/monetarypolicy/fomccalendars.htm`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORD_DATE = `(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})`;

function iso(year, month, day) {
  if (!(year >= 1900 && year <= 2199 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : null;
}

function wordDate(text) {
  const m = new RegExp(`^${WORD_DATE}$`, 'i').exec(text.trim());
  return m ? iso(Number(m[3]), MONTHS.findIndex((month) => month.toLowerCase() === m[1].toLowerCase()) + 1, Number(m[2])) : null;
}

function canonical(value, implementation = false) {
  let url;
  try { url = new URL(value.trim().replace(/&amp;/g, '&'), ORIGIN); } catch { return null; }
  if (url.protocol !== 'https:' || !['www.federalreserve.gov', 'federalreserve.gov'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) return null;
  const m = /^\/newsevents\/pressreleases\/monetary(\d{4})(\d{2})(\d{2})a(1)?\.htm$/.exec(url.pathname);
  if (!m || !!m[4] !== implementation) return null;
  const date = iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return date ? { date, url: `${ORIGIN}${url.pathname}` } : null;
}

function canonicalEvidence(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !['www.federalreserve.gov', 'federalreserve.gov'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) return null;
  if (![new URL(CALENDAR).pathname, ...FED_PRESS_URLS.map((feed) => new URL(feed).pathname)].includes(url.pathname) && !canonical(value) && !canonical(value, true)) return null;
  return `${ORIGIN}${url.pathname}`;
}

function fedResponseMatches(requested, actual) {
  const expected = canonicalEvidence(requested);
  return !!expected && canonicalEvidence(actual) === expected;
}

const titleText = (label) => compact(label.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1'));
const excludedPublication = (label) => /\bminutes\b|\blonger[-\s]+run\s+goals\b|\bmonetary\s+policy\s+strategy\b/i.test(titleText(label));

/** Calendar/RSS discovery supplies links only, never a decision from a headline. */
function statementLinks(text, today) {
  const values = [];
  const clean = String(text).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const outside = clean.replace(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_all, _tag, block) => {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? '';
    if (!excludedPublication(title)) {
      values.push(...[...block.matchAll(/<link\b[^>]*>\s*(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?\s*<\/link>/gi)].map((m) => m[1]));
      values.push(...[...block.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]));
    }
    return ' ';
  });
  for (const anchor of outside.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(anchor[1])?.[1];
    if (href && !excludedPublication(anchor[2])) values.push(href);
  }
  return [...new Set(values.map((value) => canonical(value)).filter((value) => value && value.date <= today).map((value) => value.url))].sort().reverse();
}

async function obtain(request, url) {
  try { return await request(url); } catch { return { kind: 'network', detail: 'Official evidence request failed' }; }
}

async function discoverStatement(request, today) {
  const attempts = [];
  for (const url of [CALENDAR, ...FED_PRESS_URLS]) {
    const answer = await obtain(request, url);
    const feed = url !== CALENDAR;
    const validBody = answer.ok && typeof answer.text === 'string' && (!feed || /<(?:item|entry)\b/i.test(answer.text));
    const links = validBody ? statementLinks(answer.text, today) : [];
    if (links.length) return { ok: true, url: links[0], discoveryUrl: url, attempts };
    attempts.push({ url, kind: answer.kind ?? 'malformed', detail: answer.detail ?? (validBody ? 'No published canonical statement link' : 'No usable official discovery document') });
  }
  return { kind: attempts[0]?.kind ?? 'malformed', detail: attempts.map((attempt) => `${attempt.url}: ${attempt.kind}; ${attempt.detail}`).join(' | '), attempts };
}

function rate(value) {
  const text = value.trim().replace(/\s+/g, '-');
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const m = /^(?:(\d+)-)?(\d+)\/(\d+)$/.exec(text);
  return m && Number(m[3]) > 0 ? Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]) : NaN;
}

function textOf(html) {
  return compact(html.replace(/&frac14;/gi, ' 1/4').replace(/&frac12;/gi, ' 1/2').replace(/&frac34;/gi, ' 3/4'));
}

function publicationType(label) {
  const text = titleText(label).replace(/^Federal Reserve Board\s*[-|:]\s*/i, '').replace(/\s*[-|]\s*Federal Reserve Board$/i, '').trim();
  if (excludedPublication(text)) return 'other';
  if (/^(?:Federal Reserve(?: Board)?\s+(?:issues|releases)\s+(?:an?\s+)?)?(?:FOMC|Federal Open Market Committee)\s+statement\.?$/i.test(text)) return 'statement';
  if (/^(?:Federal Reserve(?: Board)?|Board of Governors of the Federal Reserve System|Press Release|News\s*(?:&|and)\s*Events|Monetary Policy|FOMC)$/i.test(text)) return 'generic';
  return 'unknown';
}

/** Publication identity is separate from the decision stated in its body. */
function isStatementPublication(html) {
  if (typeof html !== 'string' || !html || html.length > 1_500_000) return false;
  const clean = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const labels = [];
  for (const meta of clean.matchAll(/<meta\b[^>]*>/gi)) {
    if (/\bname\s*=\s*["']DC\.title["']/i.test(meta[0])) labels.push(/\bcontent\s*=\s*["']([^"']*)["']/i.exec(meta[0])?.[1] ?? '');
  }
  labels.push(...[...clean.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => m[1]));
  const article = clean.replace(/<(aside|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const heading of article.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(heading[2])?.[1].split(/\s+/) ?? [];
    if (classes.includes('title') || classes.includes('article__title')) labels.push(heading[3]);
  }
  const types = labels.map(publicationType);
  return types.includes('statement') && types.every((type) => type === 'statement' || type === 'generic');
}

function publicationDate(html) {
  const dates = [];
  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']DC\.date["']/i.test(meta[0])) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(meta[0])?.[1] ?? '';
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T\S+)?$/.exec(content);
    dates.push(parts && Number.isFinite(Date.parse(content)) ? iso(Number(parts[1]), Number(parts[2]), Number(parts[3])) : null);
  }
  for (const article of html.matchAll(/<(?:p|time)\b[^>]*class\s*=\s*["'][^"']*article__time[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|time)>/gi)) dates.push(wordDate(compact(article[1])));
  return dates.length && dates.every(Boolean) && new Set(dates).size === 1 ? dates[0] : null;
}

function matchingTargets(text, statement) {
  const ranges = [...text.matchAll(/(?:target range for (?:the )?federal funds rate|federal funds rate in a target range)\b[\s\S]{0,80}?\b(?:of|at|to)\s+(\d+(?:\.\d+)?(?:[- ]\d+\/\d+)?|\d+\/\d+)\s+(?:to|and)\s+(\d+(?:\.\d+)?(?:[- ]\d+\/\d+)?|\d+\/\d+)\s*percent\b/gi)];
  return !!ranges.length && ranges.every((m) => rate(m[1]) === statement.lower && rate(m[2]) === statement.upper);
}

/** Only the explicit FOMC Desk direction establishes the target's effective date. */
function implementationDate(html, url, statement) {
  const page = canonical(url, true);
  if (!page || page.date !== statement.date || typeof html !== 'string' || !html || html.length > 1_500_000) return null;
  const text = textOf(html);
  if (publicationDate(html) !== statement.date || !matchingTargets(text, statement)) return null;
  const dates = [];
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const paragraph of cleaned.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const paragraphText = textOf(paragraph[2]);
    const directions = [...paragraphText.matchAll(new RegExp(`effective\\s+${WORD_DATE}[,:]?\\s+(?:the\\s+)?(?:Federal\\s+Open\\s+Market\\s+Committee|FOMC)\\s+(?:directs|has\\s+directed)\\s+(?:the\\s+)?(?:Open\\s+Market\\s+)?Desk\\b`, 'gi'))];
    if (!directions.length) continue;
    const afterParagraph = cleaned.slice(paragraph.index + paragraph[0].length);
    const list = /^\s*<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(afterParagraph);
    for (const direction of directions) {
      const associated = paragraphText.slice(direction.index + direction[0].length) + (list ? ` ${textOf(list[2])}` : '');
      if (!matchingTargets(associated, statement)) return null;
      dates.push(wordDate(`${direction[1]} ${direction[2]}, ${direction[3]}`));
    }
  }
  const unique = [...new Set(dates)];
  return unique.length === 1 && unique[0] && unique[0] >= statement.date ? unique[0] : null;
}

async function obtainFedReference(request, today) {
  const discovery = await discoverStatement(request, today);
  if (!discovery.ok) return discovery;
  const statement = await obtain(request, discovery.url);
  if (!statement.ok) return { ...statement, discovery };
  if (!isStatementPublication(statement.text)) return { kind: 'malformed', detail: 'The canonical publication was not identified unambiguously as an FOMC decision statement', discovery };
  const reference = fedStatement(statement.text, discovery.url);
  if (!reference || publicationDate(statement.text) !== reference.date || !matchingTargets(textOf(statement.text), reference)) return { kind: 'malformed', detail: 'The complete official statement did not establish an unambiguous dated policy target and action', discovery };
  const implementationUrl = discovery.url.replace(/a\.htm$/, 'a1.htm');
  const implementation = await obtain(request, implementationUrl);
  if (!implementation.ok) return { ...implementation, discovery, statementUrl: discovery.url, implementationUrl };
  const effectiveDate = implementationDate(implementation.text, implementationUrl, reference);
  if (!effectiveDate) return { kind: 'malformed', detail: 'The implementation note did not establish a matching target and explicit FOMC Desk effective date', discovery, statementUrl: discovery.url, implementationUrl };
  return { ok: true, reference: { ...reference, effectiveDate, implementationUrl }, discovery };
}

function effectiveDateComparison(decision, reference) {
  const app = decision?.effectiveDate;
  return { status: !app ? 'INCOMPLETE' : app === reference.effectiveDate ? 'PASS' : 'FAIL', field: 'decision effective date', evidenceKind: 'reference', app, ref: reference.effectiveDate, refName: reference.implementationUrl, detail: !app ? 'The captured decision has no explicit effective date to compare' : 'Independently read the matching FOMC Desk implementation direction' };
}

module.exports = { CALENDAR, statementLinks, isStatementPublication, fedResponseMatches, discoverStatement, implementationDate, obtainFedReference, effectiveDateComparison };
