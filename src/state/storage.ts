// Browser-only persistence. Nothing leaves the device unless the user copies
// a share link, and share links carry the estimate in the URL fragment, which
// browsers never send to the server.

import type { Estimate } from '../engine/types.ts'
import { emptyEstimate } from './presets.ts'

const CURRENT = 'seventhirty:current'
const SAVED = 'seventhirty:saved'
const HOUR_PRESETS = 'seventhirty:hour-presets'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the estimate still works for this session.
  }
}

/** Fill in fields added since an estimate was saved. */
export function upgrade(raw: Partial<Estimate>): Estimate {
  const base = emptyEstimate()
  return { ...base, ...raw, partner: { ...base.partner, ...(raw.partner ?? {}) }, ramps: raw.ramps ?? {}, items: raw.items ?? [], groups: raw.groups ?? [] }
}

export const loadCurrent = (): Estimate | null => {
  const e = read<Partial<Estimate> | null>(CURRENT, null)
  return e ? upgrade(e) : null
}
export const saveCurrent = (e: Estimate) => write(CURRENT, e)

export interface SavedEstimate {
  id: string
  savedAt: string
  estimate: Estimate
}
export const listSaved = (): SavedEstimate[] => read<SavedEstimate[]>(SAVED, [])
export function saveNamed(e: Estimate): SavedEstimate {
  const entry = { id: `${Date.now()}`, savedAt: new Date().toISOString(), estimate: e }
  write(SAVED, [entry, ...listSaved()].slice(0, 50))
  return entry
}
export function deleteSaved(id: string) {
  write(SAVED, listSaved().filter((s) => s.id !== id))
}

export interface HourPreset {
  label: string
  hours: number
}
export const listHourPresets = (): HourPreset[] => read<HourPreset[]>(HOUR_PRESETS, [])
export const saveHourPresets = (p: HourPreset[]) => write(HOUR_PRESETS, p)

// ------------------------------------------------------------ Share links

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeShare(e: Estimate): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(e))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeShare(s: string): Promise<Estimate> {
  const bytes = await pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'))
  return upgrade(JSON.parse(new TextDecoder().decode(bytes)) as Partial<Estimate>)
}

export async function shareUrl(e: Estimate): Promise<string> {
  const url = new URL(window.location.href)
  url.hash = `e=${await encodeShare(e)}`
  return url.toString()
}
