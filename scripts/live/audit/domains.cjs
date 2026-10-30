'use strict';

// Definition and chronology checks for the critical research screens. These are
// deliberately labelled invariants; independent source corroboration is separate.
const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => typeof v === 'string' && DATE.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0, 10) === v;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const number = (v) => finite(v) ? v : NaN;
const moment = (v) => finite(v) ? v : typeof v === 'string' ? Date.parse(v) : NaN;
const iso = (v) => finite(moment(v)) ? new Date(moment(v)).toISOString().slice(0, 10) : '';
const make = (area, item) => (status, field, detail, extra = {}) => ({ status, area, item, field, evidenceKind: 'invariant', detail, ...extra });
const compact = (s) => String(s ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/g, ' ').replace(/&(?:amp|#38);/g, '&').replace(/&#(?:8211|8212);|&(?:ndash|mdash);/g, '-').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();

function frame(snapshot, domain, item, now) {
  const row = make(domain, item);
  if (!snapshot || snapshot.schema !== 1 || snapshot.domain !== domain) return [row('BLOCKED', 'structured screen capture', 'missing or unsupported sanitized capture schema', { kind: 'capture' })];
  if (!finite(snapshot.capturedAt) || snapshot.capturedAt > now + 60_000 || now - snapshot.capturedAt > 6 * 3600_000) return [row('BLOCKED', 'capture time', 'capture is undated, future-dated or older than six hours; capture again before comparing live references', { kind: 'capture' })];
  return [];
}

function validatePolicy(snapshot, now = Date.now()) {
  const item = 'FED';
  const row = make('policy', item);
  const initial = frame(snapshot, 'policy', item, now);
  if (initial.length) return initial;
  const fed = snapshot.banks?.find((b) => b.code === 'FED');
  if (!fed) return [row('FAIL', 'Fed row', 'the policy capture contains no Federal Reserve row')];
  const result = [];
  const current = fed.current;
  if (!current || !finite(current.upper ?? current.value)) result.push(row('INCOMPLETE', 'current target', 'no effective Fed target is available'));
  else {
    const upper = current.upper ?? current.value;
    if (finite(current.lower) && current.lower > upper) result.push(row('FAIL', 'target range', 'the lower target exceeds the upper target'));
    else result.push(row('PASS', 'target range definition', 'the displayed bounds are ordered; this does not independently verify their level'));
    if (current.error || current.stale) result.push(row('INCOMPLETE', 'current source freshness', `latest policy refresh failed or is stale: ${current.error ?? 'stale cached value'}`));
    if (!finite(current.lastSuccessfulAt)) result.push(row('INCOMPLETE', 'last successful check', 'no successful-check timestamp accompanies the displayed target'));
    else if (current.lastSuccessfulAt > snapshot.capturedAt + 60_000) result.push(row('FAIL', 'last successful check', 'successful check is dated after the capture'));
    else result.push(row('PASS', 'successful-check timestamp', 'the value retains a separately dated successful source check'));
    const effective = iso(current.effectiveAt);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(snapshot.capturedAt)).map((p) => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    if (effective && effective > today) result.push(row('FAIL', 'current effective date', 'an announced future-effective policy is displayed as current'));
  }
  const decision = fed.latestDecision;
  if (!decision) result.push(row('INCOMPLETE', 'latest confirmed decision', 'no source-confirmed decision accompanies the rate series'));
  else {
    const announced = moment(decision.announcedAt);
    if (finite(announced) && announced > snapshot.capturedAt) result.push(row('FAIL', 'announcement chronology', 'a future announcement is labelled confirmed'));
    if (!evidenceUrl(decision.sourceUrl, 'fed')) result.push(row('FAIL', 'decision evidence', 'a confirmed Fed decision has no canonical official statement link'));
    if (!['hold', 'hike', 'cut'].includes(decision.outcome)) result.push(row('INCOMPLETE', 'decision outcome', 'the official decision outcome is unresolved'));
    else if (decision.outcome === 'hold' && decision.changeBp !== 0) result.push(row('FAIL', 'hold amount', 'an unchanged decision must have a zero basis-point change'));
    else if (decision.outcome === 'hike' && !(decision.changeBp > 0)) result.push(row('FAIL', 'hike amount', 'a hike must have a positive change'));
    else if (decision.outcome === 'cut' && !(decision.changeBp < 0)) result.push(row('FAIL', 'cut amount', 'a cut must have a negative change'));
    else result.push(row('PASS', 'decision semantics', `${decision.outcome} has a consistent basis-point change`));
  }
  return result;
}

function compatible(a, b) {
  if (!a || !b || !['gaap', 'adjusted'].includes(a.basis) || a.basis !== b.basis) return false;
  if (!a.currency || !b.currency || a.currency !== b.currency) return false;
  if ((a.shareBasis || b.shareBasis) && a.shareBasis !== b.shareBasis) return false;
  for (const field of ['epsType', 'splitBasis', 'scope', 'unit']) if ((a[field] || b[field]) && a[field] !== b[field]) return false;
  return true;
}

/** Financial source-basis warnings remain unresolved alongside numerical reference comparisons. */
function validateFinancials(snapshot, item, now = Date.now()) {
  const row = make('financials', item);
  const initial = frame(snapshot, 'financials', item, now);
  if (initial.length) return initial;
  if (!Array.isArray(snapshot.periods) || !snapshot.periods.length) return [row('INCOMPLETE', 'financial source basis', 'no visible statement periods were captured')];
  const result = [];
  for (const period of snapshot.periods) {
    if (!period.niTotalBasisConflict) continue;
    const differences = Array.isArray(period.niTotalBasisDetails) ? period.niTotalBasisDetails : [];
    const detail = differences.map((difference) => `${difference.field}: ${(difference.observations ?? []).map((observation) => `${observation.source}=${observation.value} at ${iso(observation.end)}`).join(' vs ')} ${difference.currency ?? ''} (${difference.unit ?? 'unit unknown'})`).join('; ');
    result.push(row('INCOMPLETE', `parent income basis ${period.label ?? ''}`, ['Filed parent income and other statement lines have unresolved reporting-basis differences; a matching net-income value does not resolve the conflict.', detail].filter(Boolean).join(' '), { basisDifferences: differences }));
    if (finite(period.parentIncomeMargin)) result.push(row('FAIL', `parent income margin ${period.label ?? ''}`, 'a numerical parent-income margin is displayed despite an unresolved statement source basis'));
  }
  return result;
}

function validateEarnings(snapshot, item, now = Date.now()) {
  const row = make('earnings', item);
  const initial = frame(snapshot, 'earnings', item, now);
  if (initial.length) return initial;
  if (!Array.isArray(snapshot.quarters) || !snapshot.quarters.length) return [row('INCOMPLETE', 'reported quarters', 'no reported or pending earnings observations were captured')];
  const result = [];
  const seen = new Set();
  for (const q of snapshot.quarters) {
    const field = `EPS ${q.periodEnd ?? '(unknown period)'}`;
    if (!q.periodEnd) {
      result.push(row('INCOMPLETE', field, 'the source does not establish a fiscal period end'));
      continue;
    }
    if (!validDate(q.periodEnd) || seen.has(q.periodEnd)) {
      result.push(row('FAIL', field, 'fiscal period is missing or appears more than once'));
      continue;
    }
    seen.add(q.periodEnd);
    const estimate = q.estimate;
    const actual = q.actual;
    const announced = moment(q.announcedAt);
    if (finite(actual?.value) && Date.parse(q.periodEnd) > snapshot.capturedAt) result.push(row('FAIL', field, 'an actual is presented before its fiscal period ends'));
    if (finite(actual?.value) && finite(announced) && announced > snapshot.capturedAt) result.push(row('FAIL', field, 'an actual is available before its stated announcement time'));
    if (q.status === 'stale' || estimate?.stale || actual?.stale) result.push(row('INCOMPLETE', `${field} freshness`, 'the selected comparison includes a stale source observation'));
    if (!finite(estimate?.value) || !finite(actual?.value)) {
      result.push(row('SKIP', field, 'no complete estimate/actual pair; no surprise can be validated', { critical: false }));
      continue;
    }
    const same = compatible(estimate, actual);
    if (finite(q.surprisePct)) {
      if (!same) result.push(row('FAIL', field, 'numeric surprise is presented without verified matching accounting, currency and share definitions'));
      else if (estimate.value === 0) result.push(row('FAIL', field, 'a zero estimate cannot produce a percentage surprise'));
      else {
        const expected = (actual.value - estimate.value) / Math.abs(estimate.value) * 100;
        result.push(row(Math.abs(expected - q.surprisePct) <= 0.011 ? 'PASS' : 'FAIL', field, 'surprise recomputed from the displayed coherent pair', { app: q.surprisePct, ref: expected }));
      }
    } else if (same && estimate.value !== 0 && q.status === 'coherent') result.push(row('INCOMPLETE', field, 'a coherent numeric pair has no captured surprise'));
    else result.push(row('SKIP', field, 'incompatible or unknown definitions are retained without a numeric surprise', { critical: false }));
    if (q.estimateProvenance === 'pre-announcement-snapshot') {
      const cutoff = moment(q.cutoffAt ?? q.announcedAt);
      const observed = moment(estimate.retrievedAt);
      const published = moment(estimate.publishedAt);
      if (!finite(cutoff) || !finite(observed)) result.push(row('INCOMPLETE', `${field} estimate cutoff`, 'a point-in-time snapshot is missing the cutoff or observation timestamp'));
      else if (observed >= cutoff || (finite(published) && published >= cutoff)) result.push(row('FAIL', `${field} estimate cutoff`, 'a post-announcement estimate is used as a pre-announcement snapshot'));
      else result.push(row('PASS', `${field} estimate cutoff`, `eligible pre-announcement snapshot (${q.cutoffKind ?? 'unspecified cutoff precision'})`));
    } else result.push(row('SKIP', `${field} historical vintage`, 'provider-paired historical data is not certified as a pre-announcement vintage', { critical: false }));
  }
  for (const aggregate of snapshot.aggregates ?? []) {
    const ends = [...(aggregate.periodEnds ?? [])].sort();
    const consecutive = ends.length === 4 && new Set(ends).size === 4 && ends.every((end, i) => validDate(end) && (!i || (Date.parse(end) - Date.parse(ends[i - 1])) / DAY >= 70 && (Date.parse(end) - Date.parse(ends[i - 1])) / DAY <= 110));
    result.push(row(consecutive ? 'PASS' : 'FAIL', `${aggregate.metric ?? 'trailing'} periods`, consecutive ? 'four consecutive fiscal quarters' : 'trailing calculation does not contain four consecutive fiscal quarters'));
  }
  return result;
}

function validateSupply(snapshot, item, now = Date.now()) {
  const row = make('supply-chain', item);
  const initial = frame(snapshot, 'supply-chain', item, now);
  if (initial.length) return initial;
  if (!Array.isArray(snapshot.relations) || !Array.isArray(snapshot.concentrations) || !snapshot.coverage) return [row('BLOCKED', 'relationship schema', 'capture omits relationships, concentration disclosures or source coverage', { kind: 'capture' })];
  const result = [];
  const coverage = snapshot.coverage;
  if ((coverage.failedRequests > 0 || coverage.capReached) && coverage.status !== 'partial') result.push(row('FAIL', 'source completeness', 'failed or capped extraction is not labelled partial'));
  else if (coverage.status === 'partial') result.push(row('INCOMPLETE', 'source completeness', 'one or more sources failed or extraction limits prevented the required coverage'));
  else if (coverage.status !== 'bounded') result.push(row('INCOMPLETE', 'source completeness', 'no explicit bounded-source coverage description was captured'));
  else result.push(row('PASS', 'source coverage semantics', 'bounded filing coverage is explicit; this is not a claim of a complete global supply chain'));
  const named = new Set();
  const anonymous = new Set();
  const ids = new Set();
  const concentrations = new Set(snapshot.concentrations.map((c) => c.id));
  for (const r of snapshot.relations) {
    const field = `${r.role ?? 'unknown role'} ${r.name ?? r.id ?? 'unknown party'}`;
    if (!r.id || ids.has(r.id)) result.push(row('FAIL', field, 'relationship identity is missing or duplicated'));
    ids.add(r.id);
    if (concentrations.has(r.id) || r.isConcentration) result.push(row('FAIL', field, 'a concentration disclosure is also counted as a distinct counterparty'));
    (r.anonymous ? anonymous : named).add(snapshot.countBasis === 'relation-records' ? r.id : r.entityId ?? r.id);
    if (!Array.isArray(r.evidence) || !r.evidence.length) result.push(row('FAIL', field, 'a displayed relationship has no source evidence'));
    if (r.validFrom && r.validTo && moment(r.validTo) < moment(r.validFrom)) result.push(row('FAIL', field, 'relationship interval ends before it starts'));
    if (r.state === 'operating' && r.validFrom && moment(r.validFrom) > snapshot.capturedAt) result.push(row('FAIL', field, 'future commencement is presented as current operations'));
  }
  const counts = snapshot.counts ?? {};
  const expected = { namedCounterparties: named.size, anonymousCounterparties: anonymous.size, concentrationDisclosures: snapshot.concentrations.length };
  for (const [key, value] of Object.entries(expected)) result.push(row(counts[key] === value ? 'PASS' : 'FAIL', key, 'recomputed independently from captured entity/disclosure records', { app: counts[key], ref: value }));
  for (const c of snapshot.concentrations) {
    if (!(c.share >= 0 && c.share <= 100) || !c.period || !c.denominator) result.push(row('FAIL', `concentration ${c.id ?? ''}`, 'share, period or denominator is invalid/missing'));
  }
  return result;
}

function evidenceUrl(value, kind) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.search) return false;
    if (kind === 'fed') return /^(?:www\.)?federalreserve\.gov$/.test(u.hostname) && /^\/newsevents\/pressreleases\/monetary\d{8}[a-z]\.htm$/.test(u.pathname);
    return /^(?:www\.)?sec\.gov$/.test(u.hostname) && /^\/Archives\/edgar\/data\/\d+\/[\w./-]+$/.test(u.pathname);
  } catch { return false; }
}

function fedLinks(html, today) {
  return [...new Set([...String(html).matchAll(/(?:https:\/\/(?:www\.)?federalreserve\.gov)?(\/newsevents\/pressreleases\/monetary(\d{4})(\d{2})(\d{2})a\.htm)/g)].filter((m) => `${m[2]}-${m[3]}-${m[4]}` <= today).map((m) => `https://www.federalreserve.gov${m[1]}`))].sort().reverse();
}

function rateNumber(value) {
  const s = String(value).trim().replace(/\s+/g, '-');
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+)-)?(\d+)\/(\d+)$/.exec(s);
  return m && Number(m[3]) > 0 ? Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]) : NaN;
}

/** Independent, conservative parsing of the official statement's target sentence. */
function fedStatement(html, url) {
  if (!evidenceUrl(url, 'fed')) return null;
  const text = compact(html);
  const range = /target range for the federal funds rate\b[\s\S]{0,100}?\b(?:at|to)\s+(\d+(?:\.\d+)?(?:[- ]\d+\/\d+)?|\d+\/\d+)\s+(?:to|and)\s+(\d+(?:\.\d+)?(?:[- ]\d+\/\d+)?|\d+\/\d+)\s*percent\b/i.exec(text);
  if (!range) return null;
  const lower = rateNumber(range[1]);
  const upper = rateNumber(range[2]);
  const prefix = text.slice(Math.max(0, range.index - 120), range.index);
  const verbs = [...prefix.matchAll(/\b(maintain|keep|leave|raise|increase|lower|reduce)\b/gi)];
  const verb = verbs.at(-1)?.[1].toLowerCase();
  const outcome = /maintain|keep|leave/.test(verb ?? '') ? 'hold' : /raise|increase/.test(verb ?? '') ? 'hike' : /lower|reduce/.test(verb ?? '') ? 'cut' : null;
  const date = /monetary(\d{4})(\d{2})(\d{2})/.exec(url);
  return finite(lower) && finite(upper) && lower <= upper && outcome && date ? { date: `${date[1]}-${date[2]}-${date[3]}`, lower, upper, outcome, sourceUrl: url } : null;
}

function verifyFed(snapshot, reference) {
  const row = make('policy', 'FED');
  const decision = snapshot?.banks?.find((b) => b.code === 'FED')?.latestDecision;
  if (!decision) return [row('INCOMPLETE', 'official decision comparison', 'no captured decision to compare with the official statement', { evidenceKind: 'reference' })];
  const date = decision.date ?? iso(decision.announcedAt) ?? iso(decision.effectiveAt);
  const checks = [['announcement date', date, reference.date], ['decision outcome', decision.outcome, reference.outcome], ['target upper', decision.upper, reference.upper], ['target lower', decision.lower, reference.lower]];
  return checks.map(([field, app, ref]) => row(app === ref ? 'PASS' : 'FAIL', field, 'independently read official FOMC statement', { evidenceKind: 'reference', app, ref, refName: reference.sourceUrl }));
}

const QUOTATION_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', hellip: '...', bull: ' ', middot: ' ' };
function quotationEntity(whole, body) {
  if (body[0] !== '#') return QUOTATION_ENTITIES[body.toLowerCase()] ?? whole;
  const code = /^#x[0-9a-f]+$/i.test(body) ? Number.parseInt(body.slice(2), 16) : /^#\d+$/.test(body) ? Number(body.slice(1)) : NaN;
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
}

// Keep source text in reading order. Inline/XBRL tags do not introduce spaces:
// "$<ix:nonFraction>375</ix:nonFraction>" renders "$375", not "$ 375".
// Block boundaries remain separators so removing markup cannot join two words.
function documentaryText(html) {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|ix:header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?([a-z][\w:.-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (_tag, name) => /^(?:p|div|li|h[1-6]|tr|td|th|table|center|br|pre|section|article|header|footer|blockquote|dl|dt|dd|ul|ol)$/i.test(name) ? ' ' : '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, quotationEntity);
}

function literalQuotation(text) {
  return String(text ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[\u2010-\u2015]/g, '-').replace(/[\u2022\u00b7]/g, ' ').replace(/\u2026/g, '...').replace(/[\s\u200b]+/g, ' ').trim().toLowerCase();
}

/** Exact contiguous documentary quotation checks corroborate evidence, not universal role inference. */
function quotedEvidence(html, evidence) {
  const document = literalQuotation(documentaryText(html));
  // A stored sentence is plain text, already decoded by extraction. Decoding or
  // stripping markup again could change literal entities or angle comparisons.
  const quote = literalQuotation(evidence.sentence);
  return quote.length >= 30 && document.includes(quote);
}

/** Latest-corrected, directly reported fiscal-quarter diluted EPS; never subtract per-share annual/YTD values. */
function filedQuarterEps(facts, periodEnd, currency) {
  if (!validDate(periodEnd) || !/^[A-Z]{3}$/.test(currency ?? '')) return null;
  const concepts = facts?.facts?.['us-gaap'] ?? {};
  for (const concept of ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted']) {
    const eligible = (concepts[concept]?.units?.[`${currency}/shares`] ?? []).filter((r) => {
      const duration = (Date.parse(r.end) - Date.parse(r.start)) / DAY;
      return finite(r.val) && /^(10-Q|10-K)(\/A)?$/.test(r.form ?? '') && r.end === periodEnd && validDate(r.start) && duration >= 60 && duration <= 120 && validDate(r.filed);
    }).sort((a, b) => a.filed.localeCompare(b.filed) || String(a.accn ?? '').localeCompare(String(b.accn ?? '')));
    if (eligible.length) return { ...eligible.at(-1), concept };
  }
  return null;
}

module.exports = { validatePolicy, validateFinancials, validateEarnings, validateSupply, compatible, evidenceUrl, fedLinks, fedStatement, verifyFed, quotedEvidence, compact, moment, iso, number, filedQuarterEps };
