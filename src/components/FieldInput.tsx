import { useId } from 'react'
import type { Config, Field } from '../engine/types.ts'
import { NumberInput } from './ui.tsx'

export function FieldInput({ field, config, onChange }: { field: Field; config: Config; onChange: (key: string, value: string | number | boolean) => void }) {
  const id = useId()
  const helpId = field.help ? `${id}-help` : undefined
  const value = config[field.key]

  if (field.kind === 'toggle') {
    return (
      <div className="field">
        <label className="toggle">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(field.key, e.target.checked)} aria-describedby={helpId} />
          <span>{field.label}</span>
        </label>
        {field.help && (
          <span id={helpId} className="help">
            {field.help}
          </span>
        )}
      </div>
    )
  }

  const label = field.unit ? `${field.label}, ${field.unit}` : field.label
  const options = typeof field.options === 'function' ? field.options(config) : field.options

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {field.kind === 'select' ? (
        <select id={id} className="input" value={String(value)} onChange={(e) => onChange(field.key, e.target.value)} aria-describedby={helpId}>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.unit ? (
        <div className="input-unit">
          <NumberInput id={id} value={Number(value) || 0} min={field.min} max={field.max} step={field.step} onChange={(n) => onChange(field.key, n)} describedBy={helpId} />
          <span className="unit" aria-hidden="true">
            {field.unit}
          </span>
        </div>
      ) : (
        <NumberInput id={id} value={Number(value) || 0} min={field.min} max={field.max} step={field.step} onChange={(n) => onChange(field.key, n)} describedBy={helpId} />
      )}
      {field.help && (
        <span id={helpId} className="help">
          {field.help}
        </span>
      )}
    </div>
  )
}
