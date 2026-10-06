// Writes development-only sample snapshots so the site runs before the first
// pricing job. Every file is marked `source: "sample"` and the UI shows a
// banner saying the rates are not Microsoft prices.
//
//   node scripts/make-sample.ts

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { METER_DEFS, VM_SAMPLE_PER_VCPU, VM_SAMPLE_WINDOWS_PER_VCPU } from '../src/pricing/catalogue.ts'
import type { MeterPrice, RegionId, Snapshot, VmPrice } from '../src/pricing/types.ts'
import { VM_SKUS } from '../src/pricing/vmSkus.ts'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'prices')
const round = (n: number) => Math.round(n * 1e6) / 1e6

for (const region of ['uksouth', 'ukwest'] as RegionId[]) {
  const meters: Record<string, MeterPrice> = {}
  for (const d of METER_DEFS) {
    meters[d.key] = { unit: d.unit, tiers: typeof d.sample === 'number' ? [{ from: 0, rate: d.sample }] : d.sample }
  }
  const vms: Record<string, VmPrice> = {}
  for (const s of VM_SKUS) {
    const linux = round(VM_SAMPLE_PER_VCPU[s.family] * s.vcpu)
    vms[s.name] = {
      linux,
      windows: round(linux + VM_SAMPLE_WINDOWS_PER_VCPU * s.vcpu),
      ri1yTerm: round(linux * 8760 * 0.6),
      ri3yTerm: round(linux * 26280 * 0.4),
      sp1y: round(linux * 0.66),
      sp3y: round(linux * 0.48),
    }
  }
  const snap: Snapshot = { schema: 1, region, currency: 'GBP', retrievedAt: '2026-10-06T00:00:00.000Z', source: 'sample', meters, vms, missing: [] }
  await mkdir(join(OUT, region), { recursive: true })
  await writeFile(join(OUT, region, 'latest.json'), JSON.stringify(snap))
}
console.log('Sample snapshots written. These are NOT Microsoft prices.')
