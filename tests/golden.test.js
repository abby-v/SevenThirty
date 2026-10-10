// Golden totals: today's results for every calculator and for a typical estimate, priced
// from a frozen copy of real Azure prices (tests/fixtures). If a code change moves any of
// these figures, this fails and shows what moved.
//
// If the change is intended, regenerate with:  UPDATE_GOLDEN=1 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SVC, defaults } from '../site/js/services.js';
import { computeItem, computeAll } from '../site/js/engine.js';
import { ctxFor, frozenPrices, item, p } from './helpers.js';

const goldenPath = fileURLToPath(new URL('./fixtures/golden.json', import.meta.url));
const ctx = ctxFor(frozenPrices());

/** The example estimate the site opens with: a UK South hub and app estate with a UK West DR firewall. */
export const EXAMPLE = [
  item('fw', { sku: 'Standard', qty: 1, gb: 2000 }), item('vpn', { sku: 'VpnGw1AZ', qty: 1, s2s: 2 }), item('bas', { sku: 'Standard', qty: 1 }),
  item('vnet', { intra: 1500, glob: 200 }), item('pip', { qty: 3 }), item('pe', { qty: 8, gbin: 150, gbout: 150 }),
  item('dns', { pub: 2, priv: 12, pq: 5, vq: 25, rin: 1, rout: 1, rs: 1 }),
  item('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Windows', osdisk: 'P10' }), item('sqldb', { tier: 'General Purpose', vc: '4', dbs: 1 }),
  item('avd', { users: 100, conc: 80, work: '4', size: 'Standard_D8s_v5', hours: '217' }), item('defender', { servers: 4, plan: 'Plan 2', sql: 1, stor: 2, arm: 1 }),
  item('fw', { sku: 'Standard', qty: 1, gb: 200 }, 'ukwest'),
];

function actual() {
  const out = { perService: {}, presets: {}, example: {} };
  for (const def of SVC) {
    out.perService[def.id] = p(computeItem(ctx, { svc: def.id, region: 'uksouth', cfg: defaults(def.id) }).amt);
    (def.presets || []).forEach(([name, cfg]) => {
      out.presets[`${def.id}: ${name}`] = p(computeItem(ctx, { svc: def.id, region: 'uksouth', cfg: { ...defaults(def.id), ...cfg } }).amt);
    });
  }
  const R = computeAll(ctx, EXAMPLE, { start: '2026-10', term: 36, live: 1, ramp: 1, disc: 0, cont: 0 });
  out.example = { monthly: p(R.monthly), standing: p(R.standing), usage: p(R.usage), termTotal: p(R.termTotal) };
  return out;
}

test('golden totals are unchanged', () => {
  const now = actual();
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(goldenPath)) {
    fs.writeFileSync(goldenPath, JSON.stringify(now, null, 1) + '\n');
    return;
  }
  const want = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const moved = [];
  for (const group of Object.keys(want)) {
    for (const [k, v] of Object.entries(want[group])) if (now[group][k] !== v) moved.push(`${group} ${k}: was £${v}, now £${now[group][k]}`);
    for (const k of Object.keys(now[group])) if (!(k in want[group])) moved.push(`${group} ${k}: new, £${now[group][k]} (run UPDATE_GOLDEN=1 npm test to add it)`);
  }
  assert.deepEqual(moved, [], `\n${moved.join('\n')}`);
});
