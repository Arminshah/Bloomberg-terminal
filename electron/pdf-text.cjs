// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// The text of a PDF, line by line with each piece's position, for the main process: the House Clerk's financial
// disclosure forms are PDFs generated from its e-filing system, laid out as tables. PDF.js (Mozilla) reads them;
// nothing is drawn and no script in a document runs (isEvalSupported off, no fonts loaded into a page).

let pdfjs = null;

/**
 * PDF.js's Node build loads @napi-rs/canvas, if installed, to draw pages. It carries its own copy of the Skia graphics
 * library, and loading it in Electron's main process crashes the app (SIGTRAP, seen on 25 October 2026). Only text is
 * read here, so that one module is refused: PDF.js then warns that drawing is unavailable and reads text as before.
 */
function refuseCanvas() {
  const Module = require('node:module');
  if (Module._load.refusesCanvas) return;
  const load = Module._load;
  const guarded = function (request, ...rest) {
    if (request === '@napi-rs/canvas') throw new Error('not loaded: the app reads text only');
    return load.call(this, request, ...rest);
  };
  guarded.refusesCanvas = true;
  Module._load = guarded;
}

/**
 * PDF.js's Node build, loaded on first use. Its worker runs in this process: PDF.js uses a worker module already loaded
 * as globalThis.pdfjsWorker, else it calls import(workerSrc). On Windows a plain path ("D:\...") is no module URL and
 * that import fails, so the worker is loaded here and workerSrc is a file: URL.
 */
async function lib() {
  if (!pdfjs) {
    refuseCanvas();
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    globalThis.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    lib.GlobalWorkerOptions.workerSrc = workerUrl(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'));
    pdfjs = lib;
  }
  return pdfjs;
}

/** A module path as the file: URL import() takes on every system. */
function workerUrl(file) {
  return require('node:url').pathToFileURL(file).href;
}

/**
 * Pieces of text at about the same height make a line. PDF y grows upwards; lines come top to bottom, pieces left
 * to right. `tolerance` is in PDF units (1/72 inch).
 */
function linesOf(items, tolerance = 1.5) {
  // A glyph a font gives no text for comes back as NUL: the forms' bold labels lose their lower case ("F\0\0\0 S").
  const sorted = items.map((it) => ({ ...it, text: it.text.replace(/\u0000/g, ' ') })).filter((it) => it.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tolerance) last.cells.push({ x: it.x, text: it.text.trim() });
    else lines.push({ y: it.y, cells: [{ x: it.x, text: it.text.trim() }] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * A PDF's pages as lines of positioned text: [{ page, lines: [{ y, cells: [{ x, text }] }] }]. A scanned page has
 * no text, so its lines are empty.
 */
async function pdfLines(bytes, maxPages = 200) {
  const { getDocument } = await lib();
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it) => typeof it.str === 'string').map((it) => ({ x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10, text: it.str }));
      pages.push({ page: p, lines: linesOf(items) });
      page.cleanup();
    }
    return { pages, numPages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

module.exports = { pdfLines, linesOf, workerUrl };
