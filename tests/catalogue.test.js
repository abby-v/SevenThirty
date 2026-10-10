// Every guided calculator, every option, against the price data the site is serving.
// This is the test the daily pipeline runs before it publishes new prices: if Microsoft
// renames or drops a meter a calculator depends on, it fails and yesterday's prices stay live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SVC, SVCMAP, SECTIONS, SECTION_ORDER, defaults } from '../site/js/services.js';
import { computeItem } from '../site/js/engine.js';
import { rateLookup } from '../site/js/blocks.js';
import { ctxFor, livePrices } from './helpers.js';

const snap = livePrices();
const ctx = ctxFor(snap);
const regions = Object.keys(snap.regions).filter((k) => k && k !== 'global' && !k.startsWith('Zone'));

/** Defaults, each preset, and each value of every drop-down, one at a time. */
function variants(def, region) {
  const out = [{ name: 'defaults', cfg: defaults(def.id) }];
  (def.presets || []).forEach(([name, cfg]) => out.push({ name: `preset "${name}"`, cfg: { ...defaults(def.id), ...cfg } }));
  const octx = { region, r: rateLookup(ctx, region), snap };
  for (const f of def.fields.filter((x) => x.type === 'sel')) {
    const opts = (typeof f.opts === 'function' ? f.opts(defaults(def.id), octx) : f.opts).map((o) => (Array.isArray(o) ? o[0] : o));
    opts.forEach((o) => out.push({ name: `${f.k}=${o}`, cfg: { ...defaults(def.id), [f.k]: o } }));
  }
  return out;
}

test('the live price data covers the regions the site promises', () => {
  for (const r of ['uksouth', 'ukwest']) assert.ok(regions.includes(r), `${r} missing from site/data/prices.json`);
  assert.equal(String(snap.currency).toUpperCase(), 'GBP');
});

test('menu: every service sits in exactly one section and every section has services', () => {
  const listed = Object.values(SECTION_ORDER).flat();
  assert.deepEqual([...listed].sort(), SVC.map((s) => s.id).sort());
  for (const [id] of SECTIONS) assert.ok(SECTION_ORDER[id]?.length, `section ${id} is empty`);
  for (const id of listed) assert.ok(SVCMAP[id].sec, `${id} has no section`);
});

test('every calculator definition is complete', () => {
  for (const def of SVC) {
    assert.ok(def.name && def.desc && def.blurb, `${def.id} needs a name, description and blurb`);
    assert.equal(typeof def.calc, 'function');
    assert.equal(typeof def.sum, 'function', `${def.id} needs a one-line summary for the estimate sheet`);
    const keys = def.fields.map((f) => f.k);
    assert.equal(new Set(keys).size, keys.length, `${def.id} has duplicate field keys`);
  }
});

for (const region of regions) {
  test(`every calculator and option prices from live data in ${region}`, () => {
    const problems = [];
    for (const def of SVC) {
      for (const v of variants(def, region)) {
        const res = computeItem(ctx, { svc: def.id, region, cfg: v.cfg });
        const where = `${def.id} (${v.name}) in ${region}`;
        if (!Number.isFinite(res.amt) || res.amt < 0) problems.push(`${where}: total is ${res.amt}`);
        for (const l of res.lines) {
          if (!['standing', 'usage'].includes(l.kind)) problems.push(`${where}: line "${l.what}" has kind ${l.kind}`);
          if (!l.calc || /NaN|undefined/.test(l.calc + l.what)) problems.push(`${where}: line "${l.what}" shows "${l.calc}"`);
          for (const s of l.srcs) {
            if (s.src === 'missing') problems.push(`${where}: no published rate for ${s.key}`);
            if (s.src === 'proxy') problems.push(`${where}: ${s.key} is a stand-in from ${s.from}, not ${region}`);
          }
        }
        try { def.sum(res.c); } catch (e) { problems.push(`${where}: summary failed (${e.message})`); }
      }
    }
    assert.deepEqual(problems, [], `\n${problems.slice(0, 40).join('\n')}`);
  });
}
