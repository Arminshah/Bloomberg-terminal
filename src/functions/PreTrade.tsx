import { bookOf, checkRules, newProblems, type Finding, type Status } from '../terminal/compliance';
import type { Portfolio } from '../terminal/userdata';

/** The pre-trade side of COMPLIANCE (CMGR), for PORTFOLIO's entry forms: what a trade would add to the exceptions. */

/** Each finding's items at a warning or over the limit, as rows of the exception blotter. */
export function exceptions(findings: Finding[]) {
  return findings.flatMap((f) => f.items.filter((i) => i.status === 'warn' || i.status === 'breach').map((i) => ({ f, i, key: `${f.rule.id}|${i.key}` })));
}

/** What a change to the portfolio would add to its exceptions; empty without rules or problems. */
export function preTradeProblems(before: Portfolio, after: Portfolio): string[] {
  const rules = after.rules ?? [];
  if (!rules.some((r) => r.on)) return [];
  return newProblems(checkRules(rules, bookOf(before)), checkRules(rules, bookOf(after)));
}

/** The pre-trade check's question: what the trade would breach, and whether to record it anyway. */
export function PreTradeCheck({ problems, onGo, onCancel, go = 'Record anyway' }: { problems: string[]; onGo: () => void; onCancel: () => void; go?: string }) {
  return (
    <div className="note amber" role="alert" data-testid="pre-trade">
      <div>Compliance check: this would add {problems.length === 1 ? 'an exception' : `${problems.length} exceptions`} to your rules (COMPLIANCE):</div>
      <ul style={{ margin: '4px 0 6px 18px' }}>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onGo}>
        {go}
      </button>{' '}
      <button type="button" className="btn primary" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** A portfolio's exception count for its other screens: "1 breach, 2 warnings". Empty without rules. */
export function complianceSummary(p: Portfolio): { text: string; status: Status } | null {
  const rules = p.rules ?? [];
  if (!rules.some((r) => r.on)) return null;
  const ex = exceptions(checkRules(rules, bookOf(p)));
  const breaches = ex.filter((x) => x.i.status === 'breach').length;
  const warns = ex.length - breaches;
  if (!ex.length) return { text: `All ${rules.filter((r) => r.on).length} compliance rules pass`, status: 'pass' };
  return { text: [breaches ? `${breaches} breach${breaches === 1 ? '' : 'es'}` : '', warns ? `${warns} warning${warns === 1 ? '' : 's'}` : ''].filter(Boolean).join(', '), status: breaches ? 'breach' : 'warn' };
}

