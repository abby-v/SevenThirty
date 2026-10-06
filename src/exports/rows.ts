// Flattens a priced estimate into rows for Markdown, CSV and Excel.

import type { EstimateResult } from '../engine/estimate.ts'
import type { Line } from '../engine/types.ts'
import { workingText } from '../engine/working.ts'
import type { RegionId } from '../pricing/types.ts'

export interface Row {
  workload: string
  environment: string
  region: RegionId
  resource: string
  resourceType: string
  arm: string
  line: string
  kind: 'standing' | 'usage'
  quantity: number | null
  rate: number | null
  hours: number | null
  gb: number | null
  monthly: number
  working: string
  meter: string
  /** How to rebuild the amount as a spreadsheet formula. */
  formula: 'qty*rate*hours' | 'qty*rate' | 'gb*rate' | 'value'
  flags: string
}

function parts(l: Line): Pick<Row, 'quantity' | 'rate' | 'hours' | 'gb' | 'formula'> {
  const w = l.working
  if (!w) return { quantity: null, rate: null, hours: null, gb: null, formula: 'value' }
  switch (w.t) {
    case 'hourly':
      return { quantity: w.qty, rate: w.rate, hours: w.hours, gb: null, formula: 'qty*rate*hours' }
    case 'monthly':
      return w.segments.length <= 1
        ? { quantity: w.qty, rate: w.segments[0]?.rate ?? 0, hours: null, gb: null, formula: 'qty*rate' }
        : { quantity: w.qty, rate: null, hours: null, gb: null, formula: 'value' }
    case 'gb':
      return w.segments.length === 1 && !w.free
        ? { quantity: null, rate: w.segments[0].rate, hours: null, gb: w.gb, formula: 'gb*rate' }
        : { quantity: null, rate: null, hours: null, gb: w.gb, formula: 'value' }
    case 'count':
      return { quantity: w.count, rate: null, hours: null, gb: null, formula: 'value' }
    case 'manual':
      return { quantity: null, rate: null, hours: null, gb: null, formula: 'value' }
  }
}

export function toRows(result: EstimateResult): Row[] {
  return result.items.flatMap((r) =>
    r.lines.map((l) => ({
      workload: r.item.group,
      environment: r.item.env,
      region: r.region,
      resource: r.item.name,
      resourceType: r.def.name,
      arm: r.def.arm,
      line: l.label,
      kind: l.kind,
      monthly: l.amount,
      working: workingText(l),
      meter: l.meterKey,
      flags: [l.unavailable ? 'rate unavailable' : '', l.manual ? 'manual rate' : '', r.overridden ? `hours override ${r.hours}` : ''].filter(Boolean).join('; '),
      ...parts(l),
    })),
  )
}
