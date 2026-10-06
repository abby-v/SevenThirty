// Checks the calculators and the pipeline's meter catalogue agree: every
// meter key any calculator can request, for every select option, must be one
// the pricing job knows how to fetch.

import { describe, expect, it } from 'vitest'
import { METER_DEFS } from '../pricing/catalogue.ts'
import type { MeterPrice, Snapshot } from '../pricing/types.ts'
import { VM_SKUS } from '../pricing/vmSkus.ts'
import { RESOURCES } from './resources.ts'
import type { Config } from './types.ts'

const meters: Record<string, MeterPrice> = {}
for (const d of METER_DEFS) meters[d.key] = { unit: d.unit, tiers: typeof d.sample === 'number' ? [{ from: 0, rate: d.sample }] : d.sample }
const snap: Snapshot = {
  schema: 1,
  region: 'uksouth',
  currency: 'GBP',
  retrievedAt: '2026-10-06T00:00:00Z',
  source: 'sample',
  meters,
  vms: Object.fromEntries(VM_SKUS.map((s) => [s.name, { linux: 0.1, windows: 0.2 }])),
}

/** Every combination of select options for a calculator (capped per field). */
function combos(fields: (typeof RESOURCES)[number]['fields'], defaults: Config): Config[] {
  let out: Config[] = [{ ...defaults }]
  for (const f of fields) {
    if (f.kind !== 'select') continue
    const next: Config[] = []
    for (const cfg of out) {
      const options = typeof f.options === 'function' ? f.options(cfg) : (f.options ?? [])
      for (const o of options) next.push({ ...cfg, [f.key]: o.value })
    }
    out = next
  }
  return out
}

describe('meter catalogue', () => {
  it('has unique keys', () => {
    const keys = METER_DEFS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('covers every meter every calculator can request', () => {
    const missing = new Set<string>()
    for (const def of RESOURCES) {
      for (const cfg of combos(def.fields, def.defaults)) {
        // Give every numeric input a value so no line is filtered out as zero.
        const filled = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, typeof v === 'number' ? Math.max(v, 200) : v]))
        for (const line of def.lines(filled, { snap, hours: 730 })) {
          if (line.unavailable) missing.add(`${def.type}: ${line.meterKey}`)
        }
      }
    }
    expect([...missing]).toEqual([])
  })

  it('declares the canonical units the calculators expect', () => {
    for (const d of METER_DEFS) expect(['hour', 'gb', 'month', '10k', '1m']).toContain(d.unit)
  })
})
