// Resource calculators. Each one declares its inputs, defaults, whether it
// uses the hours model, whether it can be paused, and how it turns a
// configuration into priced lines. Rates always come from the snapshot.

import { APP_SERVICE_PLANS, BLOB_REDUNDANCY, BLOB_TIERS, DISK_SIZES, DISK_TYPES, ER_BANDWIDTHS, ERGW_SKUS, VPN_SKUS, type DiskType } from '../pricing/skus.ts'
import { findVmSku, VM_SKUS } from '../pricing/vmSkus.ts'
import { count, data, standing } from './charges.ts'
import { HOURS_PER_MONTH } from '../pricing/normalise.ts'
import type { Config, Field, Line, Option, PriceContext, ResourceDef } from './types.ts'

const n = (cfg: Config, k: string) => Math.max(0, Number(cfg[k]) || 0)
const s = (cfg: Config, k: string) => String(cfg[k] ?? '')
const b = (cfg: Config, k: string) => cfg[k] === true
const opts = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: v }))
/** Drops lines with nothing to bill, but keeps free-tier usage so the allowance stays visible. */
const nonZero = (lines: Line[]) =>
  lines.filter((l) => {
    const w = l.working
    if (l.unavailable) return (l.quantity ?? 1) !== 0
    if (l.amount !== 0 || !w) return true
    if (w.t === 'hourly' || w.t === 'monthly') return w.qty !== 0
    if (w.t === 'gb') return w.gb !== 0
    if (w.t === 'count') return w.count !== 0
    return true
  })

const countField = (label = 'Quantity', more = false): Field => ({ key: 'count', label, kind: 'number', min: 0, step: 1, more })
const gbField = (key: string, label: string, more = false, help?: string): Field => ({ key, label, kind: 'number', unit: 'GB per month', min: 0, step: 10, more, help })

const diskOptions: Option[] = Object.entries(DISK_TYPES).flatMap(([type, d]) =>
  DISK_SIZES.map((sz) => ({ value: `${type}.${d.prefix}${sz.tier}`, label: `${d.prefix}${sz.tier} · ${d.label} · ${sz.gib} GiB` })),
)

function diskLine(ctx: PriceContext, value: string, qty: number, label: string): Line | null {
  if (!value || value === 'none') return null
  const [type, name] = value.split('.') as [DiskType, string]
  const d = DISK_TYPES[type]
  return standing(ctx, `${label} ${name} (${d?.label ?? type})`, `disk.${type}.${name}`, qty, {
    noun: 'disk',
    note: 'Managed disks bill for provisioned size every month, even when the VM is stopped.',
  })
}

export const RESOURCES: ResourceDef[] = [
  // ------------------------------------------------------------ Networking
  {
    type: 'publicIp',
    name: 'Public IP address',
    family: 'Networking',
    arm: 'Microsoft.Network/publicIPAddresses',
    description: 'Standard SKU static IPv4. Bills from creation, whether or not it is attached.',
    hourly: true,
    pausable: false,
    defaults: { count: 1 },
    fields: [countField('Public IPs')],
    summary: (c) => `${n(c, 'count')} × Standard IPv4`,
    lines: (c, ctx) => [standing(ctx, 'Standard static IPv4', 'pip.standard', n(c, 'count'))],
  },
  {
    type: 'natGateway',
    name: 'NAT Gateway',
    family: 'Networking',
    arm: 'Microsoft.Network/natGateways',
    description: 'Outbound internet for subnets. Gateway hours plus data processed; attached public IPs are priced separately.',
    hourly: true,
    pausable: false,
    defaults: { count: 1, gb: 500 },
    fields: [countField('NAT gateways'), gbField('gb', 'Data processed')],
    summary: (c) => `${n(c, 'count')} gateway · ${n(c, 'gb')} GB`,
    lines: (c, ctx) => [
      standing(ctx, 'NAT gateway', 'natgw.hour', n(c, 'count')),
      data(ctx, 'Data processed', 'natgw.gb', n(c, 'gb')),
    ],
  },
  {
    type: 'vnetPeering',
    name: 'VNet peering',
    family: 'Networking',
    arm: 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings',
    description: 'Charged on both sides: egress from the sending VNet and ingress into the receiving VNet. Both directions shown.',
    hourly: false,
    pausable: false,
    defaults: { scope: 'intra', ab: 500, ba: 500 },
    fields: [
      { key: 'scope', label: 'Peering type', kind: 'select', options: [{ value: 'intra', label: 'Same region' }, { value: 'global', label: 'Global (cross-region)' }] },
      gbField('ab', 'Data from VNet A to VNet B'),
      gbField('ba', 'Data from VNet B to VNet A'),
    ],
    summary: (c) => `${s(c, 'scope') === 'global' ? 'Global' : 'Same region'} · ${n(c, 'ab') + n(c, 'ba')} GB total`,
    lines: (c, ctx) => {
      const p = s(c, 'scope') === 'global' ? 'peering.global' : 'peering.intra'
      return [
        data(ctx, 'A → B: egress from A', `${p}.egress`, n(c, 'ab')),
        data(ctx, 'A → B: ingress into B', `${p}.ingress`, n(c, 'ab')),
        data(ctx, 'B → A: egress from B', `${p}.egress`, n(c, 'ba')),
        data(ctx, 'B → A: ingress into A', `${p}.ingress`, n(c, 'ba')),
      ]
    },
  },
  {
    type: 'vpnGateway',
    name: 'VPN Gateway',
    family: 'Networking',
    arm: 'Microsoft.Network/virtualNetworkGateways',
    description: 'Site-to-site and point-to-site VPN. Active-active uses the same gateway price; its second public IP is priced separately.',
    hourly: true,
    pausable: false,
    defaults: { sku: 'VpnGw1AZ', count: 1, s2s: 2, s2sIncluded: 10, p2s: 0, p2sIncluded: 128 },
    fields: [
      { key: 'sku', label: 'Gateway SKU', kind: 'select', options: opts(VPN_SKUS) },
      countField('Gateways'),
      { key: 's2s', label: 'Site-to-site tunnels', kind: 'number', min: 0, step: 1 },
      { key: 's2sIncluded', label: 'S2S tunnels included per gateway', kind: 'number', min: 0, step: 1, more: true, help: 'Check the included tunnels for the SKU on the VPN Gateway pricing page.' },
      { key: 'p2s', label: 'Point-to-site connections', kind: 'number', min: 0, step: 1, more: true },
      { key: 'p2sIncluded', label: 'P2S connections included per gateway', kind: 'number', min: 0, step: 1, more: true },
    ],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'sku')} · ${n(c, 's2s')} S2S`,
    lines: (c, ctx) =>
      nonZero([
        standing(ctx, `${s(c, 'sku')} gateway`, `vpngw.${s(c, 'sku')}`, n(c, 'count')),
        standing(ctx, 'Additional S2S tunnels', 'vpngw.s2s', Math.max(0, n(c, 's2s') - n(c, 's2sIncluded') * n(c, 'count')), { note: `First ${n(c, 's2sIncluded')} per gateway included.` }),
        standing(ctx, 'Additional P2S connections', 'vpngw.p2s', Math.max(0, n(c, 'p2s') - n(c, 'p2sIncluded') * n(c, 'count')), { note: `First ${n(c, 'p2sIncluded')} per gateway included.` }),
      ]),
    notes: ['Data leaving Azure over the VPN is billed as outbound data transfer. Add it with an Internet egress line.'],
  },
  {
    type: 'erGateway',
    name: 'ExpressRoute gateway',
    family: 'Networking',
    arm: 'Microsoft.Network/virtualNetworkGateways',
    description: 'The VNet side of ExpressRoute. The circuit is a separate line.',
    hourly: true,
    pausable: false,
    defaults: { sku: 'ErGw1AZ', count: 1 },
    fields: [{ key: 'sku', label: 'Gateway SKU', kind: 'select', options: opts(ERGW_SKUS) }, countField('Gateways')],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'sku')}`,
    lines: (c, ctx) => [standing(ctx, `${s(c, 'sku')} gateway`, `ergw.${s(c, 'sku')}`, n(c, 'count'))],
  },
  {
    type: 'erCircuit',
    name: 'ExpressRoute circuit',
    family: 'Networking',
    arm: 'Microsoft.Network/expressRouteCircuits',
    description: 'Monthly port charge by bandwidth. Metered plans add outbound data; inbound data is free. Provider (carrier) charges are not included.',
    hourly: false,
    pausable: false,
    defaults: { bandwidth: '1G', plan: 'metered', count: 1, gb: 1000 },
    fields: [
      { key: 'bandwidth', label: 'Bandwidth', kind: 'select', options: ER_BANDWIDTHS.map((x) => ({ value: x.id, label: x.label })) },
      { key: 'plan', label: 'Data plan', kind: 'select', options: [{ value: 'metered', label: 'Metered' }, { value: 'unlimited', label: 'Unlimited' }] },
      countField('Circuits', true),
      { ...gbField('gb', 'Outbound data'), show: (c) => s(c, 'plan') === 'metered' },
    ],
    summary: (c) => `${ER_BANDWIDTHS.find((x) => x.id === s(c, 'bandwidth'))?.label} ${s(c, 'plan')} (Standard)`,
    lines: (c, ctx) =>
      nonZero([
        standing(ctx, `${ER_BANDWIDTHS.find((x) => x.id === s(c, 'bandwidth'))?.label} circuit, ${s(c, 'plan')}`, `er.${s(c, 'plan')}.${s(c, 'bandwidth')}`, n(c, 'count'), { noun: 'circuit' }),
        ...(s(c, 'plan') === 'metered' ? [data(ctx, 'Outbound data (Zone 1)', 'er.dataout', n(c, 'gb'))] : []),
      ]),
  },
  {
    type: 'firewall',
    name: 'Azure Firewall',
    family: 'Networking',
    arm: 'Microsoft.Network/azureFirewalls',
    description: 'Deployment hours plus data processed. Can be deallocated to stop the deployment charge.',
    hourly: true,
    pausable: true,
    defaults: { sku: 'Standard', count: 1, gb: 1000 },
    fields: [
      { key: 'sku', label: 'Tier', kind: 'select', options: opts(['Basic', 'Standard', 'Premium']) },
      countField('Firewalls'),
      gbField('gb', 'Data processed'),
    ],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'sku')} · ${n(c, 'gb')} GB`,
    lines: (c, ctx) => {
      const k = s(c, 'sku').toLowerCase()
      return [standing(ctx, `${s(c, 'sku')} deployment`, `fw.${k}.hour`, n(c, 'count')), data(ctx, 'Data processed', `fw.${k}.gb`, n(c, 'gb'))]
    },
  },
  {
    type: 'bastion',
    name: 'Azure Bastion',
    family: 'Networking',
    arm: 'Microsoft.Network/bastionHosts',
    description: 'Browser-based RDP and SSH. Standard and Premium include 2 scale units; extra units are charged per hour.',
    hourly: true,
    pausable: false,
    defaults: { sku: 'Standard', count: 1, units: 2 },
    fields: [
      { key: 'sku', label: 'Tier', kind: 'select', options: opts(['Basic', 'Standard', 'Premium']) },
      countField('Bastion hosts'),
      { key: 'units', label: 'Scale units (instances)', kind: 'number', min: 2, max: 50, step: 1, show: (c) => s(c, 'sku') !== 'Basic', help: '2 are included in the base price.' },
    ],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'sku')}${s(c, 'sku') !== 'Basic' ? ` · ${n(c, 'units')} units` : ''}`,
    lines: (c, ctx) => {
      const sku = s(c, 'sku')
      const k = sku.toLowerCase()
      const extra = sku === 'Basic' ? 0 : Math.max(0, n(c, 'units') - 2) * n(c, 'count')
      return nonZero([
        standing(ctx, `${sku} host (2 scale units included)`, `bastion.${k}.hour`, n(c, 'count')),
        ...(sku === 'Basic' ? [] : [standing(ctx, 'Additional scale units', `bastion.${k}.unit`, extra)]),
      ])
    },
    notes: ['Outbound data transfer from Bastion sessions is billed separately as data transfer.'],
  },
  {
    type: 'loadBalancer',
    name: 'Load Balancer',
    family: 'Networking',
    arm: 'Microsoft.Network/loadBalancers',
    description: 'Standard SKU. Hourly charge covers the first 5 rules; extra rules are charged per rule per hour, plus data processed.',
    hourly: true,
    pausable: false,
    defaults: { count: 1, rules: 5, gb: 500 },
    fields: [
      countField('Load balancers'),
      { key: 'rules', label: 'Load balancing and outbound rules per load balancer', kind: 'number', min: 0, step: 1 },
      gbField('gb', 'Data processed'),
    ],
    summary: (c) => `${n(c, 'count')} × Standard · ${n(c, 'rules')} rules`,
    lines: (c, ctx) => {
      const lbs = n(c, 'rules') > 0 ? n(c, 'count') : 0
      return nonZero([
        standing(ctx, 'First 5 rules', 'lb.included', lbs, { note: n(c, 'rules') === 0 ? 'No charge with zero rules.' : undefined }),
        standing(ctx, 'Additional rules', 'lb.overage', Math.max(0, n(c, 'rules') - 5) * n(c, 'count')),
        data(ctx, 'Data processed', 'lb.gb', n(c, 'gb')),
      ])
    },
  },
  {
    type: 'appGateway',
    name: 'Application Gateway',
    family: 'Networking',
    arm: 'Microsoft.Network/applicationGateways',
    description: 'v2 SKU: a fixed hourly charge plus capacity units. Size capacity units on average load. Can be stopped to stop billing.',
    hourly: true,
    pausable: true,
    defaults: { sku: 'WAF_v2', count: 1, cu: 5 },
    fields: [
      { key: 'sku', label: 'SKU', kind: 'select', options: opts(['Standard_v2', 'WAF_v2']) },
      countField('Gateways'),
      { key: 'cu', label: 'Average capacity units per gateway', kind: 'number', min: 0, step: 1, help: 'One capacity unit ≈ 2,500 persistent connections, 2.22 Mbps or 1 compute unit. Use the highest of the three.' },
    ],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'sku')} · ${n(c, 'cu')} CU`,
    lines: (c, ctx) => [
      standing(ctx, `${s(c, 'sku')} fixed`, `agw.${s(c, 'sku')}.fixed`, n(c, 'count')),
      standing(ctx, 'Capacity units', `agw.${s(c, 'sku')}.cu`, n(c, 'cu') * n(c, 'count')),
    ],
  },
  {
    type: 'frontDoor',
    name: 'Front Door',
    family: 'Networking',
    arm: 'Microsoft.Cdn/profiles',
    description: 'Global entry point and CDN. Monthly base fee per profile, plus requests and data transfer to clients.',
    hourly: false,
    pausable: false,
    defaults: { tier: 'Standard', count: 1, requestsM: 10, gb: 500 },
    fields: [
      { key: 'tier', label: 'Tier', kind: 'select', options: opts(['Standard', 'Premium']) },
      countField('Profiles', true),
      { key: 'requestsM', label: 'Requests', unit: 'million per month', kind: 'number', min: 0, step: 1 },
      gbField('gb', 'Data transfer to clients (Zone 1)'),
    ],
    summary: (c) => `${s(c, 'tier')} · ${n(c, 'requestsM')}M requests · ${n(c, 'gb')} GB`,
    lines: (c, ctx) => {
      const k = s(c, 'tier').toLowerCase()
      return [
        standing(ctx, `${s(c, 'tier')} base fee`, `afd.${k}.base`, n(c, 'count'), { noun: 'profile' }),
        count(ctx, 'Requests', `afd.${k}.requests`, n(c, 'requestsM') * 1e6, 'requests'),
        data(ctx, 'Data transfer to clients', 'afd.egress', n(c, 'gb')),
      ]
    },
    notes: ['Data transfer from Front Door to origin is charged separately and is not modelled here.'],
  },
  {
    type: 'privateEndpoint',
    name: 'Private Endpoint',
    family: 'Networking',
    arm: 'Microsoft.Network/privateEndpoints',
    description: 'Per endpoint per hour, plus data processed in each direction.',
    hourly: true,
    pausable: false,
    defaults: { count: 3, in: 100, out: 100 },
    fields: [countField('Private endpoints'), gbField('in', 'Data processed inbound'), gbField('out', 'Data processed outbound')],
    summary: (c) => `${n(c, 'count')} endpoints · ${n(c, 'in') + n(c, 'out')} GB`,
    lines: (c, ctx) => [
      standing(ctx, 'Private endpoints', 'pe.hour', n(c, 'count')),
      data(ctx, 'Data processed inbound', 'pe.ingress', n(c, 'in')),
      data(ctx, 'Data processed outbound', 'pe.egress', n(c, 'out')),
    ],
  },
  {
    type: 'dns',
    name: 'Azure DNS zones',
    family: 'Networking',
    arm: 'Microsoft.Network/privateDnsZones',
    description: 'Hosted zones per month (first 25 at a higher rate) and queries per million.',
    hourly: false,
    pausable: false,
    defaults: { privateZones: 20, privateQueriesM: 100, publicZones: 0, publicQueriesM: 0 },
    fields: [
      { key: 'privateZones', label: 'Private DNS zones', kind: 'number', min: 0, step: 1 },
      { key: 'privateQueriesM', label: 'Private DNS queries', unit: 'million per month', kind: 'number', min: 0, step: 10 },
      { key: 'publicZones', label: 'Public DNS zones', kind: 'number', min: 0, step: 1, more: true },
      { key: 'publicQueriesM', label: 'Public DNS queries', unit: 'million per month', kind: 'number', min: 0, step: 10, more: true },
    ],
    summary: (c) => `${n(c, 'privateZones')} private · ${n(c, 'publicZones')} public zones`,
    lines: (c, ctx) =>
      nonZero([
        standing(ctx, 'Private zones', 'dns.private.zone', n(c, 'privateZones'), { noun: 'zones' }),
        count(ctx, 'Private queries', 'dns.private.queries', n(c, 'privateQueriesM') * 1e6, 'queries'),
        standing(ctx, 'Public zones', 'dns.public.zone', n(c, 'publicZones'), { noun: 'zones' }),
        count(ctx, 'Public queries', 'dns.public.queries', n(c, 'publicQueriesM') * 1e6, 'queries'),
      ]),
  },
  {
    type: 'dnsResolver',
    name: 'DNS Private Resolver',
    family: 'Networking',
    arm: 'Microsoft.Network/dnsResolvers',
    description: 'Inbound and outbound endpoints for hybrid DNS.',
    hourly: true,
    pausable: false,
    defaults: { inbound: 1, outbound: 1 },
    fields: [
      { key: 'inbound', label: 'Inbound endpoints', kind: 'number', min: 0, step: 1 },
      { key: 'outbound', label: 'Outbound endpoints', kind: 'number', min: 0, step: 1 },
    ],
    summary: (c) => `${n(c, 'inbound')} in · ${n(c, 'outbound')} out`,
    lines: (c, ctx) =>
      nonZero([
        standing(ctx, 'Inbound endpoints', 'dnsr.inbound', n(c, 'inbound'), { noun: 'endpoints' }),
        standing(ctx, 'Outbound endpoints', 'dnsr.outbound', n(c, 'outbound'), { noun: 'endpoints' }),
      ]),
  },
  {
    type: 'ddos',
    name: 'DDoS Protection',
    family: 'Networking',
    arm: 'Microsoft.Network/ddosProtectionPlans',
    description: 'Network Protection is a monthly plan covering 100 public IPs (shareable across subscriptions in a tenant). IP Protection is per IP.',
    hourly: false,
    pausable: false,
    defaults: { plan: 'network', ips: 10 },
    fields: [
      { key: 'plan', label: 'Plan', kind: 'select', options: [{ value: 'network', label: 'Network Protection' }, { value: 'ip', label: 'IP Protection' }] },
      { key: 'ips', label: 'Protected public IPs', kind: 'number', min: 0, step: 1 },
    ],
    summary: (c) => `${s(c, 'plan') === 'network' ? 'Network' : 'IP'} Protection · ${n(c, 'ips')} IPs`,
    lines: (c, ctx) =>
      s(c, 'plan') === 'network'
        ? nonZero([
            standing(ctx, 'Network Protection plan (100 IPs included)', 'ddos.network', 1, { noun: 'plan' }),
            standing(ctx, 'IPs over 100', 'ddos.overage', Math.max(0, n(c, 'ips') - 100), { noun: 'IPs' }),
          ])
        : [standing(ctx, 'IP Protection', 'ddos.ip', n(c, 'ips'), { noun: 'IPs' })],
  },
  {
    type: 'egress',
    name: 'Data transfer out',
    family: 'Networking',
    arm: 'Bandwidth',
    description: 'Internet egress over the Microsoft network (first 100 GB a month free) and data transfer between Azure regions in Europe.',
    hourly: false,
    pausable: false,
    defaults: { internet: 500, interRegion: 0 },
    fields: [gbField('internet', 'Internet egress', false, 'The 100 GB free tier is per billing account, not per resource.'), gbField('interRegion', 'Inter-region transfer (e.g. UK South to UK West)')],
    summary: (c) => `${n(c, 'internet')} GB internet · ${n(c, 'interRegion')} GB inter-region`,
    lines: (c, ctx) => nonZero([data(ctx, 'Internet egress', 'bw.internet', n(c, 'internet')), data(ctx, 'Inter-region transfer', 'bw.interregion', n(c, 'interRegion'))]),
  },

  // --------------------------------------------------------------- Compute
  {
    type: 'vm',
    name: 'Virtual machine',
    family: 'Compute',
    arm: 'Microsoft.Compute/virtualMachines',
    description: 'Compute per hour. Deallocated VMs stop compute charges; disks still bill.',
    hourly: true,
    pausable: true,
    defaults: { sku: 'Standard_D4s_v5', os: 'linux', count: 2, ahb: false, osDisk: 'premium.P10' },
    fields: [
      { key: 'sku', label: 'Size', kind: 'select', options: VM_SKUS.map((v) => ({ value: v.name, label: `${v.name} · ${v.vcpu} vCPU · ${v.memGb} GB · ${v.note}` })) },
      { key: 'os', label: 'Operating system', kind: 'select', options: [{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows Server' }] },
      countField('VMs'),
      { key: 'ahb', label: 'Client has eligible Windows Server licences (Hybrid Benefit)', kind: 'toggle', show: (c) => s(c, 'os') === 'windows', help: 'Shown as an alternative in the commitment comparison; the list price stays pay-as-you-go.' },
      { key: 'osDisk', label: 'OS disk', kind: 'select', more: true, options: [{ value: 'none', label: 'None (price separately)' }, ...diskOptions] },
    ],
    summary: (c) => {
      const v = findVmSku(s(c, 'sku'))
      return `${n(c, 'count')} × ${s(c, 'sku')}${v ? ` · ${v.vcpu} vCPU · ${v.memGb} GB` : ''} · ${s(c, 'os') === 'windows' ? 'Windows' : 'Linux'}`
    },
    lines: (c, ctx) => {
      const sku = s(c, 'sku')
      const qty = n(c, 'count')
      const vm = ctx.snap.vms[sku]
      const windows = s(c, 'os') === 'windows'
      const label = `${sku} ${windows ? 'Windows' : 'Linux'}`
      const out: Line[] = []
      const winRate = vm?.windows
      if (!vm || (windows && winRate === undefined)) {
        out.push({ label, meterKey: `vm.${sku}`, kind: 'standing', amount: 0, working: null, unavailable: true })
      } else {
        const r = windows ? winRate! : vm.linux
        const licence = windows ? winRate! - vm.linux : 0
        out.push({
          label,
          meterKey: `vm.${sku}`,
          kind: 'standing',
          amount: qty * r * ctx.hours,
          working: { t: 'hourly', qty, rate: r, hours: ctx.hours },
          note: windows ? 'Includes the Windows Server licence.' : undefined,
          commit: {
            qty,
            hours: ctx.hours,
            compute: vm.linux,
            licence,
            ri1yMonthly: vm.ri1yTerm !== undefined ? vm.ri1yTerm / 12 : undefined,
            ri3yMonthly: vm.ri3yTerm !== undefined ? vm.ri3yTerm / 36 : undefined,
            sp1y: vm.sp1y,
            sp3y: vm.sp3y,
          },
          ahbSaving: windows && b(c, 'ahb') ? qty * licence * ctx.hours : undefined,
        })
      }
      const disk = diskLine(ctx, s(c, 'osDisk'), qty, 'OS disk')
      if (disk) out.push(disk)
      return out
    },
  },
  {
    type: 'disk',
    name: 'Managed disk',
    family: 'Compute',
    arm: 'Microsoft.Compute/disks',
    description: 'Provisioned size per month (LRS). Standard HDD and SSD transaction charges are not included.',
    hourly: false,
    pausable: false,
    defaults: { disk: 'premium.P30', count: 1 },
    fields: [{ key: 'disk', label: 'Disk', kind: 'select', options: diskOptions }, countField('Disks')],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'disk').split('.')[1]}`,
    lines: (c, ctx) => [diskLine(ctx, s(c, 'disk'), n(c, 'count'), 'Data disk')!],
  },

  // -------------------------------------------------------------- Platform
  {
    type: 'appService',
    name: 'App Service plan',
    family: 'Platform',
    arm: 'Microsoft.Web/serverfarms',
    description: 'Per instance per hour. A plan bills while it exists, even with no apps running.',
    hourly: true,
    pausable: false,
    defaults: { os: 'linux', plan: 'P1v3', count: 2 },
    fields: [
      { key: 'os', label: 'Operating system', kind: 'select', options: [{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }] },
      { key: 'plan', label: 'Plan', kind: 'select', options: APP_SERVICE_PLANS.map((p) => ({ value: p.sku, label: `${p.sku} · ${p.tier} · ${p.note}` })) },
      countField('Instances'),
    ],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'plan')} ${s(c, 'os') === 'windows' ? 'Windows' : 'Linux'}`,
    lines: (c, ctx) => [standing(ctx, `${s(c, 'plan')} ${s(c, 'os') === 'windows' ? 'Windows' : 'Linux'} instances`, `appsvc.${s(c, 'os')}.${s(c, 'plan')}`, n(c, 'count'))],
  },
  {
    type: 'aks',
    name: 'AKS cluster management',
    family: 'Platform',
    arm: 'Microsoft.ContainerService/managedClusters',
    description: 'Control plane tier. Add node pools as virtual machine lines.',
    hourly: true,
    pausable: true,
    defaults: { tier: 'Standard', count: 1 },
    fields: [{ key: 'tier', label: 'Tier', kind: 'select', options: [{ value: 'Free', label: 'Free (no uptime SLA)' }, { value: 'Standard', label: 'Standard (uptime SLA)' }] }, countField('Clusters')],
    summary: (c) => `${n(c, 'count')} × ${s(c, 'tier')} tier`,
    lines: (c, ctx) =>
      s(c, 'tier') === 'Free'
        ? [{ label: 'Free tier control plane', meterKey: 'aks.free', kind: 'standing', amount: 0, working: { t: 'monthly', qty: n(c, 'count'), segments: [{ qty: n(c, 'count'), rate: 0 }], noun: 'cluster' } }]
        : [standing(ctx, 'Standard tier control plane', 'aks.standard', n(c, 'count'))],
  },

  // ------------------------------------------------------------------ Data
  {
    type: 'sqlDb',
    name: 'Azure SQL Database',
    family: 'Data',
    arm: 'Microsoft.Sql/servers/databases',
    description: 'vCore General Purpose, provisioned, Standard-series (Gen5). Compute and SQL licence shown separately so Hybrid Benefit is visible.',
    hourly: true,
    pausable: false,
    defaults: { vcores: 4, count: 1, storage: 250, ahb: false },
    fields: [
      { key: 'vcores', label: 'vCores per database', kind: 'select', options: opts(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '24', '32', '40', '80']) },
      countField('Databases'),
      gbField('storage', 'Data storage per database'),
      { key: 'ahb', label: 'Client has eligible SQL Server licences (Hybrid Benefit)', kind: 'toggle', more: true },
    ],
    summary: (c) => `${n(c, 'count')} × GP ${n(c, 'vcores')} vCore · ${n(c, 'storage')} GB`,
    lines: (c, ctx) => {
      const vcores = n(c, 'vcores') * n(c, 'count')
      const licence = standing(ctx, 'SQL licence (vCores)', 'sql.gp.licence', vcores)
      if (b(c, 'ahb')) licence.ahbSaving = licence.amount
      return [standing(ctx, 'Compute (vCores)', 'sql.gp.compute', vcores), licence, data(ctx, 'Data storage', 'sql.gp.storage', n(c, 'storage') * n(c, 'count'), { kind: 'standing' })]
    },
  },
  {
    type: 'blob',
    name: 'Blob storage',
    family: 'Data',
    arm: 'Microsoft.Storage/storageAccounts',
    description: 'General purpose v2 block blobs. Capacity per GB per month plus read and write operations.',
    hourly: false,
    pausable: false,
    defaults: { tier: 'Hot', redundancy: 'LRS', gb: 1000, writesM: 1, readsM: 5 },
    fields: [
      { key: 'tier', label: 'Access tier', kind: 'select', options: opts(BLOB_TIERS) },
      { key: 'redundancy', label: 'Redundancy', kind: 'select', options: opts(BLOB_REDUNDANCY) },
      gbField('gb', 'Capacity stored'),
      { key: 'writesM', label: 'Write operations', unit: 'million per month', kind: 'number', min: 0, step: 1, more: true },
      { key: 'readsM', label: 'Read operations', unit: 'million per month', kind: 'number', min: 0, step: 1, more: true },
    ],
    summary: (c) => `${s(c, 'tier')} ${s(c, 'redundancy')} · ${n(c, 'gb')} GB`,
    lines: (c, ctx) => {
      const k = `blob.${s(c, 'tier').toLowerCase()}.${s(c, 'redundancy').toLowerCase()}`
      return nonZero([
        data(ctx, 'Capacity', `${k}.stored`, n(c, 'gb'), { kind: 'standing' }),
        count(ctx, 'Write operations', `${k}.write`, n(c, 'writesM') * 1e6, 'operations'),
        count(ctx, 'Read operations', `${k}.read`, n(c, 'readsM') * 1e6, 'operations'),
      ])
    },
  },

  // ------------------------------------------------- Operations and security
  {
    type: 'logAnalytics',
    name: 'Log Analytics',
    family: 'Operations',
    arm: 'Microsoft.OperationalInsights/workspaces',
    description: 'Analytics logs, pay-as-you-go. 31 days of retention included; longer retention is charged per GB per month.',
    hourly: false,
    pausable: false,
    defaults: { gb: 50, retention: 90, free: true },
    fields: [
      gbField('gb', 'Data ingested'),
      { key: 'retention', label: 'Interactive retention', unit: 'days', kind: 'select', options: opts(['31', '60', '90', '180', '365', '730']) },
      { key: 'free', label: 'Apply the 5 GB a month free allowance', kind: 'toggle', more: true, help: 'The allowance is per billing account. Apply it to one workspace only.' },
    ],
    summary: (c) => `${n(c, 'gb')} GB a month · ${n(c, 'retention')} days`,
    lines: (c, ctx) => {
      const gb = n(c, 'gb')
      const extraMonths = Math.max(0, n(c, 'retention') - 31) / (HOURS_PER_MONTH / 24)
      const retained = gb * extraMonths
      return nonZero([
        data(ctx, 'Data ingestion', 'la.ingest', gb, { free: b(c, 'free') ? { gb: 5, label: 'monthly allowance' } : undefined }),
        data(ctx, 'Retention beyond 31 days', 'la.retention', retained, {
          kind: 'standing',
          note: `Steady state: ${gb} GB × ${extraMonths.toFixed(2)} extra months held.`,
        }),
      ])
    },
  },
  {
    type: 'keyVault',
    name: 'Key Vault',
    family: 'Operations',
    arm: 'Microsoft.KeyVault/vaults',
    description: 'Standard tier secrets and key operations. HSM-protected keys are not modelled.',
    hourly: false,
    pausable: false,
    defaults: { opsM: 1 },
    fields: [{ key: 'opsM', label: 'Operations', unit: 'million per month', kind: 'number', min: 0, step: 0.1 }],
    summary: (c) => `${n(c, 'opsM')}M operations`,
    lines: (c, ctx) => [count(ctx, 'Operations', 'kv.ops', n(c, 'opsM') * 1e6, 'operations')],
  },

  // ---------------------------------------------------------------- Other
  {
    type: 'custom',
    name: 'Custom line',
    family: 'Other',
    arm: 'User-entered',
    description: 'For anything not modelled: support plans, Marketplace software, partner managed services. Marked as user-entered.',
    hourly: false,
    pausable: true,
    defaults: { amount: 0, usage: false },
    fields: [
      { key: 'amount', label: 'Monthly amount', unit: '£ per month', kind: 'number', min: 0, step: 10 },
      { key: 'usage', label: 'Usage-based (scales with traffic)', kind: 'toggle', more: true },
    ],
    summary: (c) => `£${n(c, 'amount')} a month, user-entered`,
    lines: (c) => [{ label: 'User-entered amount', meterKey: 'custom', kind: b(c, 'usage') ? 'usage' : 'standing', amount: n(c, 'amount'), working: { t: 'manual', amount: n(c, 'amount') }, manual: true }],
  },
]

export function getResource(type: string): ResourceDef | undefined {
  return RESOURCES.find((r) => r.type === type)
}
