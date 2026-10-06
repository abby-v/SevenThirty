// Markdown table and CSV exports.

import { disclaimer, hoursLabel } from '../content.ts'
import type { EstimateResult } from '../engine/estimate.ts'
import { formatDate, gbp } from '../engine/format.ts'
import type { Estimate } from '../engine/types.ts'
import { regionName, type Snapshot } from '../pricing/types.ts'
import { toRows } from './rows.ts'

const md = (s: string) => s.replace(/\|/g, '\\|')

export function toMarkdown(est: Estimate, result: EstimateResult, snap: Snapshot | undefined): string {
  const rows = toRows(result)
  const out = [
    `## ${md(est.title)}${est.client ? ` for ${md(est.client)}` : ''}`,
    '',
    `Region: ${regionName(est.region)} · Prices retrieved ${snap ? formatDate(snap.retrievedAt) : 'unknown'} · Hours model: ${hoursLabel(est.hours)}`,
    '',
    '| Workload | Resource | Line | Type | Working | Monthly |',
    '|---|---|---|---|---|---:|',
    ...rows.map((r) => `| ${md(r.workload)} | ${md(r.resource)} | ${md(r.line)} | ${r.kind === 'standing' ? 'Standing' : 'Usage'} | ${md(r.working)} | ${gbp(r.monthly)} |`),
    `| | | | | **List price per month** | **${gbp(result.list)}** |`,
  ]
  if (result.discount) out.push(`| | | | | Customer discount (${est.discountPct}%) | −${gbp(result.discount)} |`)
  if (result.contingency) out.push(`| | | | | Contingency (${est.contingencyPct}%) | ${gbp(result.contingency)} |`)
  out.push(
    `| | | | | **Monthly total** | **${gbp(result.monthly)}** |`,
    `| | | | | Annual (× 12) | ${gbp(result.annual)} |`,
    `| | | | | ${est.termMonths}-month total over ramp | ${gbp(result.termTotal)} |`,
    '',
    `Standing charges ${gbp(result.standing)} a month; usage charges ${gbp(result.usage)} a month (list price).`,
    '',
    `_${disclaimer(snap, est)}_`,
  )
  return out.join('\n')
}

const csvCell = (v: string | number | null) => {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Full-precision CSV for finance. */
export function toCsv(est: Estimate, result: EstimateResult, snap: Snapshot | undefined): string {
  const header = ['Workload', 'Environment', 'Region', 'Resource', 'Resource type', 'ARM type', 'Line', 'Charge type', 'Quantity', 'Rate GBP', 'Hours per month', 'GB per month', 'Monthly GBP', 'Annual GBP', 'Working', 'Meter key', 'Flags', 'Price date']
  const date = snap?.retrievedAt ?? ''
  const lines = toRows(result).map((r) =>
    [r.workload, r.environment, r.region, r.resource, r.resourceType, r.arm, r.line, r.kind, r.quantity, r.rate, r.hours, r.gb, r.monthly, r.monthly * 12, r.working, r.meter, r.flags, date].map(csvCell).join(','),
  )
  return [header.join(','), ...lines, '', csvCell(disclaimer(snap, est))].join('\r\n')
}

export function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileSlug = (est: Estimate) =>
  `${(est.client || est.title || 'estimate').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-v${est.version}`
