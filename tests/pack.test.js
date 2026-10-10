import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPack } from '../site/js/pack-data.js';
import { TINY, item, p } from './helpers.js';

const S = (items, extra = {}) => ({
  v: 2, mode: '730', custom: 196, overrides: {},
  meta: { client: 'Contoso', title: 'Hub', by: 'Abby', status: 'Indicative' },
  acr: { start: '2026-10', term: 36, live: 1, ramp: 1, disc: 0, cont: 0 },
  items, ...extra,
});

test('commitment options price each eligible item every way Microsoft offers', () => {
  const vm = item('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Linux', osdisk: 'E10' });
  const pack = buildPack(S([vm, item('pip', { qty: 3 })]), TINY);
  assert.equal(pack.commitments.length, 1, 'public IPs have no commitment options');
  const row = pack.commitments[0];
  assert.deepEqual(Object.fromEntries(Object.entries(row.cost).map(([k, v]) => [k, p(v)])),
    { payg: 308, ri1: 216, ri3: 136, sp1: 235, sp3: 162 });
  assert.equal(row.current, 'payg');
  assert.equal(row.best, 'ri3');
  assert.equal(p(row.saving), 172);
  assert.equal(p(pack.potentialSaving), 172);
});

test('an item already on its best option shows no further saving', () => {
  const vm = item('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Linux', osdisk: 'E10', pricing: 'ri3' });
  const row = buildPack(S([vm]), TINY).commitments[0];
  assert.equal(row.current, 'ri3');
  assert.equal(row.saving, 0);
});

test('sections, regions and the largest cost drivers', () => {
  const items = [item('pip', { qty: 3 }), item('egress', { gb: 500 }), item('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Linux', osdisk: 'E10' }), item('pip', { qty: 2 }, 'ukwest')];
  const pack = buildPack(S(items), TINY);
  assert.deepEqual(pack.sections.map((s) => [s.label, s.items.length, p(s.amt)]), [['Networking', 3, p(8.76 + 24 + 7.3)], ['Compute', 1, 308]]);
  assert.deepEqual(pack.regions.map((r) => r.id), ['uksouth', 'ukwest']);
  assert.deepEqual(pack.drivers.map((d) => [d.name, p(d.amt)]), [['Virtual machines', 308], ['Internet egress', 24], ['Public IP addresses', 8.76]]);
  assert.ok(Math.abs(pack.sections.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
});

test('planning range follows the estimate status', () => {
  const items = [item('pip', { qty: 3 })];
  const ind = buildPack(S(items), TINY).confidence;
  assert.deepEqual([ind.pct, p(ind.low), p(ind.high)], [0.3, p(8.76 * 0.7), p(8.76 * 1.3)]);
  const fin = buildPack(S(items, { meta: { status: 'Final' } }), TINY).confidence;
  assert.equal(fin.pct, 0.1);
});

test('contract years and fiscal years add up to the term total', () => {
  const pack = buildPack(S([item('pip', { qty: 3 })], { acr: { start: '2026-10', term: 36, live: 4, ramp: 3 } }), TINY);
  assert.equal(pack.contractYears.length, 3);
  const sum = (a) => p(a.reduce((x, y) => x + y, 0));
  assert.equal(sum(pack.contractYears), p(pack.R.termTotal));
  assert.equal(sum(pack.fiscalYears.map(([, v]) => v)), p(pack.R.termTotal));
  assert.equal(pack.fiscalYears[0][0], 2027);
});

test('lines priced from stand-in rates are listed for the reader', () => {
  const pack = buildPack(S([item('fw', { sku: 'Standard', qty: 1, gb: 100 })]), TINY);
  assert.ok(pack.flagged.length >= 1);
  assert.equal(pack.flagged[0].kind, 'proxy');
});
