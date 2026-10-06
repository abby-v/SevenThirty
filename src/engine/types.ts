import type { RegionId, Snapshot } from '../pricing/types.ts'

/** Standing: bills while the resource exists. Usage: scales with traffic or transactions. */
export type Kind = 'standing' | 'usage'

export type Working =
  | { t: 'hourly'; qty: number; rate: number; hours: number }
  | { t: 'monthly'; qty: number; segments: { qty: number; rate: number }[]; noun?: string }
  | { t: 'gb'; gb: number; segments: { gb: number; rate: number }[]; free?: { gb: number; label: string } }
  | { t: 'count'; count: number; per: '10k' | '1m'; segments: { units: number; rate: number }[]; noun: string }
  | { t: 'manual'; amount: number }

/** Inputs for pricing a VM line under reservations and savings plans. */
export interface CommitInfo {
  qty: number
  hours: number
  /** Linux (compute only) PAYG rate per hour. */
  compute: number
  /** Windows licence portion per hour; 0 for Linux. */
  licence: number
  ri1yMonthly?: number
  ri3yMonthly?: number
  sp1y?: number
  sp3y?: number
}

export interface Line {
  label: string
  meterKey: string
  kind: Kind
  /** Monthly amount at PAYG list price, full precision. */
  amount: number
  working: Working | null
  /** No rate in the snapshot for this meter. */
  unavailable?: boolean
  /** Quantity requested, kept on unavailable lines so zero-quantity gaps can be hidden. */
  quantity?: number
  /** Rate came from manual-overrides.json. */
  manual?: boolean
  note?: string
  commit?: CommitInfo
  /** Monthly saving if Azure Hybrid Benefit is applied (only set when eligible). */
  ahbSaving?: number
}

export type Family = 'Networking' | 'Compute' | 'Platform' | 'Data' | 'Operations' | 'Other'
export const FAMILIES: Family[] = ['Networking', 'Compute', 'Platform', 'Data', 'Operations', 'Other']

export type Env = 'Production' | 'Non-production' | 'DR'
export const ENVS: Env[] = ['Production', 'Non-production', 'DR']

export type Config = Record<string, string | number | boolean>

export interface Option {
  value: string
  label: string
}

export interface Field {
  key: string
  label: string
  kind: 'number' | 'select' | 'toggle'
  /** Unit suffix shown in the input and read as part of the label. */
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: Option[] | ((cfg: Config) => Option[])
  /** Hidden under "More options". */
  more?: boolean
  help?: string
  show?: (cfg: Config) => boolean
}

export interface PriceContext {
  snap: Snapshot
  hours: number
}

export interface ResourceDef {
  type: string
  name: string
  family: Family
  /** Resource provider type, for engineers who think in ARM and Terraform. */
  arm: string
  description: string
  /** Uses the hours model. */
  hourly: boolean
  /** Has a stopped state that stops the main charge. */
  pausable: boolean
  defaults: Config
  fields: Field[]
  summary: (cfg: Config) => string
  lines: (cfg: Config, ctx: PriceContext) => Line[]
  notes?: string[]
}

export interface Item {
  id: string
  type: string
  name: string
  group: string
  env: Env
  config: Config
  /** Overrides the estimate's hours per month for this line. */
  hours?: number | null
}

export interface GroupRamp {
  /** Month (1-based) the workload starts consuming. */
  start: number
  /** Months to reach full run rate (1 = immediately). */
  ramp: number
  /** Last month of consumption, or null to run to the end of the term. */
  end: number | null
}

export interface Partner {
  include: boolean
  route: string
  funding: string
  contacts: string
  opportunityId: string
}

export interface Estimate {
  v: 1
  title: string
  client: string
  preparedBy: string
  version: string
  status: 'Indicative' | 'Design-stage' | 'Final'
  region: RegionId
  drRegion: RegionId | ''
  hours: number
  discountPct: number
  contingencyPct: number
  confidence: string
  termMonths: number
  /** YYYY-MM of month 1. */
  startMonth: string
  groups: string[]
  ramps: Record<string, GroupRamp>
  items: Item[]
  assumptions: string
  exclusions: string
  partner: Partner
}
