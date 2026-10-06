// SevenThirty pricing job.
//
// Pulls native GBP list prices from the Azure Retail Prices API for UK South
// and UK West, normalises them to canonical units, validates them against the
// previous snapshot and only then writes:
//
//   public/prices/<region>/latest.json
//   public/prices/<region>/<YYYY-MM-DD>.json
//   public/prices/index.json        (available snapshot dates)
//   public/prices/changelog.json    (price changes between snapshots)
//
// Nothing is written unless every region passes validation, so a partial or
// broken pull never reaches the site.
//
// Usage:
//   node scripts/fetch-prices.ts                  # normal run
//   node scripts/fetch-prices.ts --accept-changes # allow moves above threshold
//   node scripts/fetch-prices.ts --explore "Azure Bastion" [region]
//
// Runs on Node 22.18+ (native TypeScript type stripping).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { METER_DEFS, type MeterDef } from '../src/pricing/catalogue.ts'
import { normaliseUnit } from '../src/pricing/normalise.ts'
import type { MeterPrice, RegionId, Snapshot, VmPrice } from '../src/pricing/types.ts'
import { VM_SKUS } from '../src/pricing/vmSkus.ts'

const API = 'https://prices.azure.com/api/retail/prices'
const API_VERSION = '2023-01-01-preview' // needed for savings plan prices
const REGIONS: RegionId[] = ['uksouth', 'ukwest']
const PRICE_CHANGE_THRESHOLD = 0.2 // 20%
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.SEVENTHIRTY_PRICES_OUT ?? join(ROOT, 'public', 'prices')

interface ApiRow {
  currencyCode: string
  retailPrice: number
  unitPrice: number
  armRegionName: string
  location: string
  effectiveStartDate: string
  meterId: string
  meterName: string
  productName: string
  skuName: string
  armSkuName: string
  serviceName: string
  serviceFamily: string
  unitOfMeasure: string
  type: string
  isPrimaryMeterRegion: boolean
  tierMinimumUnits: number
  reservationTerm?: string
  savingsPlan?: { term: string; retailPrice: number; unitPrice: number }[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchAll(filter: string): Promise<ApiRow[]> {
  let url: string | null =
    `${API}?currencyCode='GBP'&api-version=${API_VERSION}&$filter=${encodeURIComponent(filter)}`
  const rows: ApiRow[] = []
  while (url) {
    let attempt = 0
    for (;;) {
      const res = await fetch(url)
      if (res.ok) {
        const body = (await res.json()) as { Items: ApiRow[]; NextPageLink: string | null }
        rows.push(...body.Items)
        url = body.NextPageLink
        break
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep(2 ** attempt * 1000)
        attempt++
        continue
      }
      throw new Error(`Retail Prices API returned ${res.status} for filter: ${filter}`)
    }
  }
  for (const r of rows) {
    if (r.currencyCode !== 'GBP') throw new Error(`Expected GBP, got ${r.currencyCode}. Refusing to convert currencies.`)
  }
  return rows
}

// Regional meters live under the region; some network meters are published
// against billing zones or as global.
const SCOPES = (region: RegionId) => [region, 'Zone 1', 'Global', 'global', '']
const scopeRank = (region: RegionId, r: ApiRow) => {
  const i = SCOPES(region).indexOf(r.armRegionName ?? '')
  return i === -1 ? 99 : i
}

const serviceCache = new Map<string, ApiRow[]>()
async function serviceRows(region: RegionId, service: string): Promise<ApiRow[]> {
  const key = `${region}|${service}`
  const cached = serviceCache.get(key)
  if (cached) return cached
  const scopes = SCOPES(region).map((s) => `armRegionName eq '${s}'`).join(' or ')
  const rows = await fetchAll(`serviceName eq '${service}' and priceType eq 'Consumption' and (${scopes})`)
  serviceCache.set(key, rows)
  return rows
}

function rowMatches(def: MeterDef, r: ApiRow): boolean {
  if (r.type !== 'Consumption' || r.isPrimaryMeterRegion === false) return false
  if (/Spot|Low Priority/i.test(r.skuName)) return false
  if (def.product && !def.product.test(r.productName)) return false
  if (def.sku && !def.sku.test(r.skuName)) return false
  if (def.meter && !def.meter.test(r.meterName)) return false
  const n = normaliseUnit(r.unitOfMeasure)
  return !!n && [def.unit, ...(def.altUnits ?? [])].includes(n.unit)
}

async function resolveMeter(region: RegionId, def: MeterDef, warnings: string[]): Promise<MeterPrice | null> {
  for (const service of def.services) {
    const rows = (await serviceRows(region, service)).filter((r) => rowMatches(def, r))
    if (!rows.length) continue
    const best = Math.min(...rows.map((r) => scopeRank(region, r)))
    const scoped = rows.filter((r) => scopeRank(region, r) === best)
    const byMeter = new Map<string, ApiRow[]>()
    for (const r of scoped) byMeter.set(r.meterId, [...(byMeter.get(r.meterId) ?? []), r])
    if (byMeter.size > 1) {
      const names = [...byMeter.values()].map((g) => `${g[0].productName} / ${g[0].skuName} / ${g[0].meterName}`)
      warnings.push(`${region} ${def.key}: ${byMeter.size} meters matched, using the first. Candidates: ${names.join('; ')}`)
    }
    const group = [...byMeter.values()][0].sort((a, b) => a.tierMinimumUnits - b.tierMinimumUnits)
    const head = group[0]
    const n = normaliseUnit(head.unitOfMeasure)!
    return {
      unit: n.unit,
      tiers: group.map((r) => ({ from: r.tierMinimumUnits * n.quantityFactor, rate: r.retailPrice * n.priceFactor })),
      meterId: head.meterId,
      service: head.serviceName,
      product: head.productName,
      sku: head.skuName,
      meter: head.meterName,
      apiUnit: head.unitOfMeasure,
      effectiveStartDate: head.effectiveStartDate,
    }
  }
  return null
}

async function resolveVms(region: RegionId): Promise<Record<string, VmPrice>> {
  const out: Record<string, VmPrice> = {}
  const names = VM_SKUS.map((s) => s.name)
  for (let i = 0; i < names.length; i += 8) {
    const batch = names.slice(i, i + 8)
    const skuFilter = batch.map((n) => `armSkuName eq '${n}'`).join(' or ')
    const rows = await fetchAll(`serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and (${skuFilter})`)
    for (const r of rows) {
      if (/Spot|Low Priority/i.test(r.skuName) || /Cloud Services/i.test(r.productName)) continue
      if (r.isPrimaryMeterRegion === false) continue
      const vm = (out[r.armSkuName] ??= { linux: NaN })
      const windows = /Windows/i.test(r.productName)
      if (r.type === 'Consumption' && r.unitOfMeasure === '1 Hour') {
        if (windows) vm.windows = r.retailPrice
        else {
          vm.linux = r.retailPrice
          for (const sp of r.savingsPlan ?? []) {
            if (sp.term === '1 Year') vm.sp1y = sp.retailPrice
            if (sp.term === '3 Years') vm.sp3y = sp.retailPrice
          }
        }
      } else if (r.type === 'Reservation' && !windows) {
        if (r.reservationTerm === '1 Year') vm.ri1yTerm = r.retailPrice
        if (r.reservationTerm === '3 Years') vm.ri3yTerm = r.retailPrice
      }
    }
  }
  for (const [k, v] of Object.entries(out)) if (Number.isNaN(v.linux)) delete out[k]
  return out
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

interface Change {
  date: string
  region: RegionId
  key: string
  from: number
  to: number
  unit: string
}

function compare(prev: Snapshot | null, next: Snapshot, errors: string[], changes: Change[], acceptChanges: boolean) {
  if (!prev || prev.source === 'sample') return
  const date = next.retrievedAt.slice(0, 10)
  for (const [key, p] of Object.entries(prev.meters)) {
    const n = next.meters[key]
    if (!n) {
      errors.push(`${next.region} ${key}: present in the previous snapshot but missing now`)
      continue
    }
    if (n.unit !== p.unit) errors.push(`${next.region} ${key}: unit changed from ${p.unit} to ${n.unit}`)
    const a = p.tiers[0]?.rate ?? 0
    const b = n.tiers[0]?.rate ?? 0
    if (a !== b) {
      changes.push({ date, region: next.region, key, from: a, to: b, unit: n.unit })
      const move = a === 0 ? Infinity : Math.abs(b - a) / a
      if (move > PRICE_CHANGE_THRESHOLD && !acceptChanges) {
        errors.push(`${next.region} ${key}: price moved ${(move * 100).toFixed(1)}% (${a} → ${b}). Re-run with --accept-changes after checking.`)
      }
    }
  }
  for (const [sku, p] of Object.entries(prev.vms)) {
    const n = next.vms[sku]
    if (!n) errors.push(`${next.region} VM ${sku}: present in the previous snapshot but missing now`)
    else if (n.linux !== p.linux) changes.push({ date, region: next.region, key: `vm.${sku}.linux`, from: p.linux, to: n.linux, unit: 'hour' })
  }
}

async function explore(service: string, region: RegionId) {
  const rows = await serviceRows(region, service)
  const seen = new Set<string>()
  for (const r of rows) {
    const line = `${r.armRegionName.padEnd(8)} | ${r.productName} | ${r.skuName} | ${r.meterName} | ${r.unitOfMeasure} | £${r.retailPrice} | tier ${r.tierMinimumUnits}`
    if (!seen.has(line)) {
      seen.add(line)
      console.log(line)
    }
  }
  console.log(`\n${seen.size} distinct rows for ${service} in ${region}`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--explore') {
    await explore(args[1], (args[2] as RegionId) ?? 'uksouth')
    return
  }
  const acceptChanges = args.includes('--accept-changes')
  const retrievedAt = new Date().toISOString()
  const date = retrievedAt.slice(0, 10)
  const errors: string[] = []
  const warnings: string[] = []
  const changes: Change[] = []
  const overrides =
    (await readJson<Record<string, MeterPrice & { manual: NonNullable<MeterPrice['manual']> }>>(
      join(ROOT, 'src', 'pricing', 'manual-overrides.json'),
    )) ?? {}
  const snapshots: Snapshot[] = []

  for (const region of REGIONS) {
    console.log(`Pricing ${region}…`)
    const meters: Record<string, MeterPrice> = {}
    const missing: string[] = []
    for (const def of METER_DEFS) {
      const price = await resolveMeter(region, def, warnings)
      if (price) meters[def.key] = price
      else if (overrides[def.key]) meters[def.key] = overrides[def.key]
      else {
        missing.push(def.key)
        if (def.required) errors.push(`${region} ${def.key}: required meter not found`)
      }
    }
    const vms = await resolveVms(region)
    for (const s of VM_SKUS) if (!vms[s.name]) warnings.push(`${region} VM ${s.name}: not found`)
    if (!Object.keys(vms).length) errors.push(`${region}: no VM prices found`)

    const snap: Snapshot = { schema: 1, region, currency: 'GBP', retrievedAt, source: 'azure-retail-prices-api', apiVersion: API_VERSION, meters, vms, missing }
    compare(await readJson<Snapshot>(join(OUT, region, 'latest.json')), snap, errors, changes, acceptChanges)
    snapshots.push(snap)
    console.log(`  ${Object.keys(meters).length} meters, ${Object.keys(vms).length} VM sizes, ${missing.length} missing`)
  }

  for (const w of warnings) console.warn(`warning: ${w}`)
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`)
    console.error(`\nValidation failed with ${errors.length} error(s). Nothing was written; the site keeps the previous snapshot.`)
    process.exit(1)
  }

  const index = (await readJson<Record<string, string[]>>(join(OUT, 'index.json'))) ?? {}
  for (const snap of snapshots) {
    const dir = join(OUT, snap.region)
    await mkdir(dir, { recursive: true })
    const body = JSON.stringify(snap)
    await writeFile(join(dir, `${date}.json`), body)
    await writeFile(join(dir, 'latest.json'), body)
    index[snap.region] = [...new Set([...(index[snap.region] ?? []), date])].sort()
  }
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 2))
  const changelog = (await readJson<Change[]>(join(OUT, 'changelog.json'))) ?? []
  await writeFile(join(OUT, 'changelog.json'), JSON.stringify([...changes, ...changelog].slice(0, 2000), null, 2))
  console.log(`Wrote snapshots for ${date}. ${changes.length} price change(s) logged.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
