import { useEffect, useState } from 'react'
import type { RegionId, Snapshot } from '../pricing/types.ts'

const cache = new Map<RegionId, Promise<Snapshot>>()

function load(region: RegionId): Promise<Snapshot> {
  let p = cache.get(region)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}prices/${region}/latest.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Price snapshot for ${region} returned ${r.status}`)
      return r.json() as Promise<Snapshot>
    })
    p.catch(() => cache.delete(region))
    cache.set(region, p)
  }
  return p
}

/** Loads the latest snapshot for each region in use. */
export function useSnapshots(regions: RegionId[]): { snaps: Partial<Record<RegionId, Snapshot>>; error: string | null } {
  const [snaps, setSnaps] = useState<Partial<Record<RegionId, Snapshot>>>({})
  const [error, setError] = useState<string | null>(null)
  const key = [...new Set(regions)].sort().join(',')

  useEffect(() => {
    let live = true
    for (const r of key.split(',').filter(Boolean) as RegionId[]) {
      load(r)
        .then((s) => live && setSnaps((cur) => ({ ...cur, [r]: s })))
        .catch((e: Error) => live && setError(`${e.message}. Check your connection and reload the page.`))
    }
    return () => {
      live = false
    }
  }, [key])

  return { snaps, error }
}
