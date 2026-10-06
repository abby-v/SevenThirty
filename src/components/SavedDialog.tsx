import { useEffect, useRef, useState } from 'react'
import type { Estimate } from '../engine/types.ts'
import { deleteSaved, listSaved, type SavedEstimate } from '../state/storage.ts'

export function SavedDialog({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (e: Estimate) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [items, setItems] = useState<SavedEstimate[]>([])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setItems(listSaved())
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="saved-title">
      <div className="dialog-head">
        <h2 id="saved-title">Saved in this browser</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dialog-body">
        {!items.length ? (
          <p>Nothing saved yet. Use “Save in this browser” to keep a copy here. Saved estimates never leave this device.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Estimate</th>
                <th scope="col">Saved</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.estimate.title}
                    {s.estimate.client && <span className="help"> · {s.estimate.client}</span>} <span className="help">v{s.estimate.version}</span>
                  </td>
                  <td>{new Date(s.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="r">
                    <span className="actions" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn small" onClick={() => onOpen(s.estimate)}>
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn small ghost danger"
                        onClick={() => {
                          deleteSaved(s.id)
                          setItems(listSaved())
                        }}
                      >
                        Delete <span className="sr-only">{s.estimate.title}</span>
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </dialog>
  )
}
