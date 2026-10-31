// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// DVD rows against Nasdaq's dividend history (declaration, ex, record, payment dates and amounts).
const fs = require('node:fs');
const [outDir, refDir, ...tickers] = process.argv.slice(2);
const iso = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || ''); return m ? `20${m[3]}-${m[2]}-${m[1]}` : ''; };
const us = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? `${m[3]}-${m[1]}-${m[2]}` : ''; };
for (const t of tickers) {
  const ref = JSON.parse(fs.readFileSync(`${refDir}/${t}.json`, 'utf8'));
  const rows = ref.nasdaqDividends?.data?.dividends?.rows ?? [];
  const nq = new Map(rows.map((r) => [us(r.exOrEffDate), r]));
  const lines = fs.readFileSync(`${outDir}/${t}_US_Equity_DVD.txt`, 'utf8').split('\n');
  let n = 0, bad = 0;
  for (const l of lines) {
    const m = /^\d+\)\s+(\S*)\s+(\d{2}\/\d{2}\/\d{2})\s+(\S*)\s+(\S*)\s+(\w{3})\s+([\d.]+)\s+(.+)$/.exec(l.replace(/\t/g, ' '));
    if (!m) continue;
    const [, dec, ex, rec, pay, , amt, type] = m;
    const r = nq.get(iso(ex));
    if (!r) { if (iso(ex) >= '2022-01-01') { console.log(`MISS ${t} ex ${iso(ex)} ${amt} ${type} not in Nasdaq`); bad++; } continue; }
    n++;
    const probs = [];
    if (Math.abs(Number(amt) - Number(String(r.amount).replace(/[$,]/g, ''))) > 0.0005) probs.push(`amount ${amt} vs ${r.amount}`);
    if (dec && iso(dec) !== us(r.declarationDate)) probs.push(`declared ${iso(dec)} vs ${us(r.declarationDate)}`);
    if (rec && iso(rec) !== us(r.recordDate)) probs.push(`record ${iso(rec)} vs ${us(r.recordDate)}`);
    if (pay && iso(pay) !== us(r.paymentDate)) probs.push(`pay ${iso(pay)} vs ${us(r.paymentDate)}`);
    if (probs.length) { bad++; console.log(`BAD ${t} ex ${iso(ex)}: ${probs.join('; ')}`); }
  }
  const appEx = new Set(lines.map((l) => /^\d+\)\s+\S*\s+(\d{2}\/\d{2}\/\d{2})/.exec(l.replace(/\t/g, ' '))?.[1]).filter(Boolean).map(iso));
  for (const r of rows) if (us(r.exOrEffDate) >= '2022-01-01' && us(r.exOrEffDate) <= '2026-10-28' && !appEx.has(us(r.exOrEffDate))) { console.log(`ABSENT ${t} Nasdaq ex ${us(r.exOrEffDate)} ${r.amount} ${r.type} missing in app`); bad++; }
  console.log(`${t}: ${n} rows matched, ${bad} problems`);
}
