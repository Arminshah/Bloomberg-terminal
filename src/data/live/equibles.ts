export type ResearchKind = 'estimates' | 'guidance' | 'kpis' | 'events' | 'insiders' | 'short-interest' | 'holders' | 'ir-news';
export const RESEARCH: { kind: ResearchKind; label: string; description: string }[] = [
  { kind: 'estimates', label: 'Analyst estimates', description: 'Company-published or compiled analyst consensus, as labelled by Equibles, with source units, accounting basis and snapshot dates. Coverage varies by issuer.' },
  { kind: 'guidance', label: 'Guidance', description: 'Company guidance from filings and transcripts; distinct from analyst forecasts.' },
  { kind: 'kpis', label: 'Company KPIs', description: 'Company-reported operating metrics and their source qualifications.' },
  { kind: 'events', label: 'Investor events', description: 'Investor-event and earnings-call records; transcript availability depends on coverage.' },
  { kind: 'insiders', label: 'Insider trades', description: 'SEC insider filings. Awards, exercises and gifts are distinct from open-market trades.' },
  { kind: 'short-interest', label: 'Short interest', description: 'FINRA settlement history. Any provider model estimate remains separately labelled.' },
  { kind: 'holders', label: 'Institutional holders', description: 'SEC 13F holdings, with reporting delays. Percentages refer to institutional 13F shares, not shares outstanding.' },
  { kind: 'ir-news', label: 'IR news', description: 'Company investor-relations announcements; distinct from independent news coverage.' },
];

export function parseResearch(text: string): { tool: string; report: string } | null {
  try {
    const result = JSON.parse(text);
    return result && typeof result.tool === 'string' && typeof result.report === 'string' && result.report.trim() ? { tool: result.tool, report: result.report } : null;
  } catch { return null; }
}

/** One figure of Equibles' analyst estimates: metric, forecast period, statistic and value as the report states them. */
export interface EstimateObservation {
  metric: string;
  /** Product or segment, empty for the whole company. */
  dimension: string;
  /** The source's period label ("Q ending 2026-11-30") and its end date. */
  period: string;
  end: string;
  statistic: string;
  value: number;
  unit: string;
}

const OBSERVATION = /^\s*(?:[-*•|]\s*)?([A-Za-z][\w /&().'%-]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?(\d{4}-\d{2}-\d{2})[^|]*?)\s*\|\s*([^|:]+?)\s*\|?\s*:\s*(-?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?)\s*([A-Za-z%/]+)?/i;

/** The observations in an analyst-estimates report, one per line; lines that are not one are left out. */
export function parseEstimateObservations(report: string): EstimateObservation[] {
  const out: EstimateObservation[] = [];
  for (const line of report.split('\n')) {
    const m = OBSERVATION.exec(line.replace(/\*\*/g, ''));
    if (!m) continue;
    const value = Number(m[6].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    out.push({ metric: m[1].trim(), dimension: m[2].trim(), period: m[3].trim(), end: m[4], statistic: m[5].trim(), value, unit: (m[7] ?? '').trim() });
  }
  return out;
}

export interface EstimateRow {
  metric: string;
  dimension: string;
  period: string;
  end: string;
  unit: string;
  avg: number;
  low: number;
  high: number;
  analysts: number;
  /** The average 30 days earlier, and the analysts who raised and lowered their estimate in the last 30 days. */
  avg30: number;
  raised30: number;
  lowered30: number;
}

/** The observations as one row per metric and period: average, range, analysts and the last month's revisions. */
export function estimateTable(obs: EstimateObservation[]): EstimateRow[] {
  const rows = new Map<string, EstimateRow>();
  for (const o of obs) {
    const key = `${o.metric}|${o.dimension}|${o.end}`;
    let r = rows.get(key);
    if (!r) {
      r = { metric: o.metric, dimension: o.dimension, period: o.period, end: o.end, unit: '', avg: NaN, low: NaN, high: NaN, analysts: NaN, avg30: NaN, raised30: NaN, lowered30: NaN };
      rows.set(key, r);
    }
    const s = o.statistic.toLowerCase();
    if (s === 'average' || s === 'mean' || s === 'consensus') {
      r.avg = o.value;
      r.unit = o.unit;
    } else if (s === 'low') r.low = o.value;
    else if (s === 'high') r.high = o.value;
    else if (/analyst count|number of analysts|^analysts$/.test(s)) r.analysts = o.value;
    else if (/average,? 30 days ago/.test(s)) r.avg30 = o.value;
    else if (/raised,? last 30 days/.test(s)) r.raised30 = o.value;
    else if (/lowered,? last 30 days/.test(s)) r.lowered30 = o.value;
  }
  return [...rows.values()].filter((r) => Number.isFinite(r.avg)).sort((a, b) => a.end.localeCompare(b.end) || a.metric.localeCompare(b.metric));
}

/** The guidance report's own statement that no newer guidance exists: the last filing date and the date checked to. */
export function guidanceStatus(report: string): { last: string; checked: string } | null {
  const m = /newest guidance on record was filed (\d{4}-\d{2}-\d{2});\s*documents through (\d{4}-\d{2}-\d{2})/i.exec(report);
  return m ? { last: m[1], checked: m[2] } : null;
}
