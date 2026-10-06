// Golden tests for the calculation engine. They use a fixed fixture snapshot
// with round-number rates, so each expected value can be checked by hand from
// the formula. When a live snapshot is cross-checked against the Azure
// Pricing Calculator, add those cases to golden.test.ts with the date.

import { describe, expect, it } from 'vitest'
import { normaliseUnit } from '../pricing/normalise.ts'
import type { Snapshot } from '../pricing/types.ts'
import { addPreset, emptyEstimate, makeItem, nextMonth, PRESETS } from '../state/presets.ts'
import { applyTiers } from './charges.ts'
import { commitmentScenarios, fiscalYearLabel, priceEstimate, priceItem, rampFactor } from './estimate.ts'
import { RESOURCES } from './resources.ts'
import type { Estimate, Item } from './types.ts'
import { workingText } from './working.ts'

const flat = (unit: 'hour' | 'gb' | 'month' | '10k' | '1m', rate: number) => ({ unit, tiers: [{ from: 0, rate }] })

const SNAP: Snapshot = {
  schema: 1,
  region: 'uksouth',
  currency: 'GBP',
  retrievedAt: '2026-10-06T06:00:00.000Z',
  source: 'azure-retail-prices-api',
  meters: {
    'pip.standard': flat('hour', 0.004),
    'natgw.hour': flat('hour', 0.04),
    'natgw.gb': flat('gb', 0.04),
    'peering.intra.ingress': flat('gb', 0.01),
    'peering.intra.egress': flat('gb', 0.01),
    'vpngw.VpnGw2AZ': flat('hour', 0.5),
    'vpngw.s2s': flat('hour', 0.01),
    'fw.standard.hour': flat('hour', 1),
    'fw.standard.gb': flat('gb', 0.01),
    'bastion.standard.hour': flat('hour', 0.2),
    'bastion.standard.unit': flat('hour', 0.1),
    'lb.included': flat('hour', 0.02),
    'lb.overage': flat('hour', 0.01),
    'lb.gb': flat('gb', 0.005),
    'dns.private.zone': { unit: 'month', tiers: [{ from: 0, rate: 0.4 }, { from: 25, rate: 0.08 }] },
    'dns.private.queries': flat('1m', 0.32),
    'dnsr.inbound': flat('month', 140),
    'bw.internet': { unit: 'gb', tiers: [{ from: 0, rate: 0 }, { from: 100, rate: 0.07 }, { from: 10340, rate: 0.06 }] },
    'la.ingest': flat('gb', 2),
    'la.retention': flat('gb', 0.1),
    'sql.gp.compute': flat('hour', 0.2),
    'sql.gp.licence': flat('hour', 0.2),
    'sql.gp.storage': flat('gb', 0.1),
    'blob.hot.lrs.stored': flat('gb', 0.02),
    'blob.hot.lrs.write': flat('10k', 0.05),
    'blob.hot.lrs.read': flat('10k', 0.004),
    'disk.premium.P10': flat('month', 15),
    'appsvc.linux.P1v3': flat('hour', 0.1),
    'kv.ops': flat('10k', 0.03),
  },
  vms: {
    Standard_D4s_v5: { linux: 0.2, windows: 0.36, ri1yTerm: 1051.2, ri3yTerm: 2102.4, sp1y: 0.14, sp3y: 0.1 },
  },
}

const est = (patch: Partial<Estimate> = {}): Estimate => ({ ...emptyEstimate(), startMonth: '2026-07', ...patch })
const price = (item: Item, e: Estimate = est()) => priceItem(item, e, { uksouth: SNAP })!

describe('normaliseUnit', () => {
  it('converts API units to canonical units', () => {
    expect(normaliseUnit('1 Hour')).toMatchObject({ unit: 'hour', priceFactor: 1 })
    expect(normaliseUnit('1/Hour')).toMatchObject({ unit: 'hour', priceFactor: 1 })
    expect(normaliseUnit('10 Hours')).toMatchObject({ unit: 'hour', priceFactor: 0.1 })
    expect(normaliseUnit('1 GB')).toMatchObject({ unit: 'gb', priceFactor: 1 })
    expect(normaliseUnit('1 GB/Month')).toMatchObject({ unit: 'gb', priceFactor: 1 })
    expect(normaliseUnit('1/Month')).toMatchObject({ unit: 'month', priceFactor: 1 })
    expect(normaliseUnit('10K')).toMatchObject({ unit: '10k', priceFactor: 1 })
    expect(normaliseUnit('1M')).toMatchObject({ unit: '1m', priceFactor: 1 })
    expect(normaliseUnit('100K')).toMatchObject({ unit: '10k', priceFactor: 0.1 })
    expect(normaliseUnit('1/Day')!.priceFactor).toBeCloseTo(730 / 24)
    expect(normaliseUnit('1 TB')).toMatchObject({ unit: 'gb', priceFactor: 1 / 1024 })
    expect(normaliseUnit('1 Unit')).toBeNull()
  })
})

describe('applyTiers', () => {
  it('splits a quantity across tiers', () => {
    const tiers = [{ from: 0, rate: 0 }, { from: 100, rate: 0.07 }, { from: 10340, rate: 0.06 }]
    expect(applyTiers(tiers, 50)).toEqual([{ qty: 50, rate: 0 }])
    expect(applyTiers(tiers, 1000)).toEqual([{ qty: 100, rate: 0 }, { qty: 900, rate: 0.07 }])
    expect(applyTiers(tiers, 20340)).toEqual([{ qty: 100, rate: 0 }, { qty: 10240, rate: 0.07 }, { qty: 10000, rate: 0.06 }])
  })
})

describe('resource calculators (golden)', () => {
  it('public IP: 2 × £0.004/h × 730 h = £5.84', () => {
    const r = price(makeItem('publicIp', 'g', 'Production', 'IPs', { count: 2 }))
    expect(r.total).toBeCloseTo(5.84, 10)
    expect(workingText(r.lines[0])).toBe('2 × £0.0040/h × 730 h = £5.84')
  })

  it('NAT gateway: hours plus data processed', () => {
    const r = price(makeItem('natGateway', 'g', 'Production', 'NAT', { count: 1, gb: 1000 }))
    expect(r.lines.map((l) => l.amount)).toEqual([0.04 * 730, 40])
    expect(r.lines[1].kind).toBe('usage')
    expect(workingText(r.lines[1])).toBe('1,000 GB × £0.0400/GB = £40.00')
  })

  it('VNet peering charges both directions on both sides', () => {
    const r = price(makeItem('vnetPeering', 'g', 'Production', 'Peer', { scope: 'intra', ab: 1000, ba: 500 }))
    expect(r.lines).toHaveLength(4)
    expect(r.total).toBeCloseTo(1000 * 0.01 * 2 + 500 * 0.01 * 2)
  })

  it('VPN gateway: extra tunnels above the included 10', () => {
    const r = price(makeItem('vpnGateway', 'g', 'Production', 'VPN', { sku: 'VpnGw2AZ', count: 1, s2s: 12, s2sIncluded: 10, p2s: 0 }))
    expect(r.lines.map((l) => l.label)).toEqual(['VpnGw2AZ gateway', 'Additional S2S tunnels'])
    expect(r.total).toBeCloseTo(0.5 * 730 + 2 * 0.01 * 730)
  })

  it('Bastion Standard: 2 scale units included', () => {
    const two = price(makeItem('bastion', 'g', 'Production', 'B', { sku: 'Standard', units: 2 }))
    expect(two.lines).toHaveLength(1)
    expect(two.total).toBeCloseTo(0.2 * 730)
    const five = price(makeItem('bastion', 'g', 'Production', 'B', { sku: 'Standard', units: 5 }))
    expect(five.total).toBeCloseTo(0.2 * 730 + 3 * 0.1 * 730)
  })

  it('Load Balancer: first 5 rules, overage and data', () => {
    const r = price(makeItem('loadBalancer', 'g', 'Production', 'LB', { count: 2, rules: 8, gb: 100 }))
    expect(r.total).toBeCloseTo(2 * 0.02 * 730 + 6 * 0.01 * 730 + 100 * 0.005)
  })

  it('DNS: zone tiers and queries per million', () => {
    const r = price(makeItem('dns', 'g', 'Production', 'DNS', { privateZones: 30, privateQueriesM: 100, publicZones: 0, publicQueriesM: 0 }))
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].amount).toBeCloseTo(25 * 0.4 + 5 * 0.08)
    expect(r.lines[1].amount).toBeCloseTo(100 * 0.32)
    expect(workingText(r.lines[0])).toBe('25 zones × £0.4000/month + 5 zones × £0.0800/month = £10.40')
  })

  it('monthly meters are never multiplied by hours', () => {
    const r = price(makeItem('dnsResolver', 'g', 'Production', 'R', { inbound: 1, outbound: 0 }), est({ hours: 217 }))
    expect(r.total).toBe(140)
  })

  it('egress: first 100 GB free tier named in the working', () => {
    const r = price(makeItem('egress', 'g', 'Production', 'E', { internet: 1000, interRegion: 0 }))
    expect(r.total).toBeCloseTo(900 * 0.07)
    expect(workingText(r.lines[0])).toBe('100 GB free tier + 900 GB × £0.0700/GB = £63.00')
  })

  it('Log Analytics: free allowance and steady-state retention', () => {
    const r = price(makeItem('logAnalytics', 'g', 'Production', 'LA', { gb: 105, retention: 31, free: true }))
    expect(r.total).toBeCloseTo(100 * 2)
    expect(workingText(r.lines[0])).toBe('5 GB free (monthly allowance) + 100 GB × £2.00/GB = £200.00')
    const long = price(makeItem('logAnalytics', 'g', 'Production', 'LA', { gb: 100, retention: 90, free: false }))
    expect(long.lines[1].amount).toBeCloseTo(100 * ((90 - 31) / (730 / 24)) * 0.1)
  })

  it('SQL Database: compute, licence and storage; Hybrid Benefit as a saving only', () => {
    const r = price(makeItem('sqlDb', 'g', 'Production', 'SQL', { vcores: 4, count: 1, storage: 100, ahb: true }))
    expect(r.total).toBeCloseTo(4 * 0.2 * 730 * 2 + 10)
    expect(r.lines[1].ahbSaving).toBeCloseTo(4 * 0.2 * 730)
  })

  it('Blob storage: capacity and operations per 10K', () => {
    const r = price(makeItem('blob', 'g', 'Production', 'Blob', { tier: 'Hot', redundancy: 'LRS', gb: 1000, writesM: 1, readsM: 10 }))
    expect(r.total).toBeCloseTo(20 + 100 * 0.05 + 1000 * 0.004)
    expect(workingText(r.lines[1])).toBe('100 × 10K operations × £0.0500/10K = £5.00')
  })

  it('VM: Windows rate with OS disk', () => {
    const r = price(makeItem('vm', 'g', 'Production', 'VM', { sku: 'Standard_D4s_v5', os: 'windows', count: 2, ahb: true, osDisk: 'premium.P10' }))
    expect(r.lines[0].amount).toBeCloseTo(2 * 0.36 * 730)
    expect(r.lines[0].ahbSaving).toBeCloseTo(2 * 0.16 * 730)
    expect(r.lines[1].amount).toBe(30)
  })

  it('missing meters are flagged, not guessed', () => {
    const r = price(makeItem('frontDoor', 'g', 'Production', 'AFD'))
    expect(r.lines.every((l) => l.unavailable)).toBe(true)
    expect(r.total).toBe(0)
    expect(workingText(r.lines[0])).toBe('Rate unavailable in this price snapshot')
  })

  it('every calculator prices its defaults without throwing', () => {
    for (const def of RESOURCES) {
      const r = price(makeItem(def.type, 'g', 'Production'))
      expect(Number.isFinite(r.total)).toBe(true)
    }
  })
})

describe('hours model', () => {
  it('global hours drive hourly lines and a per-line override wins', () => {
    const e = est({ hours: 217 })
    const ip = makeItem('publicIp', 'g', 'Production', 'IP', { count: 1 })
    expect(price(ip, e).hours).toBe(217)
    const overridden = { ...ip, hours: 450 }
    const r = price(overridden, e)
    expect(r.hours).toBe(450)
    expect(r.overridden).toBe(true)
  })

  it('warns when a resource that cannot be paused runs under 730 hours', () => {
    const e = est({ hours: 217 })
    expect(price(makeItem('natGateway', 'g', 'Production'), e).warnings[0]).toMatch(/no stopped state/)
    expect(price(makeItem('vm', 'g', 'Production'), e).warnings).toHaveLength(0)
    expect(price(makeItem('natGateway', 'g', 'Production'), est()).warnings).toHaveLength(0)
  })
})

describe('estimate totals', () => {
  const items = [makeItem('publicIp', 'Hub', 'Production', 'IP', { count: 10 }), makeItem('natGateway', 'Hub', 'Production', 'NAT', { count: 0, gb: 1000 })]

  it('splits standing and usage and applies discount then contingency', () => {
    const e = est({ items, groups: ['Hub'], discountPct: 10, contingencyPct: 5 })
    const r = priceEstimate(e, { uksouth: SNAP })
    expect(r.standing).toBeCloseTo(10 * 0.004 * 730)
    expect(r.usage).toBeCloseTo(40)
    expect(r.discount).toBeCloseTo(r.list * 0.1)
    expect(r.monthly).toBeCloseTo(r.list * 0.9 * 1.05)
    expect(r.annual).toBeCloseTo(r.monthly * 12)
  })

  it('sums the ramp month by month rather than monthly × term', () => {
    const e = est({ items, groups: ['Hub'], ramps: { Hub: { start: 4, ramp: 3, end: null } }, termMonths: 12 })
    const r = priceEstimate(e, { uksouth: SNAP })
    const m = r.monthly
    expect(r.forecast.slice(0, 5)).toEqual([0, 0, 0, m / 3, (2 * m) / 3])
    expect(r.termTotal).toBeCloseTo(m * (1 / 3 + 2 / 3 + 7))
  })

  it('rampFactor handles start, ramp and decommission', () => {
    const ramp = { start: 2, ramp: 2, end: 5 }
    expect([1, 2, 3, 4, 5, 6].map((m) => rampFactor(ramp, m))).toEqual([0, 0.5, 1, 1, 1, 0])
  })

  it('groups the forecast by Microsoft fiscal year (July to June)', () => {
    expect(fiscalYearLabel(2026, 6)).toBe('FY27')
    expect(fiscalYearLabel(2027, 5)).toBe('FY27')
    const e = est({ items, groups: ['Hub'], startMonth: '2026-10', termMonths: 12 })
    const fys = priceEstimate(e, { uksouth: SNAP }).fiscalYears
    expect(fys.map((f) => [f.label, f.months])).toEqual([
      ['FY27', 9],
      ['FY28', 3],
    ])
  })

  it('prices DR lines in the DR region', () => {
    const west = { ...SNAP, region: 'ukwest' as const, meters: { ...SNAP.meters, 'pip.standard': flat('hour', 0.005) } }
    const e = est({ drRegion: 'ukwest', groups: ['DR'], items: [makeItem('publicIp', 'DR', 'DR', 'IP', { count: 1 })] })
    const r = priceEstimate(e, { uksouth: SNAP, ukwest: west })
    expect(r.items[0].region).toBe('ukwest')
    expect(r.list).toBeCloseTo(0.005 * 730)
  })
})

describe('commitments', () => {
  const vm = (hours: number | null, os = 'linux') =>
    est({ groups: ['g'], items: [{ ...makeItem('vm', 'g', 'Production', 'VM', { sku: 'Standard_D4s_v5', os, count: 1, ahb: true, osDisk: 'none' }), hours }] })

  it('shows alternatives next to PAYG without changing the list total', () => {
    const r = priceEstimate(vm(null), { uksouth: SNAP })
    const s = Object.fromEntries(commitmentScenarios(r, false).map((x) => [x.id, x.monthly]))
    expect(r.list).toBeCloseTo(0.2 * 730)
    expect(s.payg).toBeCloseTo(0.2 * 730)
    expect(s.sp1y).toBeCloseTo(0.14 * 730)
    expect(s.sp3y).toBeCloseTo(0.1 * 730)
    expect(s.ri1y).toBeCloseTo(1051.2 / 12)
    expect(s.ri3y).toBeCloseTo(2102.4 / 36)
  })

  it('reservations bill every hour, so office-hours VMs can cost more', () => {
    const r = priceEstimate(vm(217), { uksouth: SNAP })
    const s = Object.fromEntries(commitmentScenarios(r, false).map((x) => [x.id, x.monthly]))
    expect(s.ri1y).toBeCloseTo(1051.2 / 12)
    expect(s.ri1y).toBeGreaterThan(s.payg)
    expect(s.best).toBeCloseTo(Math.min(0.2 * 217, 0.1 * 217, 2102.4 / 36))
  })

  it('Windows licence stays PAYG under commitments unless Hybrid Benefit is applied', () => {
    const r = priceEstimate(vm(null, 'windows'), { uksouth: SNAP })
    const without = Object.fromEntries(commitmentScenarios(r, false).map((x) => [x.id, x.monthly]))
    const withAhb = Object.fromEntries(commitmentScenarios(r, true).map((x) => [x.id, x.monthly]))
    expect(without.payg).toBeCloseTo(0.36 * 730)
    expect(without.sp3y).toBeCloseTo(0.1 * 730 + 0.16 * 730)
    expect(withAhb.payg).toBeCloseTo(0.2 * 730)
    expect(withAhb.sp3y).toBeCloseTo(0.1 * 730)
  })
})

describe('presets', () => {
  it('every starting architecture builds and prices', () => {
    let e = est()
    for (const p of PRESETS) e = addPreset(e, p)
    expect(e.groups).toHaveLength(PRESETS.length)
    const r = priceEstimate(e, { uksouth: SNAP })
    expect(r.items).toHaveLength(e.items.length)
  })

  it('nextMonth rolls over the year', () => {
    expect(nextMonth(new Date(2026, 11, 15))).toBe('2027-01')
    expect(nextMonth(new Date(2026, 9, 6))).toBe('2026-11')
  })
})
