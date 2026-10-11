// The missing-cost advisor: what it suggests, what counts as covered, and that every
// suggestion it can make prices cleanly from the live data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advise } from '../site/js/advisor.js';
import { computeItem } from '../site/js/engine.js';
import { buildPack } from '../site/js/pack-data.js';
import { ctxFor, livePrices, item, TINY } from './helpers.js';

const ids = (items, dismissed) => advise(items, dismissed).open.map((s) => s.id);
const it = (svc, cfg, region = 'uksouth', uid = `${svc}-${region}`) => ({ ...item(svc, cfg, region), uid });

test('a VM on its own: disks, backup, monitoring, Defender, Bastion, outbound and egress', () => {
  assert.deepEqual(ids([it('vm', { count: 3 })]), [
    'vm:disks:uksouth', 'vm:backup:uksouth', 'vm:la', 'vm:defender', 'vm:bas:uksouth', 'vm:nat:uksouth', 'vm:egress',
  ]);
  const backup = advise([it('vm', { count: 3 })]).open.find((s) => s.id === 'vm:backup:uksouth');
  assert.equal(backup.add.svc, 'backup');
  assert.equal(backup.add.cfg.vms, 3);
});

test('what is already in the estimate counts as covered', () => {
  const items = [it('vm', { count: 2, backup: 'Yes', ddisk: 'P30' }), it('la', { gb: 2 }), it('defender', { servers: 2 }), it('bas', {}), it('fw', {}), it('egress', {})];
  assert.ok(!ids(items).some((x) => x.startsWith('vm:')), ids(items).join());
  // A Key Vault line added from the price catalogue covers Key Vault.
  const kv = { uid: 'g1', svc: 'generic', region: 'uksouth', meta: { svc: 'Key Vault' }, cfg: { qty: 1 } };
  assert.ok(ids([it('vwan', { gb: 100 })]).includes('lz:kv'));
  assert.ok(!ids([it('vwan', { gb: 100 }), kv]).includes('lz:kv'));
});

test('a Virtual WAN hub brings the landing zone with it', () => {
  const s = advise([it('vwan', { hubs: 2, gb: 0 })]).open;
  assert.deepEqual(s.map((x) => x.id), ['lz:fw:uksouth', 'lz:dp:uksouth', 'lz:ddos', 'lz:dns:uksouth', 'lz:la', 'lz:monitor', 'lz:bas:uksouth', 'lz:defender', 'lz:kv', 'lz:egress']);
  assert.equal(s[0].add.cfg.qty, 2, 'one secured-hub firewall per hub');
  assert.equal(s[1].edit.uid, 'vwan-uksouth', 'zero hub data processing points at the hub to edit');
});

test('AVD: monitoring, Defender for the hosts, outbound, egress, profile endpoint and on-premises link', () => {
  const s = advise([it('avd', { users: 100, conc: 80, work: '4', size: 'Standard_D8s_v5' })]).open;
  assert.deepEqual(s.map((x) => x.id), ['avd:la', 'avd:defender', 'avd:nat:uksouth', 'avd:egress', 'avd:pe:uksouth', 'avd:hybrid']);
  assert.equal(s[1].add.cfg.servers, 3, '80 sessions at 32 per D8s v5 host is 3 hosts');
});

test('regional services are checked per region, shared ones once', () => {
  const items = [it('fw', {}), it('fw', {}, 'ukwest'), it('dns', { rin: 1, rout: 1, rs: 1 })];
  const got = ids(items);
  assert.ok(got.includes('lz:dns:ukwest') && !got.includes('lz:dns:uksouth'));
  assert.equal(got.filter((x) => x.startsWith('lz:la')).length, 1);
  // The same service suggested by two groups appears once.
  assert.equal(ids([it('vm', {}), it('avd', {})]).filter((x) => x.endsWith(':la')).length, 1);
});

test('marking a suggestion not needed moves it to dismissed', () => {
  const r = advise([it('vm', {})], ['vm:bas:uksouth']);
  assert.ok(!r.open.some((s) => s.id === 'vm:bas:uksouth'));
  assert.deepEqual(r.dismissed.map((s) => s.id), ['vm:bas:uksouth']);
});

test('the client pack lists related costs that are not included', () => {
  const S = { v: 2, mode: '730', custom: 196, overrides: {}, meta: { status: 'Indicative' }, acr: { start: '2026-10', term: 12, live: 1, ramp: 1 },
    items: [it('vm', { size: 'Standard_D4s_v5', count: 2, os: 'Linux', osdisk: 'E10' })], dismissed: ['vm:bas:uksouth'] };
  const P = buildPack(S, TINY);
  assert.ok(P.advice.open.some((s) => s.id === 'vm:backup:uksouth'));
  assert.deepEqual(P.advice.dismissed.map((s) => s.id), ['vm:bas:uksouth']);
});

test('every suggestion the advisor can make prices from live data', () => {
  const snap = livePrices();
  const ctx = ctxFor(snap);
  const problems = [];
  for (const region of ['uksouth', 'ukwest', 'northeurope', 'westeurope']) {
    const triggers = [it('vm', { count: 2 }, region), it('vwan', { gb: 0 }, region), it('vpn', {}, region), it('avd', {}, region), it('aks', {}, region), it('aca', {}, region),
      it('sqldb', {}, region), it('pg', {}, region), it('app', {}, region), it('func', {}, region), it('apim', {}, region), it('dbx', {}, region), it('adf', { rt: 'sh' }, region), it('aoai', {}, region)];
    const all = advise(triggers).open;
    assert.ok(all.length >= 15, `${region}: only ${all.length} suggestions`);
    for (const s of all.filter((x) => x.add)) {
      const res = computeItem(ctx, { svc: s.add.svc, region: s.add.region, cfg: s.add.cfg });
      if (!(res.amt > 0)) problems.push(`${s.id} in ${region}: £${res.amt}`);
      for (const l of res.lines) for (const x of l.srcs) if (x.src === 'missing' || x.src === 'proxy') problems.push(`${s.id} in ${region}: ${x.key} is ${x.src}`);
    }
  }
  assert.deepEqual(problems, []);
});
