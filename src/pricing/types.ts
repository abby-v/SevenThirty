// Shape of the compact pricing snapshot the site loads. Produced by
// scripts/fetch-prices.ts from the Azure Retail Prices API (GBP).

export type RegionId = 'uksouth' | 'ukwest'

/** Canonical units. Every API unit is converted to one of these at ingest. */
export type CanonicalUnit = 'hour' | 'gb' | 'month' | '10k' | '1m'

export interface Tier {
  /** Start of the tier in canonical units (from tierMinimumUnits). */
  from: number
  /** Rate in GBP per canonical unit. */
  rate: number
}

export interface MeterPrice {
  unit: CanonicalUnit
  /** Ascending by `from`. A single entry means a flat rate. */
  tiers: Tier[]
  meterId?: string
  service?: string
  product?: string
  sku?: string
  meter?: string
  /** The raw unitOfMeasure from the API, kept for traceability. */
  apiUnit?: string
  effectiveStartDate?: string
  /** Set when the rate comes from manual-overrides.json rather than the API. */
  manual?: { source: string; checked: string; reviewBy: string }
}

export interface VmPrice {
  /** PAYG Linux rate, GBP per hour. */
  linux: number
  /** PAYG Windows rate (includes the Windows Server licence), GBP per hour. */
  windows?: number
  /** Reservation term prices as published (total for the term, GBP). */
  ri1yTerm?: number
  ri3yTerm?: number
  /** Savings plan hourly rates (Linux compute), GBP per hour. */
  sp1y?: number
  sp3y?: number
}

export interface Snapshot {
  schema: 1
  region: RegionId
  currency: 'GBP'
  /** ISO timestamp of when the rates were retrieved. */
  retrievedAt: string
  /** 'sample' marks hand-entered development data, never Microsoft prices. */
  source: 'azure-retail-prices-api' | 'sample'
  apiVersion?: string
  meters: Record<string, MeterPrice>
  vms: Record<string, VmPrice>
  /** Meter keys the pipeline could not find; shown as "rate unavailable". */
  missing?: string[]
}

export const REGIONS: { id: RegionId; name: string }[] = [
  { id: 'uksouth', name: 'UK South' },
  { id: 'ukwest', name: 'UK West' },
]

export function regionName(id: RegionId): string {
  return REGIONS.find((r) => r.id === id)?.name ?? id
}
