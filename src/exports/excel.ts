// Excel workbook with live formulas: Summary, Line items, Ramp, Assumptions.
// exceljs is loaded on demand so it does not weigh down the first page load.

import { defaultAssumptions, disclaimer, exclusions } from '../content.ts'
import { commitmentScenarios, monthDate, fiscalYearLabel, type EstimateResult } from '../engine/estimate.ts'
import { formatDate } from '../engine/format.ts'
import type { Estimate } from '../engine/types.ts'
import { regionName, type Snapshot } from '../pricing/types.ts'
import { toRows } from './rows.ts'

const GBP = '£#,##0.00'
const RATE = '£#,##0.0000'

export async function toExcel(est: Estimate, result: EstimateResult, snap: Snapshot | undefined, ahb: boolean): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SevenThirty'
  wb.created = new Date()

  const summary = wb.addWorksheet('Summary')
  const lines = wb.addWorksheet('Line items')
  const ramp = wb.addWorksheet('Ramp')
  const notes = wb.addWorksheet('Assumptions')

  // ------------------------------------------------------------ Line items
  lines.columns = [
    { header: 'Workload', key: 'workload', width: 26 },
    { header: 'Environment', key: 'environment', width: 15 },
    { header: 'Region', key: 'region', width: 10 },
    { header: 'Resource', key: 'resource', width: 30 },
    { header: 'Line', key: 'line', width: 32 },
    { header: 'Charge type', key: 'kind', width: 12 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Rate', key: 'rate', width: 12 },
    { header: 'Hours per month', key: 'hours', width: 10 },
    { header: 'GB per month', key: 'gb', width: 12 },
    { header: 'Monthly', key: 'monthly', width: 14 },
    { header: 'Working', key: 'working', width: 60 },
    { header: 'Meter', key: 'meter', width: 28 },
  ]
  lines.getRow(1).font = { bold: true }
  lines.views = [{ state: 'frozen', ySplit: 1 }]
  const rows = toRows(result)
  rows.forEach((r, i) => {
    const n = i + 2
    const formula =
      r.formula === 'qty*rate*hours' ? `G${n}*H${n}*I${n}` : r.formula === 'qty*rate' ? `G${n}*H${n}` : r.formula === 'gb*rate' ? `J${n}*H${n}` : null
    lines.addRow({
      ...r,
      monthly: formula ? { formula, result: r.monthly } : r.monthly,
    })
    lines.getCell(`H${n}`).numFmt = RATE
    lines.getCell(`K${n}`).numFmt = GBP
  })
  const last = rows.length + 1
  const L = (col: string) => `'Line items'!$${col}$2:$${col}$${Math.max(2, last)}`

  // --------------------------------------------------------------- Summary
  summary.columns = [{ width: 42 }, { width: 18 }, { width: 18 }, { width: 14 }]
  const put = (label: string, value: unknown, fmt?: string) => {
    const row = summary.addRow([label, value])
    if (fmt) row.getCell(2).numFmt = fmt
    return row.number
  }
  summary.addRow([est.title]).font = { bold: true, size: 16 }
  put('Client', est.client || '—')
  put('Prepared by', est.preparedBy || '—')
  put('Version and status', `${est.version}, ${est.status}`)
  put('Region', regionName(est.region))
  put('Currency and price basis', 'GBP, Microsoft retail list price (pay-as-you-go)')
  put('Price date', snap ? formatDate(snap.retrievedAt) : 'unknown')
  put('Hours per month (global)', est.hours)
  summary.addRow([])
  const listRow = put('List price per month', { formula: `SUM(${L('K')})`, result: result.list }, GBP)
  const dRow = put('Customer discount', est.discountPct / 100, '0.0%')
  const cRow = put('Contingency', est.contingencyPct / 100, '0.0%')
  const mRow = put('Monthly total', { formula: `B${listRow}*(1-B${dRow})*(1+B${cRow})`, result: result.monthly }, GBP)
  summary.getRow(mRow).font = { bold: true }
  put('Annual (× 12)', { formula: `B${mRow}*12`, result: result.annual }, GBP)
  put(`${est.termMonths}-month total over ramp`, { formula: `SUM(Ramp!$E$2:$E$${est.termMonths + 1})`, result: result.termTotal }, GBP)
  put('Standing charges per month (list)', { formula: `SUMIF(${L('F')},"standing",${L('K')})`, result: result.standing }, GBP)
  put('Usage charges per month (list)', { formula: `SUMIF(${L('F')},"usage",${L('K')})`, result: result.usage }, GBP)
  summary.addRow([])
  summary.addRow(['Commitment options', 'Monthly', 'Saving', 'Saving %']).font = { bold: true }
  for (const s of commitmentScenarios(result, ahb)) {
    const row = summary.addRow([s.label + (s.fallbacks ? ` (${s.fallbacks} lines at PAYG)` : ''), s.monthly, s.saving, s.savingPct])
    row.getCell(2).numFmt = GBP
    row.getCell(3).numFmt = GBP
    row.getCell(4).numFmt = '0.0%'
  }
  summary.addRow([ahb ? 'Hybrid Benefit applied where eligible.' : 'Hybrid Benefit not applied.'])
  summary.addRow([])
  summary.addRow(['By workload', 'Monthly (list)']).font = { bold: true }
  for (const g of result.byGroup) {
    const row = summary.addRow([g.key, { formula: `SUMIF(${L('A')},"${g.key.replace(/"/g, '""')}",${L('K')})`, result: g.total }])
    row.getCell(2).numFmt = GBP
  }
  summary.addRow([])
  summary.addRow([disclaimer(snap, est)]).font = { italic: true }

  // ------------------------------------------------------------------ Ramp
  const groups = result.byGroup.map((g) => g.key)
  ramp.columns = [{ header: 'Month', width: 8 }, { header: 'Date', width: 12 }, { header: 'Fiscal year', width: 10 }, { header: 'Run-rate share', width: 14 }, { header: 'Monthly', width: 14 }, ...groups.map((g) => ({ header: `${g} (ramp %)`, width: 20 }))]
  ramp.getRow(1).font = { bold: true }
  const gCol = (i: number) => String.fromCharCode(70 + i) // F, G, ...
  for (let m = 1; m <= est.termMonths; m++) {
    const d = monthDate(est.startMonth, m - 1)
    const n = m + 1
    const factors = groups.map((g) => {
      const r = est.ramps[g] ?? { start: 1, ramp: 1, end: null }
      if (m < r.start || (r.end != null && m > r.end)) return 0
      return Math.min(1, (m - r.start + 1) / Math.max(1, r.ramp))
    })
    const sumParts = groups.map((g, i) => `SUMIF(${L('A')},"${g.replace(/"/g, '""')}",${L('K')})*${gCol(i)}${n}`)
    const row = ramp.addRow([
      m,
      new Date(Date.UTC(d.year, d.month0, 1)),
      fiscalYearLabel(d.year, d.month0),
      null,
      { formula: `(${sumParts.join('+') || '0'})*(1-Summary!$B$${dRow})*(1+Summary!$B$${cRow})`, result: result.forecast[m - 1] },
      ...factors,
    ])
    row.getCell(2).numFmt = 'mmm yyyy'
    row.getCell(4).value = { formula: `IF(Summary!$B$${mRow}=0,0,E${n}/Summary!$B$${mRow})`, result: result.monthly ? result.forecast[m - 1] / result.monthly : 0 }
    row.getCell(4).numFmt = '0%'
    row.getCell(5).numFmt = GBP
    groups.forEach((_, i) => (row.getCell(6 + i).numFmt = '0%'))
  }

  // ----------------------------------------------------------- Assumptions
  notes.columns = [{ width: 110 }]
  notes.addRow(['Assumptions']).font = { bold: true }
  defaultAssumptions(est, result).forEach((a) => notes.addRow([a]))
  notes.addRow([])
  notes.addRow(['Exclusions']).font = { bold: true }
  exclusions(est).forEach((a) => notes.addRow([a]))
  notes.addRow([])
  notes.addRow([disclaimer(snap, est)]).font = { italic: true }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
