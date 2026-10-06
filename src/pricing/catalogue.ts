// Meter catalogue: ties every SevenThirty input to Azure Retail Prices API
// rows. Used by scripts/fetch-prices.ts (the pipeline) and to build the
// development sample snapshot. The site itself never sees these matchers.
//
// Product and meter names are matched case-insensitively with regular
// expressions so small renames by Microsoft do not silently drop a meter.
// When a meter cannot be found the pipeline lists it under `missing` and the
// UI shows "rate unavailable" rather than inventing a number.
//
// `sample` values are hand-entered development placeholders. They are NOT
// Microsoft prices and are only used when no live snapshot exists.

import type { CanonicalUnit, Tier } from './types.ts'
import { APP_SERVICE_PLANS, BLOB_REDUNDANCY, BLOB_TIERS, DISK_SIZES, ER_BANDWIDTHS, ERGW_SKUS, VPN_SKUS } from './skus.ts'

export interface MeterDef {
  key: string
  /** Candidate serviceName values, tried in order (API names drift). */
  services: string[]
  product?: RegExp
  sku?: RegExp
  meter?: RegExp
  /** Expected canonical unit. A different unit fails validation. */
  unit: CanonicalUnit
  /** Units the engine can also accept for this meter (e.g. hour or month). */
  altUnits?: CanonicalUnit[]
  required?: boolean
  sample: number | Tier[]
}

const defs: MeterDef[] = []
const add = (d: MeterDef) => defs.push(d)
const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')

// ---------------------------------------------------------------- Networking

add({ key: 'pip.standard', services: ['Virtual Network'], product: /IP Addresses/i, meter: /Standard IPv4 Static Public IP/i, unit: 'hour', required: true, sample: 0.004 })

add({ key: 'natgw.hour', services: ['NAT Gateway', 'Virtual Network'], product: /NAT Gateway/i, meter: /Gateway$/i, unit: 'hour', required: true, sample: 0.0356 })
add({ key: 'natgw.gb', services: ['NAT Gateway', 'Virtual Network'], product: /NAT Gateway/i, meter: /Data Processed/i, unit: 'gb', required: true, sample: 0.0356 })

add({ key: 'peering.intra.ingress', services: ['Virtual Network'], meter: /Intra-?Region Ingress/i, unit: 'gb', required: true, sample: 0.008 })
add({ key: 'peering.intra.egress', services: ['Virtual Network'], meter: /Intra-?Region Egress/i, unit: 'gb', required: true, sample: 0.008 })
add({ key: 'peering.global.ingress', services: ['Virtual Network'], meter: /Inter-?Region Ingress/i, unit: 'gb', sample: 0.028 })
add({ key: 'peering.global.egress', services: ['Virtual Network'], meter: /Inter-?Region Egress/i, unit: 'gb', sample: 0.028 })

const vpnSample: Record<string, number> = { VpnGw1: 0.152, VpnGw2: 0.392, VpnGw3: 1.0, VpnGw4: 1.68, VpnGw5: 2.92, VpnGw1AZ: 0.289, VpnGw2AZ: 0.451, VpnGw3AZ: 1.15, VpnGw4AZ: 1.932, VpnGw5AZ: 3.358 }
for (const s of VPN_SKUS) {
  add({ key: `vpngw.${s}`, services: ['VPN Gateway'], sku: exact(s), meter: new RegExp(`^${s}$`, 'i'), unit: 'hour', required: s === 'VpnGw1AZ', sample: vpnSample[s] })
}
add({ key: 'vpngw.s2s', services: ['VPN Gateway'], meter: /S2S/i, unit: 'hour', sample: 0.012 })
add({ key: 'vpngw.p2s', services: ['VPN Gateway'], meter: /P2S/i, unit: 'hour', sample: 0.008 })

const ergwSample: Record<string, number> = { ErGw1AZ: 0.335, ErGw2AZ: 0.656, ErGw3AZ: 1.384 }
for (const s of ERGW_SKUS) {
  add({ key: `ergw.${s}`, services: ['ExpressRoute'], sku: exact(s), meter: new RegExp(s, 'i'), unit: 'hour', sample: ergwSample[s] })
}

const erMetered = [44, 80, 140, 240, 350, 700, 1500, 2800]
const erUnlimited = [240, 460, 860, 2000, 4560, 8200, 17000, 32000]
ER_BANDWIDTHS.forEach(({ id, label: bw }, i) => {
  add({ key: `er.metered.${id}`, services: ['ExpressRoute'], sku: /Standard.*Metered/i, meter: new RegExp(`^${bw}`, 'i'), unit: 'month', sample: erMetered[i] })
  add({ key: `er.unlimited.${id}`, services: ['ExpressRoute'], sku: /Standard.*Unlimited/i, meter: new RegExp(`^${bw}`, 'i'), unit: 'month', sample: erUnlimited[i] })
})
add({ key: 'er.dataout', services: ['ExpressRoute'], sku: /Metered/i, meter: /Data Transfer Out/i, unit: 'gb', sample: 0.02 })

const fw: [string, number, number][] = [['Basic', 0.316, 0.052], ['Standard', 1.0, 0.0128], ['Premium', 1.4, 0.0128]]
for (const [s, h, gb] of fw) {
  add({ key: `fw.${s.toLowerCase()}.hour`, services: ['Azure Firewall'], sku: exact(s), meter: /Deployment/i, unit: 'hour', required: s === 'Standard', sample: h })
  add({ key: `fw.${s.toLowerCase()}.gb`, services: ['Azure Firewall'], sku: exact(s), meter: /Data Processed/i, unit: 'gb', required: s === 'Standard', sample: gb })
}

const bastion: [string, number][] = [['Basic', 0.152], ['Standard', 0.232], ['Premium', 0.36]]
for (const [s, h] of bastion) {
  add({ key: `bastion.${s.toLowerCase()}.hour`, services: ['Azure Bastion'], sku: exact(s), meter: /^(?!.*Additional).*Gateway/i, unit: 'hour', required: s === 'Standard', sample: h })
}
add({ key: 'bastion.standard.unit', services: ['Azure Bastion'], sku: /^Standard$/i, meter: /Additional Gateway/i, unit: 'hour', sample: 0.112 })
add({ key: 'bastion.premium.unit', services: ['Azure Bastion'], sku: /^Premium$/i, meter: /Additional Gateway/i, unit: 'hour', sample: 0.176 })

add({ key: 'lb.included', services: ['Load Balancer'], sku: /^Standard$/i, meter: /Included LB Rules/i, unit: 'hour', required: true, sample: 0.02 })
add({ key: 'lb.overage', services: ['Load Balancer'], sku: /^Standard$/i, meter: /Overage LB Rules/i, unit: 'hour', sample: 0.008 })
add({ key: 'lb.gb', services: ['Load Balancer'], sku: /^Standard$/i, meter: /Data Processed/i, unit: 'gb', sample: 0.004 })

const agw: [string, number, number][] = [['Standard_v2', 0.197, 0.0064], ['WAF_v2', 0.354, 0.0115]]
for (const [s, fixed, cu] of agw) {
  add({ key: `agw.${s}.fixed`, services: ['Application Gateway'], sku: exact(s), meter: /Fixed Cost/i, unit: 'hour', required: true, sample: fixed })
  add({ key: `agw.${s}.cu`, services: ['Application Gateway'], sku: exact(s), meter: /Capacity Units?/i, unit: 'hour', required: true, sample: cu })
}

for (const [s, base, req] of [['Standard', 28, 0.0072], ['Premium', 264, 0.0096]] as [string, number, number][]) {
  add({ key: `afd.${s.toLowerCase()}.base`, services: ['Azure Front Door Service'], sku: exact(s), meter: /Base Fees?/i, unit: 'month', sample: base })
  add({ key: `afd.${s.toLowerCase()}.requests`, services: ['Azure Front Door Service'], sku: exact(s), meter: /Requests/i, unit: '10k', sample: req })
}
add({ key: 'afd.egress', services: ['Azure Front Door Service'], sku: /^Standard$/i, meter: /Data Transfer Out/i, unit: 'gb', sample: [{ from: 0, rate: 0.066 }, { from: 10240, rate: 0.064 }, { from: 51200, rate: 0.048 }] })

add({ key: 'pe.hour', services: ['Virtual Network'], product: /Private Link/i, meter: /Private Endpoint$/i, unit: 'hour', required: true, sample: 0.008 })
add({ key: 'pe.ingress', services: ['Virtual Network'], product: /Private Link/i, meter: /Data Processed - Ingress/i, unit: 'gb', sample: [{ from: 0, rate: 0.008 }, { from: 1048576, rate: 0.004 }] })
add({ key: 'pe.egress', services: ['Virtual Network'], product: /Private Link/i, meter: /Data Processed - Egress/i, unit: 'gb', sample: [{ from: 0, rate: 0.008 }, { from: 1048576, rate: 0.004 }] })

add({ key: 'dns.private.zone', services: ['Azure DNS'], meter: /Private Zone/i, unit: 'month', sample: [{ from: 0, rate: 0.4 }, { from: 25, rate: 0.08 }] })
add({ key: 'dns.private.queries', services: ['Azure DNS'], meter: /Private Queries/i, unit: '1m', sample: [{ from: 0, rate: 0.32 }, { from: 1000, rate: 0.16 }] })
add({ key: 'dns.public.zone', services: ['Azure DNS'], meter: /Public Zone/i, unit: 'month', sample: [{ from: 0, rate: 0.4 }, { from: 25, rate: 0.08 }] })
add({ key: 'dns.public.queries', services: ['Azure DNS'], meter: /Public Queries/i, unit: '1m', sample: [{ from: 0, rate: 0.32 }, { from: 1000, rate: 0.16 }] })
add({ key: 'dnsr.inbound', services: ['Azure DNS', 'Azure DNS Private Resolver'], product: /Resolver/i, meter: /Inbound Endpoint/i, unit: 'hour', altUnits: ['month'], sample: 0.197 })
add({ key: 'dnsr.outbound', services: ['Azure DNS', 'Azure DNS Private Resolver'], product: /Resolver/i, meter: /Outbound Endpoint/i, unit: 'hour', altUnits: ['month'], sample: 0.197 })

add({ key: 'ddos.network', services: ['Azure DDOS Protection'], meter: /^(Network )?Protection$/i, unit: 'month', sample: 2355 })
add({ key: 'ddos.overage', services: ['Azure DDOS Protection'], meter: /Overage/i, unit: 'month', sample: 23.6 })
add({ key: 'ddos.ip', services: ['Azure DDOS Protection'], meter: /IP Protection/i, unit: 'month', sample: 159 })

add({ key: 'bw.internet', services: ['Bandwidth'], meter: /^Standard Data Transfer Out$/i, unit: 'gb', required: true, sample: [{ from: 0, rate: 0 }, { from: 100, rate: 0.07 }, { from: 10340, rate: 0.0664 }, { from: 51300, rate: 0.056 }, { from: 153700, rate: 0.04 }] })
add({ key: 'bw.interregion', services: ['Bandwidth'], meter: /Intra Continent Data Transfer Out/i, unit: 'gb', sample: 0.016 })

// ------------------------------------------------------------------- Compute

const DISK_METERS = {
  premium: { prefix: 'P', product: /^Premium SSD Managed Disks$/i, sample: [4.22, 8.17, 15.77, 30.42, 58.58, 108.14, 207.24, 396.46] },
  standardssd: { prefix: 'E', product: /^Standard SSD Managed Disks$/i, sample: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76] },
  standardhdd: { prefix: 'S', product: /^Standard HDD Managed Disks$/i, sample: [1.23, 2.41, 4.71, 9.06, 17.41, 32.77, 62.26, 118.78] },
}
for (const [type, d] of Object.entries(DISK_METERS)) {
  DISK_SIZES.forEach((s, i) => {
    const name = `${d.prefix}${s.tier}`
    add({ key: `disk.${type}.${name}`, services: ['Storage'], product: d.product, sku: new RegExp(`^${name} LRS$`, 'i'), meter: new RegExp(`^${name} LRS Disk$`, 'i'), unit: 'month', required: name === 'P10', sample: d.sample[i] })
  })
}

add({ key: 'aks.standard', services: ['Azure Kubernetes Service'], sku: /^Standard$/i, meter: /Uptime SLA|Standard/i, unit: 'hour', sample: 0.08 })

// ------------------------------------------------------------------ Platform

const APP_SERVICE_SAMPLE: Record<string, { linux: number; windows: number }> = {
  B1: { linux: 0.0144, windows: 0.06 },
  B2: { linux: 0.0288, windows: 0.12 },
  B3: { linux: 0.0568, windows: 0.24 },
  S1: { linux: 0.076, windows: 0.08 },
  S2: { linux: 0.152, windows: 0.16 },
  S3: { linux: 0.304, windows: 0.32 },
  P0v3: { linux: 0.0616, windows: 0.1352 },
  P1v3: { linux: 0.124, windows: 0.24 },
  P2v3: { linux: 0.248, windows: 0.48 },
  P3v3: { linux: 0.496, windows: 0.96 },
}
for (const p of APP_SERVICE_PLANS) {
  for (const os of ['linux', 'windows'] as const) {
    const product = new RegExp(`${p.tier} Plan${os === 'linux' ? ' - Linux' : ''}$`, 'i')
    add({ key: `appsvc.${os}.${p.sku}`, services: ['Azure App Service'], product, sku: exact(p.api), unit: 'hour', required: p.sku === 'P1v3', sample: APP_SERVICE_SAMPLE[p.sku][os] })
  }
}

// ---------------------------------------------------------------------- Data

add({ key: 'sql.gp.compute', services: ['SQL Database'], product: /Single.*General Purpose - Compute Gen5/i, meter: /^vCore$/i, unit: 'hour', required: true, sample: 0.202 })
add({ key: 'sql.gp.licence', services: ['SQL Database'], product: /Single.*General Purpose - SQL License/i, meter: /vCore/i, unit: 'hour', sample: 0.2 })
add({ key: 'sql.gp.storage', services: ['SQL Database'], product: /Single.*General Purpose - Storage/i, meter: /Data Stored/i, unit: 'gb', sample: 0.092 })

const blobBase = { Hot: [0.0144, 0.04, 0.0032], Cool: [0.008, 0.08, 0.008], Cold: [0.0029, 0.144, 0.08], Archive: [0.0008, 0.08, 4.0] }
const redFactor = { LRS: 1, ZRS: 1.25, GRS: 2 }
for (const t of BLOB_TIERS) {
  for (const r of BLOB_REDUNDANCY) {
    const [stored, write, read] = blobBase[t]
    const f = redFactor[r]
    const k = `blob.${t.toLowerCase()}.${r.toLowerCase()}`
    const sku = exact(`${t} ${r}`)
    const product = /^(General Block Blob v2|Blob Storage)$/i
    add({ key: `${k}.stored`, services: ['Storage'], product, sku, meter: /Data Stored$/i, unit: 'gb', required: k === 'blob.hot.lrs', sample: t === 'Hot' ? [{ from: 0, rate: stored * f }, { from: 51200, rate: stored * f * 0.96 }] : stored * f })
    add({ key: `${k}.write`, services: ['Storage'], product, sku, meter: /^(?!.*Iterative).*Write Operations$/i, unit: '10k', sample: write * f })
    add({ key: `${k}.read`, services: ['Storage'], product, sku, meter: /^(?!.*Iterative).*Read Operations$/i, unit: '10k', sample: read })
  }
}

// --------------------------------------------------- Operations and security

add({ key: 'la.ingest', services: ['Log Analytics'], meter: /(Analytics Logs|Pay-as-you-go) Data Ingestion/i, unit: 'gb', required: true, sample: 2.39 })
add({ key: 'la.retention', services: ['Log Analytics'], meter: /Data Retention/i, unit: 'gb', sample: 0.08 })
add({ key: 'kv.ops', services: ['Key Vault'], sku: /^Standard$/i, meter: /^Operations$/i, unit: '10k', sample: 0.024 })

export const METER_DEFS: readonly MeterDef[] = defs

/** Development-only VM sample rates per vCPU-hour, by family. Not Microsoft prices. */
export const VM_SAMPLE_PER_VCPU: Record<string, number> = {
  Bs: 0.0193,
  Basv2: 0.0161,
  Dsv5: 0.045,
  Dasv5: 0.041,
  Ddsv5: 0.054,
  Esv5: 0.06,
  Easv5: 0.054,
  Fsv2: 0.04,
}
export const VM_SAMPLE_WINDOWS_PER_VCPU = 0.0368
