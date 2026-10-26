import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV, Section } from '../components/cells';
import { RealBadge } from '../components/Source';
import { DataTable, type Column } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { CREDITS } from '../components/Credits';
import { fmtIso, fmtNum } from '../core/format';
import { billKey, billName, billRef, congressOn, legislationAvailable, stageOf, STAGES, useLegislation, type BillLine, type Stage } from '../data/live/legislation';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * BILL, US legislation: the latest bills by update with where each stands, the laws of the current Congress, and a
 * bill's sponsor, cosponsors, committees, summary by the Congressional Research Service, actions, subjects and text,
 * from Congress.gov (desktop app, the owner's key).
 */

const STAGE_CLASS: Partial<Record<Stage, string>> = { 'Became law': 'up', Vetoed: 'dn', 'To the President': 'cyan', 'Passed a chamber': 'amber' };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** The bills matching words (in the citation or title), a stage and a chamber. */
export function findBills(bills: BillLine[], words: string, stage: string, chamber: string): BillLine[] {
  const w = words.trim().toLowerCase();
  const plain = w.replace(/[\s.]/g, '');
  return bills.filter(
    (b) =>
      (!stage || stageOf(b.action.text) === stage) &&
      (!chamber || b.chamber === chamber) &&
      (!w || b.title.toLowerCase().includes(w) || billName(b).toLowerCase().replace(/[\s.]/g, '') === plain),
  );
}

export function BILL({ route }: FnProps) {
  const panel = usePanelId();
  const congress = congressOn(Date.now());
  const named = billRef(route.args);
  const [tab, setTab] = useState(named ? 3 : 1);
  const [pages, setPages] = useState(1);
  const [words, setWords] = useState(named ? '' : (route.args ?? '').trim());
  const [stage, setStage] = useState('');
  const [chamber, setChamber] = useState('');
  const [picked, setPicked] = useState(named ? `${congress}/${named.type.toLowerCase()}/${named.number}` : '');
  const s = useLegislation(pages, congress, picked);
  const pageList = Array.from({ length: pages }, (_, p) => s.bills[p]);
  const latest = pageList.flatMap((p) => (p?.state === 'ok' ? p.data.bills : []));
  const total = s.bills[0]?.state === 'ok' ? s.bills[0].data.count : 0;
  const laws = Object.values(s.laws).flatMap((p) => (p?.state === 'ok' ? p.data.bills : []));
  const lawNo = (b: BillLine) => Number(b.laws[0]?.split('-')[1] ?? 0);
  const rows = findBills(tab === 2 ? laws : latest, words, tab === 2 ? '' : stage, chamber);
  const open = (b: BillLine) => {
    setPicked(billKey(b));
    setTab(3);
  };
  const columns: Column<BillLine>[] = [
    { key: 'b', label: 'Bill', render: (b) => <span className="amber">{billName(b)}</span>, sort: (b) => `${b.type}${b.number.padStart(6, '0')}` },
    ...(tab === 2 ? [{ key: 'l', label: 'Law', render: (b: BillLine) => (b.laws.length ? `P.L. ${b.laws.join(', ')}` : ''), sort: lawNo }] : []),
    { key: 't', label: 'Title', render: (b) => <span className="white" title={b.title.length > 90 ? b.title : undefined}>{b.title.length > 90 ? `${b.title.slice(0, 87)}…` : b.title}</span>, sort: (b) => b.title },
    { key: 'c', label: 'Chamber', hideM: true, render: (b) => b.chamber, sort: (b) => b.chamber },
    { key: 's', label: 'Stage', title: "Where the bill stands, from its latest action's wording", render: (b) => { const st = stageOf(b.action.text); return <span className={STAGE_CLASS[st]}>{st}</span>; }, sort: (b) => STAGES.indexOf(stageOf(b.action.text)) },
    { key: 'd', label: 'Latest Action', render: (b) => fmtIso(b.action.date), sort: (b) => b.action.date },
    { key: 'a', label: 'Action', hideN: true, render: (b) => <span title={b.action.text}>{b.action.text.length > 70 ? `${b.action.text.slice(0, 67)}…` : b.action.text}</span>, sort: (b) => b.action.text },
  ];
  const csv = () => [['Bill', 'Law', 'Title', 'Chamber', 'Stage', 'Latest action date', 'Latest action', 'Updated'], ...rows.map((b) => [billName(b), b.laws.join(' '), b.title, b.chamber, stageOf(b.action.text), b.action.date, b.action.text, b.updated])];
  const listPart = tab === 2 ? s.laws[0] : s.bills[0];
  const status = !legislationAvailable()
    ? 'Legislation is read from Congress.gov in the desktop app, with your free key. The browser demo has none, and none is generated.'
    : tab !== 3 && (!listPart || listPart.state === 'loading')
      ? 'Reading Congress.gov…'
      : tab !== 3 && listPart?.state === 'error'
        ? listPart.message
        : '';
  return (
    <div>
      <FnHeader
        code="LEGISLATION"
        title="U.S. Legislation"
        sub={<><RealBadge /> Congress.gov, the {ordinal(congress)} Congress{tab === 1 && total ? ` · the latest ${fmtNum(latest.length, 0)} of ${fmtNum(total, 0)} bills by update` : tab === 2 && laws.length ? ` · ${fmtNum(laws.length, 0)} laws enacted` : ''}</>}
        tabs={[{ n: 1, label: 'Latest' }, { n: 2, label: 'Laws' }, { n: 3, label: 'Bill' }]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `BILL_${tab === 2 ? 'laws' : 'latest'}.csv`, csv)}
        controls={
          tab !== 3 ? (
            <div className="chart-tools">
              <input className="inp" aria-label="Find a bill" placeholder="Words in the title, or H.R. 1234" value={words} onChange={(e) => setWords(e.target.value)} />
              {tab === 1 && (
                <label className="fld">
                  Stage
                  <select className="sel-inp" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                    <option value="">All</option>
                    {STAGES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="fld">
                Chamber
                <select className="sel-inp" aria-label="Chamber" value={chamber} onChange={(e) => setChamber(e.target.value)}>
                  <option value="">Both</option>
                  <option value="House">House</option>
                  <option value="Senate">Senate</option>
                </select>
              </label>
              {tab === 1 && pages < 4 && latest.length < total && (
                <button type="button" className="btn" onClick={() => setPages(pages + 1)}>
                  250 more
                </button>
              )}
            </div>
          ) : undefined
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : tab === 3 ? (
        <BillView billKey={picked} s={s} onBack={() => setTab(1)} />
      ) : (
        <>
          <DataTable rows={rows} columns={columns} rowKey={billKey} defaultSort={tab === 2 ? { key: 'l', dir: -1 } : { key: 'd', dir: -1 }} numbered className="zebra" onRowClick={open} selected={picked} empty="No bill matches." page={{ index: 0, size: 250 }} />
          <div className="note">
            {tab === 1
              ? 'Bills and resolutions of every Congress, the most recently updated first. The stage is read from the latest action\'s wording. Click a bill for its sponsor, summary and actions.'
              : 'The laws enacted in this Congress, the latest first.'}{' '}
            {CREDITS.congressgov}
          </div>
        </>
      )}
    </div>
  );
}

function BillView({ billKey: key, s, onBack }: { billKey: string; s: ReturnType<typeof useLegislation>; onBack: () => void }) {
  if (!key) return <div className="empty">Pick a bill on Latest or Laws, or type BILL and its number (BILL HR 7831).</div>;
  const head = s.bill[key];
  const parts = s.parts[key];
  if (!head || head.state === 'loading') return <div className="empty">Reading the bill from Congress.gov…</div>;
  if (head.state === 'error') return <div className="empty">{head.message}</div>;
  const d = head.data;
  const p = parts?.state === 'ok' ? parts.data : null;
  const person = (x: { name: string }) => x.name;
  return (
    <>
      <div className="pad-s">
        <button type="button" className="btn" onClick={onBack}>
          ‹ All bills
        </button>
      </div>
      <Section title={`${billName(d.line)} · ${d.line.title}`}>
        <KV
          items={[
            ['Congress', `${ordinal(d.line.congress)}, ${d.line.chamber}`],
            ['Sponsor', d.sponsors.map(person).join('; ') || '--'],
            ['Introduced', fmtIso(d.line.introduced)],
            ['Cosponsors', fmtNum(d.cosponsors, 0)],
            ['Policy area', d.policyArea || '--'],
            ['Stage', stageOf(d.line.action.text)],
            ['Latest action', `${fmtIso(d.line.action.date)}: ${d.line.action.text}`],
            ...(d.line.laws.length ? [['Law', `Public Law ${d.line.laws.join(', ')}`] as [string, string]] : []),
            ...(p?.committees.length ? [['Committees', p.committees.map((c) => c.name).join('; ')] as [string, string]] : []),
            ...(d.url ? [['Congress.gov', <a key="u" href={d.url} target="_blank" rel="noreferrer">{d.url.replace(/^https:\/\//, '')}</a>] as [string, React.ReactNode]] : []),
          ]}
        />
      </Section>
      {!p ? (
        <div className="empty">Reading the actions, summary and text…</div>
      ) : (
        <>
          <Section title={p.summary ? `Summary (${p.summary.label}, ${fmtIso(p.summary.date)})` : 'Summary'}>
            {p.summary ? (
              <div className="pad-s bill-summary">
                {p.summary.paragraphs.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
                <p className="muted">Written by the Congressional Research Service.</p>
              </div>
            ) : (
              <div className="empty">The Congressional Research Service has not summarised this bill yet.</div>
            )}
          </Section>
          <Section title={`Actions (${p.actions.length})`}>
            <DataTable
              rows={p.actions}
              columns={[
                { key: 'd', label: 'Date', render: (a) => fmtIso(a.date), sort: (a) => a.date },
                { key: 'y', label: 'Type', hideN: true, render: (a) => a.type, sort: (a) => a.type },
                { key: 't', label: 'Action', render: (a) => a.text, sort: (a) => a.text },
              ]}
              rowKey={(_a, i) => String(i)}
              defaultSort={{ key: 'd', dir: -1 }}
              className="zebra"
            />
          </Section>
          {p.texts.length > 0 && (
            <Section title="Text">
              <DataTable
                rows={p.texts}
                columns={[
                  { key: 'v', label: 'Version', render: (t) => t.type, sort: (t) => t.type },
                  { key: 'd', label: 'Date', render: (t) => (t.date ? fmtIso(t.date) : <span className="muted" title="Congress.gov gives no date for this version">no date</span>), sort: (t) => t.date },
                  {
                    key: 'f',
                    label: 'Read',
                    render: (t) =>
                      t.formats
                        .filter((f) => f.type === 'Formatted Text' || f.type === 'PDF')
                        .map((f, i) => (
                          <span key={f.url}>
                            {i > 0 ? ' · ' : ''}
                            <a href={f.url} target="_blank" rel="noreferrer">{f.type === 'PDF' ? 'PDF ›' : 'Text ›'}</a>
                          </span>
                        )),
                  },
                ]}
                rowKey={(_t, i) => String(i)}
                className="zebra"
              />
            </Section>
          )}
          {p.cosponsors.length > 0 && (
            <Section title={`Cosponsors (${p.cosponsors.length})`}>
              <div className="pad-s">{p.cosponsors.map((c) => `${c.name}${c.since ? ` (${fmtIso(c.since)})` : ''}`).join('; ')}</div>
            </Section>
          )}
          {p.subjects.length > 0 && (
            <Section title="Subjects">
              <div className="pad-s">{p.subjects.join('; ')}</div>
            </Section>
          )}
          <div className="note">{CREDITS.congressgov}</div>
        </>
      )}
    </>
  );
}
