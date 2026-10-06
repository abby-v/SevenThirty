import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { priceEstimate } from '../engine/estimate.ts'
import type { Snapshot } from '../pricing/types.ts'
import { emptyEstimate, makeItem } from '../state/presets.ts'
import { toExcel } from './excel.ts'
import { toCsv, toMarkdown } from './text.ts'

const snap: Snapshot = {
  schema: 1,
  region: 'uksouth',
  currency: 'GBP',
  retrievedAt: '2026-10-06T06:00:00.000Z',
  source: 'azure-retail-prices-api',
  meters: { 'pip.standard': { unit: 'hour', tiers: [{ from: 0, rate: 0.004 }] }, 'natgw.hour': { unit: 'hour', tiers: [{ from: 0, rate: 0.04 }] }, 'natgw.gb': { unit: 'gb', tiers: [{ from: 0, rate: 0.04 }] } },
  vms: {},
}
const est = {
  ...emptyEstimate(),
  title: 'Hub | estimate',
  client: 'Contoso',
  startMonth: '2026-11',
  termMonths: 12,
  discountPct: 10,
  groups: ['Hub'],
  items: [makeItem('publicIp', 'Hub', 'Production', 'IPs', { count: 2 }), makeItem('natGateway', 'Hub', 'Production', 'NAT', { count: 1, gb: 1000 })],
}
const result = priceEstimate(est, { uksouth: snap })

describe('exports', () => {
  it('Markdown has a header row, working, totals, price date and disclaimer', () => {
    const md = toMarkdown(est, result, snap)
    expect(md).toContain('| Workload | Resource | Line | Type | Working | Monthly |')
    expect(md).toContain('2 × £0.0040/h × 730 h = £5.84')
    expect(md).toContain('Hub \\| estimate')
    expect(md).toContain('Customer discount (10%)')
    expect(md).toContain('retrieved on 6 October 2026')
    expect(md).toContain('Not affiliated with Microsoft')
  })

  it('CSV keeps full precision', () => {
    const csv = toCsv(est, result, snap)
    const row = csv.split('\r\n').find((l) => l.includes('Standard static IPv4'))!
    expect(row).toContain(',0.004,730,,5.84,')
  })

  it('Excel workbook has the four sheets and live formulas', async () => {
    const buf = await toExcel(est, result, snap, false)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Line items', 'Ramp', 'Assumptions'])
    const lines = wb.getWorksheet('Line items')!
    expect(lines.getCell('K2').formula).toBe('G2*H2*I2')
    expect(lines.getCell('K4').formula).toBe('J4*H4')
    const summary = wb.getWorksheet('Summary')!
    const formulas: string[] = []
    summary.eachRow((r) => r.eachCell((c) => c.formula && formulas.push(c.formula)))
    expect(formulas.some((f) => f.startsWith("SUM('Line items'!$K$2"))).toBe(true)
    expect(wb.getWorksheet('Ramp')!.rowCount).toBe(13)
  })
})
