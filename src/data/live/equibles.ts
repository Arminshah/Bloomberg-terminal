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
