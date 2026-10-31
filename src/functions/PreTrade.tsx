import { bookOf, checkRules, newProblems, type Finding, type Status } from '../terminal/compliance';
import type { Portfolio } from '../terminal/userdata';
import { Dialog } from '../components/Dialog';

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

/**
 * The pre-trade check's question, as a dialog (TE01 05:11): what the trade would breach, and whether to record it
 * anyway. Cancel is the default; Escape and "×" cancel.
 */
export function PreTradeCheck({ problems, onGo, onCancel, go = 'Record anyway' }: { problems: string[]; onGo: () => void; onCancel: () => void; go?: string }) {
  return (
    <Dialog
      title="Compliance Check"
      testId="pre-trade"
      onClose={onCancel}
      buttons={[
        { label: go, onClick: onGo },
        { label: 'Cancel', onClick: onCancel, primary: true },
      ]}
    >
      <div>This would add {problems.length === 1 ? 'an exception' : `${problems.length} exceptions`} to your rules (COMPLIANCE):</div>
      <ul className="dlg-list">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Dialog>
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

