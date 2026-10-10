import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll } from '../site/js/engine.js';
import { toCsv, toMarkdown, assumptions } from '../site/js/exports.js';
import { TINY, ctxFor, item } from './helpers.js';

const S = {
  v: 2, mode: '730', custom: 196, overrides: {},
  meta: { client: 'Contoso', title: 'Hub', by: 'Abby', status: 'Indicative' },
  acr: { start: '2026-10', term: 12, live: 1, ramp: 1, disc: 10, cont: 0 },
  items: [item('pip', { qty: 3 }), item('egress', { gb: 500 }), item('pip', { qty: 1 }, 'ukwest')],
};
const R = computeAll(ctxFor(TINY), S.items, S.acr);

test('CSV has a row per line and totals that match the estimate', () => {
  const csv = toCsv(S, R).trim().split('\n');
  assert.equal(csv[0], 'Section,Item,Region,Line,Type,Calculation,Monthly GBP (list),Rate source');
  const lines = R.items.reduce((a, x) => a + x.res.lines.length, 0);
  assert.equal(csv.length, 1 + lines + 3);
  const listRow = csv.find((r) => r.includes('List total'));
  assert.equal(Number(listRow.split(',').at(-2)), Number(R.list.toFixed(6)));
  assert.ok(csv.some((r) => r.startsWith('"Networking","Public IP addresses","UK West"')));
});

test('Markdown is client-ready: summary, sections, assumptions, exclusions and disclaimer', () => {
  const md = toMarkdown(S, R, TINY);
  assert.match(md, /^# Hub — Contoso/);
  for (const s of ['## Summary', '| Monthly run rate |', '## Networking', '## Assumptions', '## Exclusions', 'Not affiliated with Microsoft', 'GBP, excl. VAT']) assert.ok(md.includes(s), `missing ${s}`);
  assert.match(md, /Discount of 10% applied/);
  assert.match(md, /`3 × £0\.0040\/h × 730 h`/);
});

test('assumptions state the hours model, regions and price date', () => {
  const a = assumptions(S, R, TINY).join('\n');
  assert.match(a, /Hours model: 730 h\/month \(always on\)/);
  assert.match(a, /Regions: UK South, UK West/);
  assert.match(a, /ACR forecast: 12 months from Oct 26/);
});
