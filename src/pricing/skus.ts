// SKU lists shared by the UI and the pricing pipeline. Names only, no rates.

export const VPN_SKUS = ['VpnGw1AZ', 'VpnGw2AZ', 'VpnGw3AZ', 'VpnGw4AZ', 'VpnGw5AZ', 'VpnGw1', 'VpnGw2', 'VpnGw3', 'VpnGw4', 'VpnGw5'] as const

export const ERGW_SKUS = ['ErGw1AZ', 'ErGw2AZ', 'ErGw3AZ'] as const

export const ER_BANDWIDTHS = [
  { id: '50M', label: '50 Mbps' },
  { id: '100M', label: '100 Mbps' },
  { id: '200M', label: '200 Mbps' },
  { id: '500M', label: '500 Mbps' },
  { id: '1G', label: '1 Gbps' },
  { id: '2G', label: '2 Gbps' },
  { id: '5G', label: '5 Gbps' },
  { id: '10G', label: '10 Gbps' },
] as const

export const DISK_TYPES = {
  premium: { label: 'Premium SSD', prefix: 'P' },
  standardssd: { label: 'Standard SSD', prefix: 'E' },
  standardhdd: { label: 'Standard HDD', prefix: 'S' },
} as const
export type DiskType = keyof typeof DISK_TYPES

export const DISK_SIZES = [
  { tier: 4, gib: 32 },
  { tier: 6, gib: 64 },
  { tier: 10, gib: 128 },
  { tier: 15, gib: 256 },
  { tier: 20, gib: 512 },
  { tier: 30, gib: 1024 },
  { tier: 40, gib: 2048 },
  { tier: 50, gib: 4096 },
] as const

export const APP_SERVICE_PLANS = [
  { sku: 'B1', api: 'B1', tier: 'Basic', note: '1 core, 1.75 GB' },
  { sku: 'B2', api: 'B2', tier: 'Basic', note: '2 cores, 3.5 GB' },
  { sku: 'B3', api: 'B3', tier: 'Basic', note: '4 cores, 7 GB' },
  { sku: 'S1', api: 'S1', tier: 'Standard', note: '1 core, 1.75 GB' },
  { sku: 'S2', api: 'S2', tier: 'Standard', note: '2 cores, 3.5 GB' },
  { sku: 'S3', api: 'S3', tier: 'Standard', note: '4 cores, 7 GB' },
  { sku: 'P0v3', api: 'P0 v3', tier: 'Premium v3', note: '1 vCPU, 4 GB' },
  { sku: 'P1v3', api: 'P1 v3', tier: 'Premium v3', note: '2 vCPU, 8 GB' },
  { sku: 'P2v3', api: 'P2 v3', tier: 'Premium v3', note: '4 vCPU, 16 GB' },
  { sku: 'P3v3', api: 'P3 v3', tier: 'Premium v3', note: '8 vCPU, 32 GB' },
] as const

export const BLOB_TIERS = ['Hot', 'Cool', 'Cold', 'Archive'] as const
export const BLOB_REDUNDANCY = ['LRS', 'ZRS', 'GRS'] as const
