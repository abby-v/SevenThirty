import { commitmentScenarios, hasAhbEligible, hasCommitEligible, type EstimateResult } from '../engine/estimate.ts'
import { gbp, pct } from '../engine/format.ts'

interface Props {
  result: EstimateResult
  ahb: boolean
  onAhb: (v: boolean) => void
  compact?: boolean
}

export function Commitments({ result, ahb, onAhb, compact }: Props) {
  const anyCommit = hasCommitEligible(result)
  const anyAhb = hasAhbEligible(result)
  if (!anyCommit && !anyAhb) {
    return <p className="help">Add virtual machines or SQL databases to compare reservations, savings plans and Hybrid Benefit.</p>
  }
  const scenarios = commitmentScenarios(result, ahb).filter((s) => anyCommit || s.id === 'payg')
  const best = scenarios.reduce((a, s) => (s.monthly < a.monthly ? s : a), scenarios[0])
  const lowHours = result.items.some((r) => r.lines.some((l) => l.commit && l.commit.hours < 730))

  return (
    <div>
      {anyAhb && (
        <label className="toggle" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={ahb} onChange={(e) => onAhb(e.target.checked)} />
          <span>Apply Azure Hybrid Benefit where the client has eligible licences</span>
        </label>
      )}
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Monthly cost under each commitment option</caption>
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col" className="r">
                Monthly
              </th>
              <th scope="col" className="r">
                Saving
              </th>
              {!compact && (
                <th scope="col" className="r">
                  Annual
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id} className={s.id === best.id && s.saving > 0 ? 'best' : undefined}>
                <th scope="row" style={{ fontWeight: s.id === best.id && s.saving > 0 ? 700 : 400, color: 'var(--text)' }}>
                  {s.label}
                  {s.id === best.id && s.saving > 0 && <span className="sr-only"> (lowest)</span>}
                  {s.fallbacks > 0 && <span className="help"> · {s.fallbacks} at PAYG</span>}
                </th>
                <td className="r num">{gbp(s.monthly)}</td>
                <td className="r num">{s.id === 'payg' ? '—' : `${gbp(s.saving)} (${pct(s.savingPct)})`}</td>
                {!compact && <td className="r num">{gbp(s.monthly * 12)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help" style={{ marginTop: 8 }}>
        Commitments apply to VM compute only. Reservations bill every hour of the term; savings plans are priced on the hours you run.
        {lowHours && ' Some VMs run under 730 hours, so a reservation can cost more than pay-as-you-go for them.'} Commitments are a financial decision for
        the client.
      </p>
    </div>
  )
}
