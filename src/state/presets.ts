// Starting architectures. Each preset is a named workload group with
// sensible defaults so nobody starts from an empty page.

import { getResource } from '../engine/resources.ts'
import type { Config, Env, Estimate, Item } from '../engine/types.ts'

let seq = 0
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function makeItem(type: string, group: string, env: Env, name?: string, config: Config = {}, hours?: number): Item {
  const def = getResource(type)
  if (!def) throw new Error(`Unknown resource type ${type}`)
  return { id: newId(), type, name: name ?? def.name, group, env, config: { ...def.defaults, ...config }, hours: hours ?? null }
}

export interface Preset {
  id: string
  name: string
  description: string
  build: () => { group: string; items: Item[] }
}

export const PRESETS: Preset[] = [
  {
    id: 'hub',
    name: 'Hub (platform connectivity)',
    description: 'Azure Firewall, VPN gateway, Bastion, DNS resolver, private DNS, peering and egress.',
    build: () => {
      const g = 'Platform connectivity'
      const e: Env = 'Production'
      return {
        group: g,
        items: [
          makeItem('firewall', g, e, 'Hub firewall', { sku: 'Standard', gb: 2000 }),
          makeItem('vpnGateway', g, e, 'Hub VPN gateway', { sku: 'VpnGw2AZ', s2s: 2 }),
          makeItem('bastion', g, e, 'Hub Bastion', { sku: 'Standard', units: 2 }),
          makeItem('publicIp', g, e, 'Public IPs (firewall, VPN, Bastion)', { count: 4 }),
          makeItem('dnsResolver', g, e, 'DNS Private Resolver'),
          makeItem('dns', g, e, 'Private DNS zones', { privateZones: 25, privateQueriesM: 200 }),
          makeItem('vnetPeering', g, e, 'Hub to spokes peering', { ab: 1000, ba: 1000 }),
          makeItem('logAnalytics', g, e, 'Platform Log Analytics', { gb: 100, retention: 90 }),
          makeItem('egress', g, e, 'Internet egress', { internet: 500 }),
        ],
      }
    },
  },
  {
    id: 'app',
    name: 'Application spoke',
    description: 'Application Gateway with WAF, web VMs, Azure SQL, private endpoints, Key Vault and storage.',
    build: () => {
      const g = 'Application landing zone'
      const e: Env = 'Production'
      return {
        group: g,
        items: [
          makeItem('appGateway', g, e, 'App Gateway WAF', { sku: 'WAF_v2', cu: 5 }),
          makeItem('vm', g, e, 'Web tier VMs', { sku: 'Standard_D4s_v5', os: 'windows', count: 2 }),
          makeItem('sqlDb', g, e, 'Application database', { vcores: 4, storage: 250 }),
          makeItem('privateEndpoint', g, e, 'Private endpoints', { count: 3 }),
          makeItem('keyVault', g, e, 'Key Vault'),
          makeItem('blob', g, e, 'Application storage', { gb: 500 }),
          makeItem('logAnalytics', g, e, 'Application insights workspace', { gb: 20, retention: 31, free: false }),
        ],
      }
    },
  },
  {
    id: 'devtest',
    name: 'Dev/test spoke',
    description: 'Office-hours VMs and a small App Service plan and database for non-production.',
    build: () => {
      const g = 'Dev/test'
      const e: Env = 'Non-production'
      return {
        group: g,
        items: [
          makeItem('vm', g, e, 'Dev VMs (office hours)', { sku: 'Standard_B2ms', os: 'linux', count: 3, osDisk: 'standardssd.E10' }, 217),
          makeItem('appService', g, e, 'Dev App Service plan', { plan: 'P0v3', count: 1 }),
          makeItem('sqlDb', g, e, 'Dev database', { vcores: 2, storage: 50 }),
          makeItem('privateEndpoint', g, e, 'Private endpoints', { count: 2, in: 10, out: 10 }),
        ],
      }
    },
  },
  {
    id: 'avd',
    name: 'Azure Virtual Desktop',
    description: 'Pooled multi-session hosts on an extended schedule, with OS disks and monitoring.',
    build: () => {
      const g = 'Azure Virtual Desktop'
      const e: Env = 'Production'
      return {
        group: g,
        items: [
          makeItem('vm', g, e, 'AVD session hosts', { sku: 'Standard_D8as_v5', os: 'windows', count: 10, ahb: true, osDisk: 'standardssd.E10' }, 450),
          makeItem('logAnalytics', g, e, 'AVD Insights workspace', { gb: 30, retention: 31, free: false }),
          makeItem('custom', g, e, 'FSLogix profile storage (Azure Files Premium)', { amount: 0 }),
        ],
      }
    },
  },
  {
    id: 'aks',
    name: 'AKS cluster',
    description: 'Standard tier cluster with system and user node pools, load balancer, NAT gateway and logs.',
    build: () => {
      const g = 'AKS platform'
      const e: Env = 'Production'
      return {
        group: g,
        items: [
          makeItem('aks', g, e, 'AKS control plane', { tier: 'Standard' }),
          makeItem('vm', g, e, 'System node pool', { sku: 'Standard_D4s_v5', count: 3, osDisk: 'premium.P10' }),
          makeItem('vm', g, e, 'User node pool', { sku: 'Standard_D8s_v5', count: 3, osDisk: 'premium.P10' }),
          makeItem('loadBalancer', g, e, 'AKS load balancer', { rules: 5, gb: 1000 }),
          makeItem('natGateway', g, e, 'Cluster egress NAT', { gb: 500 }),
          makeItem('publicIp', g, e, 'Public IPs', { count: 2 }),
          makeItem('logAnalytics', g, e, 'Container insights', { gb: 150, retention: 31, free: false }),
        ],
      }
    },
  },
  {
    id: 'data',
    name: 'Data platform',
    description: 'Azure SQL, data lake storage, private endpoints and Key Vault.',
    build: () => {
      const g = 'Data platform'
      const e: Env = 'Production'
      return {
        group: g,
        items: [
          makeItem('sqlDb', g, e, 'Reporting databases', { vcores: 8, count: 2, storage: 500 }),
          makeItem('blob', g, e, 'Data lake (hot)', { gb: 5000, redundancy: 'ZRS', writesM: 20, readsM: 100 }),
          makeItem('blob', g, e, 'Data lake archive', { tier: 'Cool', gb: 20000, writesM: 1, readsM: 1 }),
          makeItem('privateEndpoint', g, e, 'Private endpoints', { count: 4, in: 500, out: 500 }),
          makeItem('keyVault', g, e, 'Key Vault'),
        ],
      }
    },
  },
]

/** The month after today, as YYYY-MM: a sensible default for month 1 of a ramp. */
export function nextMonth(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function emptyEstimate(): Estimate {
  return {
    v: 1,
    title: 'Azure estimate',
    client: '',
    preparedBy: '',
    version: '1.0',
    status: 'Indicative',
    region: 'uksouth',
    drRegion: 'ukwest',
    hours: 730,
    discountPct: 0,
    contingencyPct: 0,
    confidence: '±20%',
    termMonths: 36,
    startMonth: nextMonth(),
    groups: [],
    ramps: {},
    items: [],
    assumptions: '',
    exclusions: '',
    partner: { include: false, route: '', funding: '', contacts: '', opportunityId: '' },
  }
}

export function addPreset(est: Estimate, preset: Preset): Estimate {
  const { group, items } = preset.build()
  let name = group
  for (let i = 2; est.groups.includes(name); i++) name = `${group} ${i}`
  const renamed = items.map((it) => ({ ...it, group: name }))
  return { ...est, groups: [...est.groups, name], ramps: { ...est.ramps, [name]: { start: 1, ramp: 1, end: null } }, items: [...est.items, ...renamed] }
}
