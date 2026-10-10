// Pricing maths, checked against figures worked out by hand from the TINY snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLookup, globalHours, hoursOf } from '../site/js/blocks.js';
import { computeItem, computeAll, fiscalYears, monthLabel, parseUnit } from '../site/js/engine.js';
import { DAYS } from '../site/js/format.js';
import { TINY, ctxFor, item, p, total } from './helpers.js';

const ctx = ctxFor(TINY);
const run = (it, c = ctx) => computeItem(c, it);

test('hours model: global setting, office hours, custom and per-line override', () => {
  assert.equal(globalHours({ mode: '730' }), 730);
  assert.equal(globalHours({ mode: '217' }), 217);
  assert.equal(globalHours({ mode: 'custom', custom: 196 }), 196);
  assert.equal(globalHours({ mode: 'custom', custom: 9999 }), 744, 'custom hours are capped at the longest month');
  assert.deepEqual(hoursOf(ctx, ''), { v: 730, t: '730 h', ov: false });
  assert.deepEqual(hoursOf(ctx, '100'), { v: 100, t: '100 h', ov: true });
  assert.equal(total(run(item('pip', { qty: 3 }))), 8.76);                                  // 3 × £0.004 × 730
  assert.equal(total(run(item('pip', { qty: 3 }), ctxFor(TINY, { mode: '217' }))), 2.6);   // 3 × £0.004 × 217
  assert.equal(total(run(item('pip', { qty: 3, hours: '100' }))), 1.2);                    // line override wins
});

test('rate lookup order: your edit, region, zone, global, built-in snapshot, UK South, missing', () => {
  const r = rateLookup(ctxFor(TINY, { overrides: { uksouth: { pip_h: 0.01 } } }), 'uksouth');
  assert.deepEqual([r('pip_h').v, r('pip_h').src], [0.01, 'manual']);
  assert.equal(r('peer_global').src, 'region');
  assert.deepEqual([r('afd_Standard_base').v, r('afd_Standard_base').src], [30, 'global'], 'UK South uses Zone 1 for global services');
  assert.deepEqual([r('peer_intra').v, r('peer_intra').src], [0.01, 'global']);
  assert.deepEqual([r('tm_az_hc').v, r('tm_az_hc').src], [0.5, 'global'], 'meters published with no region');
  const fw = r('fw_Standard_h');
  assert.equal(fw.src, 'proxy', 'a rate absent from loaded data falls back to the built-in snapshot, flagged');
  assert.equal(fw.from, 'snapshot');
  const w = rateLookup(ctx, 'ukwest')('disk_P10_ZRS');
  assert.deepEqual([w.v, w.src, w.from], [30, 'proxy', 'uksouth']);
  assert.deepEqual([r('no_such_meter').v, r('no_such_meter').src], [0, 'missing']);
});

test('virtual machines: OS licensing, Hybrid Benefit and disks', () => {
  const vm = (cfg) => run(item('vm', { size: 'Standard_D4s_v5', count: 2, osdisk: 'E10', ...cfg }));
  assert.equal(total(vm({ os: 'Linux' })), 308);                     // 2×0.2×730 + 2×£8
  assert.equal(total(vm({ os: 'Windows' })), 527);                   // 2×0.35×730 + 16
  assert.equal(total(vm({ os: 'Windows (Hybrid Benefit)' })), 308);  // licence removed
  assert.equal(total(vm({ os: 'Linux', osdisk: 'P10', red: 'ZRS' })), 352); // 292 + 2×£30
});

test('virtual machines: reservations and savings plans, with the saving against pay-as-you-go', () => {
  const vm = (cfg) => run(item('vm', { size: 'Standard_D4s_v5', count: 2, osdisk: 'E10', ...cfg }));
  const ri1 = vm({ os: 'Linux', pricing: 'ri1' });
  assert.equal(total(ri1), 216);                // 2 × £1,200 ÷ 12 + 16
  assert.equal(p(ri1.payg), 308);               // what pay-as-you-go would have cost
  assert.equal(total(vm({ os: 'Windows', pricing: 'ri3' })), 355); // 2×2160÷36 + licence 2×0.15×730 + 16
  assert.equal(total(vm({ os: 'Linux', pricing: 'sp1' })), 235);   // 2×0.15×730 + 16
  const office = vm({ os: 'Linux', pricing: 'ri1', hours: '217' });
  assert.equal(total(office), 216, 'a reservation bills every hour of the term, whatever the hours setting');
});

test('Windows price is derived from the per-vCPU licence when Microsoft lists only Linux, and flagged', () => {
  const res = run(item('vm', { size: 'Standard_E8s_v5', count: 1, os: 'Windows', osdisk: 'E10' }));
  assert.equal(total(res), 606.6);              // (0.5 + 8 × 0.04) × 730 + £8
  assert.ok(res.lines[0].srcs.some((s) => s.verify), 'derived Windows rate is marked to verify');
});

test('AVD sizes session hosts from users and runs a minimum overnight', () => {
  const res = run(item('avd', { users: 100, conc: 80, work: '4', size: 'Standard_D8s_v5', hours: '217', min: 1, osdisk: 'P10', profile: 30, red: 'LRS' }));
  assert.deepEqual(res.lines._sizing, { sessions: 80, per: 32, hosts: 3, v: 8 });
  // 3 × 0.4 × 217 + 1 × 0.4 × 513 + 3 × £20 + 3,000 GiB × £0.15
  assert.equal(total(res), p(260.4 + 205.2 + 60 + 450));
});

test('Sentinel picks the cheapest of pay-as-you-go and every commitment tier', () => {
  const small = run(item('sentinel', { gb: 10, mode: 'auto' }));
  assert.equal(small.lines.length, 1);
  assert.equal(total(small), p(10 * DAYS * 4));
  const big = run(item('sentinel', { gb: 150, mode: 'auto' }));
  assert.match(big.lines[0].what, /^100 GB\/day commitment tier/);
  assert.equal(total(big), p((280 + 50 * 2.8) * DAYS)); // tier + overage at the tier's effective rate
  const forced = run(item('sentinel', { gb: 150, mode: 'payg' }));
  assert.equal(total(forced), p(150 * DAYS * 4));
});

test('Azure SQL Database: licence, Hybrid Benefit and reserved compute', () => {
  const sql = (cfg) => run(item('sqldb', { tier: 'General Purpose', vc: '4', dbs: 1, ...cfg }));
  assert.equal(total(sql({ lic: 'Licence included' })), 730);  // 4×0.15×730 + 4×0.1×730
  assert.equal(total(sql({ lic: 'Hybrid Benefit' })), 438);
  assert.equal(total(sql({ lic: 'Licence included', pricing: 'ri3' })), 492); // 4×1800÷36 + 292
});

test('services with no stopped state ignore office hours where Microsoft bills continuously', () => {
  const office = ctxFor(TINY, { mode: '217' });
  assert.equal(total(run(item('ddos', { mode: 'Network Protection', ips: 50 }), office)), 2190); // £3 × 730
});

test('peering is charged at both ends; egress is tiered with a free allowance', () => {
  assert.equal(total(run(item('vnet', { intra: 1000, glob: 100 }))), 26); // 1000×2×0.01 + 100×2×0.03
  const eg = run(item('egress', { gb: 500 }));
  assert.equal(eg.lines.length, 2);
  assert.equal(total(eg), 24);                                            // 100 free + 400 × £0.06
  assert.equal(total(run(item('nat', { qty: 1, gb: 100 }))), 40.5);       // 0.05×730 + 100×0.04
});

test('ZRS is offered only where the region has availability zones', () => {
  const west = run(item('files', { gib: 1000, red: 'ZRS' }, 'ukwest'));
  assert.equal(west.c.red, 'LRS', 'UK West has no ZRS, so the item falls back to LRS');
  const south = run(item('files', { gib: 1000, red: 'ZRS' }));
  assert.equal(total(south), 200);
});

test('catalogue and manual lines: hourly with commitments, per-10K, monthly, daily and tiered units', () => {
  const g = (unit, payg, cfg, extra = {}) => run({ uid: 'g', svc: 'generic', region: 'uksouth', unit, payg, tiers: null, ri1: 0, ri3: 0, sp1: 0, sp3: 0, ...extra, cfg: { qty: 1, hours: '', pricing: 'payg', ...cfg } });
  const ri = g('1 Hour', 0.2, { qty: 2, pricing: 'ri1' }, { ri1: 1200, sp1: 0.15 });
  assert.equal(total(ri), 200);
  assert.equal(p(ri.payg), 292);
  assert.equal(total(g('1 Hour', 0.2, { qty: 2, pricing: 'sp1' }, { sp1: 0.15 })), 219);
  assert.equal(total(g('10K', 0.05, { qty: 1_000_000 })), 5);
  assert.equal(total(g('1/Month', 12, { qty: 3 })), 36);
  assert.equal(total(g('1/Day', 10, { qty: 1 })), p(10 * DAYS));
  assert.equal(total(g('1', 0, { qty: 30 }, { tiers: [[0, 0.3681], [25, 0.0736]] })), p(25 * 0.3681 + 5 * 0.0736));
  const manual = run({ uid: 'm', svc: 'manual', region: 'uksouth', unit: '1 GB', payg: 3.5, tiers: null, cfg: { qty: 100, hours: '', pricing: 'payg' } });
  assert.equal(total(manual), 350);
  assert.equal(manual.lines[0].srcs[0].src, 'manual');
});

test('unit parsing understands Microsoft unit strings', () => {
  assert.deepEqual(parseUnit('1 Hour'), { cls: 'hour', n: 1, measure: '', raw: '1 Hour' });
  assert.equal(parseUnit('10K').n, 10000);
  assert.equal(parseUnit('1M').n, 1e6);
  assert.equal(parseUnit('1 GB/Month').measure, 'GB');
  assert.equal(parseUnit('1/Day').cls, 'day');
});

test('whole estimate: discount, contingency and the ACR ramp', () => {
  const items = [item('pip', { qty: 3 }), item('egress', { gb: 500 })];
  const R = computeAll(ctx, items, { start: '2026-10', term: 12, live: 3, ramp: 2, disc: 10, cont: 5 });
  assert.equal(p(R.standing), 8.76);
  assert.equal(p(R.usage), 24);
  assert.equal(p(R.list), 32.76);
  const monthly = 32.76 * 0.9 * 1.05;
  assert.equal(p(R.monthly), p(monthly));
  assert.deepEqual(R.months.slice(0, 4).map(p), [0, 0, p(monthly / 2), p(monthly)]); // live in month 3, full by month 4
  assert.equal(p(R.termTotal), p(monthly * 9.5));
});

test('commitment saving is totalled across the estimate', () => {
  const items = [item('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Linux', osdisk: 'E10', pricing: 'ri1' })];
  const R = computeAll(ctx, items, { term: 36 });
  assert.equal(p(R.commitSave), 92); // 308 pay-as-you-go − 216 reserved
});

test('Microsoft fiscal years run July to June', () => {
  const fy = fiscalYears('2026-10', Array(12).fill(1));
  assert.deepEqual([...fy.entries()], [[2027, 9], [2028, 3]]); // Oct 26–Jun 27, then Jul–Sep 27
  assert.equal(monthLabel('2026-10', 3), 'Jan 27');
});
