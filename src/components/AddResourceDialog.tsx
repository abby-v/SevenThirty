import { useEffect, useMemo, useRef, useState } from 'react'
import { RESOURCES } from '../engine/resources.ts'
import { FAMILIES } from '../engine/types.ts'
import { PRESETS, type Preset } from '../state/presets.ts'

interface Props {
  open: boolean
  group: string
  onClose: () => void
  onAdd: (type: string) => void
  onAddPreset: (p: Preset) => void
}

export function AddResourceDialog({ open, group, onClose, onAdd, onAddPreset }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setQ('')
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])

  const query = q.trim().toLowerCase()
  const matches = useMemo(
    () => RESOURCES.filter((r) => !query || `${r.name} ${r.arm} ${r.description} ${r.family}`.toLowerCase().includes(query)),
    [query],
  )
  const presets = PRESETS.filter((p) => !query || `${p.name} ${p.description}`.toLowerCase().includes(query))

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="add-title">
      <div className="dialog-head">
        <h2 id="add-title">Add to {group}</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dialog-body">
        <div className="field">
          <label htmlFor="add-search">Search resources</label>
          <input
            id="add-search"
            className="input"
            type="search"
            placeholder="For example: firewall, VpnGw, Microsoft.Network, SQL"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {matches.length} resources match
        </p>
        {FAMILIES.map((fam) => {
          const list = matches.filter((r) => r.family === fam)
          if (!list.length) return null
          return (
            <section key={fam} aria-labelledby={`fam-${fam}`}>
              <h3 id={`fam-${fam}`} className="picker-family">
                {fam}
              </h3>
              <ul className="picker-list">
                {list.map((r) => (
                  <li key={r.type}>
                    <button type="button" onClick={() => onAdd(r.type)}>
                      <strong>{r.name}</strong>
                      <span>{r.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {presets.length > 0 && (
          <section aria-labelledby="fam-presets">
            <h3 id="fam-presets" className="picker-family">
              Starting architectures (adds a new workload)
            </h3>
            <ul className="picker-list">
              {presets.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onAddPreset(p)}>
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!matches.length && !presets.length && <p>No resources match “{q}”. Try a service name or a resource provider type.</p>}
      </div>
    </dialog>
  )
}
