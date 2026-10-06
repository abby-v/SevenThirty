import { useId, useState } from 'react'
import { listHourPresets, saveHourPresets, type HourPreset } from '../state/storage.ts'
import { NumberInput } from './ui.tsx'

const BUILT_IN: HourPreset[] = [
  { label: '730 h', hours: 730 },
  { label: '450 h', hours: 450 },
  { label: '217 h', hours: 217 },
]

const DESCRIPTIONS: Record<number, string> = {
  730: 'Always on: 24 × 365 ÷ 12',
  450: 'Extended hours',
  217: 'Office hours: 10 h a day, weekdays',
}

export function HoursControl({ hours, onChange }: { hours: number; onChange: (h: number) => void }) {
  const [saved, setSaved] = useState<HourPreset[]>(listHourPresets)
  const presets = [...BUILT_IN, ...saved.filter((s) => !BUILT_IN.some((b) => b.hours === s.hours))]
  const isPreset = presets.some((p) => p.hours === hours)
  const [custom, setCustom] = useState(!isPreset)
  const name = useId()
  const customId = useId()
  const descId = useId()

  const savePreset = () => {
    if (presets.some((p) => p.hours === hours)) return
    const next = [...saved, { label: `${hours} h`, hours }]
    setSaved(next)
    saveHourPresets(next)
    setCustom(false)
  }
  const removePreset = (h: number) => {
    const next = saved.filter((s) => s.hours !== h)
    setSaved(next)
    saveHourPresets(next)
  }

  return (
    <div className="control">
      <fieldset className="segmented" aria-describedby={descId}>
        <legend className="sr-only">Hours per month for hourly resources</legend>
        {presets.map((p) => (
          <label key={p.hours} title={DESCRIPTIONS[p.hours] ?? 'Saved preset'}>
            <input
              type="radio"
              name={name}
              checked={!custom && hours === p.hours}
              onChange={() => {
                setCustom(false)
                onChange(p.hours)
              }}
            />
            <span>{p.label}</span>
          </label>
        ))}
        <label>
          <input type="radio" name={name} checked={custom || !isPreset} onChange={() => setCustom(true)} />
          <span>Custom</span>
        </label>
      </fieldset>
      {(custom || !isPreset) && (
        <span className="inline-field">
          <label htmlFor={customId} className="sr-only">
            Custom hours per month
          </label>
          <NumberInput id={customId} className="input small" value={hours} min={0} max={744} step={1} onChange={onChange} />
          <span aria-hidden="true">h</span>
          {!presets.some((p) => p.hours === hours) && (
            <button type="button" className="btn small" onClick={savePreset}>
              Save {hours} h as preset
            </button>
          )}
        </span>
      )}
      {saved.some((s) => s.hours === hours && !BUILT_IN.some((b) => b.hours === hours)) && !custom && (
        <button type="button" className="btn small ghost" onClick={() => removePreset(hours)}>
          Remove preset
        </button>
      )}
      <span id={descId} className="sr-only">
        {DESCRIPTIONS[hours] ?? `${hours} hours per month`}. Applies to every hourly resource unless a line overrides it.
      </span>
    </div>
  )
}
