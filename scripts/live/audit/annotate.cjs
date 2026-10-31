// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
'use strict';

const { sanitize, redact } = require('./assurance.cjs');
const MAX_OUTPUT_BYTES = 48 * 1024;
const MAX_ANNOTATION_BYTES = 3 * 1024;
const MAX_DETAIL_CHUNKS = 8;
const MAX_ROW_BYTES = 1800;
const ORDER = { FAIL: 0, FLAGGED: 1, BLOCKED: 2, INCOMPLETE: 3 };

// Escape command data, including '%' first, so provider text cannot add another
// workflow command or turn an existing percent escape into a line break.
function escapeData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function value(text) {
  if (text == null) return 'n/a';
  return typeof text === 'object' ? JSON.stringify(text) : String(text);
}

function boundedData(message, environment, maxBytes = 3072) {
  const data = redact(message, environment).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  const suffix = ' [truncated]';
  if (Buffer.byteLength(escapeData(data)) <= maxBytes) return escapeData(data);
  let out = '';
  let bytes = Buffer.byteLength(suffix);
  for (const character of data) {
    const escaped = escapeData(character);
    const size = Buffer.byteLength(escaped);
    if (bytes + size > maxBytes) break;
    out += escaped;
    bytes += size;
  }
  return out + suffix;
}

/** Bounded public diagnostics. This never changes the audit's result or tolerance. */
function formatAnnotations(report, environment = process.env) {
  if (!report || !report.summary || !Array.isArray(report.rows)) throw new Error('Expected an audit report with summary and rows.');
  const summary = sanitize(report.summary, environment);
  // Sanitize rows separately: sanitize's defensive array limit must not silently
  // drop a failure from a large report before the explicit omitted count is made.
  const rows = report.rows.filter((row) => row && Object.hasOwn(ORDER, row.status)).map((row) => sanitize(row, environment)).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const counts = ['pass', 'fail', 'flagged', 'blocked', 'incomplete', 'skip'].map((key) => `${key.toUpperCase()}=${value(summary[key])}`).join('; ');
  const level = rows.some((row) => row.status === 'FAIL') || summary.exitCode === 1 ? 'error' : rows.length || summary.exitCode !== 0 ? 'warning' : 'notice';
  // Public pages truncate long annotation bodies. Pack rows into at most eight
  // small detail annotations plus one summary, below GitHub's per-step count limit.
  const chunks = [];
  let lines = [];
  let chunkLevel = 'warning';
  const separator = '%0A';
  const commandReserve = Buffer.byteLength('::warning::\n');
  let bytes = commandReserve;
  let shown = 0;
  for (const row of rows) {
    const detail = [row.kind, row.detail, row.candidates ? `candidates=${value(row.candidates)}` : ''].filter(Boolean).map(value).join('; ');
    const message = `${row.status} | area=${value(row.area)} | item=${value(row.item)} | field=${value(row.field)} | app=${value(row.app)} | ref=${value(row.ref)} | allowed=${value(row.allowed)} | source=${value(row.refName ?? row.source ?? row.sourceUrl)} | detail=${detail || 'n/a'}`;
    const line = boundedData(message, environment, MAX_ROW_BYTES);
    let size = Buffer.byteLength((lines.length ? separator : '') + line);
    if (bytes + size > MAX_ANNOTATION_BYTES) {
      chunks.push(`::${chunkLevel}::${lines.join(separator)}\n`);
      lines = [];
      chunkLevel = 'warning';
      bytes = commandReserve;
      if (chunks.length >= MAX_DETAIL_CHUNKS) break;
      size = Buffer.byteLength(line);
    }
    lines.push(line);
    if (row.status === 'FAIL') chunkLevel = 'error';
    bytes += size;
    shown++;
  }
  if (lines.length) chunks.push(`::${chunkLevel}::${lines.join(separator)}\n`);
  const prefix = `::${level}::`;
  const summaryData = boundedData(`Data audit: assurance=${value(summary.assurance)}; exit=${value(summary.exitCode)}; ${counts}. ${shown} unresolved rows shown; ${rows.length - shown} unresolved rows omitted by the ${MAX_DETAIL_CHUNKS}-chunk public annotation limit. Detail commands are at most 3 KiB; long individual rows may be truncated. Read report.md/report.json or the run summary for the complete evidence.`, environment, MAX_ANNOTATION_BYTES - Buffer.byteLength(prefix + '\n'));
  return `${prefix}${summaryData}\n${chunks.join('')}`;
}

if (require.main === module) {
  try {
    const report = JSON.parse(require('node:fs').readFileSync(process.argv[2] ?? 'audit-out/run/report.json', 'utf8'));
    process.stdout.write(formatAnnotations(report));
  } catch (error) {
    process.stdout.write(`::error::${boundedData(`Audit report annotations could not be generated: ${error.message}`, process.env, MAX_ANNOTATION_BYTES - Buffer.byteLength('::error::\n'))}\n`);
    process.exitCode = 1;
  }
}

module.exports = { formatAnnotations, escapeData, MAX_OUTPUT_BYTES, MAX_ANNOTATION_BYTES, MAX_DETAIL_CHUNKS };
