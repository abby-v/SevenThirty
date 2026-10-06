import { monthDate, type EstimateResult } from '../engine/estimate.ts'
import { gbp } from '../engine/format.ts'
import type { Estimate, GroupRamp } from '../engine/types.ts'
import { RampChart } from './RampChart.tsx'
import { NumberInput } from './ui.tsx'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function RampView({ est, result, update }: { est: Estimate; result: EstimateResult; update: (fn: (e: Estimate) => Estimate) => void }) {
  const setRamp = (g: string, patch: Partial<GroupRamp>) =>
    update((e) => ({ ...e, ramps: { ...e.ramps, [g]: { ...(e.ramps[g] ?? { start: 1, ramp: 1, end: null }), ...patch } } }))
  const year = (offset: number) => result.forecast.slice(offset, offset + 12).reduce((a, b) => a + b, 0)

  return (
    <>
      <section className="card panel" aria-labelledby="ramp-title">
        <h2 id="ramp-title">Consumption ramp</h2>
        <p>Set when each workload starts consuming and how many months it takes to reach full run rate. This turns the monthly figure into the ACR forecast.</p>
        <div className="form-grid" style={{ marginBottom: 18 }}>
          <div className="field">
            <label htmlFor="start-month">Month 1 starts</label>
            <input id="start-month" className="input" type="month" value={est.startMonth} onChange={(e) => e.target.value && update((x) => ({ ...x, startMonth: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="term">Estimate period, months</label>
            <select id="term" className="input" value={est.termMonths} onChange={(e) => update((x) => ({ ...x, termMonths: Number(e.target.value) }))}>
              {[12, 24, 36, 48, 60].map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Ramp settings by workload</caption>
            <thead>
              <tr>
                <th scope="col">Workload</th>
                <th scope="col" className="r">
                  Run rate (list)
                </th>
                <th scope="col">Starts in month</th>
                <th scope="col">Months to full run rate</th>
                <th scope="col">Ends after month</th>
              </tr>
            </thead>
            <tbody>
              {est.groups.map((g) => {
                const r = est.ramps[g] ?? { start: 1, ramp: 1, end: null }
                const d = monthDate(est.startMonth, r.start - 1)
                return (
                  <tr key={g}>
                    <th scope="row" style={{ color: 'var(--text)' }}>
                      {g}
                      <div className="help">Starts {MONTHS[d.month0]} {d.year}</div>
                    </th>
                    <td className="r num">{gbp(result.byGroup.find((b) => b.key === g)?.total ?? 0)}</td>
                    <td>
                      <NumberInput className="input small" value={r.start} min={1} max={est.termMonths} step={1} label={`${g}: starts in month`} onChange={(n) => setRamp(g, { start: Math.max(1, Math.round(n)) })} />
                    </td>
                    <td>
                      <NumberInput className="input small" value={r.ramp} min={1} max={est.termMonths} step={1} label={`${g}: months to full run rate`} onChange={(n) => setRamp(g, { ramp: Math.max(1, Math.round(n)) })} />
                    </td>
                    <td>
                      <span className="inline-field">
                        <label className="toggle">
                          <input type="checkbox" checked={r.end != null} onChange={(e) => setRamp(g, { end: e.target.checked ? est.termMonths : null })} />
                          <span>Decommission</span>
                        </label>
                        {r.end != null && (
                          <NumberInput className="input small" value={r.end} min={1} max={est.termMonths} step={1} label={`${g}: last month of consumption`} onChange={(n) => setRamp(g, { end: Math.round(n) })} />
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="help">Use a separate workload with an end month to model parallel running or a later optimisation step.</p>
      </section>

      <section className="card panel" aria-labelledby="forecast-title">
        <h2 id="forecast-title">ACR forecast</h2>
        <p>Monthly consumption after discount and contingency, with the cumulative total.</p>
        <RampChart forecast={result.forecast} startMonth={est.startMonth} title="ACR forecast" />
        <div className="form-grid" style={{ marginTop: 18 }}>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>By contract year</h3>
            <table className="table">
              <tbody>
                {Array.from({ length: Math.ceil(est.termMonths / 12) }, (_, i) => (
                  <tr key={i}>
                    <th scope="row">Year {i + 1}</th>
                    <td className="r num">{gbp(year(i * 12))}</td>
                  </tr>
                ))}
                <tr className="best">
                  <th scope="row">Total, {est.termMonths} months</th>
                  <td className="r num">{gbp(result.termTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>By Microsoft fiscal year (July to June)</h3>
            <table className="table">
              <tbody>
                {result.fiscalYears.map((f) => (
                  <tr key={f.label}>
                    <th scope="row">
                      {f.label} {f.months < 12 && <span className="help">({f.months} months)</span>}
                    </th>
                    <td className="r num">{gbp(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <details className="more" style={{ marginTop: 16 }}>
          <summary>Month-by-month table</summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="r">
                    Consumption
                  </th>
                  <th scope="col" className="r">
                    Cumulative
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.forecast.map((v, i) => {
                  const d = monthDate(est.startMonth, i)
                  const cum = result.forecast.slice(0, i + 1).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        {MONTHS[d.month0].slice(0, 3)} {d.year}
                      </td>
                      <td className="r num">{gbp(v)}</td>
                      <td className="r num">{gbp(cum)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  )
}
