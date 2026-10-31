// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
'use strict';

/**
 * Google's Gemini API for DS's "Ask a Question" (FFM_DS_TA 0:30.7, 0:35.5): a question about one filing, answered
 * from the filing alone. Each point must quote the filing word for word; a point whose quote is not in the filing, or
 * whose figures are not in its quote, is dropped and counted, so nothing the filing does not say reaches the page.
 */

const MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
const ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
/** The filing's text sent, in characters: about 100,000 tokens, well inside the models' context. */
const MAX_DOC = 400_000;
const MAX_QUESTION = 500;

const SYSTEM = [
  'You answer questions about one document, using only what the document says.',
  'Reply in JSON: "answer", one sentence that answers the question, and "points", up to six.',
  'Each point states one thing the document says, in your own words, and "quote" copies word for word a passage of',
  'the document (one sentence or less, at most 300 characters) that supports it. Any figure in a point must appear in',
  'its quote. Do not add facts, figures, forecasts or opinions the document does not contain. If the document does not',
  'answer the question, say so in "answer" and give no points.',
].join(' ');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    points: { type: 'ARRAY', items: { type: 'OBJECT', properties: { point: { type: 'STRING' }, quote: { type: 'STRING' } }, required: ['point', 'quote'] } },
  },
  required: ['answer', 'points'],
};

/** Why a question cannot be sent, or '' when it can. */
function checkQuestion(q) {
  if (typeof q !== 'string') return 'The question is not text.';
  const t = q.trim();
  if (!t) return 'Type a question.';
  if (t.length > MAX_QUESTION) return `Keep the question under ${MAX_QUESTION} characters.`;
  return '';
}

function requestBody(question, text) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: `DOCUMENT:\n${String(text).slice(0, MAX_DOC)}\n\nQUESTION: ${question.trim()}` }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 4096 },
  };
}

/** Text compared as a reader would: case, curly quotes, dashes and spacing set aside. */
function normalise(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The figures in a text, as digits without thousands separators ("1,234.5" is "1234.5"). */
function figures(s) {
  return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((f) => f.replace(/,/g, ''));
}

/**
 * Whether a quote is the document's own words: the whole of it, or, when it was shortened with "…", each of its pieces
 * (12 characters or more, the shorter ones skipped) in the document in that order.
 */
function quoted(hay, q) {
  if (hay.includes(q)) return true;
  const pieces = q.split(/\.\.\.|\u2026/).map((x) => x.replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, '')).filter((x) => x.length >= 12);
  if (pieces.length < 2) return false;
  let from = 0;
  for (const piece of pieces) {
    const at = hay.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return true;
}

/**
 * The answer kept: points whose quote is in the document and whose figures are in their quote. The answer sentence
 * is dropped when it carries a figure the document does not contain.
 */
function ground(parsed, text) {
  const hay = normalise(text);
  // Figures are compared whole: "9" is not found in "391,035".
  const inText = new Set(figures(hay));
  const raw = Array.isArray(parsed?.points) ? parsed.points.slice(0, 8) : [];
  const points = raw.map((p) => ({ point: String(p?.point ?? '').trim().slice(0, 600), quote: String(p?.quote ?? '').trim().slice(0, 400) }));
  const kept = points.filter((p) => {
    const q = normalise(p.quote);
    if (q.length < 12 || !quoted(hay, q)) return false;
    const inQuote = new Set(figures(q));
    return figures(p.point).every((f) => inQuote.has(f));
  });
  let answer = String(parsed?.answer ?? '').trim().slice(0, 600);
  if (figures(answer).some((f) => !inText.has(f))) answer = '';
  return { answer, points: kept, dropped: points.length - kept.length };
}

/** One question about one document: the first model that answers, its answer grounded in the document. */
async function ask(fetchFn, key, question, text) {
  let last = '';
  for (const model of MODELS) {
    let res;
    try {
      res = await fetchFn(ENDPOINT(model), {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(question, text)),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      last = String(err?.message ?? err);
      continue;
    }
    if (res.status === 404 || res.status === 429 || res.status >= 500) {
      last = `Gemini answered HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) return { error: `Gemini refused the question (HTTP ${res.status}).` };
    const data = await res.json().catch(() => null);
    const part = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let parsed;
    try {
      parsed = JSON.parse(part);
    } catch {
      last = 'Gemini answered in an unreadable form';
      continue;
    }
    return { model, ...ground(parsed, text) };
  }
  return { error: last ? `No answer from Gemini: ${last}.` : 'No answer from Gemini.' };
}

/** An error in words, the key never in it. */
function errorText(err, key) {
  return String(err?.message ?? err).split(key).join('<key>').replace(/https?:\/\/\S+/g, '<url>').slice(0, 200);
}

module.exports = { MODELS, MAX_DOC, SYSTEM, checkQuestion, requestBody, normalise, figures, quoted, ground, ask, errorText };
