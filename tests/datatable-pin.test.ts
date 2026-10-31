import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type Column } from '../src/components/DataTable';

type Row = { name: string; v: number };
const columns: Column<Row>[] = [
  { key: 'name', label: 'Name', render: (r) => r.name, sort: (r) => r.name },
  { key: 'v', label: 'Value', num: true, render: (r) => String(r.v), sort: (r) => r.v },
];
const rows: Row[] = [{ name: 'SUBJECT', v: 5 }, { name: 'LOW', v: 3 }, { name: 'HIGH', v: 9 }];
const order = (html: string) => [...html.matchAll(/<td class="idx num">(\d+)\)<\/td><td[^>]*>([A-Z]+)<\/td>/g)].map((m) => `${m[1]}) ${m[2]}`);

describe('a table that pins its first row, as RV pins the loaded security', () => {
  it('keeps the first row first as 100) and sorts and numbers the rest from 101)', () => {
    const html = renderToStaticMarkup(createElement(DataTable<Row>, { columns, rows, rowKey: (r) => r.name, defaultSort: { key: 'v', dir: -1 }, numbered: 101, pinFirst: true }));
    expect(order(html)).toEqual(['100) SUBJECT', '101) HIGH', '102) LOW']);
  });

  it('sorts every row without the pin', () => {
    const html = renderToStaticMarkup(createElement(DataTable<Row>, { columns, rows, rowKey: (r) => r.name, defaultSort: { key: 'v', dir: -1 }, numbered: 101 }));
    expect(order(html)).toEqual(['101) HIGH', '102) SUBJECT', '103) LOW']);
  });
});
