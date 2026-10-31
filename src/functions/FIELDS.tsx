// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { FnHeader } from '../components/FnHeader';
import { KV, Section } from '../components/cells';
import { copyText, downloadText } from '../core/csv';
import { fmtNum } from '../core/format';
import { fieldTime, fieldsCsv, filterFields, securityFields, type FieldCategory, type FieldValue } from '../data/fields';
import { engine, useInterval, useQuote } from '../data/market';
import type { SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const CATEGORIES: FieldCategory[] = ['Identity', 'Market', 'Calculated', 'Source'];
const valueText = (f: FieldValue, sec: SecurityDef) => f.value === null ? 'Not available' : typeof f.value === 'number' ? fmtNum(f.value, f.id === 'PX_VOLUME' ? 0 : Math.max(sec.dec, 4)) : f.value;

export function FIELDS({ sec, route }: FnProps) {
  if (!sec) return null;
  return <FieldSearch key={`${sec.id}|${route.args ?? ''}`} sec={sec} initialQuery={route.args ?? ''} />;
}

function FieldSearch({ sec, initialQuery }: { sec: SecurityDef; initialQuery: string }) {
  const panel = usePanelId();
  const q = useQuote(sec.id);
  useInterval(1000);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<FieldCategory | ''>('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selected, setSelected] = useState('PX_LAST');
  const inspectedAt = engine.now();
  const all = securityFields(sec, q, inspectedAt);
  const rows = filterFields(all, query, category || undefined, availableOnly);
  const field = rows.find((f) => f.id === selected) ?? rows[0];
  const csv = () => fieldsCsv(sec.id, rows, inspectedAt);
  return <div>
    <FnHeader code="FIELDS" title="Field Search & Inspection" sec={sec} sub={`${rows.length} of ${all.length} local fields`} actions={[
      { n: 98, label: 'Copy fields', onClick: () => { void copyText(csv()).then((ok) => flash(panel, ok ? 'Copied the filtered fields with sources and timestamps' : 'Clipboard unavailable', ok ? 'info' : 'error')); } },
      { n: 99, label: 'Export fields', onClick: () => downloadText(`${sec.ticker.replaceAll(' ', '-')}-fields.csv`, csv()) },
    ]} />
    <div className="chart-tools">
      <input className="inp fields-search" aria-label="Search data fields" placeholder="Field ID, name or definition · e.g. PX_LAST, spread, volume" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className="sel-inp" aria-label="Field category" value={category} onChange={(e) => setCategory(e.target.value as FieldCategory | '')}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <label className="fld"><input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} /> Available values only</label>
    </div>
    {field && <Section title={<span>{field.id} · {field.name}</span>} className="field-definition">
      <KV items={[
        ['Value / unit', <span key="value" data-testid="field-value">{valueText(field, sec)} · {field.unit}</span>],
        ['Status / provider', `${field.status} · ${field.source}`],
        ['Source as of UTC', fieldTime(field) || 'None: see the time basis'],
        ['Time basis', field.timeBasis],
        ['Definition', field.definition],
        ['Availability / convention', field.note],
      ]} />
    </Section>}
    <div className="tbl-wrap"><DataTable<FieldValue> rows={rows} rowKey={(f) => f.id} selected={field?.id} onRowClick={(f) => setSelected(f.id)} empty="No fields match this search and category." columns={[
      { key: 'id', label: 'Field', sort: (f) => f.id, render: (f) => <button className="sec-link" type="button" aria-label={`Inspect ${f.id}`} onClick={() => setSelected(f.id)}>{f.id}</button> },
      { key: 'name', label: 'Name', sort: (f) => f.name, render: (f) => f.name },
      { key: 'value', label: 'Value', num: true, render: (f) => valueText(f, sec) },
      { key: 'unit', label: 'Unit', render: (f) => f.unit },
      { key: 'status', label: 'Status', sort: (f) => f.status, render: (f) => <span className={f.value === null ? 'muted' : f.status === 'DEMO DATA' || f.status.includes('STALE') || f.status.includes('UNVERIFIED') || f.status.includes('TIMESTAMP UNAVAILABLE') ? 'amber' : ''} title={f.note}>{f.status}</span> },
      { key: 'source', label: 'Source', sort: (f) => f.source, render: (f) => f.source, hideM: true },
      { key: 'time', label: 'Source as of UTC', render: fieldTime, hideM: true },
    ]} /></div>
    <div className="note">This catalogue describes values currently held by Armin Terminal. IDs and definitions are local; familiar names do not imply compatibility with any other vendor's fields or API. Source coverage, timing, units and missing fields remain explicit. Bid/ask event times are unavailable in this engine and are never borrowed from a trade. No extra provider request is made by this screen.</div>
  </div>;
}
