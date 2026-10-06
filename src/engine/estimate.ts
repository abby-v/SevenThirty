// Prices a whole estimate: per-item lines, totals, standing/usage split,
// breakdowns, the month-by-month ramp and commitment comparisons.

import type { RegionId, Snapshot } from '../pricing/types.ts'
import { HOURS_PER_MONTH } from '../pricing/normalise.ts'
import { getResource } from './resources.ts'
import type { Estimate, Family, GroupRamp, Item, Line, ResourceDef } from './types.ts'

export interface ItemResult {
  item: Item
  def: ResourceDef
  region: RegionId
  hours: number
  overridden: boolean
  lines: Line[]
  total: number
  warnings: string[]
}

export interface Breakdown {
  key: string
  total: number
}

export interface EstimateResult {
  items: ItemResult[]
  /** Monthly at list (PAYG) price, before discount and contingency. */
  list: number
  standing: number
  usage: number
  discount: number
  contingency: number
  /** Monthly after discount and contingency, at full run rate. */
  monthly: number
  annual: number
  /** Multiplier from list to final: (1 − discount) × (1 + contingency). */
  factor: number
  unavailable: number
  manual: number
  byGroup: Breakdown[]
  byEnv: Breakdown[]
  byFamily: Breakdown[]
  forecast: number[]
  termTotal: number
  fiscalYears: { label: string; total: number; months: number }[]
  drivers: { name: string; total: number; share: number }[]
}

export function itemRegion(item: Item, est: Estimate): RegionId {
  return item.env === 'DR' && est.drRegion ? est.drRegion : est.region
}

export function priceItem(item: Item, est: Estimate, snaps: Partial<Record<RegionId, Snapshot>>): ItemResult | null {
  const def = getResource(item.type)
  if (!def) return null
  const region = itemRegion(item, est)
  const snap = snaps[region]
  const overridden = def.hourly && item.hours != null
  const hours = overridden ? item.hours! : est.hours
  const config = { ...def.defaults, ...item.config }
  const lines = snap ? def.lines(config, { snap, hours }) : []
  const warnings: string[] = []
  if (def.hourly && !def.pausable && hours < HOURS_PER_MONTH) {
    warnings.push(
      `${def.name} has no stopped state. ${hours} hours a month only holds if it is deleted and redeployed on a schedule; otherwise it bills for 730 hours.`,
    )
  }
  if (lines.some((l) => l.unavailable)) warnings.push('Some rates are not in this price snapshot, so they are excluded from the total.')
  return { item, def, region, hours, overridden, lines, total: lines.reduce((a, l) => a + l.amount, 0), warnings }
}

const group = (items: ItemResult[], key: (r: ItemResult) => string): Breakdown[] => {
  const m = new Map<string, number>()
  for (const r of items) m.set(key(r), (m.get(key(r)) ?? 0) + r.total)
  return [...m.entries()].map(([k, total]) => ({ key: k, total })).sort((a, b) => b.total - a.total)
}

export function rampFactor(r: GroupRamp | undefined, month: number): number {
  const ramp = r ?? { start: 1, ramp: 1, end: null }
  if (month < ramp.start) return 0
  if (ramp.end != null && month > ramp.end) return 0
  const span = Math.max(1, ramp.ramp)
  return Math.min(1, (month - ramp.start + 1) / span)
}

/** Microsoft's fiscal year runs July to June and is named for the year it ends: July 2026 is FY27. */
export function fiscalYearLabel(year: number, monthIndex0: number): string {
  const fy = monthIndex0 >= 6 ? year + 1 : year
  return `FY${String(fy).slice(-2)}`
}

export function monthDate(startMonth: string, offset: number): { year: number; month0: number } {
  const [y, m] = startMonth.split('-').map(Number)
  const total = y * 12 + (m - 1) + offset
  return { year: Math.floor(total / 12), month0: total % 12 }
}

export function priceEstimate(est: Estimate, snaps: Partial<Record<RegionId, Snapshot>>): EstimateResult {
  const items = est.items.map((i) => priceItem(i, est, snaps)).filter((r): r is ItemResult => !!r)
  const lines = items.flatMap((r) => r.lines)
  const list = lines.reduce((a, l) => a + l.amount, 0)
  const standing = lines.filter((l) => l.kind === 'standing').reduce((a, l) => a + l.amount, 0)
  const discountRate = Math.min(100, Math.max(0, est.discountPct)) / 100
  const contingencyRate = Math.max(0, est.contingencyPct) / 100
  const discount = list * discountRate
  const contingency = (list - discount) * contingencyRate
  const monthly = list - discount + contingency
  const factor = (1 - discountRate) * (1 + contingencyRate)

  const byGroup = group(items, (r) => r.item.group)
  const groupTotals = new Map(byGroup.map((g) => [g.key, g.total]))
  const forecast: number[] = []
  for (let m = 1; m <= est.termMonths; m++) {
    let t = 0
    for (const [g, total] of groupTotals) t += total * rampFactor(est.ramps[g], m)
    forecast.push(t * factor)
  }
  const fyMap = new Map<string, { total: number; months: number }>()
  forecast.forEach((v, i) => {
    const d = monthDate(est.startMonth, i)
    const label = fiscalYearLabel(d.year, d.month0)
    const cur = fyMap.get(label) ?? { total: 0, months: 0 }
    fyMap.set(label, { total: cur.total + v, months: cur.months + 1 })
  })

  return {
    items,
    list,
    standing,
    usage: list - standing,
    discount,
    contingency,
    monthly,
    annual: monthly * 12,
    factor,
    unavailable: lines.filter((l) => l.unavailable).length,
    manual: lines.filter((l) => l.manual).length,
    byGroup,
    byEnv: group(items, (r) => r.item.env),
    byFamily: group(items, (r) => r.def.family as Family),
    forecast,
    termTotal: forecast.reduce((a, b) => a + b, 0),
    fiscalYears: [...fyMap.entries()].map(([label, v]) => ({ label, ...v })),
    drivers: items
      .map((r) => ({ name: r.item.name, total: r.total, share: list ? r.total / list : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3),
  }
}

// ---------------------------------------------------------- Commitments

export type ScenarioId = 'payg' | 'sp1y' | 'sp3y' | 'ri1y' | 'ri3y' | 'best'

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'payg', label: 'Pay-as-you-go' },
  { id: 'sp1y', label: 'Savings plan, 1 year' },
  { id: 'sp3y', label: 'Savings plan, 3 years' },
  { id: 'ri1y', label: 'Reservations, 1 year' },
  { id: 'ri3y', label: 'Reservations, 3 years' },
  { id: 'best', label: 'Best per VM, 3 years' },
]

export interface Scenario {
  id: ScenarioId
  label: string
  monthly: number
  saving: number
  savingPct: number
  /** Lines where the commitment was unavailable and PAYG was used. */
  fallbacks: number
}

/** Monthly cost of one line under a scenario, at list price. */
export function lineUnder(line: Line, id: ScenarioId, ahb: boolean): { amount: number; fallback: boolean } {
  const ahbOff = ahb && line.ahbSaving ? line.ahbSaving : 0
  const c = line.commit
  if (id === 'payg' || !c) return { amount: line.amount - ahbOff, fallback: false }
  const licence = ahb && line.ahbSaving !== undefined ? 0 : c.qty * c.licence * c.hours
  const options: Record<'sp1y' | 'sp3y' | 'ri1y' | 'ri3y', number | undefined> = {
    sp1y: c.sp1y !== undefined ? c.qty * c.sp1y * c.hours : undefined,
    sp3y: c.sp3y !== undefined ? c.qty * c.sp3y * c.hours : undefined,
    // Reservations bill every hour of the term whether or not the VM runs.
    ri1y: c.ri1yMonthly !== undefined ? c.qty * c.ri1yMonthly : undefined,
    ri3y: c.ri3yMonthly !== undefined ? c.qty * c.ri3yMonthly : undefined,
  }
  const payg = c.qty * c.compute * c.hours
  if (id === 'best') {
    const candidates = [payg, options.sp3y, options.ri3y].filter((v): v is number => v !== undefined)
    return { amount: Math.min(...candidates) + licence, fallback: false }
  }
  const v = options[id]
  if (v === undefined) return { amount: payg + licence, fallback: true }
  return { amount: v + licence, fallback: false }
}

export function commitmentScenarios(result: EstimateResult, ahb: boolean): Scenario[] {
  const lines = result.items.flatMap((r) => r.lines)
  const payg = result.list * result.factor
  return SCENARIOS.map(({ id, label }) => {
    let total = 0
    let fallbacks = 0
    for (const l of lines) {
      const r = lineUnder(l, id, ahb)
      total += r.amount
      if (r.fallback) fallbacks++
    }
    const monthly = total * result.factor
    return { id, label, monthly, saving: payg - monthly, savingPct: payg ? (payg - monthly) / payg : 0, fallbacks }
  })
}

export function hasCommitEligible(result: EstimateResult): boolean {
  return result.items.some((r) => r.lines.some((l) => l.commit))
}

export function hasAhbEligible(result: EstimateResult): boolean {
  return result.items.some((r) => r.lines.some((l) => l.ahbSaving !== undefined))
}
