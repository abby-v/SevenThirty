// Converts Azure Retail Prices API units into SevenThirty's canonical units.
// Pure functions, shared by the pipeline and the tests.

import type { CanonicalUnit } from './types.ts'

export interface Normalised {
  unit: CanonicalUnit
  /** Multiply an API price by this to get the canonical rate. */
  priceFactor: number
  /** Multiply an API tierMinimumUnits by this to get canonical units. */
  quantityFactor: number
}

/** Hours in an average month: 24 × 365 ÷ 12. */
export const HOURS_PER_MONTH = 730

const CANONICAL_SIZE: Record<CanonicalUnit, number> = { hour: 1, gb: 1, month: 1, '10k': 10_000, '1m': 1_000_000 }

/**
 * Parse an API unitOfMeasure such as "1 Hour", "10 Hours", "1 GB/Month",
 * "1/Month", "10K", "1M" or "1/Day". Returns null for units we do not model.
 *
 * Choices documented here so they are reviewable:
 * - "/Day" meters become monthly: rate × 730 ÷ 24.
 * - "TB" meters become per GB using 1,024 GB per TB. Check the service's
 *   pricing page if a TB meter is ever added.
 */
export function normaliseUnit(unitOfMeasure: string): Normalised | null {
  const m = unitOfMeasure.trim().match(/^(\d+(?:\.\d+)?)?\s*([KM])?\s*\/?\s*(.*)$/i)
  if (!m) return null
  const count = m[1] ? Number(m[1]) : 1
  const scale = m[2]?.toUpperCase() === 'K' ? 1_000 : m[2]?.toUpperCase() === 'M' ? 1_000_000 : 1
  const base = m[3].trim().toLowerCase()
  const mult = count * scale

  if (scale > 1) {
    // Transaction counts: keep the multiplier explicit as per 10K or per 1M.
    const unit: CanonicalUnit = scale === 1_000_000 ? '1m' : '10k'
    const size = CANONICAL_SIZE[unit]
    return { unit, priceFactor: size / mult, quantityFactor: mult / size }
  }
  if (base === 'hour' || base === 'hours') return { unit: 'hour', priceFactor: 1 / mult, quantityFactor: mult }
  if (base === 'gb' || base === 'gb/month') return { unit: 'gb', priceFactor: 1 / mult, quantityFactor: mult }
  if (base === 'tb' || base === 'tb/month') return { unit: 'gb', priceFactor: 1 / (mult * 1024), quantityFactor: mult * 1024 }
  if (base === 'month' || base === 'months') return { unit: 'month', priceFactor: 1 / mult, quantityFactor: mult }
  if (base === 'day' || base === 'days') return { unit: 'month', priceFactor: HOURS_PER_MONTH / 24 / mult, quantityFactor: mult }
  return null
}
