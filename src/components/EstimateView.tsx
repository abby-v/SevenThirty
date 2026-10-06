import { useState } from 'react'
import type { EstimateResult } from '../engine/estimate.ts'
import { gbp } from '../engine/format.ts'
import type { Estimate, Item } from '../engine/types.ts'
import { addPreset, makeItem, newId, PRESETS } from '../state/presets.ts'
import { AddResourceDialog } from './AddResourceDialog.tsx'
import { ItemCard } from './ItemCard.tsx'

interface Props {
  est: Estimate
  result: EstimateResult
  update: (fn: (e: Estimate) => Estimate) => void
}

export function EstimateView({ est, result, update }: Props) {
  const [adding, setAdding] = useState<string | null>(null)
  const showRegion = !!est.drRegion && est.items.some((i) => i.env === 'DR')

  const setItem = (item: Item) => update((e) => ({ ...e, items: e.items.map((i) => (i.id === item.id ? item : i)) }))
  const removeItem = (id: string) => update((e) => ({ ...e, items: e.items.filter((i) => i.id !== id) }))
  const duplicate = (item: Item) =>
    update((e) => {
      const idx = e.items.findIndex((i) => i.id === item.id)
      const copy = { ...item, id: newId(), name: `${item.name} (copy)` }
      return { ...e, items: [...e.items.slice(0, idx + 1), copy, ...e.items.slice(idx + 1)] }
    })
  const renameGroup = (from: string, to: string) =>
    update((e) => {
      if (!to.trim() || (to !== from && e.groups.includes(to))) return e
      const ramps = { ...e.ramps, [to]: e.ramps[from] }
      if (to !== from) delete ramps[from]
      return { ...e, groups: e.groups.map((g) => (g === from ? to : g)), ramps, items: e.items.map((i) => (i.group === from ? { ...i, group: to } : i)) }
    })
  const removeGroup = (g: string) =>
    update((e) => {
      const ramps = { ...e.ramps }
      delete ramps[g]
      return { ...e, groups: e.groups.filter((x) => x !== g), ramps, items: e.items.filter((i) => i.group !== g) }
    })
  const addGroup = () =>
    update((e) => {
      let name = 'New workload'
      for (let i = 2; e.groups.includes(name); i++) name = `New workload ${i}`
      return { ...e, groups: [...e.groups, name], ramps: { ...e.ramps, [name]: { start: 1, ramp: 1, end: null } } }
    })

  if (!est.groups.length) {
    return (
      <section className="card start" aria-labelledby="start-title">
        <h2 id="start-title">Start from an architecture</h2>
        <p>Pick the closest design. Every line has sensible defaults you can change, and you can add more workloads later.</p>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset" onClick={() => update((e) => addPreset(e, p))}>
              <strong>{p.name}</strong>
              <span>{p.description}</span>
            </button>
          ))}
          <button type="button" className="preset" onClick={addGroup}>
            <strong>Blank workload</strong>
            <span>Start empty and add resources one by one.</span>
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      {est.groups.map((g) => {
        const items = result.items.filter((r) => r.item.group === g)
        const total = items.reduce((a, r) => a + r.total, 0)
        return (
          <section key={g} className="group" aria-label={`Workload: ${g}`}>
            <div className="group-head">
              <label className="sr-only" htmlFor={`group-${g}`}>
                Workload name
              </label>
              <input
                id={`group-${g}`}
                className="group-name"
                defaultValue={g}
                onBlur={(e) => renameGroup(g, e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <span className="group-total num">{gbp(total)} a month</span>
              <button type="button" className="btn small" onClick={() => setAdding(g)}>
                Add resource
              </button>
              <button
                type="button"
                className="btn small ghost danger"
                onClick={() => (items.length === 0 || confirm(`Remove ${g} and its ${items.length} lines?`)) && removeGroup(g)}
              >
                Remove workload
              </button>
            </div>
            <div className="items">
              {items.map((r) => (
                <ItemCard
                  key={r.item.id}
                  result={r}
                  globalHours={est.hours}
                  groups={est.groups}
                  showRegion={showRegion}
                  onChange={setItem}
                  onRemove={() => removeItem(r.item.id)}
                  onDuplicate={() => duplicate(r.item)}
                />
              ))}
              {!items.length && (
                <div className="card" style={{ padding: 16 }}>
                  <p style={{ margin: '0 0 10px' }}>No resources yet.</p>
                  <button type="button" className="btn primary" onClick={() => setAdding(g)}>
                    Add resource
                  </button>
                </div>
              )}
            </div>
          </section>
        )
      })}
      <div className="actions">
        <button type="button" className="btn" onClick={addGroup}>
          Add workload
        </button>
        <button type="button" className="btn" onClick={() => setAdding(est.groups[est.groups.length - 1])}>
          Add starting architecture
        </button>
      </div>
      <AddResourceDialog
        open={adding !== null}
        group={adding ?? ''}
        onClose={() => setAdding(null)}
        onAdd={(type) => {
          const g = adding!
          update((e) => ({ ...e, items: [...e.items, makeItem(type, g, e.items.find((i) => i.group === g)?.env ?? 'Production')] }))
          setAdding(null)
        }}
        onAddPreset={(p) => {
          update((e) => addPreset(e, p))
          setAdding(null)
        }}
      />
    </>
  )
}
