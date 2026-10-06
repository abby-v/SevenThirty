// Client-facing wording shared by the UI, the client pack and every export.

import type { EstimateResult } from './engine/estimate.ts'
import { formatDate } from './engine/format.ts'
import type { Estimate } from './engine/types.ts'
import { regionName, type Snapshot } from './pricing/types.ts'

export function disclaimer(snap: Snapshot | undefined, est: Estimate): string {
  const date = snap ? formatDate(snap.retrievedAt) : '[price date unavailable]'
  const regions = [regionName(est.region), est.drRegion && est.items.some((i) => i.env === 'DR') ? regionName(est.drRegion) : '']
    .filter(Boolean)
    .join(' and ')
  return `Indicative estimate based on Microsoft Azure retail list prices in GBP for ${regions}, retrieved on ${date}. Actual charges depend on configuration, usage, agreement type and discounts. Prices exclude VAT. Not affiliated with Microsoft.`
}

export function hoursLabel(hours: number): string {
  if (hours === 730) return '730 hours a month (always on, 24 × 365 ÷ 12)'
  if (hours === 217) return '217 hours a month (office hours, 10 hours a day on weekdays)'
  if (hours === 450) return '450 hours a month (extended hours)'
  return `${hours} hours a month (custom)`
}

export function defaultAssumptions(est: Estimate, result: EstimateResult): string[] {
  const overrides = result.items.filter((r) => r.overridden).map((r) => `${r.item.name} (${r.hours} h)`)
  const ahb = result.items.some((r) => r.lines.some((l) => l.ahbSaving !== undefined))
  const out = [
    `Hourly resources run ${hoursLabel(est.hours)}.${overrides.length ? ` Overrides: ${overrides.join(', ')}.` : ''}`,
    `Primary region ${regionName(est.region)}${est.drRegion ? `; disaster recovery resources priced in ${regionName(est.drRegion)}` : ''}.`,
    'Data volumes are monthly figures in GB as entered in the estimate.',
    'Prices are Microsoft retail list prices (pay-as-you-go) in GBP, unless a commitment option is shown.',
    est.discountPct > 0
      ? `A customer discount of ${est.discountPct}% is applied to the list price.`
      : 'No customer-specific discount (EA, MCA or CSP) is applied.',
    ahb
      ? 'Azure Hybrid Benefit is shown as an option for resources where the client has told us they hold eligible licences. It is not applied to the list total.'
      : 'Azure Hybrid Benefit is not applied.',
    est.contingencyPct > 0 ? `A contingency of ${est.contingencyPct}% is added after discount.` : 'No contingency is added.',
    'All figures exclude VAT.',
  ]
  return [...out, ...est.assumptions.split('\n').map((s) => s.trim()).filter(Boolean)]
}

export const DEFAULT_EXCLUSIONS = [
  'VAT.',
  'Microsoft Unified or partner support plans, unless added as a line.',
  'Third-party Marketplace software and licences.',
  'Microsoft 365, Entra ID licensing and Defender plans not listed.',
  'Partner professional services and managed service fees.',
  'Data egress beyond the stated volumes.',
  'One-off migration costs (tooling and parallel running outside the ramp).',
]

export function exclusions(est: Estimate): string[] {
  return [...DEFAULT_EXCLUSIONS, ...est.exclusions.split('\n').map((s) => s.trim()).filter(Boolean)]
}
