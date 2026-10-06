import { useId } from 'react'
import type { ItemResult } from '../engine/estimate.ts'
import { gbp } from '../engine/format.ts'
import { ENVS, type Env, type Item } from '../engine/types.ts'
import { workingText } from '../engine/working.ts'
import { regionName } from '../pricing/types.ts'
import { FieldInput } from './FieldInput.tsx'
import { KindTag, NumberInput } from './ui.tsx'

interface Props {
  result: ItemResult
  globalHours: number
  groups: string[]
  showRegion: boolean
  onChange: (item: Item) => void
  onRemove: () => void
  onDuplicate: () => void
}

export function ItemCard({ result, globalHours, groups, showRegion, onChange, onRemove, onDuplicate }: Props) {
  const { item, def, lines, total, warnings, overridden, hours } = result
  const config = { ...def.defaults, ...item.config }
  const id = useId()
  const visible = def.fields.filter((f) => !f.show || f.show(config))
  const main = visible.filter((f) => !f.more)
  const more = visible.filter((f) => f.more)
  const setConfig = (key: string, value: string | number | boolean) => onChange({ ...item, config: { ...item.config, [key]: value } })

  return (
    <article className="card" aria-labelledby={`${id}-name`}>
      <div className="item-head">
        <div className="item-title">
          <label htmlFor={`${id}-name`} className="sr-only">
            Line name
          </label>
          <input id={`${id}-name`} className="item-name" value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} />
          <div className="item-meta">
            <span>{def.name}</span>
            <code>{def.arm}</code>
            <span>{def.summary(config)}</span>
            {showRegion && <span>{regionName(result.region)}</span>}
            {overridden && <span className="tag override">Hours override: {hours} h</span>}
          </div>
        </div>
        <div className="item-amount num">
          {gbp(total)}
          <small>per month</small>
        </div>
      </div>

      <div className="item-body">
        <div className="fields">
          {main.map((f) => (
            <FieldInput key={f.key} field={f} config={config} onChange={setConfig} />
          ))}
        </div>
        {more.length > 0 && (
          <details className="more">
            <summary>More options</summary>
            <div className="fields">
              {more.map((f) => (
                <FieldInput key={f.key} field={f} config={config} onChange={setConfig} />
              ))}
            </div>
          </details>
        )}

        <table className="lines">
          <caption className="sr-only">Charges for {item.name}</caption>
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">Working</th>
              <th scope="col" className="amount">
                Monthly
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <div>{l.label}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    <KindTag kind={l.kind} />
                    {l.manual && <span className="tag manual">{l.working?.t === 'manual' ? 'User-entered' : 'Manually maintained rate'}</span>}
                    {l.unavailable && <span className="tag missing">Rate unavailable</span>}
                  </div>
                </td>
                <td className="working-cell">
                  <span className="working num">{workingText(l)}</span>
                  {l.note && <span className="line-note">{l.note}</span>}
                </td>
                <td className="amount num">{gbp(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {warnings.map((w) => (
          <p className="warning" key={w}>
            <span aria-hidden="true">⚠</span>
            <span>{w}</span>
          </p>
        ))}
        {def.notes?.map((n) => (
          <p className="help" key={n} style={{ marginTop: 8 }}>
            {n}
          </p>
        ))}
      </div>

      <div className="item-foot">
        {def.hourly && (
          <span className="inline-field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={item.hours != null}
                onChange={(e) => onChange({ ...item, hours: e.target.checked ? globalHours : null })}
              />
              <span>Override hours</span>
            </label>
            {item.hours != null && (
              <>
                <NumberInput
                  className="input small"
                  value={item.hours}
                  min={0}
                  max={744}
                  step={1}
                  label={`Hours per month for ${item.name}`}
                  onChange={(n) => onChange({ ...item, hours: n })}
                />
                <span aria-hidden="true">h</span>
              </>
            )}
          </span>
        )}
        <span className="inline-field">
          <label htmlFor={`${id}-env`}>Environment</label>
          <select id={`${id}-env`} className="input" value={item.env} onChange={(e) => onChange({ ...item, env: e.target.value as Env })}>
            {ENVS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </span>
        {groups.length > 1 && (
          <span className="inline-field">
            <label htmlFor={`${id}-group`}>Workload</label>
            <select id={`${id}-group`} className="input" value={item.group} onChange={(e) => onChange({ ...item, group: e.target.value })}>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="btn small ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="btn small ghost danger" onClick={onRemove}>
          Remove <span className="sr-only">{item.name}</span>
        </button>
      </div>
    </article>
  )
}
