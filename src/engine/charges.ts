// Building blocks every resource calculator uses. Each returns a Line that
// carries its own working so the UI can show quantity × rate × hours or GB.

import type { MeterPrice, Tier } from '../pricing/types.ts'
import type { Kind, Line, PriceContext } from './types.ts'

export function meter(ctx: PriceContext, key: string): MeterPrice | undefined {
  return ctx.snap.meters[key]
}

/** Split a quantity across ascending tiers. Zero-quantity segments are dropped. */
export function applyTiers(tiers: Tier[], quantity: number): { qty: number; rate: number }[] {
  const out: { qty: number; rate: number }[] = []
  for (let i = 0; i < tiers.length; i++) {
    const start = tiers[i].from
    const end = i + 1 < tiers.length ? tiers[i + 1].from : Infinity
    const q = Math.max(0, Math.min(quantity, end) - start)
    if (q > 0) out.push({ qty: q, rate: tiers[i].rate })
  }
  return out
}

const sum = (segs: { qty: number; rate: number }[]) => segs.reduce((a, s) => a + s.qty * s.rate, 0)

function unavailable(label: string, key: string, kind: Kind, quantity: number): Line {
  return { label, meterKey: key, kind, amount: 0, working: null, unavailable: true, quantity }
}

/**
 * A charge for something that exists: priced per hour × hours when the meter
 * is hourly, or as a flat monthly amount when the meter is monthly.
 * Monthly meters are never multiplied by hours.
 */
export function standing(ctx: PriceContext, label: string, key: string, qty: number, opts: { note?: string; noun?: string } = {}): Line {
  const m = meter(ctx, key)
  if (!m) return unavailable(label, key, 'standing', qty)
  const base = { label, meterKey: key, kind: 'standing' as const, manual: !!m.manual, note: opts.note }
  if (m.unit === 'hour') {
    const r = m.tiers[0].rate
    return { ...base, amount: qty * r * ctx.hours, working: { t: 'hourly', qty, rate: r, hours: ctx.hours } }
  }
  if (m.unit === 'month') {
    const segments = applyTiers(m.tiers, qty)
    return { ...base, amount: sum(segments), working: { t: 'monthly', qty, segments, noun: opts.noun } }
  }
  return unavailable(label, key, 'standing', qty)
}

/** A per-GB usage charge with tiers and an optional named free allowance. */
export function data(ctx: PriceContext, label: string, key: string, gb: number, opts: { free?: { gb: number; label: string }; note?: string; kind?: Kind } = {}): Line {
  const kind = opts.kind ?? 'usage'
  const m = meter(ctx, key)
  if (!m || m.unit !== 'gb') return unavailable(label, key, kind, gb)
  const freeGb = Math.min(gb, opts.free?.gb ?? 0)
  const segments = applyTiers(m.tiers, gb - freeGb).map((s) => ({ gb: s.qty, rate: s.rate }))
  const amount = segments.reduce((a, s) => a + s.gb * s.rate, 0)
  return {
    label,
    meterKey: key,
    kind,
    amount,
    manual: !!m.manual,
    note: opts.note,
    working: { t: 'gb', gb, segments, free: opts.free && freeGb > 0 ? { gb: freeGb, label: opts.free.label } : undefined },
  }
}

/** A transaction charge. `count` is the raw number of operations or queries per month. */
export function count(ctx: PriceContext, label: string, key: string, n: number, noun: string, opts: { note?: string } = {}): Line {
  const m = meter(ctx, key)
  if (!m || (m.unit !== '10k' && m.unit !== '1m')) return unavailable(label, key, 'usage', n)
  const size = m.unit === '10k' ? 10_000 : 1_000_000
  const units = n / size
  const segments = applyTiers(m.tiers, units).map((s) => ({ units: s.qty, rate: s.rate }))
  const amount = segments.reduce((a, s) => a + s.units * s.rate, 0)
  return { label, meterKey: key, kind: 'usage', amount, manual: !!m.manual, note: opts.note, working: { t: 'count', count: n, per: m.unit, segments, noun } }
}
