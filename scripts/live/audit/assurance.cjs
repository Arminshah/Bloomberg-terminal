'use strict';

// The audit's result policy is independent of capture and network code. A completed
// process and a verified observation are different outcomes.
const STATUSES = ['PASS', 'FAIL', 'FLAGGED', 'BLOCKED', 'INCOMPLETE', 'SKIP'];
const SECRET_FIELDS = /^(?:authorization|cookie|set-cookie|password|secret|.*(?:api[_-]?key|secret[_-]?key|api[_-]?token|access[_-]?token)|token)$/i;
const SECRET_ENV = /(?:API_KEY|SECRET_KEY|API_TOKEN|^GH_TOKEN$|^GITHUB_TOKEN$)/;

function redact(value, environment = process.env) {
  let text = String(value ?? '').replace(/((?:api[_-]?key|token|key)=)[^&\s"<>]+/gi, '$1<redacted>').replace(/\bBearer\s+[A-Za-z0-9_.+\/-]+/gi, 'Bearer <redacted>');
  for (const [name, secret] of Object.entries(environment)) if (SECRET_ENV.test(name) && typeof secret === 'string' && secret.length >= 8) text = text.split(secret).join('<redacted>');
  return text;
}

/** Only sanitized research data goes into public run reports. Never copy auth fields. */
function sanitize(value, environment = process.env, depth = 0) {
  if (depth > 14) return '[depth limit]';
  if (typeof value === 'string') return redact(value, environment);
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => sanitize(v, environment, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.test(k)).map(([k, v]) => [k, sanitize(v, environment, depth + 1)]));
  return value;
}

function numericComparison(app, ref, tolerance = {}) {
  if (!Number.isFinite(app) || !Number.isFinite(ref)) return { status: 'SKIP', detail: !Number.isFinite(app) ? 'the screen gives no numeric value' : 'the reference gives no numeric value' };
  const diff = app - ref;
  const allowed = Math.max(tolerance.abs ?? 0, tolerance.pct == null ? 0 : Math.abs(ref) * tolerance.pct / 100, tolerance.pp ?? 0);
  return { status: Math.abs(diff) <= allowed + 1e-12 ? 'PASS' : 'FAIL', diff, allowed };
}

/** A conflict is still unresolved even when one candidate matches a reference. */
function conflictComparison(candidates, ref, tolerance = {}, detail = '') {
  const checked = candidates.filter((x) => Number.isFinite(x.value)).map((candidate) => ({ ...candidate, ...numericComparison(candidate.value, ref, tolerance) }));
  return { status: 'FLAGGED', candidates: checked, detail: [detail, checked.length ? `${checked.filter((x) => x.status === 'PASS').length} of ${checked.length} displayed candidates match this reference; the source conflict remains unresolved` : 'the warning exposes no safely interpretable numeric candidates'].filter(Boolean).join('; ') };
}

/** Required coverage is explicit. Optional omissions never become numeric passes. */
function assess(rows, requirements = []) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.toLowerCase(), rows.filter((r) => r.status === s).length]));
  const coverage = requirements.map((r) => {
    const scope = rows.filter((row) => row.area === r.area && (r.item == null || row.item === r.item));
    const referencePasses = scope.filter((row) => row.status === 'PASS' && row.evidenceKind === 'reference').length;
    const invariantPasses = scope.filter((row) => row.status === 'PASS' && row.evidenceKind === 'invariant').length;
    const unresolved = scope.filter((row) => row.critical !== false && ['FAIL', 'FLAGGED', 'BLOCKED', 'INCOMPLETE'].includes(row.status)).length;
    return { ...r, referencePasses, invariantPasses, unresolved, satisfied: referencePasses >= (r.minReferencePasses ?? 1) && invariantPasses >= (r.minInvariantPasses ?? 0) && unresolved === 0 };
  });
  const missing = coverage.filter((c) => !c.satisfied);
  const unresolved = rows.some((r) => r.critical !== false && ['FLAGGED', 'INCOMPLETE'].includes(r.status));
  // A malformed/unknown status cannot accidentally improve assurance.
  const invalid = rows.some((r) => !STATUSES.includes(r.status));
  const exitCode = counts.fail || invalid ? 1 : counts.blocked ? 2 : missing.length || unresolved || counts.pass === 0 ? 3 : 0;
  return { ...counts, coverage, assurance: exitCode === 0 ? 'verified-required-scope' : 'incomplete', exitCode };
}

module.exports = { STATUSES, redact, sanitize, numericComparison, conflictComparison, assess };
