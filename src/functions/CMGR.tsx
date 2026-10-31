// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { Section } from '../components/cells';
import { fmtDateTime, fmtNum } from '../core/format';
import { useTick } from '../data/market';
import { resolveSecurity } from '../data/registry';
import { bookOf, checkRules, limitText, RULE_LABEL, ruleId, type Finding, type Rule, type RuleKind, type Status } from '../terminal/compliance';
import { flash, usePanelId } from '../terminal/panel';
import { portfolio, portfolios } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';
import { PortfolioTabs } from './PORT';
import { exceptions } from './PreTrade';

const STATUS_TEXT: Record<Status, string> = { pass: 'Pass', warn: 'Warning', breach: 'Breach', unknown: 'No NAV' };
const STATUS_CLASS: Record<Status, string> = { pass: 'up', warn: 'amber', breach: 'dn', unknown: 'muted' };

/** Rules many funds hold to, one click each. */
const PRESETS: { label: string; rules: Omit<Rule, 'id'>[] }[] = [
  { label: 'UCITS 5/10/40', rules: [{ kind: 'ucits', on: true }] },
  { label: 'No position above 10%', rules: [{ kind: 'position', max: 10, warn: 8, on: true }] },
  { label: 'No sector above 30%', rules: [{ kind: 'sector', max: 30, warn: 25, on: true }] },
  { label: 'At least 20 holdings', rules: [{ kind: 'count', min: 20, on: true }] },
  { label: 'No short positions', rules: [{ kind: 'short', on: true }] },
];

const KINDS: RuleKind[] = ['position', 'sector', 'country', 'region', 'class', 'ucits', 'restricted', 'count', 'cash', 'short'];

export function CMGR(_: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const st = portfolio.use((s) => s);
  const active = portfolios.use((s) => s.active);
  const rules = useMemo(() => st.rules ?? [], [st.rules]);
  const book = bookOf(st);
  const findings = checkRules(rules, book);
  const ex = exceptions(findings);
  const exKeys = ex.map((x) => x.key).sort().join(',');
  // When each exception was first seen: kept with the portfolio, dropped once the rule passes again.
  useEffect(() => {
    const seen = portfolio.get().exceptions ?? {};
    const now = Date.now();
    const keys = exKeys ? exKeys.split(',') : [];
    const next: Record<string, number> = {};
    for (const k of keys) next[k] = seen[k] ?? now;
    if (Object.keys(next).length !== Object.keys(seen).length || keys.some((k) => !(k in seen))) portfolio.set((s) => ({ ...s, exceptions: next }));
  }, [exKeys, active]);
  const seen = st.exceptions ?? {};
  const setRules = (next: Rule[]) => portfolio.set((s) => ({ ...s, rules: next }));

  const [kind, setKind] = useState<RuleKind>('position');
  const [group, setGroup] = useState('');
  const [max, setMax] = useState('');
  const [warn, setWarn] = useState('');
  const [min, setMin] = useState('');
  const [names, setNames] = useState('');
  const groups = useMemo(() => {
    const key = kind === 'sector' ? 'sector' : kind === 'country' ? 'country' : kind === 'region' ? 'region' : kind === 'class' ? 'cls' : null;
    return key ? [...new Set(book.holdings.map((h) => String(h[key])))].sort() : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, book.holdings.length]);
  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : undefined);
  const add = () => {
    const r: Rule = { id: ruleId(), kind, on: true };
    const mx = num(max);
    const wn = num(warn);
    const mn = num(min);
    if (kind === 'restricted') {
      const ids: string[] = [];
      for (const t of names.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
        const d = resolveSecurity(t);
        if (!d) return flash(panel, `Unknown security: ${t}`, 'error');
        ids.push(d.id);
      }
      if (!ids.length) return flash(panel, 'Name the securities not to hold, separated by commas', 'error');
      r.ids = [...new Set(ids)];
    } else if (kind === 'count') {
      if (!(mn != null && Number.isInteger(mn) && mn > 0)) return flash(panel, 'Enter the fewest holdings, a whole number', 'error');
      r.min = mn;
      if (wn != null) r.warn = wn;
    } else if (kind === 'cash') {
      if (mn == null && mx == null) return flash(panel, 'Enter the least or the most cash, in percent of NAV', 'error');
      if ((mn != null && !(mn >= 0)) || (mx != null && !(mx >= 0))) return flash(panel, 'Cash limits are percentages of NAV', 'error');
      if (mn != null) r.min = mn;
      if (mx != null) r.max = mx;
    } else if (kind !== 'ucits' && kind !== 'short') {
      if (!(mx != null && mx > 0)) return flash(panel, 'Enter the limit, in percent of NAV', 'error');
      if (wn != null && !(wn > 0 && wn < mx)) return flash(panel, 'The warning level is a percentage below the limit', 'error');
      r.max = mx;
      if (wn != null) r.warn = wn;
      if (kind !== 'position' && group.trim()) r.group = group.trim();
    }
    setRules([...rules, r]);
    setMax('');
    setWarn('');
    setMin('');
    setNames('');
    setGroup('');
    flash(panel, `Rule added: ${RULE_LABEL[kind]}, ${limitText(r)}`, 'info');
  };

  const breaches = ex.filter((x) => x.i.status === 'breach').length;
  const csv = () => [
    ['Portfolio', 'Status', 'Rule', 'Item', 'Value', 'Limit', 'First seen'],
    ...ex.map((x) => [st.name, STATUS_TEXT[x.i.status], RULE_LABEL[x.f.rule.kind], x.i.key, x.f.rule.kind === 'count' ? x.i.value : Number(x.i.value.toFixed(4)), x.f.limit, seen[x.key] ? new Date(seen[x.key]).toISOString() : '']),
  ];
  const valueText = (f: Finding, v: number) => (f.rule.kind === 'count' ? String(v) : `${fmtNum(v, 2)}%`);

  return (
    <div>
      <FnHeader
        code="COMPLIANCE"
        title="Compliance Manager"
        sub={`${st.name} · your own rules, checked as prices move and before each trade you record`}
        actions={exportActions(panel, `${st.name.replace(/\W+/g, '_') || 'portfolio'}-exceptions.csv`, csv).map((a) => ({ ...a, label: `${a.label} exceptions` }))}
        controls={<PortfolioTabs />}
      />
      <div className="note" data-testid="cmgr-summary">
        {rules.length === 0
          ? 'No rules yet for this portfolio. Add one below, or start from a common rule.'
          : `${rules.filter((r) => r.on).length} of ${rules.length} rules on · ${breaches} breach${breaches === 1 ? '' : 'es'} · ${ex.length - breaches} warning${ex.length - breaches === 1 ? '' : 's'}`}
        {Number.isFinite(book.nav) ? ` · NAV ${fmtNum(book.nav, 0)} ${book.base}` : ' · NAV unknown: a holding has no price yet'}
      </div>
      <Section title="Exceptions">
        {ex.length ? (
          <table className="tbl zebra" data-testid="cmgr-exceptions">
            <thead>
              <tr>
                <th>Status</th>
                <th>Rule</th>
                <th>Item</th>
                <th className="num">Value</th>
                <th>Limit</th>
                <th className="hide-m">First seen</th>
              </tr>
            </thead>
            <tbody>
              {ex.map((x) => (
                <tr key={x.key}>
                  <td className={STATUS_CLASS[x.i.status]}>{STATUS_TEXT[x.i.status]}</td>
                  <td>{RULE_LABEL[x.f.rule.kind]}</td>
                  <td className="white">{x.i.key}</td>
                  <td className="num">{valueText(x.f, x.i.value)}</td>
                  <td className="muted">{x.f.limit}</td>
                  <td className="hide-m muted">{seen[x.key] ? fmtDateTime(seen[x.key]) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">{rules.some((r) => r.on) ? 'No exceptions: every rule passes.' : 'No rules on.'}</div>
        )}
      </Section>
      <Section title="Rules">
        {rules.length ? (
          <table className="tbl" data-testid="cmgr-rules">
            <thead>
              <tr>
                <th>On</th>
                <th>Rule</th>
                <th>Limit</th>
                <th>Status</th>
                <th className="hide-m">Closest or worst</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => {
                const f = findings.find((x) => x.rule.id === r.id);
                const top = f?.items[0];
                return (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" aria-label={`Rule ${i + 1} on`} checked={r.on} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} />
                    </td>
                    <td>{RULE_LABEL[r.kind]}</td>
                    <td className="muted">{limitText(r)}</td>
                    <td className={f ? STATUS_CLASS[f.status] : 'muted'}>{f ? STATUS_TEXT[f.status] : 'Off'}</td>
                    <td className="hide-m">{f && top ? `${top.key} ${valueText(f, top.value)}` : ''}</td>
                    <td>
                      <button type="button" className="link-btn" aria-label={`Delete rule ${i + 1}`} onClick={() => setRules(rules.filter((x) => x.id !== r.id))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </Section>
      <Section title="Add a rule">
        <div className="pad row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="sel-inp" aria-label="Rule" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {RULE_LABEL[k]}
              </option>
            ))}
          </select>
          {(kind === 'sector' || kind === 'country' || kind === 'region' || kind === 'class') && (
            <>
              <input className="inp" style={{ width: 170 }} aria-label="Group" placeholder="Each (or one, by name)" list={`cmgr-groups-${panel}`} value={group} onChange={(e) => setGroup(e.target.value)} />
              <datalist id={`cmgr-groups-${panel}`}>
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
          {kind === 'restricted' && <input className="inp" style={{ width: 240 }} aria-label="Securities" placeholder="Tickers, separated by commas" value={names} onChange={(e) => setNames(e.target.value)} />}
          {(kind === 'count' || kind === 'cash') && <input className="inp" style={{ width: 90 }} aria-label="Least" placeholder={kind === 'count' ? 'Fewest' : 'Least %'} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />}
          {kind !== 'restricted' && kind !== 'count' && kind !== 'ucits' && kind !== 'short' && <input className="inp" style={{ width: 90 }} aria-label="Limit" placeholder={kind === 'cash' ? 'Most %' : 'Limit %'} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />}
          {kind !== 'restricted' && kind !== 'ucits' && kind !== 'short' && kind !== 'cash' && <input className="inp" style={{ width: 90 }} aria-label="Warning" placeholder={kind === 'count' ? 'Warn below' : 'Warn above %'} inputMode="decimal" value={warn} onChange={(e) => setWarn(e.target.value)} />}
          <button type="button" className="btn primary" onClick={add}>
            Add rule
          </button>
        </div>
        <div className="chart-tools">
          <span className="amber">Common rules</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip-btn" onClick={() => setRules([...rules, ...p.rules.map((r) => ({ ...r, id: ruleId() }))])}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>
      <div className="note">
        Weights are shares of the portfolio&apos;s net asset value: cash, securities at market and futures at their P&amp;L, with a future&apos;s exposure at
        its notional. A group&apos;s weight adds its holdings (sectors are GICS sectors; countries and regions are where each security trades). UCITS 5/10/40
        is the diversification rule of the EU&apos;s UCITS Directive (2009/65/EC, Article 52): at most 10% in one issuer, and the holdings above 5% together
        at most 40%; here each holding counts as its own issuer. The rules are checked again with every price, and on PORTFOLIO a position or transaction
        that would add an exception asks before it is recorded.
      </div>
    </div>
  );
}
